//! Server lifecycle: launch-line construction, INI sync, start / stop / RCON access.

use super::ini::{self, IniDoc};
use super::proc;
use super::rcon::RconClient;
use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::state::{now_ms, AppState};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

pub const GUS: &str = "GameUserSettings.ini";
pub const GAME: &str = "Game.ini";

/// Launch options that the profile manages itself; ignored if present in `launch_options`.
const RESERVED: &[&str] = &[
    "-mods", "-passivemods", "-clusterid", "-ClusterDirOverride", "-WinLiveMaxPlayers",
    "?Port", "?QueryPort", "?RCONPort", "?RCONEnabled", "?SessionName", "?ServerAdminPassword",
    "?ServerPassword", "?AltSaveDirectoryName", "?listen",
];

fn quote_if_needed(v: &str) -> String {
    if v.contains(' ') && !v.starts_with('"') {
        format!("\"{v}\"")
    } else {
        v.to_string()
    }
}

/// Builds the exact raw command-line arguments (after the executable).
pub fn build_args(inst: &ServerInstance) -> Vec<String> {
    let mut url = format!("{}?listen", inst.map);
    url.push_str(&format!("?Port={}", inst.game_port));
    url.push_str(&format!("?QueryPort={}", inst.query_port));
    url.push_str(&format!("?RCONEnabled=True?RCONPort={}", inst.rcon_port));
    if let Some(alt) = inst.alt_save_directory.as_ref().filter(|s| !s.trim().is_empty()) {
        url.push_str(&format!("?AltSaveDirectoryName={}", alt.trim()));
    }
    for (k, v) in &inst.launch_options {
        if !k.starts_with('?') || RESERVED.iter().any(|r| r.eq_ignore_ascii_case(k)) {
            continue;
        }
        match v {
            LaunchValue::Flag(true) => url.push_str(k),
            LaunchValue::Flag(false) => {}
            LaunchValue::Value(s) if !s.is_empty() => url.push_str(&format!("{k}={s}")),
            LaunchValue::Value(_) => {}
        }
    }
    let mut args = vec![url];
    args.push(format!("-WinLiveMaxPlayers={}", inst.max_players));
    let active: Vec<String> = inst.mods.iter().filter(|m| m.enabled && !m.passive).map(|m| m.id.to_string()).collect();
    if !active.is_empty() {
        args.push(format!("-mods={}", active.join(",")));
    }
    let passive: Vec<String> = inst.mods.iter().filter(|m| m.enabled && m.passive).map(|m| m.id.to_string()).collect();
    if !passive.is_empty() {
        args.push(format!("-passivemods={}", passive.join(",")));
    }
    if let Some(cid) = inst.cluster_id.as_ref().filter(|s| !s.trim().is_empty()) {
        args.push(format!("-clusterid={}", cid.trim()));
        if let Some(dir) = &inst.cluster_dir {
            args.push(format!("-ClusterDirOverride={}", quote_if_needed(&dir.to_string_lossy())));
        }
    }
    for (k, v) in &inst.launch_options {
        if !k.starts_with('-') || RESERVED.iter().any(|r| r.eq_ignore_ascii_case(k)) {
            continue;
        }
        match v {
            LaunchValue::Flag(true) => args.push(k.clone()),
            LaunchValue::Flag(false) => {}
            LaunchValue::Value(s) if !s.is_empty() => args.push(format!("{k}={}", quote_if_needed(s))),
            LaunchValue::Value(_) => {}
        }
    }
    for extra in inst.custom_args.split_whitespace() {
        args.push(extra.to_string());
    }
    args
}

/// Writes profile-owned values into GameUserSettings.ini so passwords and names with spaces never
/// have to travel on the command line (where they are visible to every process on the machine).
pub fn sync_core_ini(inst: &ServerInstance) -> AppResult<()> {
    let path = inst.config_dir().join(GUS);
    let mut doc = IniDoc::parse(&ini::read_file(&path)?);
    let session = if inst.session_name.trim().is_empty() { &inst.name } else { &inst.session_name };
    doc.set("SessionSettings", "SessionName", session);
    doc.set("SessionSettings", "Port", &inst.game_port.to_string());
    doc.set("SessionSettings", "QueryPort", &inst.query_port.to_string());
    doc.set("ServerSettings", "RCONEnabled", "True");
    doc.set("ServerSettings", "RCONPort", &inst.rcon_port.to_string());
    doc.set("ServerSettings", "ServerAdminPassword", &inst.admin_password);
    if inst.server_password.is_empty() {
        doc.remove("ServerSettings", "ServerPassword");
    } else {
        doc.set("ServerSettings", "ServerPassword", &inst.server_password);
    }
    if inst.spectator_password.is_empty() {
        doc.remove("ServerSettings", "SpectatorPassword");
    } else {
        doc.set("ServerSettings", "SpectatorPassword", &inst.spectator_password);
    }
    doc.set("/Script/Engine.GameSession", "MaxPlayers", &inst.max_players.to_string());
    ini::write_file(&path, &doc.to_text())?;
    let game = inst.config_dir().join(GAME);
    if !game.exists() {
        ini::write_file(&game, "[/script/shootergame.shootergamemode]\r\n")?;
    }
    Ok(())
}

pub fn server_running_pid(inst: &ServerInstance) -> Option<u32> {
    let mut sys = sysinfo::System::new();
    proc::find_pids_for_exe(&mut sys, &inst.server_exe()).into_iter().next()
}

pub async fn apply_pending_configs(state: &AppState, inst: &ServerInstance) -> AppResult<bool> {
    let pending = state.with_runtime(&inst.id, |r| std::mem::take(&mut r.pending_configs)).await;
    let any = !pending.is_empty();
    for (file, text) in pending {
        ini::write_file(&inst.config_dir().join(&file), &text)?;
    }
    Ok(any)
}

pub async fn start(state: &AppState, app: &AppHandle, id: &str) -> AppResult<()> {
    let inst = state.instance(id).await?;
    if !inst.is_installed() {
        return Err(AppError::msg("Server files are not installed yet. Run Install first."));
    }
    if inst.admin_password.trim().is_empty() {
        return Err(AppError::msg("Set an admin password first – RCON and graceful shutdown depend on it."));
    }
    if let Some(pid) = server_running_pid(&inst) {
        state
            .with_runtime(id, |r| {
                r.pid = Some(pid);
                r.state = Some(ServerState::Running);
            })
            .await;
        state.emit_status(app, id).await;
        return Ok(());
    }
    apply_pending_configs(state, &inst).await?;
    sync_core_ini(&inst)?;
    if let Some(dir) = &inst.cluster_dir {
        if inst.cluster_id.is_some() {
            std::fs::create_dir_all(dir)?;
        }
    }
    let args = build_args(&inst);
    let mut cmd = std::process::Command::new(inst.server_exe());
    cmd.current_dir(inst.server_exe().parent().unwrap());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP: no console flash and survives app exit.
        cmd.creation_flags(0x0800_0000 | 0x0000_0200);
        for a in &args {
            cmd.raw_arg(a);
        }
    }
    #[cfg(not(windows))]
    cmd.args(&args);
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let child = cmd
        .spawn()
        .map_err(|e| AppError::msg(format!("Failed to launch server: {e}")))?;
    let pid = child.id();
    drop(child);
    state
        .with_runtime(id, |r| {
            r.pid = Some(pid);
            r.state = Some(ServerState::Starting);
            r.started_at = Some(now_ms());
            r.intentional_stop = false;
            r.rcon_ok = false;
            r.players = None;
        })
        .await;
    let _ = app.emit(
        "log-lines",
        LogBatch {
            id: id.to_string(),
            source: "manager".into(),
            lines: vec![format!("Launching: ArkAscendedServer.exe {}", redact(&args.join(" ")))],
            ts: now_ms(),
        },
    );
    state.emit_status(app, id).await;
    Ok(())
}

fn redact(s: &str) -> String {
    let re = regex::Regex::new(r"(?i)(Password=)[^?\s]+").unwrap();
    re.replace_all(s, "${1}••••").into_owned()
}

/// Graceful stop: SaveWorld + DoExit over RCON, then wait; hard-kill after `timeout_secs`.
pub async fn stop(state: &AppState, app: &AppHandle, id: &str, graceful: bool, timeout_secs: u64) -> AppResult<()> {
    let inst = state.instance(id).await?;
    let pid = match state.with_runtime(id, |r| r.pid).await.or_else(|| server_running_pid(&inst)) {
        Some(p) => p,
        None => {
            state.with_runtime(id, |r| r.state = Some(ServerState::Stopped)).await;
            state.emit_status(app, id).await;
            return Ok(());
        }
    };
    state
        .with_runtime(id, |r| {
            r.intentional_stop = true;
            r.state = Some(ServerState::Stopping);
        })
        .await;
    state.emit_status(app, id).await;

    let mut exited = false;
    if graceful {
        let _ = rcon(state, &inst, "SaveWorld").await;
        let _ = rcon(state, &inst, "DoExit").await;
        let mut sys = sysinfo::System::new();
        for _ in 0..timeout_secs {
            tokio::time::sleep(Duration::from_secs(1)).await;
            if !proc::pid_alive(&mut sys, pid) {
                exited = true;
                break;
            }
        }
    }
    if !exited {
        proc::kill_tree(pid).await?;
        tokio::time::sleep(Duration::from_millis(800)).await;
    }
    drop_rcon(state, id).await;
    state
        .with_runtime(id, |r| {
            r.pid = None;
            r.state = Some(ServerState::Stopped);
            r.started_at = None;
            r.rcon_ok = false;
            r.players = None;
        })
        .await;
    // ASA rewrites GameUserSettings.ini on exit – re-apply anything saved while it was running.
    apply_pending_configs(state, &inst).await?;
    state.emit_status(app, id).await;
    Ok(())
}

async fn client_for(state: &AppState, inst: &ServerInstance) -> Arc<Mutex<RconClient>> {
    let mut map = state.rcon.lock().await;
    if let Some(c) = map.get(&inst.id) {
        if c.lock().await.matches(inst.rcon_port, &inst.admin_password) {
            return c.clone();
        }
    }
    let c = Arc::new(Mutex::new(RconClient::new("127.0.0.1", inst.rcon_port, &inst.admin_password)));
    map.insert(inst.id.clone(), c.clone());
    c
}

pub async fn rcon(state: &AppState, inst: &ServerInstance, command: &str) -> AppResult<String> {
    let client = client_for(state, inst).await;
    let mut guard = client.lock().await;
    guard.exec(command).await
}

pub async fn drop_rcon(state: &AppState, id: &str) {
    if let Some(c) = state.rcon.lock().await.remove(id) {
        c.lock().await.disconnect();
    }
}

/// Broadcast a countdown then restart (optionally updating in between).
pub async fn restart_with_warnings(
    state: &AppState,
    app: &AppHandle,
    id: &str,
    warn_minutes: &[u32],
    update: bool,
) -> AppResult<()> {
    let inst = state.instance(id).await?;
    let mut warns: Vec<u32> = warn_minutes.to_vec();
    warns.sort_unstable_by(|a, b| b.cmp(a));
    for (i, m) in warns.iter().enumerate() {
        let _ = rcon(state, &inst, &format!("ServerChat Server restarting in {m} minute{}", if *m == 1 { "" } else { "s" })).await;
        let next = warns.get(i + 1).copied().unwrap_or(0);
        tokio::time::sleep(Duration::from_secs(((m - next) as u64) * 60)).await;
    }
    let _ = rcon(state, &inst, "ServerChat Restarting now – saving world").await;
    stop(state, app, id, true, 120).await?;
    if update {
        super::jobs::update_server(state, app, id, false).await?;
    }
    start(state, app, id).await
}
