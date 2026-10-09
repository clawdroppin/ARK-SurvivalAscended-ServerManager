/**
 * Command-line options that only work on the launch line (not in INI files). Keys include their
 * prefix: `-Flag` / `-Key=value` options or `?Key=value` URL options. Profile-managed options
 * (port, mods, cluster, max players, passwords) are configured elsewhere and excluded here.
 */
export interface LaunchOptionDef {
  key: string;
  kind: 'flag' | 'value' | 'select';
  label: string;
  desc: string;
  group: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  recommended?: boolean;
  danger?: boolean;
}

export const LAUNCH_GROUPS = [
  'Platform & Access',
  'Logging',
  'Gameplay',
  'Creatures',
  'Events',
  'Performance',
  'Network',
  'Anti-cheat & Integrity',
  'Experimental (undocumented)',
] as const;

export const LAUNCH_OPTIONS: LaunchOptionDef[] = [
  // Platform & access
  {
    key: '-ServerPlatform', kind: 'select', group: 'Platform & Access', label: 'Allowed platforms',
    desc: 'Which clients may join. ALL enables crossplay with consoles; combine with + (e.g. PC+XSX).',
    options: [
      { value: '', label: 'Default (ALL)' }, { value: 'ALL', label: 'All platforms (crossplay)' },
      { value: 'PC', label: 'PC – Steam only' }, { value: 'PC+WINGDK', label: 'PC – Steam + Microsoft Store' },
      { value: 'PS5', label: 'PlayStation 5' }, { value: 'XSX', label: 'Xbox Series' },
      { value: 'PC+XSX+WINGDK', label: 'PC + Xbox ecosystem' },
    ],
  },
  { key: '-exclusivejoin', kind: 'flag', group: 'Platform & Access', label: 'Whitelist only', desc: 'Only players added with AllowPlayerToJoinNoCheck (Players tab) can join.' },
  { key: '-EnableIdlePlayerKick', kind: 'flag', group: 'Platform & Access', label: 'Kick idle players', desc: 'Kick players idle for longer than Kick Idle Players Period.' },
  { key: '-culture', kind: 'select', group: 'Platform & Access', label: 'Server language', desc: 'Language for server-generated messages.',
    options: ['', 'en', 'de', 'fr', 'es', 'it', 'pl', 'pt_BR', 'ru', 'ja', 'ko', 'zh', 'zh-Hant-TW', 'tr', 'cs', 'da', 'fi', 'hu', 'nl', 'sv', 'uk', 'th'].map((v) => ({ value: v, label: v || 'Default' })) },
  { key: '-DisableCustomCosmetics', kind: 'flag', group: 'Platform & Access', label: 'Disable custom cosmetics', desc: 'Block mod-provided cosmetics.' },
  { key: '-DoCustomCosmeticValidation', kind: 'flag', group: 'Platform & Access', label: 'Validate custom cosmetics', desc: 'Validate cosmetic mods against the whitelist.' },

  // Logging
  { key: '-servergamelog', kind: 'flag', group: 'Logging', label: 'Server game log', desc: 'Write admin commands, tribe events and more to ServerGame logs.', recommended: true },
  { key: '-servergamelogincludetribelogs', kind: 'flag', group: 'Logging', label: 'Include tribe logs', desc: 'Add tribe log entries to the server game log.' },
  { key: '-ServerRCONOutputTribeLogs', kind: 'flag', group: 'Logging', label: 'Tribe logs over RCON', desc: 'Stream tribe logs through RCON chat output.' },
  { key: '-NotifyAdminCommandsInChat', kind: 'flag', group: 'Logging', label: 'Announce admin commands', desc: 'Post admin command usage in global chat.' },
  { key: '-ForceDupeLog', kind: 'flag', group: 'Logging', label: 'Force dupe log', desc: 'Always write potential duplication events to the log.' },
  { key: '-DisableDupeLogDeletes', kind: 'flag', group: 'Logging', label: 'Keep dupe logs', desc: 'Do not delete old dupe-detection logs.' },

  // Gameplay
  { key: '-ForceAllowCaveFlyers', kind: 'flag', group: 'Gameplay', label: 'Allow flyers in caves', desc: 'Let flying creatures enter caves.' },
  { key: '-AutoDestroyStructures', kind: 'flag', group: 'Gameplay', label: 'Auto-destroy old structures', desc: 'Enable the auto-destroy timer (see Auto Destroy Old Structures Multiplier).' },
  { key: '-imprintlimit', kind: 'value', group: 'Gameplay', label: 'Imprint limit', desc: 'Max imprint % a creature can reach (default 100).', placeholder: '101' },
  { key: '-MinimumTimeBetweenInventoryRetrieval', kind: 'value', group: 'Gameplay', label: 'Inventory retrieval cooldown', desc: 'Seconds between retrieving uploaded inventories (default 3600).', placeholder: '3600' },
  { key: '-pvedisallowtribewar', kind: 'flag', group: 'Gameplay', label: 'Disallow PvE tribe war', desc: 'Prevent tribe war declarations in PvE.' },
  { key: '-PVPDisablePenetratingHits', kind: 'flag', group: 'Gameplay', label: 'Disable penetrating hits', desc: 'Stop hits from passing through structures in PvP.' },
  { key: '-NoBiomeWalls', kind: 'flag', group: 'Gameplay', label: 'No biome walls', desc: 'Disable invisible biome walls.' },
  { key: '-nofishloot', kind: 'flag', group: 'Gameplay', label: 'No fishing loot', desc: 'Fishing yields meat only.' },
  { key: '-ClearOldItems', kind: 'flag', group: 'Gameplay', label: 'Clear old items', desc: 'Remove all items dropped before the last restart.' },
  { key: '-StructureDestructionTag', kind: 'value', group: 'Gameplay', label: 'Structure destruction tag', desc: 'Destroy structures inside newly added biome zones on start.', placeholder: 'DestroySwampSnowStructures' },

  // Creatures
  { key: '-NoWildBabies', kind: 'flag', group: 'Creatures', label: 'No wild babies', desc: 'Prevent wild baby creatures from spawning.' },
  { key: '-ForceRespawnDinos', kind: 'flag', group: 'Creatures', label: 'Respawn all wild creatures on start', desc: 'Wipe and respawn every wild creature on launch – great after changing spawn settings.' },
  { key: '-NoDinos', kind: 'flag', group: 'Creatures', label: 'No wild creatures', desc: 'Disable wild creature spawning entirely.', danger: true },
  { key: '-NoDinosExceptForcedSpawn', kind: 'flag', group: 'Creatures', label: 'Only forced spawns', desc: 'Only creatures spawned by forced/scripted spawners.' },
  { key: '-NoDinosExceptWaterSpawn', kind: 'flag', group: 'Creatures', label: 'Only water spawns', desc: 'Only water creatures spawn.' },
  { key: '-NoDinosExceptManualSpawn', kind: 'flag', group: 'Creatures', label: 'Only manual spawns', desc: 'Only creatures spawned with admin commands.' },
  { key: '-disabledinonetrangescaling', kind: 'flag', group: 'Creatures', label: 'Disable creature net range scaling', desc: 'Disable dynamic network range scaling for creatures.' },
  { key: '-UnstasisDinoObstructionCheck', kind: 'flag', group: 'Creatures', label: 'Unstasis obstruction check', desc: 'Prevent creatures unstasising inside structures.' },
  { key: '-StasisKeepControllers', kind: 'flag', group: 'Creatures', label: 'Keep AI controllers in stasis', desc: 'Keep AI controllers alive in stasis (more RAM, faster wake-up).' },
  { key: '-NoAI', kind: 'flag', group: 'Creatures', label: 'Disable creature AI', desc: 'Creatures stand still. Testing only.', danger: true },

  // Events
  { key: '-ActiveEvent', kind: 'select', group: 'Events', label: 'Active event', desc: 'Run a seasonal event (ASA ships most events as mods – Winter Wonderland still works natively).',
    options: [
      { value: '', label: 'None' }, { value: 'WinterWonderland', label: 'Winter Wonderland' }, { value: 'Easter', label: 'Eggcellent Adventure' },
      { value: 'FearEvolved', label: 'Fear Evolved' }, { value: 'Summer', label: 'Summer Bash' }, { value: 'TurkeyTrial', label: 'Turkey Trial' },
      { value: 'vday', label: 'Love Evolved' }, { value: 'PAX', label: 'PAX' }, { value: 'None', label: 'Force no event' },
    ] },
  { key: '-ServerUseEventColors', kind: 'flag', group: 'Events', label: 'Event colors', desc: 'Wild creatures use event color palettes.' },
  { key: '-EasterColors', kind: 'flag', group: 'Events', label: 'Easter colors', desc: 'Wild creatures use Easter colors.' },
  { key: '?EventColorsChanceOverride', kind: 'value', group: 'Events', label: 'Event color chance', desc: 'Chance (0–1) for wild creatures to roll event colors.', placeholder: '0.5' },

  // Performance
  { key: '-UseDynamicConfig', kind: 'flag', group: 'Performance', label: 'Dynamic config', desc: 'Load live-tunable rates from the dynamic config URL.' },
  { key: '-GBUsageToForceRestart', kind: 'value', group: 'Performance', label: 'RAM restart threshold (GB)', desc: 'Restart automatically when RAM usage exceeds this many GB (default 35).', placeholder: '35' },
  { key: '-MaxNumOfSaveBackups', kind: 'value', group: 'Performance', label: 'Rolling save snapshots', desc: 'Number of timestamped .ark snapshots the server keeps (default 20).', placeholder: '20' },
  { key: '-UseStructureStasisGrid', kind: 'flag', group: 'Performance', label: 'Structure stasis grid', desc: 'Grid-based structure stasis – helps big bases.' },
  { key: '-structurememopts', kind: 'flag', group: 'Performance', label: 'Structure memory optimizations', desc: 'Reduce memory used by structures.' },
  { key: '-forceuseperfthreads', kind: 'flag', group: 'Performance', label: 'Force perf threads', desc: 'Force extra worker threads on.' },
  { key: '-noperfthreads', kind: 'flag', group: 'Performance', label: 'No perf threads', desc: 'Disable extra worker threads (low-core hosts).' },
  { key: '-AlwaysTickDedicatedSkeletalMeshes', kind: 'flag', group: 'Performance', label: 'Always tick skeletal meshes', desc: 'Fix creatures/players appearing frozen; costs CPU.' },
  { key: '-nosound', kind: 'flag', group: 'Performance', label: 'No sound', desc: 'Disable audio subsystem on the server.', recommended: true },

  // Network
  { key: '-MULTIHOME', kind: 'flag', group: 'Network', label: 'Multihome', desc: 'Bind to a specific IP (set it in [MultiHome] or with -ServerIP).' },
  { key: '-ServerIP', kind: 'value', group: 'Network', label: 'Bind IP', desc: 'IPv4 address to bind when the host has several NICs.', placeholder: '192.168.1.10' },
  { key: '-UseServerNetSpeedCheck', kind: 'flag', group: 'Network', label: 'Net speed check', desc: 'Limit client bandwidth abuse.' },
  { key: '-NoTransferFromFiltering', kind: 'flag', group: 'Network', label: 'No transfer filtering', desc: 'Allow transfers from any server with the same cluster ID.' },
  { key: '-CustomNotificationURL', kind: 'value', group: 'Network', label: 'Notification webhook URL', desc: 'Custom URL for server notifications.' },

  // Anti-cheat
  { key: '-NoBattlEye', kind: 'flag', group: 'Anti-cheat & Integrity', label: 'Disable BattlEye', desc: 'Turn off BattlEye anti-cheat.' },
  { key: '-EnableSteelShield', kind: 'flag', group: 'Anti-cheat & Integrity', label: 'Steel Shield', desc: 'Enable Wildcard’s additional server-side protections.' },
  { key: '-ignoredupeditems', kind: 'flag', group: 'Anti-cheat & Integrity', label: 'Ignore duped items', desc: 'Ignore detected duplicated items instead of deleting.' },
  { key: '-disableCharacterTracker', kind: 'flag', group: 'Anti-cheat & Integrity', label: 'Disable character tracker', desc: 'Disable the character tracking subsystem.' },

  // Documented options that were missing
  { key: '-usestore', kind: 'flag', group: 'Gameplay', label: 'Use player data store', desc: 'Store player and tribe data in the newer per-file store format.' },
  { key: '-converttostore', kind: 'flag', group: 'Gameplay', label: 'Convert to data store', desc: 'One-time conversion of existing player/tribe data to the store format (use with -usestore).' },
  { key: '-NoDinosExceptStreamingSpawn', kind: 'flag', group: 'Creatures', label: 'Only streaming spawns', desc: 'Only creatures from world-partition streaming spawners appear.' },
  { key: '-ForceIgnoreSingleplayerSpawnRangeCheck', kind: 'flag', group: 'Creatures', label: 'Ignore SP spawn range check', desc: 'Spawn creatures even near the player when single-player settings are on.' },
  { key: '-onethread', kind: 'flag', group: 'Performance', label: 'Single thread', desc: 'Run the server on one thread. Diagnostics only – much slower.', danger: true },
  { key: '-LANPLAY', kind: 'flag', group: 'Network', label: 'LAN play', desc: 'Optimise networking for players on the same local network.' },

  // Experimental – present in the server binary but not officially documented; behaviour may change.
  { key: '-DisableRailgunPVP', kind: 'flag', group: 'Experimental (undocumented)', label: 'Disable railgun in PvP', desc: 'Prevents railgun damage in PvP.' },
  { key: '?MapPlayerLocation', kind: 'select', group: 'Experimental (undocumented)', label: 'Map player location (URL)', desc: 'Command-line form of Show Map Player Location.', options: [{ value: '', label: 'Use INI setting' }, { value: 'true', label: 'Show' }, { value: 'false', label: 'Hide' }] },
  { key: '-noantispeedhack', kind: 'flag', group: 'Experimental (undocumented)', label: 'Disable anti-speedhack', desc: 'Turns off the movement speed-hack check.', danger: true },
  { key: '-speedhackbias', kind: 'value', group: 'Experimental (undocumented)', label: 'Speedhack tolerance', desc: 'Tolerance for the speed-hack check (default 1.0; higher = more lenient).', placeholder: '1.0' },
  { key: '-nocombineclientmoves', kind: 'flag', group: 'Experimental (undocumented)', label: 'Don’t combine client moves', desc: 'Disables movement packet combining (may help rubber-banding, costs bandwidth).' },
  { key: '-NoHangDetection', kind: 'flag', group: 'Experimental (undocumented)', label: 'No hang detection', desc: 'Stop the engine from killing the server when the game thread hangs (e.g. very long saves).' },
  { key: '-noundermeshchecking', kind: 'flag', group: 'Experimental (undocumented)', label: 'No under-mesh checking', desc: 'Disable checks for players under the map.' },
  { key: '-noundermeshkilling', kind: 'flag', group: 'Experimental (undocumented)', label: 'No under-mesh killing', desc: 'Detect but don’t kill players under the map.' },
  { key: '-UseItemDupeCheck', kind: 'flag', group: 'Experimental (undocumented)', label: 'Item dupe check', desc: 'Extra duplication detection on item transfers.' },
  { key: '-UseSecureSpawnRules', kind: 'flag', group: 'Experimental (undocumented)', label: 'Secure spawn rules', desc: 'Stricter item spawn validation.' },
  { key: '-UseTameEffectivenessClamp', kind: 'flag', group: 'Experimental (undocumented)', label: 'Clamp taming effectiveness', desc: 'Clamp taming effectiveness to valid ranges.' },
  { key: '-AllowChatSpam', kind: 'flag', group: 'Experimental (undocumented)', label: 'Allow chat spam', desc: 'Disable the chat spam filter.' },
  { key: '-MaxConnectionsPerIP', kind: 'value', group: 'Experimental (undocumented)', label: 'Max connections per IP', desc: 'Limit simultaneous connections from one IP address.', placeholder: '4' },
  { key: '-pveallowtribewar', kind: 'flag', group: 'Experimental (undocumented)', label: 'PvE allow tribe war', desc: 'Command-line form of PvE Allow Tribe War.' },
  { key: '-DisableCustomFoldersInTributeInventories', kind: 'flag', group: 'Experimental (undocumented)', label: 'No folders in upload inventory', desc: 'Prevent custom folders in obelisk/transmitter inventories.' },
  { key: '-BackupTransferPlayerDatas', kind: 'flag', group: 'Experimental (undocumented)', label: 'Back up transfer data', desc: 'Keep backups of cross-ARK transfer data.' },
  { key: '-PreventHibernation', kind: 'flag', group: 'Experimental (undocumented)', label: 'Prevent hibernation', desc: 'Keep distant areas ticking (more CPU).' },
  { key: '-nodormancythrottling', kind: 'flag', group: 'Experimental (undocumented)', label: 'No dormancy throttling', desc: 'Disable network dormancy throttling.' },
  { key: '-DormancyNetMultiplier', kind: 'value', group: 'Experimental (undocumented)', label: 'Dormancy net multiplier', desc: 'Scales network dormancy distances.', placeholder: '1.0' },
  { key: '-TotalConversionMod', kind: 'value', group: 'Experimental (undocumented)', label: 'Total conversion mod', desc: 'Run a total-conversion mod by its mod ID.', placeholder: 'mod ID' },
  { key: '-CustomAdminCommandTrackingURL', kind: 'value', group: 'Experimental (undocumented)', label: 'Admin command tracking URL', desc: 'Send admin command usage to a custom endpoint.' },
];
