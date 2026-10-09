//! One-click "Fix Server Issues" pipeline. Every step reports findings; when `apply_fixes` is set
//! the step also repairs what it safely can. Destructive repairs always move data aside rather
//! than deleting it (saves go to `_quarantine`, configs get a `.bak`).

use super::{archive, curseforge, ini, jobs, prereqs, proc, saves, server, steamcmd};
use crate::error::AppResult;
use crate::models::*;
use crate::state::{AppState, TaskReporter};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagOptions {
    pub apply_fixes: bool,
    pub validate_files: bool,
    pub repair_saves: bool,
    pub check_mods: bool,
    pub clean_cache: bool,
    pub check_network: bool,
    pub open_firewall: bool,
    pub install_prereqs: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagStep {
    pub id: String,
    pub title: String,
    /// pending | running | ok | warning | error | fixed | skipped
    pub status: String,
    pub findings: Vec<String>,
    pub fixes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagEvent<'a> {
    run_id: &'a str,
    instance_id: &'a str,
    step: &'a DiagStep,
}

struct Run<'a> {
    app: &'a AppHandle,
    run_id: String,
    instance_id: String,
    steps: Vec<DiagStep>,
}

impl<'a> Run<'a> {
    fn begin(&mut self, id: &str, title: &str) {
        self.steps.push(DiagStep { id: id.into(), title: title.into(), status: "running".into(), findings: vec![], fixes: vec![] });
        self.emit();
    }
    fn cur(&mut self) -> &mut DiagStep {
        self.steps.last_mut().unwrap()
    }
    fn find(&mut self, s: impl Into<String>) {
        self.cur().findings.push(s.into());
        self.emit();
    }
    fn fixed(&mut self, s: impl Into<String>) {
        self.cur().fixes.push(s.into());
        self.emit();
    }
    fn end(&mut self, status: &str) {
        let st = self.cur();
        // A step that applied fixes and has nothing worse to report is "fixed".
        st.status = if status == "ok" && !st.fixes.is_empty() { "fixed".into() } else { status.into() };
        self.emit();
    }
    fn emit(&self) {
        if let Some(step) = self.steps.last() {
            let _ = self.app.emit("diagnostics", DiagEvent { run_id: &self.run_id, instance_id: &self.instance_id, step });
        }
    }
}

fn worst(a: &str, b: &str) -> &'static str {
    let rank = |s: &str| match s { "error" => 3, "warning" => 2, _ => 1 };
    match rank(a).max(rank(b)) { 3 => "error", 2 => "warning", _ => "ok" }
}

pub async fn run(state: &AppState, app: &AppHandle, id: &str, opts: DiagOptions) -> AppResult<Vec<DiagStep>> {
    let inst = state.instance(id).await?;
    let mut run = Run { app, run_id: uuid::Uuid::new_v4().to_string(), instance_id: id.to_string(), steps: vec![] };
    let needs_stop = opts.apply_fixes && (opts.repair_saves || opts.validate_files || opts.clean_cache);

    // ── 1. Process state ────────────────────────────────────────────────────────────
    run.begin("process", "Server process");
    let mut sys = sysinfo::System::new();
    let pids = proc::find_pids_for_exe(&mut sys, &inst.server_exe());
    let mut running = !pids.is_empty();
    let tracked = state.with_runtime(id, |r| r.pid).await;
    let mut st = "ok";
    if pids.len() > 1 {
        run.find(format!("{} server processes are running from this install – only one can own the ports and save", pids.len()));
        st = "error";
        if opts.apply_fixes {
            for p in pids.iter().filter(|p| Some(**p) != tracked).skip(if tracked.is_some() { 0 } else { 1 }) {
                if proc::kill_tree(*p).await.is_ok() {
                    run.fixed(format!("Terminated duplicate process (PID {p})"));
                }
            }
            st = "ok";
        }
    }
    let rt_crash = state.with_runtime(id, |r| (r.crash_times.len(), r.crash_loop)).await;
    if rt_crash.1 {
        run.find(format!("Crash loop detected – {} crashes in the last 15 minutes", rt_crash.0));
        st = worst(st, "error");
    } else if rt_crash.0 > 0 {
        run.find(format!("{} recent crash(es)", rt_crash.0));
        st = worst(st, "warning");
    }
    if running && needs_stop {
        run.find("Server is running – stopping it gracefully so files can be repaired");
        server::stop(state, app, id, true, 90).await?;
        run.fixed("Server stopped (world saved first)");
        running = false;
    } else if running {
        run.find("Server is running – file-level repairs will be reported but not applied");
    } else {
        run.find("No server process running");
    }
    run.end(st);

    // ── 2. Prerequisites ────────────────────────────────────────────────────────────
    run.begin("prereqs", "System prerequisites");
    let list = prereqs::check(state).await;
    let missing: Vec<String> = list
        .iter()
        .filter(|p| p.installable && (p.status == "missing" || (p.status == "warning" && p.id == "vcredist")))
        .map(|p| p.id.to_string())
        .collect();
    let mut st = "ok";
    for p in &list {
        if p.status != "ok" {
            run.find(format!("{}: {}", p.name, p.detail));
            st = worst(st, if p.required && p.status == "missing" { "error" } else { "warning" });
        }
    }
    if !missing.is_empty() && opts.apply_fixes && opts.install_prereqs {
        let r = TaskReporter::new(app, "prereqs", "Installing prerequisites", Some(id));
        match prereqs::install(state, &missing, &r).await {
            Ok(_) => {
                r.done("Prerequisites installed");
                run.fixed(format!("Installed: {}", missing.join(", ")));
                st = "ok";
            }
            Err(e) => {
                r.fail(&e.to_string());
                run.find(format!("Automatic install failed: {e}"));
            }
        }
    }
    if list.iter().all(|p| p.status == "ok") {
        run.find("All prerequisites satisfied");
    }
    run.end(st);

    // ── 3. Configuration ────────────────────────────────────────────────────────────
    run.begin("config", "Configuration files");
    let mut st = "ok";
    if !inst.config_dir().exists() {
        run.find("Config folder does not exist yet (created on first launch)");
    }
    for file in [server::GUS, server::GAME] {
        let path = inst.config_dir().join(file);
        if !path.exists() {
            continue;
        }
        let raw = std::fs::read(&path)?;
        let text = ini::decode(&raw);
        if raw.starts_with(&[0xFF, 0xFE]) || raw.starts_with(&[0xFE, 0xFF]) {
            run.find(format!("{file} is UTF-16 encoded"));
        }
        let issues = ini::IniDoc::validate(&text, REPEATABLE);
        let errors: Vec<_> = issues.iter().filter(|i| i.severity == "error").collect();
        let warns: Vec<_> = issues.iter().filter(|i| i.severity == "warning").collect();
        for i in errors.iter().chain(warns.iter()).take(8) {
            run.find(format!("{file}:{} – {}", i.line, i.message));
        }
        if !errors.is_empty() {
            st = worst(st, "error");
        } else if !warns.is_empty() {
            st = worst(st, "warning");
        }
        if opts.apply_fixes && (!errors.is_empty() || !warns.is_empty()) && !running {
            let fixed = auto_fix_ini(&text);
            if fixed != text {
                std::fs::copy(&path, path.with_extension(format!("ini.{}.bak", chrono::Local::now().format("%Y%m%d%H%M%S"))))?;
                ini::write_file(&path, &fixed)?;
                run.fixed(format!("Repaired {file} (original kept as .bak)"));
                let remaining = ini::IniDoc::validate(&fixed, REPEATABLE).iter().filter(|i| i.severity == "error").count();
                st = if remaining == 0 { "ok" } else { "warning" };
            }
        }
    }
    let gus = ini::IniDoc::parse(&ini::read_file(&inst.config_dir().join(server::GUS))?);
    let rcon_on = gus.get("ServerSettings", "RCONEnabled").map(|v| v.eq_ignore_ascii_case("true")).unwrap_or(false);
    let rcon_port_ok = gus.get("ServerSettings", "RCONPort").map(|v| v == inst.rcon_port.to_string()).unwrap_or(false);
    if inst.admin_password.trim().is_empty() {
        run.find("No admin password set – RCON, player management and graceful shutdown are unavailable");
        st = worst(st, "error");
    }
    if !rcon_on || !rcon_port_ok {
        run.find("RCON is not enabled on the configured port in GameUserSettings.ini");
        st = worst(st, "warning");
        if opts.apply_fixes && !running && inst.config_dir().exists() {
            server::sync_core_ini(&inst)?;
            run.fixed("Enabled RCON and synced ports/passwords into GameUserSettings.ini");
            st = if st == "error" && !inst.admin_password.trim().is_empty() { "ok" } else { st };
        }
    }
    run.end(st);

    // ── 4. Network ──────────────────────────────────────────────────────────────────
    if opts.check_network {
        run.begin("network", "Ports & firewall");
        let mut st = "ok";
        let others = state.instances.read().await.clone();
        for o in others.iter().filter(|o| o.id != inst.id) {
            for (label, p) in [("game", inst.game_port), ("query", inst.query_port), ("RCON", inst.rcon_port)] {
                if [o.game_port, o.query_port, o.rcon_port].contains(&p) {
                    run.find(format!("{label} port {p} is also used by instance '{}'", o.name));
                    st = worst(st, "error");
                }
            }
        }
        if !running {
            for (label, port, udp) in [("Game (UDP)", inst.game_port, true), ("Query (UDP)", inst.query_port, true), ("RCON (TCP)", inst.rcon_port, false)] {
                let free = if udp {
                    std::net::UdpSocket::bind(("0.0.0.0", port)).is_ok()
                } else {
                    std::net::TcpListener::bind(("0.0.0.0", port)).is_ok()
                };
                if !free {
                    let owner = proc::port_owner(port, udp).await;
                    let who = owner
                        .map(|pid| format!("{} (PID {pid})", proc::process_name(&mut sys, pid).unwrap_or_else(|| "unknown".into())))
                        .unwrap_or_else(|| "another process".into());
                    run.find(format!("{label} port {port} is already bound by {who}"));
                    st = worst(st, "error");
                    if opts.apply_fixes {
                        if let Some(pid) = owner {
                            let name = proc::process_name(&mut sys, pid).unwrap_or_default();
                            if name.eq_ignore_ascii_case("ArkAscendedServer.exe") {
                                proc::kill_tree(pid).await?;
                                run.fixed(format!("Stopped orphaned ArkAscendedServer.exe holding port {port}"));
                            }
                        }
                    }
                } else {
                    run.find(format!("{label} port {port} is free"));
                }
            }
        } else {
            run.find("Server running – port bindings are owned by it");
        }
        let rule = firewall_rule_name(&inst);
        let (_, out) = proc::capture("netsh.exe", &["advfirewall", "firewall", "show", "rule", &format!("name={rule}")]).await?;
        let has_rule = out.contains(&rule);
        if !has_rule {
            run.find(format!("No inbound firewall rule for UDP {}/{} – players outside this PC may not be able to join", inst.game_port, inst.query_port));
            st = worst(st, "warning");
            if opts.apply_fixes && opts.open_firewall {
                match add_firewall_rules(state, &inst).await {
                    Ok(_) => run.fixed("Added Windows Firewall inbound rules for the game and query ports"),
                    Err(e) => run.find(format!("Could not add firewall rules: {e}")),
                }
            }
        } else {
            run.find("Windows Firewall rule present");
        }
        run.find(format!("RCON (TCP {}) is intentionally kept local – forward it only if you need remote admin", inst.rcon_port));
        run.end(st);
    }

    // ── 5. Stale locks, temp & cache ────────────────────────────────────────────────
    let mut force_validate = false;
    if opts.clean_cache {
        run.begin("cache", "Stale locks, temp files & caches");
        let mut st = "ok";
        let steamapps = inst.install_dir.join("steamapps");
        for sub in ["downloading", "temp"] {
            let d = steamapps.join(sub);
            if dir_has_entries(&d) {
                run.find(format!("Leftover SteamCMD {sub} data ({})", human(dir_size(&d))));
                st = worst(st, "warning");
                if opts.apply_fixes && !running {
                    std::fs::remove_dir_all(&d)?;
                    run.fixed(format!("Cleared steamapps/{sub}"));
                }
            }
        }
        match steamcmd::manifest_state_flags(&inst.install_dir) {
            Some(4) | None => {}
            Some(f) => {
                run.find(format!("App manifest StateFlags={f} – a previous update did not finish"));
                st = worst(st, "warning");
                force_validate = true;
            }
        }
        let mut locks = 0;
        for e in walkdir::WalkDir::new(inst.saved_dir()).max_depth(3).into_iter().flatten() {
            let n = e.file_name().to_string_lossy().to_lowercase();
            if e.file_type().is_file() && (n.ends_with(".lock") || n.ends_with(".lck")) {
                locks += 1;
                if opts.apply_fixes && !running && std::fs::remove_file(e.path()).is_ok() {
                    run.fixed(format!("Removed stale lock {}", e.path().display()));
                }
            }
        }
        if locks > 0 {
            run.find(format!("{locks} stale lock file(s)"));
            st = worst(st, "warning");
        }
        let primary = inst.save_dir().join(format!("{}.ark", inst.map));
        let has_sidecar = ["-wal", "-journal"].iter().any(|s| PathBuf::from(format!("{}{s}", primary.display())).exists());
        if has_sidecar && !running {
            run.find("World save has an uncommitted SQLite journal from an unclean shutdown");
            st = worst(st, "warning");
            if opts.apply_fixes {
                match saves::checkpoint_wal(&primary) {
                    Ok(_) => run.fixed("Recovered and merged the save journal into the world file"),
                    Err(e) => run.find(format!("Journal recovery failed: {e}")),
                }
            }
        }
        let crashes = inst.saved_dir().join("Crashes");
        let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 86400);
        let mut old = 0u64;
        if let Ok(rd) = std::fs::read_dir(&crashes) {
            for e in rd.flatten() {
                if e.metadata().and_then(|m| m.modified()).map(|t| t < cutoff).unwrap_or(false) {
                    old += dir_size(&e.path());
                    if opts.apply_fixes {
                        let _ = std::fs::remove_dir_all(e.path());
                    }
                }
            }
        }
        if old > 0 {
            run.find(format!("{} of crash dumps older than 7 days", human(old)));
            if opts.apply_fixes {
                run.fixed("Removed old crash dumps");
            }
        }
        if st == "ok" && run.cur().findings.is_empty() {
            run.find("Nothing stale found");
        }
        run.end(st);
    }

    // ── 6. Save integrity ───────────────────────────────────────────────────────────
    if opts.repair_saves {
        run.begin("saves", "World save integrity");
        let mut st = "ok";
        if running {
            run.find("Skipped – server is running");
            run.end("skipped");
        } else {
            let checks = saves::check_all(&inst.save_dir(), &inst.map);
            if checks.is_empty() {
                run.find("No world save yet");
            }
            let primary = checks.iter().find(|c| c.file.is_primary);
            let snapshot_count = checks.iter().filter(|c| !c.file.is_primary).count();
            let bad_snaps = checks.iter().filter(|c| !c.file.is_primary && c.status == "corrupt").count();
            if let Some(p) = primary {
                run.find(format!("{} ({}): {}", p.file.name, human(p.file.size), p.detail));
                if p.status == "corrupt" || p.file.size == 0 {
                    st = "error";
                    if opts.apply_fixes {
                        if let Some(snap) = saves::newest_valid_snapshot(&inst.save_dir(), &inst.map) {
                            let q = saves::rollback_to(&inst.save_dir(), &inst.map, &snap)?;
                            run.fixed(format!(
                                "Rolled back to {} (corrupt save moved to {})",
                                snap.file_name().unwrap().to_string_lossy(),
                                q.display()
                            ));
                            st = "ok";
                        } else if let Some(b) = archive::list_backups(&[state.backup_dir(&inst).await, state.legacy_backup_dir(&inst)]).first() {
                            archive::restore_backup(&inst, &b.path, false)?;
                            run.fixed(format!("Restored world from backup {}", b.name));
                            st = "ok";
                        } else {
                            run.find("No valid snapshot or backup available to roll back to");
                        }
                    }
                }
            } else if !checks.is_empty() {
                run.find(format!("Primary save {}.ark is missing", inst.map));
                st = "warning";
            }
            run.find(format!("{snapshot_count} rolling snapshot(s), {bad_snaps} corrupt"));
            if bad_snaps > 0 {
                st = worst(st, "warning");
            }
            run.end(st);
        }
    }

    // ── 7. Mods ─────────────────────────────────────────────────────────────────────
    if opts.check_mods {
        run.begin("mods", "Mods & crash analysis");
        let mut st = "ok";
        let evidence = crash_evidence(&inst);
        for e in evidence.fatal.iter().take(4) {
            run.find(format!("Crash: {e}"));
            st = worst(st, "warning");
        }
        let mut dupes = std::collections::HashSet::new();
        for m in &inst.mods {
            if !dupes.insert(m.id) {
                run.find(format!("Mod {} is listed twice", m.id));
                st = worst(st, "warning");
            }
        }
        let suspects: Vec<&ModEntry> = inst
            .mods
            .iter()
            .filter(|m| m.enabled && evidence.mentions(m))
            .collect();
        for m in &suspects {
            run.find(format!("Mod '{}' ({}) appears in recent crash/log errors", m.name, m.id));
            st = worst(st, "error");
        }
        let key = state.settings.read().await.curseforge_api_key.clone();
        if !key.trim().is_empty() && !inst.mods.is_empty() {
            let ids: Vec<u64> = inst.mods.iter().map(|m| m.id).collect();
            match curseforge::get_mods(&state.http, &key, &ids).await {
                Ok(found) => {
                    for m in &inst.mods {
                        match found.iter().find(|f| f.id == m.id) {
                            None => {
                                run.find(format!("Mod {} ({}) no longer exists on CurseForge", m.name, m.id));
                                st = worst(st, "error");
                            }
                            Some(f) if !f.is_available => {
                                run.find(format!("Mod '{}' is marked unavailable on CurseForge", f.name));
                                st = worst(st, "warning");
                            }
                            Some(f) => {
                                if let Some(d) = f.date_modified.as_deref().and_then(|d| chrono::DateTime::parse_from_rfc3339(d).ok()) {
                                    let age = chrono::Utc::now().signed_duration_since(d).num_days();
                                    if age > 240 {
                                        run.find(format!("Mod '{}' hasn't been updated in {age} days – may be outdated for the current server build", f.name));
                                        st = worst(st, "warning");
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => run.find(format!("Could not query CurseForge: {e}")),
            }
        }
        if opts.apply_fixes && !suspects.is_empty() && (rt_crash.1 || !evidence.fatal.is_empty()) {
            let suspect_ids: Vec<u64> = suspects.iter().map(|m| m.id).collect();
            {
                let mut list = state.instances.write().await;
                if let Some(i) = list.iter_mut().find(|i| i.id == inst.id) {
                    for m in i.mods.iter_mut().filter(|m| suspect_ids.contains(&m.id)) {
                        m.enabled = false;
                    }
                }
            }
            state.persist_instances().await?;
            for id in &suspect_ids {
                let n = purge_mod_files(&inst.mods_dir(), *id);
                if n > 0 {
                    run.fixed(format!("Deleted cached files for mod {id} so the server re-downloads them"));
                }
            }
            run.fixed(format!("Disabled {} suspected mod(s); re-enable them one at a time to confirm", suspect_ids.len()));
            state.with_runtime(id, |r| { r.crash_loop = false; r.crash_times.clear(); }).await;
            st = "ok";
        }
        if inst.mods.is_empty() && evidence.fatal.is_empty() {
            run.find("No mods installed and no recent crashes");
        }
        run.end(st);
    }

    // ── 8. Server files ─────────────────────────────────────────────────────────────
    if opts.validate_files || force_validate {
        run.begin("files", "Server files (SteamCMD validate)");
        if running {
            run.find("Skipped – server is running");
            run.end("skipped");
        } else if !opts.apply_fixes {
            run.find(if force_validate { "Validation recommended (interrupted update detected)" } else { "Validation will run when fixes are applied" });
            run.end(if force_validate { "warning" } else { "skipped" });
        } else {
            run.find("Verifying every file against Steam – this can take several minutes");
            match jobs::update_server(state, app, id, true).await {
                Ok(_) => {
                    run.fixed("All server files verified (missing/corrupt files re-downloaded)");
                    run.end("ok");
                }
                Err(e) => {
                    run.find(format!("Validation failed: {e}"));
                    run.end("error");
                }
            }
        }
    }

    Ok(run.steps)
}

pub const REPEATABLE: &[&str] = &[
    "OverridePlayerLevelEngramPoints", "ConfigOverrideItemMaxQuantity", "ConfigOverrideItemCraftingCosts",
    "ConfigOverrideSupplyCrateItems", "ConfigAddNPCSpawnEntriesContainer", "ConfigSubtractNPCSpawnEntriesContainer",
    "ConfigOverrideNPCSpawnEntriesContainer", "DinoSpawnWeightMultipliers", "NPCReplacements",
    "DinoClassDamageMultipliers", "DinoClassResistanceMultipliers", "TamedDinoClassDamageMultipliers",
    "TamedDinoClassResistanceMultipliers", "TamedDinoClassSpeedMultipliers", "TamedDinoClassStaminaMultipliers",
    "OverrideEngramEntries", "OverrideNamedEngramEntries", "EngramEntryAutoUnlocks", "HarvestResourceItemAmountClassMultipliers",
    "LevelExperienceRampOverrides", "PreventDinoTameClassNames", "PreventBreedingForClassNames", "ExcludeItemIndices",
    "CheatTeleportLocations", "PreventTransferForClassNames", "ItemStatClamps",
];

/// Conservative automatic INI repairs: trims spaces around '=', comments out junk lines and
/// orphan settings that precede any section.
pub fn auto_fix_ini(text: &str) -> String {
    let mut out = Vec::new();
    let mut in_section = false;
    for raw in text.lines() {
        let t = raw.trim();
        if t.is_empty() || t.starts_with(';') || t.starts_with('#') {
            out.push(raw.to_string());
        } else if t.starts_with('[') {
            if t.ends_with(']') {
                in_section = true;
                out.push(t.to_string());
            } else {
                in_section = true;
                out.push(format!("{t}]"));
            }
        } else if let Some(eq) = raw.find('=') {
            if !in_section {
                out.push(format!("; [disabled by Fix Server Issues – outside any section] {t}"));
            } else {
                out.push(format!("{}={}", raw[..eq].trim(), raw[eq + 1..].trim()));
            }
        } else {
            out.push(format!("; [disabled by Fix Server Issues – invalid line] {t}"));
        }
    }
    out.join("\r\n") + "\r\n"
}

pub fn firewall_rule_name(inst: &ServerInstance) -> String {
    format!("ASA Server Manager - {}", &inst.id[..8.min(inst.id.len())])
}

pub async fn add_firewall_rules(state: &AppState, inst: &ServerInstance) -> AppResult<()> {
    let name = firewall_rule_name(inst);
    let script = format!(
        "Remove-NetFirewallRule -DisplayName '{name}' -ErrorAction SilentlyContinue\r\n\
         New-NetFirewallRule -DisplayName '{name}' -Description '{}' -Direction Inbound -Action Allow -Protocol UDP -LocalPort {},{} | Out-Null\r\n\
         Write-Output 'firewall ok'",
        inst.name.replace('\'', ""),
        inst.game_port,
        inst.query_port,
    );
    let out = proc::powershell_elevated(&script, &state.data_dir.join("tmp")).await?;
    if out.contains("ERROR:") {
        return Err(crate::error::AppError::msg(out.lines().find(|l| l.contains("ERROR:")).unwrap_or("").to_string()));
    }
    Ok(())
}

struct Evidence {
    fatal: Vec<String>,
    haystack: String,
}

impl Evidence {
    fn mentions(&self, m: &ModEntry) -> bool {
        if self.haystack.contains(&m.id.to_string()) {
            return true;
        }
        let norm: String = m.name.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect();
        norm.len() >= 5 && self.haystack.contains(&norm)
    }
}

/// Gather fatal error lines from the newest server log and crash reports from the last 48 h.
fn crash_evidence(inst: &ServerInstance) -> Evidence {
    let mut fatal = Vec::new();
    let mut hay = String::new();
    let markers = ["Fatal error", "Assertion failed", "Unhandled Exception", "EXCEPTION_ACCESS_VIOLATION", "Critical error", "LogMods: Error", "Failed to load mod", "LogWindows: Error"];
    let mut scan = |text: &str| {
        for l in text.lines() {
            if markers.iter().any(|m| l.contains(m)) {
                let t = l.trim();
                if fatal.len() < 20 && !fatal.iter().any(|f: &String| f == t) {
                    fatal.push(t.chars().take(220).collect());
                }
            }
            if l.contains("Error") || l.contains("Fatal") || l.contains("Mods/") || l.contains("Mods\\") {
                hay.push_str(&l.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>());
                hay.push(' ');
            }
        }
    };
    let log = inst.logs_dir().join("ShooterGame.log");
    if let Ok(t) = std::fs::read(&log) {
        let start = t.len().saturating_sub(2_000_000);
        scan(&String::from_utf8_lossy(&t[start..]));
    }
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(48 * 3600);
    if let Ok(rd) = std::fs::read_dir(inst.saved_dir().join("Crashes")) {
        let mut dirs: Vec<_> = rd
            .flatten()
            .filter(|e| e.metadata().and_then(|m| m.modified()).map(|t| t > cutoff).unwrap_or(false))
            .collect();
        dirs.sort_by_key(|e| std::cmp::Reverse(e.metadata().and_then(|m| m.modified()).ok()));
        for d in dirs.into_iter().take(3) {
            for f in ["CrashContext.runtime-xml", "ShooterGame.log"] {
                if let Ok(t) = std::fs::read(d.path().join(f)) {
                    let start = t.len().saturating_sub(500_000);
                    scan(&String::from_utf8_lossy(&t[start..]));
                }
            }
        }
    }
    Evidence { fatal, haystack: hay }
}

/// Delete downloaded files for a mod (folders named `<id>` or `<id>_*`) inside the server's Mods dir.
pub fn purge_mod_files(mods_dir: &Path, id: u64) -> usize {
    let prefix = format!("{id}_");
    let exact = id.to_string();
    let mut n = 0;
    for e in walkdir::WalkDir::new(mods_dir).min_depth(1).max_depth(2).into_iter().flatten() {
        if !e.file_type().is_dir() {
            continue;
        }
        let name = e.file_name().to_string_lossy();
        if (name == exact || name.starts_with(&prefix)) && e.path().starts_with(mods_dir) {
            if std::fs::remove_dir_all(e.path()).is_ok() {
                n += 1;
            }
        }
    }
    n
}

fn dir_has_entries(p: &Path) -> bool {
    std::fs::read_dir(p).map(|mut r| r.next().is_some()).unwrap_or(false)
}

fn dir_size(p: &Path) -> u64 {
    walkdir::WalkDir::new(p).into_iter().flatten().filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum()
}

pub fn human(b: u64) -> String {
    let b = b as f64;
    if b >= 1e9 { format!("{:.2} GB", b / 1e9) } else if b >= 1e6 { format!("{:.1} MB", b / 1e6) } else { format!("{:.0} KB", b / 1e3) }
}
