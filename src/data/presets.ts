/**
 * Built-in server presets. Rate tiers follow what the community commonly runs (official 1×,
 * official-event 2×, small-tribes ~3×, community/casual PvE 3–5× with 25–50× breeding, boosted
 * 10×+, competitive PvP ~3× with offline raid protection, hardcore ~2×, roleplay with longer days).
 * Exact values are hand-tuned for a good out-of-the-box experience – every one can be changed
 * afterwards in the editor.
 */

export interface PresetChange {
  file: 'GUS' | 'Game';
  section: string;
  key: string;
  value: string;
  /** For repeatable keys (list editors): the full list of values. */
  values?: string[];
}

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  hue: number;
  /** Headline numbers shown on the card. */
  rates: { xp: number; harvest: number; taming: number; breeding: number };
  changes: PresetChange[];
  /** Only the "Official" preset: start from a clean slate. */
  resetFirst?: boolean;
  builtin?: boolean;
}

const GAME = '/script/shootergame.shootergamemode';
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const b = (v: boolean) => (v ? 'True' : 'False');
const gus = (key: string, v: number | boolean | string, section = 'ServerSettings'): PresetChange => ({
  file: 'GUS',
  section,
  key,
  value: typeof v === 'number' ? f(v) : typeof v === 'boolean' ? b(v) : v,
});
const game = (key: string, v: number | boolean | string): PresetChange => ({
  file: 'Game',
  section: GAME,
  key,
  value: typeof v === 'number' ? (key.startsWith('Max') || key.startsWith('Limit') ? String(Math.round(v)) : f(v)) : typeof v === 'boolean' ? b(v) : v,
});
const int = (c: PresetChange) => ({ ...c, value: String(Math.round(Number(c.value))) });

/** Core rate block shared by most presets. */
function rates(o: { xp: number; harvest: number; taming: number; hatch: number; mature: number; mating: number; cuddle: number; imprint?: number }) {
  return [
    gus('XPMultiplier', o.xp),
    gus('HarvestAmountMultiplier', o.harvest),
    gus('TamingSpeedMultiplier', o.taming),
    game('EggHatchSpeedMultiplier', o.hatch),
    game('BabyMatureSpeedMultiplier', o.mature),
    game('MatingIntervalMultiplier', o.mating),
    game('BabyCuddleIntervalMultiplier', o.cuddle),
    game('BabyImprintAmountMultiplier', o.imprint ?? 1),
  ];
}

const qol = [
  gus('AllowThirdPersonPlayer', true),
  gus('ServerCrosshair', true),
  gus('ShowFloatingDamageText', true),
  gus('AllowFlyerCarryPvE', true),
  gus('AllowAnyoneBabyImprintCuddle', true),
  gus('AlwaysAllowStructurePickup', true),
  gus('OverrideOfficialDifficulty', 5),
  gus('DifficultyOffset', 1),
];

export const PRESETS: Preset[] = [
  {
    id: 'official',
    name: 'Official defaults',
    tagline: 'Clean slate · 1× everything',
    description: 'Removes every gameplay override so the server runs Wildcard’s stock values. Start here if you want to tune everything yourself.',
    tags: ['Vanilla'],
    hue: 210,
    rates: { xp: 1, harvest: 1, taming: 1, breeding: 1 },
    resetFirst: true,
    changes: [],
  },
  {
    id: 'official-event',
    name: 'Official event (2×)',
    tagline: 'What official servers run on event weekends',
    description: 'Double XP, harvesting and taming with doubled breeding speed – the classic “evo event” feel, still close to vanilla balance.',
    tags: ['PvE', 'PvP', 'Light boost'],
    hue: 190,
    rates: { xp: 2, harvest: 2, taming: 2, breeding: 2 },
    changes: [...rates({ xp: 2, harvest: 2, taming: 2, hatch: 2, mature: 2, mating: 0.5, cuddle: 0.5 }), gus('OverrideOfficialDifficulty', 5)],
  },
  {
    id: 'small-tribes',
    name: 'Small tribes (3×)',
    tagline: 'Max 6 per tribe · no alliances',
    description: 'Modelled on the popular small-tribes rule set: 3× rates, tribes capped at 6, alliances disabled so solo and duo players can compete.',
    tags: ['PvP', 'Small tribes'],
    hue: 20,
    rates: { xp: 3, harvest: 3, taming: 3, breeding: 3 },
    changes: [
      ...rates({ xp: 3, harvest: 3, taming: 3, hatch: 3, mature: 3, mating: 0.5, cuddle: 0.5, imprint: 1.5 }),
      int(game('MaxNumberOfPlayersInTribe', 6)),
      gus('PreventTribeAlliances', true),
      gus('OverrideOfficialDifficulty', 5),
    ],
  },
  {
    id: 'community-pve',
    name: 'Community PvE (3×)',
    tagline: 'Relaxed co-op building and taming',
    description: 'Friendly PvE with 3×/5× rates, 25× breeding, no structure decay and generous building limits. A great default for friend groups.',
    tags: ['PvE', 'Casual'],
    hue: 150,
    rates: { xp: 3, harvest: 3, taming: 5, breeding: 25 },
    changes: [
      ...rates({ xp: 3, harvest: 3, taming: 5, hatch: 25, mature: 25, mating: 0.1, cuddle: 0.1, imprint: 3 }),
      gus('serverPVE', true),
      gus('HarvestHealthMultiplier', 2),
      gus('DisableStructureDecayPvE', true),
      gus('DisableDinoDecayPvE', true),
      gus('AllowCaveBuildingPvE', true),
      gus('ItemStackSizeMultiplier', 2),
      ...qol,
    ],
  },
  {
    id: 'casual-pve',
    name: 'Casual PvE (5×)',
    tagline: 'Play a few hours a week and still progress',
    description: '5× XP and harvesting, 10× taming, 50× breeding with frequent imprints. Lower drains and tougher players make it forgiving.',
    tags: ['PvE', 'Casual', 'Boosted'],
    hue: 130,
    rates: { xp: 5, harvest: 5, taming: 10, breeding: 50 },
    changes: [
      ...rates({ xp: 5, harvest: 5, taming: 10, hatch: 50, mature: 50, mating: 0.05, cuddle: 0.05, imprint: 5 }),
      gus('serverPVE', true),
      gus('HarvestHealthMultiplier', 2),
      game('BabyFoodConsumptionSpeedMultiplier', 0.5),
      gus('PlayerCharacterFoodDrainMultiplier', 0.7),
      gus('PlayerCharacterWaterDrainMultiplier', 0.7),
      gus('DisableStructureDecayPvE', true),
      gus('DisableDinoDecayPvE', true),
      gus('AllowCaveBuildingPvE', true),
      gus('ItemStackSizeMultiplier', 3),
      gus('DisableCryopodFridgeRequirement', true),
      gus('PerPlatformMaxStructuresMultiplier', 2),
      game('bAllowPlatformSaddleMultiFloors', true),
      ...qol,
    ],
  },
  {
    id: 'boosted-x10',
    name: 'Boosted 10×',
    tagline: 'Fast progression, still a real game',
    description: '10× rates with near-instant breeding, 10× stacks and doubled weight per level. Popular for clusters that wipe every few months.',
    tags: ['PvE', 'PvP', 'Boosted'],
    hue: 280,
    rates: { xp: 10, harvest: 10, taming: 10, breeding: 100 },
    changes: [
      ...rates({ xp: 10, harvest: 10, taming: 10, hatch: 100, mature: 100, mating: 0.01, cuddle: 0.02, imprint: 10 }),
      gus('HarvestHealthMultiplier', 3),
      gus('ItemStackSizeMultiplier', 10),
      game('PerLevelStatsMultiplier_Player[7]', 2),
      game('PerLevelStatsMultiplier_DinoTamed[7]', 2),
      gus('DisableCryopodFridgeRequirement', true),
      gus('PerPlatformMaxStructuresMultiplier', 3),
      game('bAllowPlatformSaddleMultiFloors', true),
      game('bAllowSpeedLeveling', true),
      game('bAllowFlyerSpeedLeveling', true),
      game('CropGrowthSpeedMultiplier', 10),
      ...qol,
    ],
  },
  {
    id: 'boosted-x100',
    name: 'Mega boosted 100×',
    tagline: 'Instant gratification sandbox',
    description: 'Max out in an evening: 100× rates, 50× stacks, instant breeding and all engrams unlocked. Ideal for testing builds or short wipes.',
    tags: ['Boosted', 'Sandbox'],
    hue: 320,
    rates: { xp: 100, harvest: 50, taming: 100, breeding: 200 },
    changes: [
      ...rates({ xp: 100, harvest: 50, taming: 100, hatch: 200, mature: 200, mating: 0.001, cuddle: 0.001, imprint: 50 }),
      gus('HarvestHealthMultiplier', 5),
      gus('ItemStackSizeMultiplier', 50),
      game('bAutoUnlockAllEngrams', true),
      game('PerLevelStatsMultiplier_Player[7]', 5),
      game('PerLevelStatsMultiplier_DinoTamed[7]', 5),
      game('bAllowSpeedLeveling', true),
      game('bAllowFlyerSpeedLeveling', true),
      gus('DisableCryopodFridgeRequirement', true),
      gus('DisableCryopodEnemyCheck', true),
      game('CropGrowthSpeedMultiplier', 50),
      game('bAllowPlatformSaddleMultiFloors', true),
      ...qol,
    ],
  },
  {
    id: 'breeders',
    name: 'Breeder’s paradise',
    tagline: 'Normal gathering, lightning breeding',
    description: '3× gathering but 100× maturation, constant mating and 1% imprint intervals – built for mutation stacking and stat-line projects.',
    tags: ['PvE', 'Breeding'],
    hue: 340,
    rates: { xp: 3, harvest: 3, taming: 5, breeding: 100 },
    changes: [
      ...rates({ xp: 3, harvest: 3, taming: 5, hatch: 100, mature: 100, mating: 0.001, cuddle: 0.01, imprint: 10 }),
      game('MatingSpeedMultiplier', 10),
      game('LayEggIntervalMultiplier', 0.1),
      game('BabyFoodConsumptionSpeedMultiplier', 0.25),
      gus('AllowAnyoneBabyImprintCuddle', true),
      gus('serverPVE', true),
      gus('DisableDinoDecayPvE', true),
      int(gus('MaxTamedDinos', 10000)),
      gus('OverrideOfficialDifficulty', 5),
    ],
  },
  {
    id: 'competitive-pvp',
    name: 'Competitive PvP (3×)',
    tagline: 'Raiding with offline protection',
    description: '3× rates, 15-minute offline raid protection, PvP decay on and escalating respawn timers. Balanced for active tribes.',
    tags: ['PvP'],
    hue: 0,
    rates: { xp: 3, harvest: 3, taming: 5, breeding: 20 },
    changes: [
      ...rates({ xp: 3, harvest: 3, taming: 5, hatch: 20, mature: 20, mating: 0.1, cuddle: 0.1, imprint: 2 }),
      gus('serverPVE', false),
      gus('PreventOfflinePvP', true),
      gus('PreventOfflinePvPInterval', 900),
      gus('PvPStructureDecay', true),
      gus('PvPDinoDecay', true),
      game('bIncreasePvPRespawnInterval', true),
      int(game('MaxNumberOfPlayersInTribe', 10)),
      int(game('MaxAlliancesPerTribe', 1)),
      gus('EnableExtraStructurePreventionVolumes', true),
      gus('OverrideOfficialDifficulty', 5),
    ],
  },
  {
    id: 'hardcore',
    name: 'Hardcore survival',
    tagline: 'No crosshair, no map marker, hungry dinos',
    description: 'Low rates, stronger wild creatures, faster drains and no hand-holding UI. Death matters – diseases are permanent.',
    tags: ['PvP', 'PvE', 'Hardcore'],
    hue: 30,
    rates: { xp: 1.5, harvest: 1.5, taming: 2, breeding: 5 },
    changes: [
      ...rates({ xp: 1.5, harvest: 1.5, taming: 2, hatch: 5, mature: 5, mating: 0.5, cuddle: 0.5 }),
      gus('ServerCrosshair', false),
      gus('ShowMapPlayerLocation', false),
      gus('AllowThirdPersonPlayer', false),
      gus('ShowFloatingDamageText', false),
      gus('AllowHitMarkers', false),
      game('bUseCorpseLocator', false),
      gus('DinoDamageMultiplier', 1.5),
      gus('PlayerCharacterFoodDrainMultiplier', 1.3),
      gus('PlayerCharacterWaterDrainMultiplier', 1.3),
      gus('NonPermanentDiseases', false),
      gus('OverrideOfficialDifficulty', 6),
      gus('DifficultyOffset', 1),
    ],
  },
  {
    id: 'solo',
    name: 'Solo & duo',
    tagline: 'Single-player balance on a dedicated server',
    description: 'Enables Wildcard’s single-player tweaks, caps tribes at 2 and speeds taming/breeding so a lone survivor can do everything.',
    tags: ['PvE', 'Solo'],
    hue: 60,
    rates: { xp: 2, harvest: 3, taming: 6, breeding: 30 },
    changes: [
      ...rates({ xp: 2, harvest: 3, taming: 6, hatch: 30, mature: 30, mating: 0.1, cuddle: 0.05, imprint: 4 }),
      game('bUseSingleplayerSettings', true),
      int(game('MaxNumberOfPlayersInTribe', 2)),
      gus('serverPVE', true),
      gus('DisableStructureDecayPvE', true),
      gus('DisableDinoDecayPvE', true),
      gus('ItemStackSizeMultiplier', 3),
      gus('DisableCryopodFridgeRequirement', true),
      ...qol,
    ],
  },
  {
    id: 'builder',
    name: 'Builder’s sandbox',
    tagline: 'All engrams, huge stacks, no limits',
    description: 'Creative-style PvE: every engram unlocked, 100× stacks, free placement, raised structure limits and no decay.',
    tags: ['PvE', 'Creative'],
    hue: 100,
    rates: { xp: 10, harvest: 50, taming: 20, breeding: 50 },
    changes: [
      ...rates({ xp: 10, harvest: 50, taming: 20, hatch: 50, mature: 50, mating: 0.05, cuddle: 0.05, imprint: 10 }),
      gus('serverPVE', true),
      game('bAutoUnlockAllEngrams', true),
      gus('ItemStackSizeMultiplier', 100),
      game('bDisableStructurePlacementCollision', true),
      game('bIgnoreStructuresPreventionVolumes', true),
      int(gus('TheMaxStructuresInRange', 30000)),
      gus('PerPlatformMaxStructuresMultiplier', 5),
      game('bAllowPlatformSaddleMultiFloors', true),
      gus('DisableStructureDecayPvE', true),
      gus('DisableDinoDecayPvE', true),
      gus('AllowCaveBuildingPvE', true),
      ...qol,
    ],
  },
  {
    id: 'roleplay',
    name: 'Roleplay & immersive',
    tagline: 'Long days, proximity chat, no HUD clutter',
    description: 'Gentle 2× rates, 25% longer days and 50% longer daylight, proximity text and voice, no floating damage numbers or map markers.',
    tags: ['PvE', 'Roleplay'],
    hue: 250,
    rates: { xp: 2, harvest: 2, taming: 3, breeding: 15 },
    changes: [
      ...rates({ xp: 2, harvest: 2, taming: 3, hatch: 15, mature: 15, mating: 0.2, cuddle: 0.15, imprint: 2 }),
      gus('DayCycleSpeedScale', 0.8),
      gus('DayTimeSpeedScale', 0.5),
      gus('ProximityChat', true),
      gus('globalVoiceChat', false),
      gus('ShowFloatingDamageText', false),
      gus('ShowMapPlayerLocation', false),
      game('PerLevelStatsMultiplier_Player[0]', 1.5),
      game('PerLevelStatsMultiplier_DinoTamed[0]', 1.5),
      gus('serverPVE', true),
      gus('OverrideOfficialDifficulty', 5),
    ],
  },
].map((p) => ({ ...p, builtin: true }));
