//! Background supervisor: one tokio task that owns process monitoring, telemetry, log tailing,
//! crash recovery and the per-instance scheduler (restarts, backups, update checks).
//! Nothing here ever runs on the webview thread.

use super::{archive, jobs, proc, rcon, server};
use crate::models::*;
use crate::state::{now_ms, AppState};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{Networks, Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerEvent {
    pub id: String,
    /// info | success | warning | error
    pub level: String,
    pub message: String,
}

pub fn notify(app: &AppHandle, id: &str, level: &str, message: impl Into<String>) {
    let _ = app.emit("server-event", ServerEvent { id: id.into(), level: level.into(), message: message.into() });
}

struct TailState {
    offset: u64,
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<Arc<AppState>>().inner().clone();
        let mut sys = System::new();
        let mut nets = Networks::new_with_refreshed_list();
        let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f32;
        let mut tick: u64 = 0;
        let mut last_tick = Instant::now();
        let mut tails: HashMap<String, TailState> = HashMap::new();

        // Adopt servers that were already running when the app started (and honour auto-start).
        {
            let list = state.instances.read().await.clone();
            for inst in &list {
                if let Some(pid) = server::server_running_pid(inst) {
                    state.with_runtime(&inst.id, |r| { r.pid = Some(pid); r.state = Some(ServerState::Starting); r.started_at = Some(now_ms()); }).await;
                } else if inst.automation.auto_start_with_app && inst.is_installed() {
                    let (s, a, id) = (state.clone(), app.clone(), inst.id.clone());
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = server::start(&s, &a, &id).await {
                            notify(&a, &id, "error", format!("Auto-start failed: {e}"));
                        }
                    });
                }
                state.with_runtime(&inst.id, |r| r.installed_build = super::steamcmd::local_build(&inst.install_dir)).await;
                state.emit_status(&app, &inst.id).await;
            }
        }

        loop {
            let interval = state.settings.read().await.telemetry_interval_ms.clamp(500, 10_000);
            tokio::time::sleep(Duration::from_millis(interval)).await;
            tick += 1;
            let elapsed = last_tick.elapsed().as_secs_f64().max(0.001);
            last_tick = Instant::now();

            let instances = state.instances.read().await.clone();
            let pids: Vec<Pid> = {
                let rt = state.runtime.lock().await;
                instances.iter().filter_map(|i| rt.get(&i.id).and_then(|r| r.pid)).map(Pid::from_u32).collect()
            };
            sys.refresh_processes_specifics(
                ProcessesToUpdate::Some(&pids),
                true,
                ProcessRefreshKind::nothing().with_cpu().with_memory().with_disk_usage(),
            );
            sys.refresh_memory();
            nets.refresh(true);
            let (rx, tx) = nets.iter().fold((0u64, 0u64), |(r, t), (_, n)| (r + n.received(), t + n.transmitted()));

            // Externally started servers: one full process scan every ~15 s for all instances.
            let adopt_scan: Option<Vec<(u32, String)>> = if tick % 8 == 1 {
                Some(proc::server_exes(&mut sys))
            } else {
                None
            };

            for inst in &instances {
                let id = inst.id.clone();
                let (pid, st, intentional, started_at) = state
                    .with_runtime(&id, |r| (r.pid, r.state, r.intentional_stop, r.started_at))
                    .await;

                if pid.is_none() {
                    let want = inst.server_exe().to_string_lossy().replace('/', "\\").to_lowercase();
                    let found = adopt_scan.as_ref().and_then(|l| l.iter().find(|(_, exe)| *exe == want).map(|(p, _)| *p));
                    if let Some(found) = found {
                        state.with_runtime(&id, |r| { r.pid = Some(found); r.state = Some(ServerState::Starting); r.started_at = Some(now_ms()); r.intentional_stop = false; }).await;
                        state.emit_status(&app, &id).await;
                    }
                    continue;
                }
                let Some(pid) = pid else { continue };

                let proc_info = sys.process(Pid::from_u32(pid));
                if proc_info.is_none() {
                    handle_exit(&state, &app, inst, intentional, st).await;
                    tails.remove(&id);
                    continue;
                }
                let p = proc_info.unwrap();
                let du = p.disk_usage();
                let (players, rcon_ok) = state.with_runtime(&id, |r| (r.players, r.rcon_ok)).await;

                let latency = if tick % 5 == 0 || (st == Some(ServerState::Starting) && tick % 3 == 0) {
                    poll_rcon(&state, &app, inst).await
                } else {
                    None
                };

                let sample = TelemetrySample {
                    id: id.clone(),
                    ts: now_ms(),
                    cpu: p.cpu_usage() / cores,
                    mem_bytes: p.memory(),
                    sys_mem_total: sys.total_memory(),
                    sys_mem_used: sys.used_memory(),
                    net_rx_bps: (rx as f64 / elapsed) as u64,
                    net_tx_bps: (tx as f64 / elapsed) as u64,
                    disk_read_bps: (du.read_bytes as f64 / elapsed) as u64,
                    disk_write_bps: (du.written_bytes as f64 / elapsed) as u64,
                    players: if rcon_ok { players } else { None },
                    rcon_latency_ms: latency,
                    uptime_secs: started_at.map(|s| ((now_ms() - s) / 1000).max(0) as u64),
                };
                let _ = app.emit("telemetry", sample);

                tail_log(&app, inst, &mut tails);

                if rcon_ok && tick % 3 == 0 {
                    let (s, a, i) = (state.clone(), app.clone(), inst.clone());
                    tauri::async_runtime::spawn(async move {
                        if let Ok(chat) = server::rcon(&s, &i, "GetChat").await {
                            let lines: Vec<String> = chat
                                .lines()
                                .map(|l| l.trim().to_string())
                                .filter(|l| !l.is_empty() && !l.starts_with("Server received, But no response"))
                                .collect();
                            if !lines.is_empty() {
                                let _ = a.emit("log-lines", LogBatch { id: i.id.clone(), source: "chat".into(), lines, ts: now_ms() });
                            }
                        }
                    });
                }
            }

            if tick % 5 == 0 {
                scheduler(&state, &app, &instances).await;
            }
        }
    });
}

async fn poll_rcon(state: &Arc<AppState>, app: &AppHandle, inst: &ServerInstance) -> Option<u32> {
    let t0 = Instant::now();
    let res = tokio::time::timeout(Duration::from_secs(6), server::rcon(state, inst, "ListPlayers")).await;
    let ok = matches!(res, Ok(Ok(_)));
    let latency = t0.elapsed().as_millis() as u32;
    let players = match &res {
        Ok(Ok(text)) => Some(rcon::parse_players(text).len() as u32),
        _ => None,
    };
    let became_running = state
        .with_runtime(&inst.id, |r| {
            let was = r.state;
            r.rcon_ok = ok;
            if ok {
                r.players = players;
                if was == Some(ServerState::Starting) {
                    r.state = Some(ServerState::Running);
                    return true;
                }
            }
            false
        })
        .await;
    if became_running {
        notify(app, &inst.id, "success", format!("{} is online", inst.name));
    }
    state.emit_status(app, &inst.id).await;
    if ok { Some(latency) } else { None }
}

async fn handle_exit(state: &Arc<AppState>, app: &AppHandle, inst: &ServerInstance, intentional: bool, st: Option<ServerState>) {
    let id = inst.id.clone();
    server::drop_rcon(state, &id).await;
    let crashed = !intentional && matches!(st, Some(ServerState::Running) | Some(ServerState::Starting));
    let auto = inst.automation.clone();
    let (should_restart, loop_detected, count) = state
        .with_runtime(&id, |r| {
            r.pid = None;
            r.started_at = None;
            r.rcon_ok = false;
            r.players = None;
            if !crashed {
                r.state = Some(ServerState::Stopped);
                return (false, false, 0);
            }
            let now = now_ms();
            r.crash_times.retain(|t| now - *t < 15 * 60_000);
            r.crash_times.push(now);
            r.state = Some(ServerState::Crashed);
            let n = r.crash_times.len() as u32;
            if n > auto.max_crash_restarts {
                r.crash_loop = true;
            }
            (auto.auto_restart_on_crash && !r.crash_loop, r.crash_loop, n)
        })
        .await;
    let _ = server::apply_pending_configs(state, inst).await;
    state.emit_status(app, &id).await;
    if crashed {
        if loop_detected {
            notify(app, &id, "error", format!("{} is crash-looping ({count} crashes in 15 min). Auto-restart paused — run Fix Server Issues.", inst.name));
        } else {
            notify(app, &id, "warning", format!("{} stopped unexpectedly{}", inst.name, if should_restart { " — restarting in 10 s" } else { "" }));
        }
    }
    if should_restart {
        let (s, a) = (state.clone(), app.clone());
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(10)).await;
            if let Err(e) = server::start(&s, &a, &id).await {
                notify(&a, &id, "error", format!("Auto-restart failed: {e}"));
            }
        });
    }
}

fn tail_log(app: &AppHandle, inst: &ServerInstance, tails: &mut HashMap<String, TailState>) {
    let path = inst.logs_dir().join("ShooterGame.log");
    let Ok(mut f) = std::fs::File::open(&path) else { return };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let t = tails.entry(inst.id.clone()).or_insert(TailState { offset: len.saturating_sub(16 * 1024) });
    if len < t.offset {
        t.offset = 0; // rotated
    }
    if len == t.offset {
        return;
    }
    let to_read = (len - t.offset).min(512 * 1024);
    if f.seek(SeekFrom::Start(len - to_read)).is_err() {
        return;
    }
    let mut buf = vec![0u8; to_read as usize];
    if f.read_exact(&mut buf).is_err() {
        return;
    }
    t.offset = len;
    let text = String::from_utf8_lossy(&buf);
    let lines: Vec<String> = text.lines().filter(|l| !l.trim().is_empty()).map(|l| l.to_string()).collect();
    if !lines.is_empty() {
        let _ = app.emit("log-lines", LogBatch { id: inst.id.clone(), source: "server".into(), lines, ts: now_ms() });
    }
}

/// Scheduled restarts with countdown warnings, automatic backups and update checks.
async fn scheduler(state: &Arc<AppState>, app: &AppHandle, instances: &[ServerInstance]) {
    let now = chrono::Local::now();
    let today = now.format("%Y-%m-%d").to_string();
    for inst in instances {
        let a = &inst.automation;
        let (st, last_backup, last_check) = state
            .with_runtime(&inst.id, |r| (r.state, r.last_backup, r.last_update_check))
            .await;
        let running = st == Some(ServerState::Running);

        // Next scheduled restart for status display.
        let mut next: Option<chrono::DateTime<chrono::Local>> = None;
        for t in &a.restart_times {
            let Ok(nt) = chrono::NaiveTime::parse_from_str(t, "%H:%M") else { continue };
            let mut dt = now.date_naive().and_time(nt).and_local_timezone(chrono::Local).single();
            if let Some(d) = dt {
                if d <= now {
                    dt = Some(d + chrono::Duration::days(1));
                }
            }
            if let Some(d) = dt {
                if next.map(|n| d < n).unwrap_or(true) {
                    next = Some(d);
                }
            }
        }
        state.with_runtime(&inst.id, |r| r.next_restart = next.map(|n| n.timestamp_millis())).await;

        if running {
            if let Some(n) = next {
                let mins_left = (n - now).num_seconds() as f64 / 60.0;
                let max_warn = a.restart_warnings.iter().copied().max().unwrap_or(0) as f64;
                let key = format!("{today}-{}", n.format("%H:%M"));
                if mins_left <= max_warn.max(0.5) {
                    let fired = state.with_runtime(&inst.id, |r| !r.fired_schedule_keys.insert(key.clone())).await;
                    if !fired {
                        let remaining: Vec<u32> = a.restart_warnings.iter().copied().filter(|w| (*w as f64) <= mins_left.ceil()).collect();
                        let (s, ap, id, upd) = (state.clone(), app.clone(), inst.id.clone(), a.update_on_restart);
                        notify(app, &inst.id, "info", format!("Scheduled restart of {} at {}", inst.name, n.format("%H:%M")));
                        tauri::async_runtime::spawn(async move {
                            let has_update = if upd { jobs::check_update(&s, &ap, &id).await.unwrap_or(false) } else { false };
                            if let Err(e) = server::restart_with_warnings(&s, &ap, &id, &remaining, has_update).await {
                                notify(&ap, &id, "error", format!("Scheduled restart failed: {e}"));
                            }
                        });
                    }
                }
            }
        }

        if running && a.auto_backup_minutes > 0 && now_ms() - last_backup > a.auto_backup_minutes as i64 * 60_000 {
            if last_backup == 0 {
                // Don't back up immediately after launch; start the clock instead.
                state.with_runtime(&inst.id, |r| r.last_backup = now_ms()).await;
            } else {
                state.with_runtime(&inst.id, |r| r.last_backup = now_ms()).await;
                let (s, ap, i) = (state.clone(), app.clone(), inst.clone());
                tauri::async_runtime::spawn(async move {
                    let _ = server::rcon(&s, &i, "SaveWorld").await;
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    let dir = s.backup_dir(&i).await;
                    let keep = i.automation.backup_retention as usize;
                    let res = tokio::task::spawn_blocking(move || {
                        let b = archive::create_backup(&dir, &i, "auto")?;
                        archive::prune_backups(&dir, keep)?;
                        Ok::<_, crate::error::AppError>(b)
                    })
                    .await;
                    match res {
                        Ok(Ok(b)) => { let _ = ap.emit("backup-created", b); }
                        Ok(Err(e)) => notify(&ap, "", "error", format!("Automatic backup failed: {e}")),
                        Err(e) => notify(&ap, "", "error", format!("Automatic backup failed: {e}")),
                    }
                });
            }
        }

        if inst.is_installed() && a.check_updates_minutes > 0 && now_ms() - last_check > a.check_updates_minutes as i64 * 60_000 && st != Some(ServerState::Installing) {
            state.with_runtime(&inst.id, |r| r.last_update_check = now_ms()).await;
            let (s, ap, id, name) = (state.clone(), app.clone(), inst.id.clone(), inst.name.clone());
            tauri::async_runtime::spawn(async move {
                if let Ok(true) = jobs::check_update(&s, &ap, &id).await {
                    notify(&ap, &id, "info", format!("A server update is available for {name}"));
                }
            });
        }
    }
}
