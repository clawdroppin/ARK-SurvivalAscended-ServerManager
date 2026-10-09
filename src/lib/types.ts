// Mirrors of the Rust models (serde camelCase).

export type LaunchValue = boolean | string;

export interface ModEntry {
  id: number;
  name: string;
  enabled: boolean;
  passive: boolean;
  logoUrl?: string | null;
  summary?: string | null;
  websiteUrl?: string | null;
  knownDate?: string | null;
  latestDate?: string | null;
}

export interface Automation {
  autoRestartOnCrash: boolean;
  maxCrashRestarts: number;
  autoBackupMinutes: number;
  backupRetention: number;
  restartTimes: string[];
  restartWarnings: number[];
  updateOnRestart: boolean;
  checkUpdatesMinutes: number;
  autoStartWithApp: boolean;
}

export interface ServerInstance {
  id: string;
  name: string;
  installDir: string;
  map: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  adminPassword: string;
  serverPassword: string;
  spectatorPassword: string;
  maxPlayers: number;
  clusterId?: string | null;
  clusterDir?: string | null;
  altSaveDirectory?: string | null;
  mods: ModEntry[];
  launchOptions: Record<string, LaunchValue>;
  customArgs: string;
  automation: Automation;
  accent?: string | null;
  createdAt: number;
}

export interface AppSettings {
  steamcmdDir?: string | null;
  defaultInstallRoot?: string | null;
  curseforgeApiKey: string;
  backupDir?: string | null;
  onboardingComplete: boolean;
  telemetryIntervalMs: number;
  confirmDestructive: boolean;
}

export interface AppInfo {
  version: string;
  portable: boolean;
  steamcmdInstalled: boolean;
  dataDir: string;
  steamcmdDir: string;
  /** Global backup override; null = each server's own Backups folder. */
  backupDir?: string | null;
  defaultInstallRoot: string;
}

export type ServerState = 'notInstalled' | 'stopped' | 'installing' | 'starting' | 'running' | 'stopping' | 'crashed';

export interface ServerStatus {
  id: string;
  state: ServerState;
  pid?: number | null;
  startedAt?: number | null;
  players?: number | null;
  rconOk: boolean;
  crashCount: number;
  crashLoop: boolean;
  installedBuild?: string | null;
  latestBuild?: string | null;
  pendingConfig: boolean;
  nextRestart?: number | null;
}

export interface TelemetrySample {
  id: string;
  ts: number;
  cpu: number;
  memBytes: number;
  sysMemTotal: number;
  sysMemUsed: number;
  netRxBps: number;
  netTxBps: number;
  diskReadBps: number;
  diskWriteBps: number;
  players?: number | null;
  rconLatencyMs?: number | null;
  uptimeSecs?: number | null;
}

export interface TaskEvent {
  taskId: string;
  instanceId?: string | null;
  kind: string;
  title: string;
  message: string;
  progress?: number | null;
  done: boolean;
  error?: string | null;
}

export interface LogBatch {
  id: string;
  source: string;
  lines: string[];
  ts: number;
}

export interface ServerEvent {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface Player {
  index: number;
  name: string;
  eosId: string;
}

export interface Prereq {
  id: string;
  name: string;
  description: string;
  status: 'ok' | 'missing' | 'warning';
  detail: string;
  required: boolean;
  installable: boolean;
}

export interface IniIssue {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ConfigFile {
  text: string;
  exists: boolean;
  path: string;
}

export interface CfMod {
  id: number;
  name: string;
  summary: string;
  logoUrl?: string | null;
  downloadCount: number;
  authors: string[];
  dateModified?: string | null;
  dateReleased?: string | null;
  websiteUrl?: string | null;
  categories: string[];
  classId?: number | null;
  isAvailable: boolean;
  latestFileName?: string | null;
}

export interface DiagOptions {
  applyFixes: boolean;
  validateFiles: boolean;
  repairSaves: boolean;
  checkMods: boolean;
  cleanCache: boolean;
  checkNetwork: boolean;
  openFirewall: boolean;
  installPrereqs: boolean;
}

export interface DiagStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'ok' | 'warning' | 'error' | 'fixed' | 'skipped';
  findings: string[];
  fixes: string[];
}

export interface DiagEvent {
  runId: string;
  instanceId: string;
  step: DiagStep;
}

export interface SaveFile {
  path: string;
  name: string;
  size: number;
  modified: number;
  isPrimary: boolean;
}

export interface SaveCheck {
  file: SaveFile;
  status: 'ok' | 'corrupt' | 'unknown';
  detail: string;
}

export interface BackupInfo {
  path: string;
  name: string;
  size: number;
  created: number;
}

export interface PackManifest {
  format: string;
  version: number;
  createdAt: string;
  profile: ServerInstance;
  includesSaves: boolean;
  includesCluster: boolean;
  includesPasswords: boolean;
}

export interface A2sInfo {
  name: string;
  map: string;
  players: number;
  maxPlayers: number;
  version: string;
  pingMs: number;
}
