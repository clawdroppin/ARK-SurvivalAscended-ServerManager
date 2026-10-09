use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

/// "ARK Survival Ascended Dedicated Server" tool (anonymous). Note: 2399830 is the game itself and fails with "No subscription".
pub const ASA_APP_ID: u32 = 2430930;
pub const CURSEFORGE_GAME_ID: u32 = 83374;

/// A launch option value: either a bare flag (`-NoBattlEye`) or a keyed value (`-WinLiveMaxPlayers=70`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum LaunchValue {
    Flag(bool),
    Value(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
    pub id: u64,
    pub name: String,
    #[serde(default = "yes")]
    pub enabled: bool,
    #[serde(default)]
    pub passive: bool,
    #[serde(default)]
    pub logo_url: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub website_url: Option<String>,
    /// CurseForge `dateModified` known when the mod was added/last acknowledged.
    #[serde(default)]
    pub known_date: Option<String>,
    /// Latest `dateModified` seen during an update check.
    #[serde(default)]
    pub latest_date: Option<String>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Automation {
    pub auto_restart_on_crash: bool,
    pub max_crash_restarts: u32,
    pub auto_backup_minutes: u32,
    pub backup_retention: u32,
    /// Local wall-clock times ("HH:MM") for scheduled restarts.
    pub restart_times: Vec<String>,
    /// Minutes before a scheduled restart at which to broadcast a warning.
    pub restart_warnings: Vec<u32>,
    pub update_on_restart: bool,
    pub check_updates_minutes: u32,
    pub auto_start_with_app: bool,
}

impl Default for Automation {
    fn default() -> Self {
        Self {
            auto_restart_on_crash: true,
            max_crash_restarts: 3,
            auto_backup_minutes: 60,
            backup_retention: 24,
            restart_times: vec![],
            restart_warnings: vec![15, 5, 1],
            update_on_restart: true,
            check_updates_minutes: 30,
            auto_start_with_app: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInstance {
    pub id: String,
    pub name: String,
    pub install_dir: PathBuf,
    pub map: String,
    #[serde(default)]
    pub session_name: String,
    pub game_port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
    #[serde(default)]
    pub admin_password: String,
    #[serde(default)]
    pub server_password: String,
    #[serde(default)]
    pub spectator_password: String,
    pub max_players: u32,
    #[serde(default)]
    pub cluster_id: Option<String>,
    #[serde(default)]
    pub cluster_dir: Option<PathBuf>,
    #[serde(default)]
    pub alt_save_directory: Option<String>,
    #[serde(default)]
    pub mods: Vec<ModEntry>,
    /// Command-line options keyed by option name without the leading `-`/`?`.
    #[serde(default)]
    pub launch_options: BTreeMap<String, LaunchValue>,
    #[serde(default)]
    pub custom_args: String,
    #[serde(default)]
    pub automation: Automation,
    #[serde(default)]
    pub accent: Option<String>,
    pub created_at: i64,
}

impl ServerInstance {
    pub fn server_exe(&self) -> PathBuf {
        self.install_dir
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ArkAscendedServer.exe")
    }
    pub fn config_dir(&self) -> PathBuf {
        self.install_dir
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join("WindowsServer")
    }
    pub fn saved_dir(&self) -> PathBuf {
        self.install_dir.join("ShooterGame").join("Saved")
    }
    pub fn save_dir(&self) -> PathBuf {
        let base = self.saved_dir().join("SavedArks");
        match &self.alt_save_directory {
            Some(alt) if !alt.trim().is_empty() => base.join(alt.trim()).join(&self.map),
            _ => base.join(&self.map),
        }
    }
    pub fn logs_dir(&self) -> PathBuf {
        self.saved_dir().join("Logs")
    }
    pub fn mods_dir(&self) -> PathBuf {
        self.install_dir
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ShooterGame")
            .join("Mods")
    }
    pub fn is_installed(&self) -> bool {
        self.server_exe().exists()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub steamcmd_dir: Option<PathBuf>,
    pub default_install_root: Option<PathBuf>,
    pub curseforge_api_key: String,
    pub backup_dir: Option<PathBuf>,
    pub onboarding_complete: bool,
    pub telemetry_interval_ms: u64,
    pub confirm_destructive: bool,
    /// Data folder the stored paths were written relative to (lets a portable folder be moved).
    pub last_data_dir: Option<PathBuf>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            steamcmd_dir: None,
            default_install_root: None,
            curseforge_api_key: String::new(),
            backup_dir: None,
            onboarding_complete: false,
            telemetry_interval_ms: 2000,
            confirm_destructive: true,
            last_data_dir: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ServerState {
    NotInstalled,
    Stopped,
    Installing,
    Starting,
    Running,
    Stopping,
    Crashed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub id: String,
    pub state: ServerState,
    pub pid: Option<u32>,
    pub started_at: Option<i64>,
    pub players: Option<u32>,
    pub rcon_ok: bool,
    pub crash_count: u32,
    pub crash_loop: bool,
    pub installed_build: Option<String>,
    pub latest_build: Option<String>,
    pub pending_config: bool,
    pub next_restart: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetrySample {
    pub id: String,
    pub ts: i64,
    /// Process CPU usage normalised to 0–100 % of the whole machine.
    pub cpu: f32,
    pub mem_bytes: u64,
    pub sys_mem_total: u64,
    pub sys_mem_used: u64,
    pub net_rx_bps: u64,
    pub net_tx_bps: u64,
    pub disk_read_bps: u64,
    pub disk_write_bps: u64,
    pub players: Option<u32>,
    /// Round-trip time of a no-op RCON command – a practical proxy for server-thread responsiveness.
    pub rcon_latency_ms: Option<u32>,
    pub uptime_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEvent {
    pub task_id: String,
    pub instance_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub message: String,
    /// 0.0–1.0, or None for indeterminate.
    pub progress: Option<f64>,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogBatch {
    pub id: String,
    /// "server" | "steamcmd" | "chat" | "rcon" | task kinds
    pub source: String,
    pub lines: Vec<String>,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub index: u32,
    pub name: String,
    pub eos_id: String,
}
