//! Tauri command surface. Every command is async and returns `Result<T, AppError>`; heavy work is
//! pushed to `spawn_blocking` or the tokio runtime so the webview never stalls.

use crate::core::{a2s, archive, curseforge, diagnostics, ini, jobs, prereqs, rcon, saves, server};
use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::state::{AppState, TaskReporter};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

type S<'a> = State<'a, Arc<AppState>>;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tokio::task::spawn_blocking(f).await.map_err(|e| AppError::msg(e.to_string()))?
}

// ── App ──────────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    portable: bool,
    steamcmd_installed: bool,
    data_dir: PathBuf,
    steamcmd_dir: PathBuf,
    /// Global backup override, if any (default is each server's own folder).
    backup_dir: Option<PathBuf>,
    default_install_root: PathBuf,
}

#[tauri::command]
pub async fn get_app_info(state: S<'_>) -> AppResult<AppInfo> {
    let steamcmd_dir = state.steamcmd_dir().await;
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        portable: state.portable,
        steamcmd_installed: crate::core::steamcmd::exe(&steamcmd_dir).exists(),
        data_dir: state.data_dir.clone(),
        steamcmd_dir,
        backup_dir: state.settings.read().await.backup_dir.clone(),
        default_install_root: state.default_install_root().await,
    })
}

#[tauri::command]
pub async fn get_settings(state: S<'_>) -> AppResult<AppSettings> {
    Ok(state.settings.read().await.clone())
}

#[tauri::command]
pub async fn save_settings(state: S<'_>, mut settings: AppSettings) -> AppResult<()> {
    let mut guard = state.settings.write().await;
    settings.last_data_dir = guard.last_data_dir.clone();
    *guard = settings;
    drop(guard);
    state.persist_settings().await
}

#[tauri::command]
pub async fn cancel_task(state: S<'_>, task_id: String) -> AppResult<()> {
    if let Some(f) = state.cancels.lock().await.get(&task_id) {
        f.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

// ── Prerequisites ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_prereqs(state: S<'_>) -> AppResult<Vec<prereqs::Prereq>> {
    Ok(prereqs::check(&state).await)
}

#[tauri::command]
pub async fn install_prereqs(app: AppHandle, state: S<'_>, ids: Vec<String>) -> AppResult<()> {
    let r = TaskReporter::new(&app, "prereqs", "Installing prerequisites", None);
    match prereqs::install(&state, &ids, &r).await {
        Ok(_) => {
            r.done("Prerequisites installed");
            Ok(())
        }
        Err(e) => {
            r.fail(&e.to_string());
            Err(e)
        }
    }
}

// ── Instances ────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_instances(state: S<'_>) -> AppResult<Vec<ServerInstance>> {
    Ok(state.instances.read().await.clone())
}

#[tauri::command]
pub async fn get_statuses(state: S<'_>) -> AppResult<Vec<ServerStatus>> {
    let list = state.instances.read().await.clone();
    let mut out = Vec::with_capacity(list.len());
    for i in &list {
        out.push(state.status(i).await);
    }
    Ok(out)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewInstance {
    name: String,
    install_dir: Option<PathBuf>,
    map: String,
    max_players: Option<u32>,
    admin_password: Option<String>,
    cluster_id: Option<String>,
    game_port: Option<u16>,
    rcon_port: Option<u16>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortSuggestion {
    game_port: u16,
    query_port: u16,
    rcon_port: u16,
}

fn suggest(list: &[ServerInstance]) -> PortSuggestion {
    let used: Vec<u16> = list.iter().flat_map(|i| [i.game_port, i.query_port, i.rcon_port]).collect();
    let mut g = 7777;
    while used.contains(&g) || used.contains(&(g + 1)) {
        g += 2;
    }
    let mut q = 27015;
    while used.contains(&q) {
        q += 1;
    }
    let mut r = 27020;
    while used.contains(&r) || r == q {
        r += 1;
    }
    PortSuggestion { game_port: g, query_port: q, rcon_port: r }
}

#[tauri::command]
pub async fn suggest_ports(state: S<'_>) -> AppResult<PortSuggestion> {
    Ok(suggest(&state.instances.read().await))
}

fn slug(s: &str) -> String {
    let v: String = s
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if v.is_empty() { "server".into() } else { v }
}

pub fn random_password() -> String {
    let u = uuid::Uuid::new_v4().simple().to_string();
    u[..16].to_string()
}

#[tauri::command]
pub async fn create_instance(app: AppHandle, state: S<'_>, input: NewInstance) -> AppResult<ServerInstance> {
    let ports = suggest(&state.instances.read().await);
    let root = state.default_install_root().await;
    let install_dir = input.install_dir.unwrap_or_else(|| root.join(slug(&input.name)));
    let cluster_dir = input
        .cluster_id
        .as_ref()
        .filter(|c| !c.trim().is_empty())
        .map(|c| state.data_dir.join("clusters").join(slug(c)));
    let mut launch_options = BTreeMap::new();
    launch_options.insert("-servergamelog".into(), LaunchValue::Flag(true));
    let inst = ServerInstance {
        id: uuid::Uuid::new_v4().to_string(),
        session_name: input.name.clone(),
        name: input.name,
        install_dir,
        map: input.map,
        game_port: input.game_port.unwrap_or(ports.game_port),
        query_port: ports.query_port,
        rcon_port: input.rcon_port.unwrap_or(ports.rcon_port),
        admin_password: input.admin_password.filter(|p| !p.is_empty()).unwrap_or_else(random_password),
        server_password: String::new(),
        spectator_password: String::new(),
        max_players: input.max_players.unwrap_or(70),
        cluster_id: input.cluster_id.filter(|c| !c.trim().is_empty()),
        cluster_dir,
        alt_save_directory: None,
        mods: vec![],
        launch_options,
        custom_args: String::new(),
        automation: Automation::default(),
        accent: None,
        created_at: chrono::Utc::now().timestamp_millis(),
    };
    std::fs::create_dir_all(&inst.install_dir)?;
    state.instances.write().await.push(inst.clone());
    state.persist_instances().await?;
    state.emit_status(&app, &inst.id).await;
    Ok(inst)
}

#[tauri::command]
pub async fn update_instance(app: AppHandle, state: S<'_>, instance: ServerInstance) -> AppResult<ServerInstance> {
    {
        let mut list = state.instances.write().await;
        let slot = list
            .iter_mut()
            .find(|i| i.id == instance.id)
            .ok_or_else(|| AppError::InstanceNotFound(instance.id.clone()))?;
        *slot = instance.clone();
    }
    state.persist_instances().await?;
    server::drop_rcon(&state, &instance.id).await;
    state.emit_status(&app, &instance.id).await;
    Ok(instance)
}

#[tauri::command]
pub async fn delete_instance(state: S<'_>, id: String, delete_files: bool) -> AppResult<()> {
    let inst = state.instance(&id).await?;
    if server::server_running_pid(&inst).is_some() {
        return Err(AppError::msg("Stop the server before removing it."));
    }
    state.instances.write().await.retain(|i| i.id != id);
    state.persist_instances().await?;
    state.runtime.lock().await.remove(&id);
    server::drop_rcon(&state, &id).await;
    if delete_files && inst.install_dir.join("ShooterGame").exists() {
        // Remove the server files but keep the Backups folder – backups are never deleted implicitly.
        let dir = inst.install_dir.clone();
        blocking(move || {
            for e in std::fs::read_dir(&dir)?.flatten() {
                if e.file_name().to_string_lossy().eq_ignore_ascii_case("Backups") {
                    continue;
                }
                let p = e.path();
                if p.is_dir() { std::fs::remove_dir_all(&p)?; } else { std::fs::remove_file(&p)?; }
            }
            let _ = std::fs::remove_dir(&dir); // only succeeds if nothing (no backups) is left
            Ok(())
        })
        .await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn clone_instance(app: AppHandle, state: S<'_>, id: String, name: String) -> AppResult<ServerInstance> {
    let src = state.instance(&id).await?;
    let ports = suggest(&state.instances.read().await);
    let root = state.default_install_root().await;
    let mut inst = src.clone();
    inst.id = uuid::Uuid::new_v4().to_string();
    inst.name = name.clone();
    inst.session_name = name.clone();
    inst.install_dir = root.join(slug(&name));
    inst.game_port = ports.game_port;
    inst.query_port = ports.query_port;
    inst.rcon_port = ports.rcon_port;
    inst.created_at = chrono::Utc::now().timestamp_millis();
    let (from, to) = (src.config_dir(), inst.config_dir());
    blocking(move || {
        std::fs::create_dir_all(&to)?;
        for f in [server::GUS, server::GAME] {
            if from.join(f).exists() {
                std::fs::copy(from.join(f), to.join(f))?;
            }
        }
        Ok(())
    })
    .await?;
    state.instances.write().await.push(inst.clone());
    state.persist_instances().await?;
    state.emit_status(&app, &inst.id).await;
    Ok(inst)
}

/// Adopt an existing ASA install (e.g. from another manager) by reading its configs.
#[tauri::command]
pub async fn import_existing(app: AppHandle, state: S<'_>, path: PathBuf, name: Option<String>) -> AppResult<ServerInstance> {
    let exe = path.join("ShooterGame").join("Binaries").join("Win64").join("ArkAscendedServer.exe");
    if !exe.exists() {
        return Err(AppError::msg("That folder does not contain ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe"));
    }
    let cfg = path.join("ShooterGame").join("Saved").join("Config").join("WindowsServer");
    let gus = ini::IniDoc::parse(&ini::read_file(&cfg.join(server::GUS))?);
    let ports = suggest(&state.instances.read().await);
    let session = gus.get("SessionSettings", "SessionName").unwrap_or_default();
    let map = std::fs::read_dir(path.join("ShooterGame").join("Saved").join("SavedArks"))
        .ok()
        .and_then(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .find(|n| n.ends_with("_WP"))
        })
        .unwrap_or_else(|| "TheIsland_WP".into());
    let parse_port = |s: Option<String>, d: u16| s.and_then(|v| v.parse().ok()).unwrap_or(d);
    let mut launch_options = BTreeMap::new();
    launch_options.insert("-servergamelog".into(), LaunchValue::Flag(true));
    let inst = ServerInstance {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| if session.is_empty() { "Imported server".into() } else { session.clone() }),
        session_name: session,
        install_dir: path,
        map,
        game_port: parse_port(gus.get("SessionSettings", "Port"), ports.game_port),
        query_port: parse_port(gus.get("SessionSettings", "QueryPort"), ports.query_port),
        rcon_port: parse_port(gus.get("ServerSettings", "RCONPort"), ports.rcon_port),
        admin_password: gus.get("ServerSettings", "ServerAdminPassword").unwrap_or_else(random_password),
        server_password: gus.get("ServerSettings", "ServerPassword").unwrap_or_default(),
        spectator_password: gus.get("ServerSettings", "SpectatorPassword").unwrap_or_default(),
        max_players: gus.get("/Script/Engine.GameSession", "MaxPlayers").and_then(|v| v.parse().ok()).unwrap_or(70),
        cluster_id: None,
        cluster_dir: None,
        alt_save_directory: None,
        mods: vec![],
        launch_options,
        custom_args: String::new(),
        automation: Automation::default(),
        accent: None,
        created_at: chrono::Utc::now().timestamp_millis(),
    };
    state.instances.write().await.push(inst.clone());
    state.persist_instances().await?;
    state.emit_status(&app, &inst.id).await;
    Ok(inst)
}

// ── Lifecycle ────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn install_server(app: AppHandle, state: S<'_>, id: String, validate: bool) -> AppResult<()> {
    jobs::update_server(&state, &app, &id, validate).await
}

#[tauri::command]
pub async fn check_server_update(app: AppHandle, state: S<'_>, id: String) -> AppResult<bool> {
    jobs::check_update(&state, &app, &id).await
}

#[tauri::command]
pub async fn start_server(app: AppHandle, state: S<'_>, id: String) -> AppResult<()> {
    state.with_runtime(&id, |r| { r.crash_loop = false; }).await;
    server::start(&state, &app, &id).await
}

#[tauri::command]
pub async fn stop_server(app: AppHandle, state: S<'_>, id: String, force: bool) -> AppResult<()> {
    server::stop(&state, &app, &id, !force, 90).await
}

#[tauri::command]
pub async fn restart_server(app: AppHandle, state: S<'_>, id: String, warn_minutes: Vec<u32>, update: bool) -> AppResult<()> {
    server::restart_with_warnings(&state, &app, &id, &warn_minutes, update).await
}

#[tauri::command]
pub async fn get_launch_line(state: S<'_>, id: String) -> AppResult<String> {
    let inst = state.instance(&id).await?;
    Ok(format!("\"{}\" {}", inst.server_exe().display(), server::build_args(&inst).join(" ")))
}

// ── Configuration files ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFile {
    text: String,
    exists: bool,
    path: PathBuf,
}

fn check_file(file: &str) -> AppResult<()> {
    if file == server::GUS || file == server::GAME {
        Ok(())
    } else {
        Err(AppError::msg("Unknown config file"))
    }
}

#[tauri::command]
pub async fn read_config(state: S<'_>, id: String, file: String) -> AppResult<ConfigFile> {
    check_file(&file)?;
    let inst = state.instance(&id).await?;
    // Show the pending (not yet applied) version if one exists.
    if let Some(t) = state.with_runtime(&id, |r| r.pending_configs.get(&file).cloned()).await {
        return Ok(ConfigFile { text: t, exists: true, path: inst.config_dir().join(&file) });
    }
    let path = inst.config_dir().join(&file);
    let exists = path.exists();
    let text = ini::read_file(&path)?;
    Ok(ConfigFile { text, exists, path })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    /// True when the server is running: the text is stored and re-applied after shutdown, because
    /// ASA overwrites GameUserSettings.ini on exit.
    deferred: bool,
}

#[tauri::command]
pub async fn write_config(app: AppHandle, state: S<'_>, id: String, file: String, text: String) -> AppResult<WriteResult> {
    check_file(&file)?;
    let inst = state.instance(&id).await?;
    let running = state.with_runtime(&id, |r| r.pid.is_some()).await;
    let path = inst.config_dir().join(&file);
    // Always back up the previous version once per minute window.
    if path.exists() {
        let bak_dir = inst.config_dir().join("_history");
        std::fs::create_dir_all(&bak_dir)?;
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M");
        let _ = std::fs::copy(&path, bak_dir.join(format!("{file}.{stamp}.bak")));
        prune_history(&bak_dir, &file, 30);
    }
    ini::write_file(&path, &text)?;
    if running {
        state.with_runtime(&id, |r| { r.pending_configs.insert(file.clone(), text); }).await;
    }
    state.emit_status(&app, &id).await;
    Ok(WriteResult { deferred: running })
}

/// Keep only the newest `keep` history copies of a config file.
fn prune_history(dir: &std::path::Path, file: &str, keep: usize) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let prefix = format!("{file}.");
    let mut files: Vec<_> = rd
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
        .collect();
    // Names embed a sortable timestamp (YYYYmmdd-HHMM), so lexical order is chronological.
    files.sort_by_key(|e| std::cmp::Reverse(e.file_name()));
    for e in files.into_iter().skip(keep) {
        let _ = std::fs::remove_file(e.path());
    }
}

#[tauri::command]
pub fn validate_ini(text: String) -> Vec<ini::IniIssue> {
    ini::IniDoc::validate(&text, diagnostics::REPEATABLE)
}

// ── RCON / query ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn rcon_exec(app: AppHandle, state: S<'_>, id: String, command: String) -> AppResult<String> {
    let inst = state.instance(&id).await?;
    let out = server::rcon(&state, &inst, &command).await;
    let ok = out.is_ok();
    state.with_runtime(&id, |r| r.rcon_ok = ok).await;
    if !ok {
        state.emit_status(&app, &id).await;
    }
    out
}

#[tauri::command]
pub async fn list_players(state: S<'_>, id: String) -> AppResult<Vec<Player>> {
    let inst = state.instance(&id).await?;
    let text = server::rcon(&state, &inst, "ListPlayers").await?;
    let players = rcon::parse_players(&text);
    let n = players.len() as u32;
    state.with_runtime(&id, |r| r.players = Some(n)).await;
    Ok(players)
}

#[tauri::command]
pub async fn a2s_query(state: S<'_>, id: String) -> Result<a2s::A2sInfo, String> {
    let inst = state.instance(&id).await.map_err(|e| e.to_string())?;
    a2s::query_info("127.0.0.1", inst.query_port).await
}

#[tauri::command]
pub async fn read_log_tail(state: S<'_>, id: String, max_lines: usize) -> AppResult<Vec<String>> {
    let inst = state.instance(&id).await?;
    let path = inst.logs_dir().join("ShooterGame.log");
    blocking(move || {
        let bytes = std::fs::read(&path).unwrap_or_default();
        let start = bytes.len().saturating_sub(256 * 1024);
        let text = String::from_utf8_lossy(&bytes[start..]);
        let lines: Vec<String> = text.lines().map(String::from).collect();
        let skip = lines.len().saturating_sub(max_lines);
        Ok(lines.into_iter().skip(skip).collect())
    })
    .await
}

// ── Mods ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cf_search(state: S<'_>, query: String, sort: u32, index: u32) -> AppResult<curseforge::SearchResult> {
    let key = state.settings.read().await.curseforge_api_key.clone();
    curseforge::search(&state.http, &key, &query, sort, index).await
}

#[tauri::command]
pub async fn cf_get_mods(state: S<'_>, ids: Vec<u64>) -> AppResult<Vec<curseforge::CfMod>> {
    let key = state.settings.read().await.curseforge_api_key.clone();
    curseforge::get_mods(&state.http, &key, &ids).await
}

/// Refresh `latest_date` for every installed mod; returns how many have updates.
#[tauri::command]
pub async fn check_mod_updates(app: AppHandle, state: S<'_>, id: String) -> AppResult<ServerInstance> {
    let mut inst = state.instance(&id).await?;
    let key = state.settings.read().await.curseforge_api_key.clone();
    let ids: Vec<u64> = inst.mods.iter().map(|m| m.id).collect();
    let found = curseforge::get_mods(&state.http, &key, &ids).await?;
    for m in inst.mods.iter_mut() {
        if let Some(f) = found.iter().find(|f| f.id == m.id) {
            m.latest_date = f.date_modified.clone();
            if m.known_date.is_none() {
                m.known_date = f.date_modified.clone();
            }
            if m.name.is_empty() || m.name.starts_with("Mod ") {
                m.name = f.name.clone();
            }
            m.logo_url = f.logo_url.clone().or(m.logo_url.take());
        }
    }
    update_instance(app, state, inst).await
}

#[tauri::command]
pub async fn purge_mod_files(state: S<'_>, id: String, mod_id: u64) -> AppResult<usize> {
    let inst = state.instance(&id).await?;
    if server::server_running_pid(&inst).is_some() {
        return Err(AppError::msg("Stop the server first."));
    }
    Ok(diagnostics::purge_mod_files(&inst.mods_dir(), mod_id))
}

// ── Diagnostics ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn run_diagnostics(app: AppHandle, state: S<'_>, id: String, options: diagnostics::DiagOptions) -> AppResult<Vec<diagnostics::DiagStep>> {
    diagnostics::run(&state, &app, &id, options).await
}

#[tauri::command]
pub async fn add_firewall_rules(state: S<'_>, id: String) -> AppResult<()> {
    let inst = state.instance(&id).await?;
    diagnostics::add_firewall_rules(&state, &inst).await
}

// ── Saves & backups ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_saves(state: S<'_>, id: String) -> AppResult<Vec<saves::SaveCheck>> {
    let inst = state.instance(&id).await?;
    blocking(move || Ok(saves::check_all(&inst.save_dir(), &inst.map))).await
}

#[tauri::command]
pub async fn rollback_save(state: S<'_>, id: String, snapshot: PathBuf) -> AppResult<PathBuf> {
    let inst = state.instance(&id).await?;
    if server::server_running_pid(&inst).is_some() {
        return Err(AppError::msg("Stop the server before rolling back the world."));
    }
    if !snapshot.starts_with(inst.save_dir()) {
        return Err(AppError::msg("Snapshot must be inside the server's save folder"));
    }
    blocking(move || saves::rollback_to(&inst.save_dir(), &inst.map, &snapshot)).await
}

#[tauri::command]
pub async fn create_backup(state: S<'_>, id: String, label: String) -> AppResult<archive::BackupInfo> {
    let inst = state.instance(&id).await?;
    if state.with_runtime(&id, |r| r.rcon_ok).await {
        let _ = server::rcon(&state, &inst, "SaveWorld").await;
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
    let dir = state.backup_dir(&inst).await;
    blocking(move || archive::create_backup(&dir, &inst, &label)).await
}

#[tauri::command]
pub async fn get_backup_dir(state: S<'_>, id: String) -> AppResult<PathBuf> {
    let inst = state.instance(&id).await?;
    Ok(state.backup_dir(&inst).await)
}

#[tauri::command]
pub async fn list_backups(state: S<'_>, id: String) -> AppResult<Vec<archive::BackupInfo>> {
    let inst = state.instance(&id).await?;
    Ok(archive::list_backups(&[state.backup_dir(&inst).await, state.legacy_backup_dir(&inst)]))
}

async fn backup_path_checked(state: &AppState, inst: &ServerInstance, path: &PathBuf) -> AppResult<()> {
    let dirs = [state.backup_dir(inst).await, state.legacy_backup_dir(inst)];
    if !dirs.iter().any(|d| path.starts_with(d)) {
        return Err(AppError::msg("Backup is outside this server's backup folder"));
    }
    Ok(())
}

#[tauri::command]
pub async fn restore_backup(state: S<'_>, id: String, path: PathBuf, include_configs: bool) -> AppResult<()> {
    let inst = state.instance(&id).await?;
    if server::server_running_pid(&inst).is_some() {
        return Err(AppError::msg("Stop the server before restoring a backup."));
    }
    backup_path_checked(&state, &inst, &path).await?;
    blocking(move || archive::restore_backup(&inst, &path, include_configs)).await
}

#[tauri::command]
pub async fn delete_backup(state: S<'_>, id: String, path: PathBuf) -> AppResult<()> {
    let inst = state.instance(&id).await?;
    backup_path_checked(&state, &inst, &path).await?;
    Ok(std::fs::remove_file(path)?)
}

// ── Import / export ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    include_saves: bool,
    include_cluster: bool,
    include_passwords: bool,
}

#[tauri::command]
pub async fn export_pack(app: AppHandle, state: S<'_>, id: String, dest: PathBuf, options: ExportOptions) -> AppResult<()> {
    let inst = state.instance(&id).await?;
    let r = TaskReporter::new(&app, "export", &format!("Exporting {}", inst.name), Some(&id));
    r.progress("Packing files", None);
    let res = blocking(move || archive::export_pack(&inst, &dest, options.include_saves, options.include_cluster, options.include_passwords)).await;
    match &res {
        Ok(_) => r.done("Export complete"),
        Err(e) => r.fail(&e.to_string()),
    }
    res
}

#[tauri::command]
pub async fn read_pack(path: PathBuf) -> AppResult<archive::PackManifest> {
    blocking(move || archive::read_manifest(&path)).await
}

#[tauri::command]
pub async fn import_pack(app: AppHandle, state: S<'_>, path: PathBuf, name: String, install_dir: Option<PathBuf>) -> AppResult<ServerInstance> {
    let manifest = { let p = path.clone(); blocking(move || archive::read_manifest(&p)).await? };
    let ports = suggest(&state.instances.read().await);
    let root = state.default_install_root().await;
    let mut inst = manifest.profile;
    inst.id = uuid::Uuid::new_v4().to_string();
    inst.name = name.clone();
    inst.install_dir = install_dir.unwrap_or_else(|| root.join(slug(&name)));
    inst.game_port = ports.game_port;
    inst.query_port = ports.query_port;
    inst.rcon_port = ports.rcon_port;
    if inst.admin_password.is_empty() {
        inst.admin_password = random_password();
    }
    if let Some(cid) = &inst.cluster_id {
        inst.cluster_dir = Some(state.data_dir.join("clusters").join(slug(cid)));
    }
    inst.created_at = chrono::Utc::now().timestamp_millis();
    let r = TaskReporter::new(&app, "import", &format!("Importing {name}"), Some(&inst.id));
    r.progress("Unpacking", None);
    let i2 = inst.clone();
    let res = blocking(move || {
        std::fs::create_dir_all(&i2.install_dir)?;
        archive::unpack_into(&path, &i2)
    })
    .await;
    if let Err(e) = res {
        r.fail(&e.to_string());
        return Err(e);
    }
    state.instances.write().await.push(inst.clone());
    state.persist_instances().await?;
    state.emit_status(&app, &inst.id).await;
    r.done("Imported – install server files to run it");
    Ok(inst)
}

/// Inspect a folder the user picked for SteamCMD: does it already contain steamcmd.exe, is it
/// writable, and is it empty? Lets the UI offer "use existing" vs "install here".
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderProbe {
    exists: bool,
    has_steamcmd: bool,
    writable: bool,
    empty: bool,
}

#[tauri::command]
pub async fn probe_steamcmd_dir(path: PathBuf) -> AppResult<FolderProbe> {
    blocking(move || {
        let exists = path.is_dir();
        let has_steamcmd = crate::core::steamcmd::exe(&path).exists();
        let empty = !exists || std::fs::read_dir(&path).map(|mut r| r.next().is_none()).unwrap_or(true);
        let target = if exists { path.clone() } else { path.parent().map(|p| p.to_path_buf()).unwrap_or(path.clone()) };
        let probe = target.join(".asm-write-test");
        let writable = std::fs::write(&probe, b"x").is_ok();
        let _ = std::fs::remove_file(&probe);
        Ok(FolderProbe { exists, has_steamcmd, writable, empty })
    })
    .await
}

// ── Map catalog & presets ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_map_catalog(state: S<'_>, force: bool) -> AppResult<crate::core::maps::MapCatalog> {
    Ok(crate::core::maps::catalog(&state.http, &state.data_dir, force).await)
}

/// User presets are stored as free-form JSON in `<data dir>/presets.json` (visible in the profile folder).
#[tauri::command]
pub async fn list_user_presets(state: S<'_>) -> AppResult<Vec<serde_json::Value>> {
    Ok(crate::state::read_json(&state.data_dir.join("presets.json")).unwrap_or_default())
}

#[tauri::command]
pub async fn save_user_presets(state: S<'_>, presets: Vec<serde_json::Value>) -> AppResult<()> {
    crate::state::write_json_atomic(&state.data_dir.join("presets.json"), &presets)
}
