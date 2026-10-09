"""Generate src/data/settings.generated.ts from the parsed wiki variable table (names/types/defaults)
plus hand-written descriptions, categories and slider ranges."""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
v = json.load(open(src, encoding='utf-8'))

GAME_SECTION = '/script/shootergame.shootergamemode'

# Keys managed by the server profile, the mod manager or structured editors.
SKIP = {
    'ActiveMods', 'ActiveMapMod', 'ActiveTotalConversion', 'RCONEnabled', 'RCONPort', 'ServerAdminPassword',
    'ServerPassword', 'SpectatorPassword', 'SessionName', 'Port', 'QueryPort', 'MultiHome',
    'CheatTeleportLocations', 'ValgueroMemorialEntries', 'ExcludeItemIndices', 'OverridePlayerLevelEngramPoints',
    'OverrideMaxExperiencePointsPlayer', 'OverrideMaxExperiencePointsDino', 'PreventDinoTameClassNames',
    'PreventBreedingForClassNames', 'MaxStructuresInRange', 'NewMaxStructuresInRange', 'bDisableStructureDecayPvE',
    'bAllowFlyerCarryPVE', 'ItemStatClamps',
}

def clean_default(d):
    d = re.sub(r'<[^>]+>|\{\{[^}]*\}\}|\'\'+', '', d).strip()
    d = d.split('(')[0].strip() if d.startswith(('1.0 (', '0 (')) else d
    d = d.strip('"')
    if d in ('N/A', 'Unknown', '') or d.startswith('|'):
        return None
    return d

def kind(t, name, default):
    t = t.lower()
    if 'boolean' in t: return 'bool'
    if 'float' in t: return 'float'
    if 'integer' in t: return 'int'
    if 'string' in t or 'url' in t.lower(): return 'string'
    if default and re.fullmatch(r'-?\d+\.\d+', default): return 'float'
    if default and re.fullmatch(r'-?\d+', default): return 'int'
    if default and default.lower() in ('true', 'false'): return 'bool'
    return 'string'

def label(name):
    n = name
    if re.match(r'^b[A-Z]', n): n = n[1:]
    n = n.replace('_', ' ')
    n = re.sub(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])', ' ', n)
    n = n.replace('Pv E', 'PvE').replace('Pv P', 'PvP').replace('X P', 'XP').replace('R C O N', 'RCON').replace('H U D', 'HUD').replace('C4', 'C4')
    n = re.sub(r'\bPv E\b', 'PvE', n)
    n = n.replace('Dino ', 'Creature ').replace(' Dino', ' Creature').replace('Dinos', 'Creatures')
    return n[0].upper() + n[1:]

# Hand-written descriptions (our own wording).
D = {
# Rates & XP
'XPMultiplier': 'Global multiplier for all experience gained by players, tribes and creatures.',
'GenericXPMultiplier': 'XP gained passively over time (generic XP).',
'HarvestXPMultiplier': 'XP gained from harvesting resources.',
'KillXPMultiplier': 'XP gained from killing creatures and players.',
'CraftXPMultiplier': 'XP gained from crafting items.',
'SpecialXPMultiplier': 'XP from special events such as discovering explorer notes and bosses.',
'HarvestAmountMultiplier': 'Amount of resources gathered per hit or per harvest action.',
'HarvestHealthMultiplier': 'Health of harvestable nodes (trees, rocks). Higher = more hits = more total resources.',
'TamingSpeedMultiplier': 'How fast creatures tame. 2.0 = twice as fast.',
'PassiveTameIntervalMultiplier': 'Time between passive-tame feeding requests. Lower = faster passive taming.',
'ResourcesRespawnPeriodMultiplier': 'Time before harvested resource nodes respawn. Lower = faster respawn.',
'CropGrowthSpeedMultiplier': 'How fast crops grow in plots.',
'CropDecaySpeedMultiplier': 'How fast mature crops rot in plots.',
'DinoHarvestingDamageMultiplier': 'Damage creatures deal to harvestable nodes – affects gather rates of tames.',
'PlayerHarvestingDamageMultiplier': 'Damage players deal to harvestable nodes.',
'UseOptimizedHarvestingHealth': 'Faster harvesting for high harvest-health servers; reduces lag from very high multipliers.',
'ClampResourceHarvestDamage': 'Limit damage creatures deal to resources to their harvest health.',
'ResourceNoReplenishRadiusPlayers': 'Radius around players in which resources will not respawn.',
'ResourceNoReplenishRadiusStructures': 'Radius around structures in which resources will not respawn.',
'StructurePreventResourceRadiusMultiplier': 'Radius scale in which structures block resource respawn.',
# Difficulty
'DifficultyOffset': 'Scales wild creature level (0–1). Combined with Override Official Difficulty to set max wild level.',
'OverrideOfficialDifficulty': 'Max wild creature level = value × 30. 5.0 gives level 150 (official). 0 = not overridden.',
# Players
'PlayerDamageMultiplier': 'Damage dealt by players.',
'PlayerResistanceMultiplier': 'Damage taken by players. Lower = more resistant (0.5 = half damage).',
'PlayerCharacterWaterDrainMultiplier': 'How fast players get thirsty.',
'PlayerCharacterFoodDrainMultiplier': 'How fast players get hungry.',
'PlayerCharacterStaminaDrainMultiplier': 'How fast player stamina drains.',
'PlayerCharacterHealthRecoveryMultiplier': 'How fast players regain health.',
'OxygenSwimSpeedStatMultiplier': 'Swim speed gained per level of Oxygen.',
'MaxFallSpeedMultiplier': 'Maximum speed players can fall before taking damage.',
'bAllowUnlimitedRespecs': 'Allow Mindwipe Tonic to be used without cooldown.',
'bAllowSpeedLeveling': 'Allow players and land creatures to level Movement Speed.',
'bAllowFlyerSpeedLeveling': 'Allow flying creatures to level Movement Speed.',
'ImplantSuicideCD': 'Cooldown between respawns via the implant (seconds).',
'AllowThirdPersonPlayer': 'Allow players to use third-person camera.',
'ServerCrosshair': 'Show crosshair for players.',
'ServerForceNoHUD': 'Hide the HUD for all players (hardcore immersion).',
'ShowMapPlayerLocation': 'Show each player their own location on the map.',
'ShowFloatingDamageText': 'Show RPG-style floating damage numbers.',
'AllowHitMarkers': 'Show hit markers when shooting.',
'bUseCorpseLocator': 'Show a beam on the player’s corpse after death.',
'bShowCreativeMode': 'Show the creative mode button in the pause menu.',
'bUseSingleplayerSettings': 'Apply single-player balance tweaks to this server.',
'bAutoUnlockAllEngrams': 'Unlock every engram for all players without spending points.',
'bOnlyAllowSpecifiedEngrams': 'Hide every engram not explicitly listed in engram overrides.',
'bDisablePhotoMode': 'Disable photo mode.',
'PhotoModeRangeLimit': 'Max distance the photo camera can travel from the player.',
'ServerHardcore': 'Hardcore: characters are deleted on death.',
'bUseDinoLevelUpAnimations': 'Play animations when tames level up.',
# Creatures
'DinoCountMultiplier': 'Number of wild creatures spawned. Large values can hurt performance.',
'DinoDamageMultiplier': 'Damage dealt by wild creatures.',
'DinoResistanceMultiplier': 'Damage taken by wild creatures. Lower = tougher.',
'TamedDinoDamageMultiplier': 'Damage dealt by tamed creatures.',
'TamedDinoResistanceMultiplier': 'Damage taken by tamed creatures. Lower = tougher.',
'DinoCharacterFoodDrainMultiplier': 'How fast creatures get hungry (also affects taming food consumption).',
'DinoCharacterStaminaDrainMultiplier': 'How fast creature stamina drains.',
'DinoCharacterHealthRecoveryMultiplier': 'How fast creatures regain health.',
'WildDinoCharacterFoodDrainMultiplier': 'Food drain of wild creatures (affects taming speed indirectly).',
'TamedDinoCharacterFoodDrainMultiplier': 'Food drain of tamed creatures.',
'WildDinoTorporDrainMultiplier': 'How fast wild creatures wake up while being tamed.',
'TamedDinoTorporDrainMultiplier': 'How fast tamed creatures wake up.',
'RaidDinoCharacterFoodDrainMultiplier': 'Food drain for raid creatures (e.g. Titanosaur).',
'AllowRaidDinoFeeding': 'Allow feeding Titanosaurs so they stay tamed permanently.',
'MaxTamedDinos': 'Server-wide maximum number of tamed creatures.',
'MaxPersonalTamedDinos': 'Per-tribe tame cap. 0 = disabled.',
'PersonalTamedDinosSaddleStructureCost': 'Tame slots consumed by a platform saddle with structures.',
'MaxTamedDinos_SoftTameLimit': 'Soft tame cap – tribes over it get warnings, then tames are deleted.',
'MaxTamedDinos_SoftTameLimit_CountdownForDeletionDuration': 'Seconds before tames over the soft limit are destroyed.',
'DestroyTamesOverTheSoftTameLimit': 'Actually destroy tames once over the soft limit countdown.',
'DestroyTamesOverLevelClamp': 'Destroy tames above this level on server start. 0 = disabled.',
'bDisableDinoRiding': 'Prevent riding any creature.',
'bDisableDinoTaming': 'Prevent taming any creature.',
'bAllowUnclaimDinos': 'Allow players to unclaim their tames.',
'bForceCanRideFliers': 'Force-allow riding flyers on maps that disable them.',
'AllowFlyerCarryPvE': 'Allow flyers to pick up wild creatures in PvE.',
'AllowFlyingStaminaRecovery': 'Flyers regain stamina while flying if not sprinting.',
'ServerAutoForceRespawnWildDinosInterval': 'Force-respawn all wild creatures every N seconds. 0 = never.',
'PreventSpawnAnimations': 'Skip wake-up animation when players respawn.',
'DinoTurretDamageMultiplier': 'Damage turrets deal to creatures.',
'ForceGachaUnhappyInCaves': 'Gachas become unhappy when kept in caves.',
'UseTameLimitForStructuresOnly': 'Only count platform saddles with structures towards the tame limit.',
'bUseTameLimitForStructuresOnly': 'Only count platform saddles with structures towards the tame limit.',
'bPassiveDefensesDamageRiderlessDinos': 'Spikes and other passive defenses damage riderless creatures.',
'PoopIntervalMultiplier': 'Time between creature/player poops. Lower = more fertilizer.',
'HairGrowthSpeedMultiplier': 'How fast player hair grows. 0 disables growth.',
'NPCNetworkStasisRangeScalePlayerCountStart': 'Player count at which creature stasis range starts shrinking. 0 = off.',
'NPCNetworkStasisRangeScalePlayerCountEnd': 'Player count at which creature stasis range reaches its minimum.',
'NPCNetworkStasisRangeScalePercentEnd': 'Minimum stasis range scale at high player counts.',
# Breeding
'MatingIntervalMultiplier': 'Cooldown between matings. Lower = mate more often.',
'MatingSpeedMultiplier': 'How fast mating completes.',
'EggHatchSpeedMultiplier': 'How fast eggs hatch / gestation finishes.',
'BabyMatureSpeedMultiplier': 'How fast babies grow up.',
'BabyFoodConsumptionSpeedMultiplier': 'How fast babies eat.',
'BabyCuddleIntervalMultiplier': 'Time between imprint requests. Lower = more frequent cuddles.',
'BabyCuddleGracePeriodMultiplier': 'Grace period after a cuddle request before imprint starts decaying.',
'BabyCuddleLoseImprintQualitySpeedMultiplier': 'How fast imprint quality decays after the grace period.',
'BabyImprintAmountMultiplier': 'Imprint % gained per cuddle.',
'BabyImprintingStatScaleMultiplier': 'Stat bonus granted by imprinting. 0 disables the bonus.',
'LayEggIntervalMultiplier': 'Time between unfertilized egg drops. Lower = more eggs.',
'bDisableDinoBreeding': 'Disable creature breeding entirely.',
'AllowAnyoneBabyImprintCuddle': 'Anyone in the tribe can cuddle babies, not just the imprinter.',
'DisableImprintDinoBuff': 'Disable the imprint bonus for riders.',
'PreventMateBoost': 'Disable the mate-boost damage resistance buff.',
# Structures
'StructureDamageMultiplier': 'Damage dealt by structures (turrets, spikes).',
'StructureResistanceMultiplier': 'Damage taken by structures. Lower = sturdier.',
'TheMaxStructuresInRange': 'Maximum structures allowed within the build-limit radius.',
'PerPlatformMaxStructuresMultiplier': 'Scales how many structures fit on platform saddles and rafts.',
'MaxPlatformSaddleStructureLimit': 'Maximum platform saddles/rafts with structures per server.',
'PlatformSaddleBuildAreaBoundsMultiplier': 'How far from a platform saddle you can build.',
'bAllowPlatformSaddleMultiFloors': 'Allow multiple floors on platform saddles.',
'bFlyerPlatformAllowUnalignedDinoBasing': 'Allow creatures to stand on flyer platforms without aligning.',
'AllowCaveBuildingPvE': 'Allow building in caves in PvE.',
'AllowCaveBuildingPvP': 'Allow building in caves in PvP.',
'AlwaysAllowStructurePickup': 'Structures can always be picked up (no time limit).',
'StructurePickupTimeAfterPlacement': 'Seconds after placement during which a structure can be picked up.',
'StructurePickupHoldDuration': 'Hold time to pick up a structure. 0 = instant.',
'AllowIntegratedSPlusStructures': 'Enable the S+ structure set.',
'bDisableStructurePlacementCollision': 'Allow placing structures through terrain and other objects.',
'bIgnoreStructuresPreventionVolumes': 'Allow building in normally blocked areas (e.g. near obelisks).',
'bGenesisUseStructuresPreventionVolumes': 'Enforce build-prevention zones on Genesis mission areas.',
'OverrideStructurePlatformPrevention': 'Allow turrets on platform saddles.',
'EnableExtraStructurePreventionVolumes': 'Block building in resource-rich areas (official PvP rule).',
'ForceAllStructureLocking': 'All structures are locked by default.',
'AllowMultipleAttachedC4': 'Allow more than one C4 on a creature.',
'AllowCrateSpawnsOnTopOfStructures': 'Supply drops can land on top of structures.',
'PvEAllowStructuresAtSupplyDrops': 'Allow building near supply drop points in PvE.',
'StructureDamageRepairCooldown': 'Seconds after damage before a structure can be repaired.',
'bLimitTurretsInRange': 'Limit how many turrets can be placed in a radius.',
'bHardLimitTurretsInRange': 'Turret limit counts every turret, not just powered ones.',
'LimitTurretsNum': 'Max turrets within the turret limit radius.',
'LimitTurretsRange': 'Radius (UU) for the turret limit.',
'LimitGeneratorsNum': 'Max generators within the generator limit radius.',
'LimitGeneratorsRange': 'Radius (UU) for the generator limit.',
'MaxGateFrameOnSaddles': 'Max gateways on platform saddles. 0 = none.',
'MaxTrainCars': 'Max train cars per train.',
'MaxHexagonsPerCharacter': 'Cap on Hexagons a character can hold.',
'IgnoreLimitMaxStructuresInRangeTypeFlag': 'Don’t count decorative items towards the structure limit.',
'FastDecayUnsnappedCoreStructures': 'Unsnapped foundations/pillars decay 5× faster.',
'OnlyDecayUnsnappedCoreStructures': 'Only unsnapped core structures decay.',
'IgnorePVPMountedWeaponryRestrictions': 'Allow mounted weapons on creatures in PvP without restrictions.',
'PreventOutOfTribePinCodeUse': 'Players outside the tribe cannot use PIN codes.',
'MaxStructuresInSmallRadius': 'Max structures in a small radius (anti-spam). 0 = off.',
'RadiusStructuresInSmallRadius': 'Radius for the small-radius structure limit.',
'AllowDeprecatedStructures': 'Allow legacy structures that were removed from crafting.',
'ForceFlyerExplosives': 'Allow flyers to carry C4 and explosives.',
'GlobalPoweredBatteryDurabilityDecreasePerSecond': 'Battery drain per second for powered structures.',
'FuelConsumptionIntervalMultiplier': 'Time between fuel consumption. Higher = fuel lasts longer.',
'WirelessCraftingRangeOverride': 'Range (UU) for pulling resources from nearby containers when crafting.',
'bDisableWirelessCrafting': 'Disable crafting from nearby containers entirely.',
'bDisableWirelessCraftingForDinos': 'Disable wireless crafting from tame inventories.',
'bDisableWirelessCraftingForPlayers': 'Disable wireless crafting while on foot.',
'bDisableWirelessCraftingForStructures': 'Disable wireless crafting at crafting stations.',
# Decay
'DisableStructureDecayPvE': 'Disable gradual structure auto-decay in PvE.',
'DisableDinoDecayPvE': 'Disable tame auto-unclaim decay in PvE.',
'PvEStructureDecayPeriodMultiplier': 'Scales PvE structure decay timers. Higher = slower decay.',
'PvEDinoDecayPeriodMultiplier': 'Scales PvE tame decay timer. Higher = slower decay.',
'PvPStructureDecay': 'Enable structure decay in PvP.',
'PvPDinoDecay': 'Enable tame decay in PvP.',
'AutoDestroyOldStructuresMultiplier': 'Auto-destroy structures not near a tribe member after (decay time × value). 0 = off.',
'OnlyAutoDestroyCoreStructures': 'Auto-destroy only affects core structures (foundations, walls…).',
'AutoDestroyDecayedDinos': 'Delete tames that decayed to unclaimed on server load.',
'DisableBurrowDecayTimers': 'Disable decay for burrow structures.',
'FastDecayInterval': 'Seconds before unsnapped structures fast-decay.',
'PvEStructureDecayDestructionPeriod': 'Legacy: seconds until decayed structures can be destroyed.',
'GlobalCorpseDecompositionTimeMultiplier': 'How long corpses remain. Higher = longer.',
'GlobalItemDecompositionTimeMultiplier': 'How long dropped items remain. Higher = longer.',
'UseCorpseLifeSpanMultiplier': 'Scales corpse lifespan.',
'GlobalSpoilingTimeMultiplier': 'How long perishable items last. Higher = slower spoiling.',
'ClampItemSpoilingTimes': 'Clamp spoil times to their maximum (prevents exploits).',
'LimitNonPlayerDroppedItemsCount': 'Max non-player dropped items in a radius. 0 = no limit.',
'LimitNonPlayerDroppedItemsRange': 'Radius for the dropped-items limit.',
# PvP/PvE
'serverPVE': 'PvE mode: players and tames cannot damage other tribes.',
'PreventOfflinePvP': 'Offline raid protection: structures/tames become invulnerable when the tribe is offline.',
'PreventOfflinePvPInterval': 'Seconds after logout before offline protection activates.',
'PreventOfflinePvPConnectionInvincibleInterval': 'Invulnerability seconds after logging in when ORP is on.',
'bDisableFriendlyFire': 'Tribe members cannot damage each other (PvP).',
'bPvEDisableFriendlyFire': 'Tribe members cannot damage each other (PvE).',
'bPvEAllowTribeWar': 'Allow tribes to declare war in PvE.',
'bPvEAllowTribeWarCancel': 'Allow cancelling a declared tribe war.',
'bIncreasePvPRespawnInterval': 'Respawn timer grows if killed repeatedly in PvP.',
'IncreasePvPRespawnIntervalBaseAmount': 'Extra respawn seconds added per repeated death.',
'IncreasePvPRespawnIntervalCheckPeriod': 'Window (seconds) for counting repeated deaths.',
'IncreasePvPRespawnIntervalMultiplier': 'Multiplier for each repeated death penalty.',
'bAutoPvETimer': 'Switch to PvE automatically during a time window.',
'bAutoPvEUseSystemTime': 'Use the host system clock (instead of in-game time) for the Auto-PvE window.',
'AutoPvEStartTimeSeconds': 'Auto-PvE window start (seconds since midnight).',
'AutoPvEStopTimeSeconds': 'Auto-PvE window end (seconds since midnight).',
'EnablePvPGamma': 'Allow changing gamma in PvP.',
'DisablePvEGamma': 'Prevent changing gamma in PvE.',
'PvPZoneStructureDamageMultiplier': 'Structure damage multiplier inside cave/PvP zones.',
'AllowHideDamageSourceFromLogs': 'Hide the attacker’s name in tribe logs.',
# Tribes
'MaxNumberOfPlayersInTribe': 'Max members per tribe. 0 = unlimited. 1 = solo.',
'MaxAlliancesPerTribe': 'Max alliances a tribe can join.',
'MaxTribesPerAlliance': 'Max tribes per alliance.',
'PreventTribeAlliances': 'Disable tribe alliances.',
'TribeNameChangeCooldown': 'Minutes between tribe renames.',
'MaxTribeLogs': 'Number of tribe log entries kept.',
'TribeLogDestroyedEnemyStructures': 'Log enemy structures your tribe destroys.',
'TribeMergeAllowed': 'Allow tribes to merge.',
'TribeMergeCooldown': 'Seconds between tribe merges.',
'TribeSlotReuseCooldown': 'Seconds before a freed tribe slot can be reused.',
'TribeTowerBonusMultiplier': 'Bonus from tribe towers.',
# Items
'ItemStackSizeMultiplier': 'Scales max stack size for all items. Some items ignore it.',
'SupplyCrateLootQualityMultiplier': 'Quality of loot in supply drops (1–5).',
'FishingLootQualityMultiplier': 'Quality of fishing loot (1–5).',
'CraftingSkillBonusMultiplier': 'Bonus from Crafting Skill stat.',
'CustomRecipeEffectivenessMultiplier': 'Effectiveness of custom cooking recipes.',
'CustomRecipeSkillMultiplier': 'How much crafting skill affects custom recipes.',
'bAllowCustomRecipes': 'Allow custom recipes (Cooking Pot / Industrial Cooker).',
'bDisableLootCrates': 'Disable supply drops/loot crates.',
'RandomSupplyCratePoints': 'Supply drops spawn at random points.',
'ClampItemStats': 'Enable item stat clamps (see Item stat clamps).',
'BaseTemperatureMultiplier': 'Global temperature offset.',
'AdjustableMutagenSpawnDelayMultiplier': 'Respawn delay for mutagen on Genesis 2/ASA maps.',
# Environment
'DayCycleSpeedScale': 'Speed of the full day/night cycle. Lower = longer days.',
'DayTimeSpeedScale': 'Speed of daytime only.',
'NightTimeSpeedScale': 'Speed of nighttime only. Lower = longer nights.',
'DisableWeatherFog': 'Disable fog.',
'PreventDiseases': 'Disable diseases (e.g. Swamp Fever).',
'NonPermanentDiseases': 'Diseases are cured on respawn.',
# Chat
'globalVoiceChat': 'Voice chat is heard server-wide.',
'ProximityChat': 'Text chat is only visible to nearby players.',
'AlwaysNotifyPlayerLeft': 'Announce when players leave.',
'DontAlwaysNotifyPlayerJoined': 'Don’t announce when players join.',
'bFilterChat': 'Filter bad words in chat.',
'bFilterCharacterNames': 'Filter bad words in character names.',
'bFilterTribeNames': 'Filter bad words in tribe names.',
'BadWordListURL': 'URL of the bad-word list.',
'BadWordWhiteListURL': 'URL of the bad-word whitelist.',
'LogChatMessages': 'Write chat messages to log files.',
'ChatLogFlushIntervalSeconds': 'Seconds between chat log flushes.',
'ChatLogMaxAgeInDays': 'Days to keep chat logs.',
# Admin
'AdminLogging': 'Announce admin commands in chat.',
'AdminListURL': 'URL with a list of admin IDs.',
'BanListURL': 'URL of a shared ban list.',
'CosmeticWhitelistOverride': 'URL of a custom cosmetic whitelist.',
'CustomDynamicConfigUrl': 'Dynamic config URL (used with -UseDynamicConfig).',
'CustomLiveTuningUrl': 'Live tuning override URL.',
'KickIdlePlayersPeriod': 'Seconds of inactivity before idle kick (requires -EnableIdlePlayerKick).',
'EnableAFKKickPlayerCountPercent': 'Only kick AFK players when the server is above this % full.',
'UseExclusiveList': 'Only allow whitelisted players (exclusive join).',
'UpdateAllowedCheatersInterval': 'Seconds between reloading the admin list.',
'EnableMeshBitingProtection': 'Prevent creatures from biting through meshes.',
'ServerEnableMeshChecking': 'Enable anti-meshing checks.',
'UseCharacterTracker': 'Track character positions for admin tools.',
'RCONServerGameLogBuffer': 'Number of game log lines kept for RCON GetGameLog.',
# Saving / perf
'AutoSavePeriodMinutes': 'Minutes between automatic world saves.',
'AutoRestartIntervalSeconds': 'Restart the server automatically every N seconds.',
'DontRestoreBackup': 'Don’t auto-restore a backup save if loading fails.',
'MaxStructuresToProcess': 'Max structures processed per frame. 0 = default.',
'ListenServerTetherDistanceMultiplier': 'Tether distance for non-dedicated sessions.',
'FreezeReaperPregnancy': 'Reaper pregnancy timer pauses while offline.',
# Transfers
'noTributeDownloads': 'Disable all downloads from obelisks/transmitters.',
'PreventDownloadSurvivors': 'Block downloading survivors.',
'PreventDownloadItems': 'Block downloading items.',
'PreventDownloadDinos': 'Block downloading creatures.',
'PreventUploadSurvivors': 'Block uploading survivors.',
'PreventUploadItems': 'Block uploading items.',
'PreventUploadDinos': 'Block uploading creatures.',
'CrossARKAllowForeignDinoDownloads': 'Allow downloading creatures native to other maps.',
'MinimumDinoReuploadInterval': 'Seconds before a downloaded creature can be uploaded again.',
'TributeCharacterExpirationSeconds': 'Seconds uploaded survivors stay available. 0 = forever.',
'TributeDinoExpirationSeconds': 'Seconds uploaded creatures stay available.',
'TributeItemExpirationSeconds': 'Seconds uploaded items stay available.',
'MaxTributeCharacters': 'Max survivors stored in the upload slot.',
'MaxTributeDinos': 'Max creatures in the upload inventory.',
'MaxTributeItems': 'Max items in the upload inventory.',
# Cryo
'EnableCryopodNerf': 'Creatures deal less damage after leaving a cryopod.',
'CryopodNerfDuration': 'Seconds the cryopod nerf lasts.',
'CryopodNerfDamageMult': 'Damage dealt during the cryopod nerf.',
'CryopodNerfIncomingDamageMultPercent': 'Extra damage taken during the cryopod nerf.',
'EnableCryoSicknessPVE': 'Cryo sickness applies in PvE.',
'DisableCryopodEnemyCheck': 'Allow deploying cryopods near enemies.',
'DisableCryopodFridgeRequirement': 'Cryopods work without being charged in a fridge.',
'AllowCryoFridgeOnSaddle': 'Allow cryofridges on platform saddles.',
'CryoHospitalHoursToRegenHP': 'Hours to fully heal a creature in a Cryo Hospital.',
'CryoHospitalHoursToRegenFood': 'Hours to fully feed a creature in a Cryo Hospital.',
'CryoHospitalHoursToDrainTorpor': 'Hours to fully drain torpor in a Cryo Hospital.',
'CryoHospitalMatingCooldownReduction': 'Mating cooldown reduction factor in a Cryo Hospital.',
# Map
'AllowTekSuitPowersInGenesis': 'Allow Tek suit powers on Genesis.',
'bDisableGenesisMissions': 'Disable Genesis missions.',
'bDisableHexagonStore': 'Disable the Hexagon store.',
'bHexStoreAllowOnlyEngramTradeOption': 'Hexagon store sells only engram unlocks.',
'BaseHexagonRewardMultiplier': 'Hexagons earned from missions.',
'HexagonCostMultiplier': 'Price of items in the Hexagon store.',
'bDisableWorldBuffs': 'Disable world buffs (Genesis 2 / ASA).',
'bEnableWorldBuffScaling': 'Scale world buffs.',
'WorldBuffScalingEfficacy': 'World buff strength scale.',
'bDisableDefaultMapItemSets': 'Disable default spawn item sets on certain maps.',
'UseFjordurTraversalBuff': 'Enable the Fjordur bonus traversal abilities.',
'UseAstraeosTraversalBuff': 'Enable the Astraeos traversal buff.',
'ArmadoggoDeathCooldown': 'Seconds before an Armadoggo can save you again.',
'YoungIceFoxDeathCooldown': 'Seconds before a young Ice Fox can save you again.',
'CosmoWeaponAmmoReloadAmount': 'Ammo regenerated per reload tick for Cosmo’s web.',
'MaxCosmoWeaponAmmo': 'Max Cosmo web ammo. -1 = default.',
'WorldBossKingKaijuSpawnTime': 'Time of day (HH:MM:SS) the King Kaiju world boss spawns.',
'ExtinctionEventTimeInterval': 'Seconds between Extinction events.',
'LimitBunkersPerTribe': 'Limit bunkers per tribe.',
'LimitBunkersPerTribeNum': 'Max bunkers per tribe.',
'AllowBunkersInPreventionZones': 'Allow bunkers in build-prevention zones.',
'AllowRidingDinosInsideBunkers': 'Allow riding creatures inside bunkers.',
'AllowBunkerModulesAboveGround': 'Allow bunker modules above ground.',
'AllowDinoAIInsideBunkers': 'Creature AI works inside bunkers.',
'AllowBunkerModulesInPreventionZones': 'Allow bunker modules in prevention zones.',
'MinDistanceBetweenBunkers': 'Min distance (UU) between bunkers.',
'EnemyAccessBunkerHPThreshold': 'HP fraction below which enemies can enter a bunker.',
'BunkerUnderHPThresholdDmgMultiplier': 'Damage multiplier to bunkers under the HP threshold.',
'BloodforgeReinforceExtraDurability': 'Extra durability from Bloodforge reinforcement.',
'BloodforgeReinforceResourceCostMultiplier': 'Resource cost of Bloodforge reinforcement.',
'BloodforgeReinforceSpeedMultiplier': 'Speed of Bloodforge reinforcement.',
'MaxActiveOutposts': 'Max outposts a tribe may hold (Lost Colony).',
'MaxActiveResourceCaches': 'Max resource caches a tribe may hold.',
'MaxActiveCityOutposts': 'Max city outposts a tribe may hold.',
'OutpostSigilRewardMultiplier': 'Sigil rewards from outposts.',
'AllowSharedConnections': 'Allow family-shared Steam accounts to join.',
'AllowMultipleTamedUnicorns': 'Allow more than one tamed unicorn (Ragnarok).',
'EnableVolcano': 'Enable the Ragnarok volcano.',
'UnicornSpawnInterval': 'Hours between unicorn spawns (Ragnarok).',
'VolcanoIntensity': 'Volcano intensity (Ragnarok).',
'VolcanoInterval': 'Seconds between eruptions. 0 = default.',
'Duration': 'Seconds the Message of the Day stays on screen.',
'Message': 'Message of the Day shown to players on join. Use \\n for new lines.',
}

CATS = [
    ('rates', 'Rates & Harvesting'), ('xp', 'Experience'), ('players', 'Players'), ('creatures', 'Creatures'),
    ('breeding', 'Breeding & Imprinting'), ('structures', 'Structures & Building'), ('decay', 'Decay & Cleanup'),
    ('pvp', 'PvP / PvE Rules'), ('tribes', 'Tribes & Alliances'), ('items', 'Items, Loot & Crafting'),
    ('environment', 'World & Environment'), ('transfers', 'Transfers & Clusters'), ('cryo', 'Cryopods'),
    ('chat', 'Chat & Messages'), ('admin', 'Administration & Security'), ('performance', 'Saving & Performance'),
    ('maps', 'Map-specific'),
]

RULES = [
    ('cryo', r'Cryo'),
    ('maps', r'Bunker|Outpost|Sigil|Bloodforge|ResourceCaches|Hexagon|Genesis|TekSuit|WorldBuff|Astraeos|Fjordur|Kaiju|Armadoggo|IceFox|Reaper|Volcano|Unicorn|Mutagen|Gacha|Extinction|Cosmo|ImplantSuicide|DefaultMapItemSets|SharedConnections'),
    ('transfers', r'Tribute|Upload|Download|CrossARK|Reupload'),
    ('xp', r'XP|Experience'),
    ('breeding', r'Baby|Imprint|Mating|Egg|Breeding|Mate'),
    ('decay', r'Decay|AutoDestroy|Decomposition|Corpse|Spoil|DroppedItems'),
    ('rates', r'Harvest|Resource|Taming|Crop|PassiveTame|Difficulty'),
    ('items', r'Item|Crate|Loot|Craft|Fuel|Battery|Recipe|Stack|Fishing|Wireless'),
    ('pvp', r'PvP|PvE|PVE|Offline|FriendlyFire|Gamma|Hardcore|AutoPvE|TribeWar|HideDamageSource'),
    ('tribes', r'Tribe|Alliance'),
    ('structures', r'Structure|Platform|Saddle|Turret|Generator|Pickup|Cave|Gate|Train|Snapped|C4|PinCode|Prevention|Explosive|Deprecated|Hexagons'),
    ('chat', r'Chat|Voice|Notify|Filter|BadWord|Message|Duration'),
    ('admin', r'Admin|Ban|Cheat|Exclusive|URL|Url|Cosmetic|Mesh|Kick|AFK|RCON|CharacterTracker'),
    ('performance', r'Stasis|ToProcess|AutoSave|Restart|Restore|Tether'),
    ('environment', r'DayCycle|DayTime|NightTime|Temperature|Weather|Fog|Disease'),
    ('creatures', r'Dino|Tame|Wild|Raid|Flyer|Fliers|Spawn|Poop|Turret'),
    ('players', r'.'),
]
OVERRIDE_CAT = {
    'MaxFallSpeedMultiplier': 'players', 'OxygenSwimSpeedStatMultiplier': 'players', 'HairGrowthSpeedMultiplier': 'players',
    'PreventSpawnAnimations': 'players', 'AllowRaidDinoFeeding': 'creatures', 'RaidDinoCharacterFoodDrainMultiplier': 'creatures',
    'DinoTurretDamageMultiplier': 'structures', 'BaseTemperatureMultiplier': 'environment', 'DinoHarvestingDamageMultiplier': 'rates',
    'PlayerHarvestingDamageMultiplier': 'rates', 'ResourceNoReplenishRadiusPlayers': 'rates', 'ResourceNoReplenishRadiusStructures': 'rates',
    'StructurePreventResourceRadiusMultiplier': 'rates', 'ClampResourceHarvestDamage': 'rates', 'MaxHexagonsPerCharacter': 'maps',
    'FreezeReaperPregnancy': 'maps', 'AdjustableMutagenSpawnDelayMultiplier': 'maps', 'TribeTowerBonusMultiplier': 'maps',
    'AllowCrateSpawnsOnTopOfStructures': 'structures', 'PvEAllowStructuresAtSupplyDrops': 'structures', 'ClampItemStats': 'items',
    'PvPZoneStructureDamageMultiplier': 'pvp', 'bPassiveDefensesDamageRiderlessDinos': 'structures',
    'PersonalTamedDinosSaddleStructureCost': 'creatures', 'bUseTameLimitForStructuresOnly': 'creatures',
    'MaxPlatformSaddleStructureLimit': 'structures', 'ServerAutoForceRespawnWildDinosInterval': 'creatures',
    'GlobalPoweredBatteryDurabilityDecreasePerSecond': 'structures', 'FuelConsumptionIntervalMultiplier': 'structures',
    'WirelessCraftingRangeOverride': 'items', 'bAllowUnlimitedRespecs': 'players', 'bAllowSpeedLeveling': 'players',
    'bAllowFlyerSpeedLeveling': 'creatures', 'AllowFlyingStaminaRecovery': 'creatures', 'AllowFlyerCarryPvE': 'creatures',
    'DisableDinoDecayPvE': 'decay', 'DisableStructureDecayPvE': 'decay', 'PvEStructureDecayPeriodMultiplier': 'decay',
    'PvEDinoDecayPeriodMultiplier': 'decay', 'PvPStructureDecay': 'decay', 'PvPDinoDecay': 'decay',
    'PvEStructureDecayDestructionPeriod': 'decay', 'IgnorePVPMountedWeaponryRestrictions': 'pvp',
    'AllowCaveBuildingPvE': 'structures', 'AllowCaveBuildingPvP': 'structures', 'ForceGachaUnhappyInCaves': 'creatures',
    'EnableIdlePlayerKick': 'admin', 'KickIdlePlayersPeriod': 'admin', 'EnableAFKKickPlayerCountPercent': 'admin',
    'UseExclusiveList': 'admin', 'UpdateAllowedCheatersInterval': 'admin', 'AutoRestartIntervalSeconds': 'performance',
    'NPCNetworkStasisRangeScalePercentEnd': 'performance', 'ListenServerTetherDistanceMultiplier': 'performance',
    'MaxTributeCharacters': 'transfers', 'MaxTributeDinos': 'transfers', 'MaxTributeItems': 'transfers',
    'AllowAnyoneBabyImprintCuddle': 'breeding', 'DisableImprintDinoBuff': 'breeding', 'PreventMateBoost': 'breeding',
    'bDisableDinoBreeding': 'breeding', 'LayEggIntervalMultiplier': 'breeding', 'bUseDinoLevelUpAnimations': 'creatures',
    'MaxTrainCars': 'maps', 'MaxGateFrameOnSaddles': 'structures', 'UseOptimizedHarvestingHealth': 'rates',
    'AllowHitMarkers': 'players', 'ShowFloatingDamageText': 'players', 'bDisableLootCrates': 'items', 'RandomSupplyCratePoints': 'items',
    'TribeLogDestroyedEnemyStructures': 'tribes', 'ForceAllStructureLocking': 'structures', 'bAllowCustomRecipes': 'items',
    'AllowSharedConnections': 'admin', 'ArmadoggoDeathCooldown': 'maps', 'YoungIceFoxDeathCooldown': 'maps',
    'MaxTamedDinos_SoftTameLimit_CountdownForDeletionDuration': 'creatures', 'bHexStoreAllowOnlyEngramTradeOption': 'maps',
    'bFilterTribeNames': 'chat',
}
FIX_DEFAULT = {
    'BadWordListURL': 'http://cdn2.arkdedicated.com/asa/badwords.txt',
    'BadWordWhiteListURL': 'http://cdn2.arkdedicated.com/asa/goodwords.txt',
}
FORCE_TYPE = {'ExtinctionEventTimeInterval': 'int'}
ADVANCED = {
    'NPCNetworkStasisRangeScalePlayerCountStart', 'NPCNetworkStasisRangeScalePlayerCountEnd', 'NPCNetworkStasisRangeScalePercentEnd',
    'MaxStructuresToProcess', 'CustomLiveTuningUrl', 'CustomDynamicConfigUrl', 'ListenServerTetherDistanceMultiplier',
    'PvEStructureDecayDestructionPeriod', 'UpdateAllowedCheatersInterval', 'RCONServerGameLogBuffer', 'MaxHexagonsPerCharacter',
    'UseCorpseLifeSpanMultiplier', 'IgnoreLimitMaxStructuresInRangeTypeFlag', 'DontRestoreBackup', 'TribeSlotReuseCooldown',
    'CosmeticWhitelistOverride', 'BadWordListURL', 'BadWordWhiteListURL', 'UseCharacterTracker',
}
# (min, max, step, scale) slider ranges. Values beyond max can still be typed.
R = {
    'XPMultiplier': (0, 50, 0.1, 'log'), 'GenericXPMultiplier': (0, 50, 0.1, 'log'), 'HarvestXPMultiplier': (0, 50, 0.1, 'log'),
    'KillXPMultiplier': (0, 50, 0.1, 'log'), 'CraftXPMultiplier': (0, 50, 0.1, 'log'), 'SpecialXPMultiplier': (0, 50, 0.1, 'log'),
    'HarvestAmountMultiplier': (0, 50, 0.1, 'log'), 'HarvestHealthMultiplier': (0.1, 20, 0.1, 'log'), 'TamingSpeedMultiplier': (0, 100, 0.1, 'log'),
    'BabyMatureSpeedMultiplier': (0, 200, 0.1, 'log'), 'EggHatchSpeedMultiplier': (0, 200, 0.1, 'log'), 'MatingSpeedMultiplier': (0, 50, 0.1, 'log'),
    'MatingIntervalMultiplier': (0, 2, 0.001, 'log'), 'BabyCuddleIntervalMultiplier': (0, 2, 0.001, 'log'), 'BabyImprintAmountMultiplier': (0, 50, 0.1, 'log'),
    'BabyCuddleGracePeriodMultiplier': (0, 10, 0.1, 'log'), 'BabyCuddleLoseImprintQualitySpeedMultiplier': (0, 10, 0.1, 'log'),
    'BabyFoodConsumptionSpeedMultiplier': (0, 5, 0.05, 'linear'), 'BabyImprintingStatScaleMultiplier': (0, 5, 0.05, 'linear'),
    'LayEggIntervalMultiplier': (0, 5, 0.01, 'log'), 'PassiveTameIntervalMultiplier': (0, 5, 0.01, 'log'), 'PoopIntervalMultiplier': (0, 5, 0.01, 'log'),
    'CropGrowthSpeedMultiplier': (0, 100, 0.1, 'log'), 'CropDecaySpeedMultiplier': (0, 10, 0.05, 'log'),
    'ResourcesRespawnPeriodMultiplier': (0, 5, 0.01, 'log'), 'DifficultyOffset': (0, 1, 0.01, 'linear'),
    'OverrideOfficialDifficulty': (0, 20, 0.5, 'linear'), 'DayCycleSpeedScale': (0, 10, 0.01, 'log'), 'DayTimeSpeedScale': (0, 10, 0.01, 'log'),
    'NightTimeSpeedScale': (0, 10, 0.01, 'log'), 'ItemStackSizeMultiplier': (0, 100, 0.1, 'log'),
    'SupplyCrateLootQualityMultiplier': (1, 5, 0.1, 'linear'), 'FishingLootQualityMultiplier': (1, 5, 0.1, 'linear'),
    'DinoCountMultiplier': (0, 5, 0.05, 'linear'), 'AutoSavePeriodMinutes': (1, 120, 1, 'linear'),
    'TheMaxStructuresInRange': (0, 30000, 100, 'linear'), 'MaxTamedDinos': (0, 20000, 100, 'linear'),
    'MaxTamedDinos_SoftTameLimit': (0, 20000, 100, 'linear'), 'MaxPersonalTamedDinos': (0, 2000, 10, 'linear'),
    'MaxNumberOfPlayersInTribe': (0, 100, 1, 'linear'), 'MaxAlliancesPerTribe': (0, 50, 1, 'linear'), 'MaxTribesPerAlliance': (0, 50, 1, 'linear'),
    'MaxPlatformSaddleStructureLimit': (0, 500, 1, 'linear'), 'PerPlatformMaxStructuresMultiplier': (0, 10, 0.1, 'log'),
    'LimitTurretsNum': (0, 500, 1, 'linear'), 'LimitTurretsRange': (0, 30000, 100, 'linear'), 'LimitGeneratorsNum': (0, 50, 1, 'linear'),
    'LimitGeneratorsRange': (0, 30000, 100, 'linear'), 'MaxTrainCars': (0, 32, 1, 'linear'), 'MaxGateFrameOnSaddles': (0, 20, 1, 'linear'),
    'StructurePickupHoldDuration': (0, 5, 0.1, 'linear'), 'StructurePickupTimeAfterPlacement': (0, 3600, 5, 'linear'),
    'TribeNameChangeCooldown': (0, 1440, 1, 'linear'), 'MaxTribeLogs': (0, 2000, 10, 'linear'),
    'PlatformSaddleBuildAreaBoundsMultiplier': (0, 10, 0.1, 'log'), 'WirelessCraftingRangeOverride': (0, 30000, 100, 'linear'),
    'PhotoModeRangeLimit': (0, 30000, 100, 'linear'), 'MaxTributeCharacters': (0, 50, 1, 'linear'), 'MaxTributeDinos': (0, 500, 1, 'linear'),
    'MaxTributeItems': (0, 500, 1, 'linear'), 'LimitBunkersPerTribeNum': (0, 50, 1, 'linear'), 'MaxActiveOutposts': (0, 50, 1, 'linear'),
    'MaxActiveResourceCaches': (0, 50, 1, 'linear'), 'MaxActiveCityOutposts': (0, 50, 1, 'linear'),
    'SupplyCrate': None, 'VolcanoIntensity': (0, 5, 0.1, 'linear'), 'UnicornSpawnInterval': (0, 168, 1, 'linear'),
    'EnableAFKKickPlayerCountPercent': (0, 1, 0.05, 'linear'), 'NPCNetworkStasisRangeScalePercentEnd': (0, 1, 0.01, 'linear'),
    'EnemyAccessBunkerHPThreshold': (0, 1, 0.01, 'linear'), 'BunkerUnderHPThresholdDmgMultiplier': (0, 1, 0.01, 'linear'),
    'ChatLogMaxAgeInDays': (0, 90, 1, 'linear'), 'Duration': (0, 300, 1, 'linear'), 'MaxTribeLogs': (0, 2000, 10, 'linear'),
    'IncreasePvPRespawnIntervalMultiplier': (0, 10, 0.1, 'linear'), 'CraftingSkillBonusMultiplier': (0, 10, 0.1, 'log'),
    'DinoHarvestingDamageMultiplier': (0, 50, 0.1, 'log'), 'PlayerHarvestingDamageMultiplier': (0, 50, 0.1, 'log'),
    'TribeTowerBonusMultiplier': (0, 10, 0.1, 'linear'), 'GlobalPoweredBatteryDurabilityDecreasePerSecond': (0, 20, 0.1, 'linear'),
    'CryopodNerfDamageMult': (0, 1, 0.01, 'linear'), 'CryopodNerfIncomingDamageMultPercent': (0, 1, 0.01, 'linear'),
    'MaxHexagonsPerCharacter': (0, 2000000000, 1000, 'log'), 'DestroyTamesOverLevelClamp': (0, 1000, 1, 'linear'),
    'LimitNonPlayerDroppedItemsCount': (0, 2000, 10, 'linear'), 'LimitNonPlayerDroppedItemsRange': (0, 30000, 100, 'linear'),
    'MaxStructuresInSmallRadius': (0, 500, 1, 'linear'), 'RadiusStructuresInSmallRadius': (0, 10000, 50, 'linear'),
    'MinDistanceBetweenBunkers': (0, 30000, 100, 'linear'), 'NPCNetworkStasisRangeScalePlayerCountStart': (0, 200, 1, 'linear'),
    'NPCNetworkStasisRangeScalePlayerCountEnd': (0, 200, 1, 'linear'), 'CosmoWeaponAmmoReloadAmount': (0, 20, 1, 'linear'),
    'MaxCosmoWeaponAmmo': (-1, 100, 1, 'linear'), 'CryoHospitalHoursToRegenHP': (0, 48, 0.5, 'linear'),
    'CryoHospitalHoursToRegenFood': (0, 72, 0.5, 'linear'), 'CryoHospitalHoursToDrainTorpor': (0, 48, 0.5, 'linear'),
    'CryoHospitalMatingCooldownReduction': (0, 10, 0.1, 'linear'), 'OxygenSwimSpeedStatMultiplier': (0, 10, 0.1, 'log'),
}
SECONDS_HINT = re.compile(r'Seconds|Interval$|Cooldown|Period$|Duration$|Time$|CD$|TimeInterval|Expiration')
INVERTED = {'MatingIntervalMultiplier', 'BabyCuddleIntervalMultiplier', 'LayEggIntervalMultiplier', 'PassiveTameIntervalMultiplier',
            'PoopIntervalMultiplier', 'ResourcesRespawnPeriodMultiplier', 'PlayerResistanceMultiplier', 'DinoResistanceMultiplier',
            'TamedDinoResistanceMultiplier', 'StructureResistanceMultiplier'}

entries = []
seen = set()
for o in v:
    sec = o['section'] or ''
    if o['inASA'].strip() == 'No' or sec in ('DynamicConfig', 'Command line options', '[ModInstaller]'):
        continue
    name = o['name'].split('<')[0].split('[')[0].split('=')[0].strip().strip("'")
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', name) or name in SKIP:
        continue
    if o['type'].strip() in ('(...)',) or name.startswith(('PerLevelStatsMultiplier', 'PlayerBaseStatMultipliers', 'MutagenLevelBoost', 'ItemStatClamps')):
        continue
    if sec == 'Game.ini':
        file, section = 'Game', GAME_SECTION
    else:
        file, section = 'GUS', sec.strip('[]')
    if section == '/Script/Engine.GameSession':
        continue
    key = (file, section, name)
    if key in seen:
        continue
    seen.add(key)
    default = FIX_DEFAULT.get(name, clean_default(o['default']))
    t = FORCE_TYPE.get(name) or kind(o['type'], name, default)
    if name in ('MaxTamedDinos',):
        t = 'int'
    e = {'key': name, 'file': file, 'section': section, 'type': t, 'label': label(name)}
    if default is not None:
        if t == 'bool':
            e['default'] = default.lower() == 'true'
        elif t in ('float', 'int'):
            try:
                f = float(default)
                e['default'] = int(f) if t == 'int' else (round(f, 6))
            except ValueError:
                pass
        else:
            e['default'] = default
    elif t == 'bool':
        e['default'] = False
    cat = OVERRIDE_CAT.get(name)
    if not cat:
        if section == 'Ragnarok':
            cat = 'maps'
        elif section == 'MessageOfTheDay':
            cat = 'chat'
        else:
            for c, rx in RULES:
                if re.search(rx, name):
                    cat = c
                    break
    e['category'] = cat
    desc = D.get(name)
    if not desc:
        base = e['label']
        if t == 'bool':
            desc = f'Enable “{base}”.'
        elif name.endswith('Multiplier'):
            desc = f'Scales {base[:-len(" Multiplier")].lower()}. 1.0 = official.'
        else:
            desc = base + '.'
    e['desc'] = desc
    if t in ('float', 'int'):
        rng = R.get(name)
        d = e.get('default', 0) or 0
        if rng:
            e['min'], e['max'], e['step'], e['scale'] = rng
        elif SECONDS_HINT.search(name) and not name.endswith('Multiplier'):
            e['unit'] = 's'
            e['min'], e['max'], e['step'], e['scale'] = 0, max(604800, d * 2), 1, 'log'
        elif name.endswith(('Multiplier', 'Scale')) or (t == 'float' and d == 1.0):
            e['min'], e['max'], e['step'], e['scale'] = 0, 10, 0.05, 'log'
        elif t == 'int':
            e['min'], e['max'], e['step'], e['scale'] = 0, max(100, int(d * 4)), 1, 'linear'
        else:
            e['min'], e['max'], e['step'], e['scale'] = 0, max(10, d * 4), 0.1, 'linear'
        if name in INVERTED:
            e['inverted'] = True
    if name in ADVANCED:
        e['advanced'] = True
    if section == 'MessageOfTheDay' and name == 'Message':
        e['type'] = 'text'
    entries.append(e)

# Settings the wiki groups elsewhere but that belong in the editor.
entries.append({'key': 'bAllowFlyerCarryPvE', 'file': 'GUS', 'section': 'ServerSettings', 'type': 'bool', 'label': 'Allow Flyer Carry PvE (legacy key)', 'default': False, 'category': 'creatures', 'desc': 'Legacy spelling of Allow Flyer Carry PvE kept for older configs.', 'advanced': True})

# Gaps found by the coverage audit: item stat clamps (indexed), Valguero memorial and legacy keys.
ITEM_STATS = ['Generic quality', 'Armor', 'Max durability', 'Weapon damage %', 'Weapon clip ammo', 'Hypothermal insulation', 'Weight', 'Hyperthermal insulation']
for i, n in enumerate(ITEM_STATS):
    entries.append({'key': f'ItemStatClamps[{i}]', 'file': 'Game', 'section': GAME_SECTION, 'type': 'int', 'label': f'Item stat clamp – {n}',
                    'category': 'items', 'desc': f'Caps the internal {n.lower()} value items can roll (requires Clamp Item Stats). Unset = no cap.',
                    'min': 0, 'max': 65535, 'step': 1, 'scale': 'linear', 'advanced': True})
entries.append({'key': 'ValgueroMemorialEntries', 'file': 'Game', 'section': GAME_SECTION, 'type': 'string', 'label': 'Valguero memorial names',
                'category': 'maps', 'desc': 'Player names engraved on the Valguero memorial, separated by semicolons with no spaces.', 'advanced': True})
for key, label, t, d, cat, desc in [
    ('bDisableStructureDecayPvE', 'Disable Structure Decay PvE (legacy key)', 'bool', False, 'decay', 'Legacy spelling still read by some builds; prefer Disable Structure Decay PvE.'),
    ('MaxStructuresInRange', 'Max Structures In Range (legacy)', 'int', 1300, 'structures', 'Pre-2017 structure limit, superseded by The Max Structures In Range.'),
    ('NewMaxStructuresInRange', 'New Max Structures In Range (legacy)', 'int', 6000, 'structures', 'Intermediate structure limit, superseded by The Max Structures In Range.'),
]:
    e = {'key': key, 'file': 'GUS', 'section': 'ServerSettings', 'type': t, 'label': label, 'default': d, 'category': cat, 'desc': desc, 'advanced': True}
    if t == 'int':
        e.update({'min': 0, 'max': 30000, 'step': 100, 'scale': 'linear'})
    entries.append(e)

order = {c: i for i, (c, _) in enumerate(CATS)}
entries.sort(key=lambda e: (order[e['category']], e.get('advanced', False), e['file'], e['label']))

with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// AUTO-GENERATED by scripts/gen_settings.py – setting names, types and defaults are sourced from the\n')
    f.write('// community ARK wiki server-configuration reference (ASA-applicable entries); descriptions, categories\n')
    f.write('// and slider ranges are hand-tuned. Do not edit by hand – edit the generator instead.\n')
    f.write("import type { SettingDef, CategoryDef } from './types';\n\n")
    f.write('export const SETTING_CATEGORIES: CategoryDef[] = ' + json.dumps([{'id': c, 'label': l} for c, l in CATS], indent=2) + ';\n\n')
    f.write('export const SETTINGS: SettingDef[] = ' + json.dumps(entries, indent=1, ensure_ascii=False) + ';\n')
from collections import Counter
print(len(entries), Counter(e['category'] for e in entries))
missing = [e['key'] for e in entries if e['key'] not in D]
print('auto-described:', len(missing), missing)
