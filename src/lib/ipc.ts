import { invoke } from '@tauri-apps/api/core';
import type * as T from './types';

/** Typed wrappers over every Rust command. Errors arrive as plain strings. */
export const api = {
  appInfo: () => invoke<T.AppInfo>('get_app_info'),
  getSettings: () => invoke<T.AppSettings>('get_settings'),
  saveSettings: (settings: T.AppSettings) => invoke<void>('save_settings', { settings }),
  cancelTask: (taskId: string) => invoke<void>('cancel_task', { taskId }),
  probeSteamcmdDir: (path: string) =>
    invoke<{ exists: boolean; hasSteamcmd: boolean; writable: boolean; empty: boolean }>('probe_steamcmd_dir', { path }),

  checkPrereqs: () => invoke<T.Prereq[]>('check_prereqs'),
  installPrereqs: (ids: string[]) => invoke<void>('install_prereqs', { ids }),

  listInstances: () => invoke<T.ServerInstance[]>('list_instances'),
  getStatuses: () => invoke<T.ServerStatus[]>('get_statuses'),
  suggestPorts: () => invoke<{ gamePort: number; queryPort: number; rconPort: number }>('suggest_ports'),
  createInstance: (input: {
    name: string;
    installDir?: string | null;
    map: string;
    maxPlayers?: number;
    adminPassword?: string;
    clusterId?: string | null;
    gamePort?: number;
    rconPort?: number;
  }) => invoke<T.ServerInstance>('create_instance', { input }),
  updateInstance: (instance: T.ServerInstance) => invoke<T.ServerInstance>('update_instance', { instance }),
  deleteInstance: (id: string, deleteFiles: boolean) => invoke<void>('delete_instance', { id, deleteFiles }),
  cloneInstance: (id: string, name: string) => invoke<T.ServerInstance>('clone_instance', { id, name }),
  importExisting: (path: string, name?: string) => invoke<T.ServerInstance>('import_existing', { path, name }),

  installServer: (id: string, validate = false) => invoke<void>('install_server', { id, validate }),
  checkServerUpdate: (id: string) => invoke<boolean>('check_server_update', { id }),
  startServer: (id: string) => invoke<void>('start_server', { id }),
  stopServer: (id: string, force = false) => invoke<void>('stop_server', { id, force }),
  restartServer: (id: string, warnMinutes: number[], update: boolean) =>
    invoke<void>('restart_server', { id, warnMinutes, update }),
  launchLine: (id: string) => invoke<string>('get_launch_line', { id }),

  readConfig: (id: string, file: IniFileName) => invoke<T.ConfigFile>('read_config', { id, file }),
  writeConfig: (id: string, file: IniFileName, text: string) =>
    invoke<{ deferred: boolean }>('write_config', { id, file, text }),
  validateIni: (text: string) => invoke<T.IniIssue[]>('validate_ini', { text }),

  rcon: (id: string, command: string) => invoke<string>('rcon_exec', { id, command }),
  listPlayers: (id: string) => invoke<T.Player[]>('list_players', { id }),
  a2s: (id: string) => invoke<T.A2sInfo>('a2s_query', { id }),
  logTail: (id: string, maxLines: number) => invoke<string[]>('read_log_tail', { id, maxLines }),

  cfSearch: (query: string, sort: number, index: number) =>
    invoke<{ mods: T.CfMod[]; total: number }>('cf_search', { query, sort, index }),
  cfGetMods: (ids: number[]) => invoke<T.CfMod[]>('cf_get_mods', { ids }),
  checkModUpdates: (id: string) => invoke<T.ServerInstance>('check_mod_updates', { id }),
  purgeModFiles: (id: string, modId: number) => invoke<number>('purge_mod_files', { id, modId }),

  runDiagnostics: (id: string, options: T.DiagOptions) => invoke<T.DiagStep[]>('run_diagnostics', { id, options }),
  addFirewallRules: (id: string) => invoke<void>('add_firewall_rules', { id }),

  checkSaves: (id: string) => invoke<T.SaveCheck[]>('check_saves', { id }),
  rollbackSave: (id: string, snapshot: string) => invoke<string>('rollback_save', { id, snapshot }),
  createBackup: (id: string, label: string) => invoke<T.BackupInfo>('create_backup', { id, label }),
  backupDir: (id: string) => invoke<string>('get_backup_dir', { id }),
  listBackups: (id: string) => invoke<T.BackupInfo[]>('list_backups', { id }),
  restoreBackup: (id: string, path: string, includeConfigs: boolean) =>
    invoke<void>('restore_backup', { id, path, includeConfigs }),
  deleteBackup: (id: string, path: string) => invoke<void>('delete_backup', { id, path }),

  exportPack: (id: string, dest: string, options: { includeSaves: boolean; includeCluster: boolean; includePasswords: boolean }) =>
    invoke<void>('export_pack', { id, dest, options }),
  readPack: (path: string) => invoke<T.PackManifest>('read_pack', { path }),
  mapCatalog: (force = false) =>
    invoke<{ maps: { id: string; name: string; modId?: number | null }[]; fetchedAt?: number | null; source: 'live' | 'cache' | 'none'; error?: string | null }>('get_map_catalog', { force }),
  listUserPresets: () => invoke<unknown[]>('list_user_presets'),
  saveUserPresets: (presets: unknown[]) => invoke<void>('save_user_presets', { presets }),
  importPack: (path: string, name: string, installDir?: string | null) =>
    invoke<T.ServerInstance>('import_pack', { path, name, installDir }),
};

export type IniFileName = 'GameUserSettings.ini' | 'Game.ini';
export const GUS: IniFileName = 'GameUserSettings.ini';
export const GAME: IniFileName = 'Game.ini';

export function errMsg(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}
