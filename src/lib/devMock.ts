/**
 * Browser-only preview backend. Loaded exclusively by `npm run dev` when the page is NOT inside
 * Tauri, so the UI can be designed/tested in a normal browser. Never bundled into the app build.
 */
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type { ServerInstance, ServerStatus } from './types';

const auto = { autoRestartOnCrash: true, maxCrashRestarts: 3, autoBackupMinutes: 60, backupRetention: 24, restartTimes: ['04:00'], restartWarnings: [15, 5, 1], updateOnRestart: true, checkUpdatesMinutes: 30, autoStartWithApp: false };

const instances: ServerInstance[] = [
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000001', name: 'Island PvE x5', installDir: 'D:\\ASA\\island', map: 'TheIsland_WP', sessionName: 'Island PvE x5 | Boosted',
    gamePort: 7777, queryPort: 27015, rconPort: 27020, adminPassword: 'hunter2hunter2', serverPassword: '', spectatorPassword: '', maxPlayers: 70,
    clusterId: 'alpha', clusterDir: 'C:\\data\\clusters\\alpha', altSaveDirectory: null,
    mods: [
      { id: 928548, name: 'Super Spyglass Plus', enabled: true, passive: false, summary: 'See creature stats at a glance', knownDate: '2026-08-01T00:00:00Z', latestDate: '2026-09-20T00:00:00Z' },
      { id: 929420, name: 'Awesome Teleporters', enabled: true, passive: false, summary: 'Teleport network for your tribe' },
      { id: 931047, name: 'Structures Plus (S+)', enabled: false, passive: false },
    ],
    launchOptions: { '-servergamelog': true, '-ServerPlatform': 'ALL' }, customArgs: '', automation: auto, createdAt: 1,
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000002', name: 'Scorched Hardcore', installDir: 'D:\\ASA\\se', map: 'ScorchedEarth_WP', sessionName: '',
    gamePort: 7779, queryPort: 27016, rconPort: 27021, adminPassword: 'x', serverPassword: '', spectatorPassword: '', maxPlayers: 40,
    clusterId: 'alpha', clusterDir: null, altSaveDirectory: null, mods: [], launchOptions: {}, customArgs: '', automation: auto, createdAt: 2,
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000003', name: 'Astraeos Test', installDir: 'D:\\ASA\\astraeos', map: 'Astraeos_WP', sessionName: '',
    gamePort: 7781, queryPort: 27017, rconPort: 27022, adminPassword: 'x', serverPassword: '', spectatorPassword: '', maxPlayers: 20,
    clusterId: null, clusterDir: null, altSaveDirectory: null, mods: [], launchOptions: {}, customArgs: '', automation: auto, createdAt: 3,
  },
];

const statuses: Record<string, ServerStatus> = {
  [instances[0].id]: { id: instances[0].id, state: 'running', pid: 4242, startedAt: Date.now() - 9_000_000, players: 12, rconOk: true, crashCount: 0, crashLoop: false, installedBuild: '19876543', latestBuild: '19876543', pendingConfig: false, nextRestart: Date.now() + 5 * 3600_000 },
  [instances[1].id]: { id: instances[1].id, state: 'stopped', rconOk: false, crashCount: 0, crashLoop: false, installedBuild: '19876543', latestBuild: '19900001', pendingConfig: false },
  [instances[2].id]: { id: instances[2].id, state: 'notInstalled', rconOk: false, crashCount: 0, crashLoop: false, pendingConfig: false },
};

const GUS_TEXT = `[ServerSettings]\r\nXPMultiplier=5.0\r\nHarvestAmountMultiplier=3.0\r\nTamingSpeedMultiplier=8.0\r\nDifficultyOffset=1.0\r\nOverrideOfficialDifficulty=5.0\r\nAllowThirdPersonPlayer=True\r\nShowFloatingDamageText=True\r\nRCONEnabled=True\r\nRCONPort=27020\r\nServerAdminPassword=hunter2hunter2\r\n\r\n[SessionSettings]\r\nSessionName=Island PvE x5 | Boosted\r\nPort=7777\r\n\r\n[MessageOfTheDay]\r\nMessage=Welcome survivors!\\nRates are 5x.\r\nDuration=20\r\n\r\n[SuperSpyglassPlus]\r\nShowTamingInfo=True\r\n`;
const GAME_TEXT = `[/script/shootergame.shootergamemode]\r\nBabyMatureSpeedMultiplier=25.0\r\nEggHatchSpeedMultiplier=20.0\r\nPerLevelStatsMultiplier_Player[7]=2.0\r\nPerLevelStatsMultiplier_DinoTamed[0]=0.3\r\nConfigOverrideItemMaxQuantity=(ItemClassString="PrimalItemResource_Stone_C",Quantity=(MaxItemQuantity=500,bIgnoreMultiplier=true))\r\nNPCReplacements=(FromClassName="Raptor_Character_BP_C",ToClassName="Dodo_Character_BP_C")\r\nBadLine without equals\r\n`;
const files: Record<string, string> = {};

export function installDevMock() {
  mockWindows('main');
  mockIPC(
    (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      switch (cmd) {
        case 'get_app_info':
          return { version: '0.1.0-dev', portable: false, steamcmdInstalled: true, dataDir: 'C:\\Users\\you\\AppData\\Roaming\\com.asaservermanager.app', steamcmdDir: 'C:\\…\\steamcmd', backupDir: null, defaultInstallRoot: 'D:\\ASA' };
        case 'get_settings':
          return { curseforgeApiKey: '', onboardingComplete: true, telemetryIntervalMs: 2000, confirmDestructive: true };
        case 'list_instances':
          return instances;
        case 'get_statuses':
          return Object.values(statuses);
        case 'suggest_ports':
          return { gamePort: 7783, queryPort: 27018, rconPort: 27023 };
        case 'update_instance': {
          const inst = a.instance as ServerInstance;
          const i = instances.findIndex((x) => x.id === inst.id);
          instances[i] = inst;
          return inst;
        }
        case 'read_config': {
          const k = `${a.id}:${a.file}`;
          return { text: files[k] ?? (a.file === 'Game.ini' ? GAME_TEXT : GUS_TEXT), exists: true, path: '' };
        }
        case 'write_config':
          files[`${a.id}:${a.file}`] = a.text as string;
          return { deferred: true };
        case 'validate_ini':
          return String(a.text)
            .split(/\r?\n/)
            .flatMap((l, i) => (l.trim() && !l.trim().startsWith('[') && !l.includes('=') && !l.trim().startsWith(';') ? [{ line: i + 1, severity: 'error', message: "Line is not a 'Key=Value' pair" }] : []));
        case 'get_launch_line':
          return '"D:\\ASA\\island\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe" TheIsland_WP?listen?Port=7777?QueryPort=27015?RCONEnabled=True?RCONPort=27020 -WinLiveMaxPlayers=70 -mods=928548,929420 -clusterid=alpha -servergamelog -ServerPlatform=ALL';
        case 'list_players':
          return [
            { index: 0, name: 'Rexy', eosId: '0002a1b2c3d4e5f60718293a4b5c6d7e' },
            { index: 1, name: 'DodoLord', eosId: '00029f8e7d6c5b4a39281706f5e4d3c2' },
          ];
        case 'rcon_exec':
          return a.command === 'ListPlayers' ? '0. Rexy, 0002a1b2c3d4\n1. DodoLord, 00029f8e7d6c' : 'Server received, But no response!!';
        case 'read_log_tail':
          return ['[2026.10.09-12.00.00:000][  0]Log file open', '[2026.10.09-12.00.01:000][  0]LogInit: Build: ++ASA+Release', '[2026.10.09-12.00.05:000][  0]Server: "Island PvE x5" has successfully started!', '[2026.10.09-12.10.11:000][  0]Warning: Mod 931047 not found'];
        case 'check_prereqs':
          return [
            { id: 'os', name: '64-bit Windows 10/11 or Server 2019+', description: '', status: 'ok', detail: 'Windows 11 Pro', required: true, installable: false },
            { id: 'vcredist', name: 'Visual C++ 2015–2022 Redistributable (x64)', description: 'Microsoft C/C++ runtime required by ArkAscendedServer.exe.', status: 'ok', detail: 'Installed v14.42', required: true, installable: true },
            { id: 'certs', name: 'Amazon TLS certificates (Epic Online Services)', description: 'Needed for the server to register with EOS.', status: 'missing', detail: 'Amazon RSA 2048 M02 intermediate missing', required: true, installable: true },
            { id: 'directx', name: 'DirectX End-User Runtime (June 2010)', description: 'Legacy D3DX/XInput libraries.', status: 'warning', detail: 'Not detected (recommended)', required: false, installable: true },
            { id: 'steamcmd', name: 'SteamCMD', description: 'Installs and updates the server.', status: 'ok', detail: 'Found', required: true, installable: true },
            { id: 'ram', name: 'Memory', description: '', status: 'ok', detail: '64.0 GB installed', required: false, installable: false },
            { id: 'disk', name: 'Free disk space', description: '', status: 'ok', detail: '812 GB free on D:\\ASA', required: false, installable: false },
          ];
        case 'get_map_catalog':
          return {
            source: 'live',
            fetchedAt: Date.now() - 3600_000,
            maps: [
              { id: 'TheIsland_WP', name: 'The Island' },
              { id: 'LostColony_WP', name: 'Lost Colony' },
              { id: 'BobsMissions_WP', name: 'Club ARK', modId: 1005639 },
            ],
          };
        case 'list_user_presets':
          return [];
        case 'save_user_presets':
          return null;
        case 'probe_steamcmd_dir':
          return { exists: true, hasSteamcmd: false, writable: true, empty: true };
        case 'list_backups':
          return [{ path: 'C:\\b\\x.zip', name: 'TheIsland_WP_20261009-040000_auto.zip', size: 184_000_000, created: Date.now() - 3600_000 }];
        case 'check_saves':
          return [
            { file: { path: 'a', name: 'TheIsland_WP.ark', size: 220_000_000, modified: Date.now() - 600_000, isPrimary: true }, status: 'ok', detail: 'Integrity check passed' },
            { file: { path: 'b', name: 'TheIsland_WP_09.10.2026_03.00.00.ark', size: 219_000_000, modified: Date.now() - 4 * 3600_000, isPrimary: false }, status: 'ok', detail: 'Integrity check passed' },
          ];
        case 'run_diagnostics':
          return new Promise((res) => {
            const steps = [
              { id: 'process', title: 'Server process', status: 'ok', findings: ['Server is running – stopping it gracefully'], fixes: ['Server stopped (world saved first)'] },
              { id: 'prereqs', title: 'System prerequisites', status: 'fixed', findings: ['Amazon TLS certificates: missing'], fixes: ['Installed: certs'] },
              { id: 'config', title: 'Configuration files', status: 'fixed', findings: ["Game.ini:7 – Line is not a 'Key=Value' pair"], fixes: ['Repaired Game.ini (original kept as .bak)'] },
              { id: 'saves', title: 'World save integrity', status: 'ok', findings: ['TheIsland_WP.ark (220 MB): Integrity check passed', '12 rolling snapshot(s), 0 corrupt'], fixes: [] },
              { id: 'mods', title: 'Mods & crash analysis', status: 'warning', findings: ["Mod 'Structures Plus (S+)' hasn't been updated in 260 days"], fixes: [] },
            ];
            steps.forEach((s, i) => setTimeout(() => emit('diagnostics', { runId: 'r', instanceId: a.id, step: s }), 300 * (i + 1)));
            setTimeout(() => res(steps), 300 * (steps.length + 1));
          });
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );

  // Fake telemetry for the running instance.
  let t = 0;
  setInterval(() => {
    t++;
    emit('telemetry', {
      id: instances[0].id, ts: Date.now(), cpu: 18 + Math.sin(t / 4) * 6 + Math.random() * 4, memBytes: 11.2e9 + Math.sin(t / 9) * 4e8, sysMemTotal: 68.5e9, sysMemUsed: 31e9,
      netRxBps: 420_000 + Math.random() * 120_000, netTxBps: 960_000 + Math.random() * 200_000, diskReadBps: 30_000 * Math.random(), diskWriteBps: t % 15 === 0 ? 48e6 : 200_000,
      players: 12, rconLatencyMs: 8 + Math.round(Math.random() * 6) + (t % 20 === 0 ? 60 : 0), uptimeSecs: 9000 + t * 2,
    });
    if (t % 3 === 0) emit('log-lines', { id: instances[0].id, source: 'server', lines: [`[${new Date().toISOString()}] LogNet: tick ${t}`], ts: Date.now() });
  }, 2000);
}

/**
 * README screenshots: `?shot=<view>[&cat=<settings category>][&overlay=newServer]` opens a view
 * once the store is ready. Dev-only, like the rest of this file.
 */
export async function applyShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot) return;
  const [{ useApp }, { useSettingsNav }] = await Promise.all([import('@/store/app'), import('@/features/settings/nav')]);
  const wait = () => new Promise<void>((r) => {
    const t = setInterval(() => useApp.getState().ready && (clearInterval(t), r()), 50);
  });
  await wait();
  const id = instances[0].id;
  useApp.setState({ overlay: null });
  if (shot === 'dashboard') useApp.getState().goHome();
  else useApp.getState().openTab(id, shot as never);
  const cat = q.get('cat');
  if (cat) setTimeout(() => useSettingsNav.getState().focus('XPMultiplier', cat), 200);
  const overlay = q.get('overlay');
  if (overlay) setTimeout(() => useApp.getState().setOverlay(overlay as never), 300);
}
