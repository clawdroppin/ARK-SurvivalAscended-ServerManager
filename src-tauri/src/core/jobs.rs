//! Long-running jobs shared by commands and the supervisor.

use super::steamcmd;
use crate::error::{AppError, AppResult};
use crate::state::{AppState, TaskReporter};
use tauri::AppHandle;

pub async fn update_server(state: &AppState, app: &AppHandle, id: &str, validate: bool) -> AppResult<()> {
    let inst = state.instance(id).await?;
    if super::server::server_running_pid(&inst).is_some() {
        return Err(AppError::msg("Stop the server before updating or validating its files."));
    }
    let title = if !inst.is_installed() {
        format!("Installing {}", inst.name)
    } else if validate {
        format!("Validating {}", inst.name)
    } else {
        format!("Updating {}", inst.name)
    };
    // Refuse a second concurrent install/update for the same server.
    let already = state.with_runtime(id, |rt| std::mem::replace(&mut rt.installing, true)).await;
    if already {
        return Err(AppError::msg("An install or update for this server is already running."));
    }
    let r = TaskReporter::new(app, "steamcmd", &title, Some(id));
    let cancel = state.register_cancel(&r.task_id).await;
    state.emit_status(app, id).await;
    let steam_dir = state.steamcmd_dir().await;
    r.progress("Waiting for SteamCMD", None);
    let _guard = state.steam_lock.lock().await;
    let result = steamcmd::app_update(&state.http, &steam_dir, &inst.install_dir, validate, &r, cancel).await;
    state.cancels.lock().await.remove(&r.task_id);
    let build = steamcmd::local_build(&inst.install_dir);
    state
        .with_runtime(id, |rt| {
            rt.installing = false;
            rt.installed_build = build.clone();
        })
        .await;
    match &result {
        Ok(_) => {
            // Make sure the config directory exists so the editors work before the first boot.
            let _ = std::fs::create_dir_all(inst.config_dir());
            let _ = super::server::sync_core_ini(&inst);
            r.done(&format!("Server files ready (build {})", build.unwrap_or_else(|| "unknown".into())));
        }
        Err(e) => r.fail(&e.to_string()),
    }
    state.emit_status(app, id).await;
    result
}

/// Compare the installed build with Steam's public branch. Returns true when an update exists.
pub async fn check_update(state: &AppState, app: &AppHandle, id: &str) -> AppResult<bool> {
    let inst = state.instance(id).await?;
    let r = TaskReporter::new(app, "update-check", "Checking for updates", Some(id)).quiet();
    let steam_dir = state.steamcmd_dir().await;
    let _guard = state.steam_lock.lock().await;
    // Every server shares the same AppID, so one Steam query serves all of them for 10 minutes.
    let cached = state
        .latest_build_cache
        .lock()
        .await
        .clone()
        .filter(|(t, _)| crate::state::now_ms() - t < 10 * 60_000);
    let latest = match cached {
        Some((_, b)) => b,
        None => match steamcmd::latest_build(&state.http, &steam_dir, &r).await {
            Ok(l) => {
                *state.latest_build_cache.lock().await = Some((crate::state::now_ms(), l.clone()));
                l
            }
            Err(e) => {
                r.fail(&e.to_string());
                return Err(e);
            }
        },
    };
    let local = steamcmd::local_build(&inst.install_dir);
    r.done(&format!(
        "Installed {} · latest {}",
        local.as_deref().unwrap_or("?"),
        latest.as_deref().unwrap_or("?")
    ));
    state
        .with_runtime(id, |rt| {
            rt.latest_build = latest.clone();
            rt.installed_build = local.clone();
            rt.last_update_check = crate::state::now_ms();
        })
        .await;
    state.emit_status(app, id).await;
    Ok(matches!((latest, local), (Some(a), Some(b)) if a != b))
}
