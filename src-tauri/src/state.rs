use crate::core::rcon::RconClient;
use crate::error::{AppError, AppResult};
use crate::models::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};

/// Volatile, per-instance runtime bookkeeping (never persisted).
#[derive(Debug, Default)]
pub struct Runtime {
    pub pid: Option<u32>,
    pub state: Option<ServerState>,
    pub started_at: Option<i64>,
    pub intentional_stop: bool,
    pub crash_times: Vec<i64>,
    pub crash_loop: bool,
    pub players: Option<u32>,
    pub rcon_ok: bool,
    pub installing: bool,
    /// Config text written while the server was running. ASA rewrites GameUserSettings.ini on
    /// shutdown, so these are re-applied once the process exits.
    pub pending_configs: HashMap<String, String>,
    pub installed_build: Option<String>,
    pub latest_build: Option<String>,
    pub last_backup: i64,
    pub last_update_check: i64,
    pub fired_schedule_keys: HashSet<String>,
    pub next_restart: Option<i64>,
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub portable: bool,
    pub settings: RwLock<AppSettings>,
    pub instances: RwLock<Vec<ServerInstance>>,
    pub runtime: Mutex<HashMap<String, Runtime>>,
    pub rcon: Mutex<HashMap<String, Arc<Mutex<RconClient>>>>,
    pub http: reqwest::Client,
    /// Cancellation flags for long-running tasks, keyed by task id.
    pub cancels: Mutex<HashMap<String, Arc<std::sync::atomic::AtomicBool>>>,
    /// SteamCMD keeps global state in its folder; only one invocation may run at a time.
    pub steam_lock: Mutex<()>,
    /// Latest public build seen on Steam and when – shared by all servers (same AppID).
    pub latest_build_cache: Mutex<Option<(i64, Option<String>)>>,
}

impl AppState {
    pub fn load(data_dir: PathBuf, portable: bool) -> Self {
        let _ = std::fs::create_dir_all(&data_dir);
        let mut settings: AppSettings = load_json_safe(&data_dir.join("settings.json"));
        let mut instances: Vec<ServerInstance> = load_json_safe(&data_dir.join("instances.json"));
        // A portable folder may have been moved or opened from another drive letter: re-root every
        // stored path that pointed inside the old data folder.
        if let Some(old) = settings.last_data_dir.clone().filter(|o| o != &data_dir) {
            let fix = |p: &mut PathBuf| {
                if let Some(n) = crate::paths::rebase(p, &old, &data_dir) {
                    *p = n;
                }
            };
            for d in [&mut settings.steamcmd_dir, &mut settings.default_install_root, &mut settings.backup_dir].into_iter().flatten() {
                fix(d);
            }
            for i in instances.iter_mut() {
                fix(&mut i.install_dir);
                if let Some(c) = i.cluster_dir.as_mut() {
                    fix(c);
                }
            }
            let _ = write_json_atomic(&data_dir.join("instances.json"), &instances);
        }
        if settings.last_data_dir.as_ref() != Some(&data_dir) {
            settings.last_data_dir = Some(data_dir.clone());
            let _ = write_json_atomic(&data_dir.join("settings.json"), &settings);
        }
        let http = reqwest::Client::builder()
            .user_agent(concat!("ASA-Server-Manager/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("http client");
        Self {
            data_dir,
            portable,
            settings: RwLock::new(settings),
            instances: RwLock::new(instances),
            runtime: Mutex::new(HashMap::new()),
            rcon: Mutex::new(HashMap::new()),
            http,
            cancels: Mutex::new(HashMap::new()),
            steam_lock: Mutex::new(()),
            latest_build_cache: Mutex::new(None),
        }
    }

    pub async fn persist_instances(&self) -> AppResult<()> {
        let list = self.instances.read().await.clone();
        write_json_atomic(&self.data_dir.join("instances.json"), &list)
    }

    pub async fn persist_settings(&self) -> AppResult<()> {
        let s = self.settings.read().await.clone();
        write_json_atomic(&self.data_dir.join("settings.json"), &s)
    }

    pub async fn instance(&self, id: &str) -> AppResult<ServerInstance> {
        self.instances
            .read()
            .await
            .iter()
            .find(|i| i.id == id)
            .cloned()
            .ok_or_else(|| AppError::InstanceNotFound(id.to_string()))
    }

    pub async fn steamcmd_dir(&self) -> PathBuf {
        self.settings
            .read()
            .await
            .steamcmd_dir
            .clone()
            .unwrap_or_else(|| self.data_dir.join("steamcmd"))
    }

    /// Where a server's backups go: `<server folder>\Backups` by default, or
    /// `<override>\<server id>` when a global backup folder is set in App settings.
    pub async fn backup_dir(&self, inst: &ServerInstance) -> PathBuf {
        match self.settings.read().await.backup_dir.clone() {
            Some(root) => root.join(&inst.id),
            None => inst.install_dir.join("Backups"),
        }
    }

    /// Pre-0.2 location (`<data>/backups/<id>`), still listed so older backups stay restorable.
    pub fn legacy_backup_dir(&self, inst: &ServerInstance) -> PathBuf {
        self.data_dir.join("backups").join(&inst.id)
    }

    pub async fn default_install_root(&self) -> PathBuf {
        self.settings
            .read()
            .await
            .default_install_root
            .clone()
            .unwrap_or_else(|| self.data_dir.join("servers"))
    }

    pub async fn with_runtime<R>(&self, id: &str, f: impl FnOnce(&mut Runtime) -> R) -> R {
        let mut map = self.runtime.lock().await;
        f(map.entry(id.to_string()).or_default())
    }

    pub async fn status(&self, inst: &ServerInstance) -> ServerStatus {
        let map = self.runtime.lock().await;
        let rt = map.get(&inst.id);
        let installed = inst.is_installed();
        let state = match rt {
            Some(r) if r.installing => ServerState::Installing,
            Some(r) if r.state.is_some() => r.state.unwrap(),
            _ if !installed => ServerState::NotInstalled,
            _ => ServerState::Stopped,
        };
        let state = if state == ServerState::Stopped && !installed {
            ServerState::NotInstalled
        } else {
            state
        };
        ServerStatus {
            id: inst.id.clone(),
            state,
            pid: rt.and_then(|r| r.pid),
            started_at: rt.and_then(|r| r.started_at),
            players: rt.and_then(|r| r.players),
            rcon_ok: rt.map(|r| r.rcon_ok).unwrap_or(false),
            crash_count: rt.map(|r| r.crash_times.len() as u32).unwrap_or(0),
            crash_loop: rt.map(|r| r.crash_loop).unwrap_or(false),
            installed_build: rt.and_then(|r| r.installed_build.clone()),
            latest_build: rt.and_then(|r| r.latest_build.clone()),
            pending_config: rt.map(|r| !r.pending_configs.is_empty()).unwrap_or(false),
            next_restart: rt.and_then(|r| r.next_restart),
        }
    }

    pub async fn emit_status(&self, app: &AppHandle, id: &str) {
        if let Ok(inst) = self.instance(id).await {
            let st = self.status(&inst).await;
            let _ = app.emit("server-status", st);
        }
    }

    pub async fn register_cancel(&self, task_id: &str) -> Arc<std::sync::atomic::AtomicBool> {
        let flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        self.cancels
            .lock()
            .await
            .insert(task_id.to_string(), flag.clone());
        flag
    }
}

/// Small helper to stream progress for long running jobs to the UI.
#[derive(Clone)]
pub struct TaskReporter {
    pub app: AppHandle,
    pub task_id: String,
    pub instance_id: Option<String>,
    pub kind: String,
    pub title: String,
    /// When set, raw output lines are not forwarded to the log stream.
    pub quiet: bool,
}

impl TaskReporter {
    pub fn new(app: &AppHandle, kind: &str, title: &str, instance_id: Option<&str>) -> Self {
        Self {
            app: app.clone(),
            task_id: uuid::Uuid::new_v4().to_string(),
            instance_id: instance_id.map(|s| s.to_string()),
            kind: kind.to_string(),
            title: title.to_string(),
            quiet: false,
        }
    }
    pub fn quiet(mut self) -> Self {
        self.quiet = true;
        self
    }
    fn send(&self, message: &str, progress: Option<f64>, done: bool, error: Option<String>) {
        let _ = self.app.emit(
            "task",
            TaskEvent {
                task_id: self.task_id.clone(),
                instance_id: self.instance_id.clone(),
                kind: self.kind.clone(),
                title: self.title.clone(),
                message: message.to_string(),
                progress,
                done,
                error,
            },
        );
    }
    pub fn progress(&self, message: &str, progress: Option<f64>) {
        self.send(message, progress, false, None)
    }
    pub fn done(&self, message: &str) {
        self.send(message, Some(1.0), true, None)
    }
    pub fn fail(&self, error: &str) {
        self.send(error, None, true, Some(error.to_string()))
    }
    pub fn log(&self, line: &str) {
        if self.quiet {
            return;
        }
        let _ = self.app.emit(
            "log-lines",
            LogBatch {
                id: self.instance_id.clone().unwrap_or_default(),
                source: self.kind.clone(),
                lines: vec![line.to_string()],
                ts: chrono::Utc::now().timestamp_millis(),
            },
        );
    }
}

pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Load a JSON file without ever losing data: a file that exists but can't be parsed is kept as
/// `<name>.corrupt-<timestamp>` and the last good `.bak` copy is used instead.
pub fn load_json_safe<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    if !path.exists() {
        return read_json(&path.with_extension("json.bak")).unwrap_or_default();
    }
    if let Some(v) = read_json(path) {
        return v;
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let corrupt = path.with_extension(format!("json.corrupt-{stamp}"));
    let _ = std::fs::rename(path, &corrupt);
    eprintln!("{} was unreadable; kept as {} and restored from backup", path.display(), corrupt.display());
    read_json(&path.with_extension("json.bak")).unwrap_or_default()
}

pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Keep the previous good version as a one-step backup.
    if path.exists() && read_json::<serde_json::Value>(path).is_some() {
        let _ = std::fs::copy(path, path.with_extension("json.bak"));
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(value)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corrupt_file_is_preserved_and_backup_used() {
        let dir = std::env::temp_dir().join(format!("asm-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("instances.json");
        write_json_atomic(&p, &vec![1, 2, 3]).unwrap();
        write_json_atomic(&p, &vec![4, 5]).unwrap(); // .bak now holds [1,2,3]
        std::fs::write(&p, "{ not json").unwrap();
        let v: Vec<i32> = load_json_safe(&p);
        assert_eq!(v, vec![1, 2, 3]);
        let kept = std::fs::read_dir(&dir).unwrap().flatten().any(|e| e.file_name().to_string_lossy().contains("corrupt-"));
        assert!(kept, "corrupt file must be kept");
        let _ = std::fs::remove_dir_all(dir);
    }
}
