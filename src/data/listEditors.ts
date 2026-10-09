import { parseStruct, unquote } from '@/lib/ini';

/** Structured editors for Game.ini keys that repeat once per entry. */
export interface ListField {
  name: string;
  label: string;
  type: 'class' | 'string' | 'float' | 'int' | 'bool';
  /** Wrap the value in quotes when serialising. */
  quote?: boolean;
  default: string | number | boolean;
  /** Nested struct parent, e.g. `Quantity` for `Quantity=(MaxItemQuantity=…)`. */
  parent?: string;
  suggestions?: 'creatures' | 'resources' | 'tags';
  width?: string;
}

export interface ListEditorDef {
  key: string;
  label: string;
  desc: string;
  group: 'Creatures' | 'Items & Resources' | 'Engrams' | 'Spawns & Loot (advanced)';
  kind: 'struct' | 'string' | 'raw';
  fields?: ListField[];
  example?: string;
}

export const LIST_EDITORS: ListEditorDef[] = [
  {
    key: 'DinoSpawnWeightMultipliers', group: 'Creatures', kind: 'struct', label: 'Spawn weights',
    desc: 'Make a creature more or less common, and optionally cap its share of the population.',
    fields: [
      { name: 'DinoNameTag', label: 'Creature tag', type: 'string', default: 'Rex', suggestions: 'tags' },
      { name: 'SpawnWeightMultiplier', label: 'Weight ×', type: 'float', default: 1 },
      { name: 'OverrideSpawnLimitPercentage', label: 'Limit share', type: 'bool', default: false },
      { name: 'SpawnLimitPercentage', label: 'Max share (0–1)', type: 'float', default: 0.1 },
    ],
  },
  {
    key: 'NPCReplacements', group: 'Creatures', kind: 'struct', label: 'Creature replacements',
    desc: 'Replace every spawn of one creature with another. Leave “To” empty to remove the creature.',
    fields: [
      { name: 'FromClassName', label: 'From class', type: 'class', quote: true, default: 'Rex_Character_BP_C', suggestions: 'creatures' },
      { name: 'ToClassName', label: 'To class', type: 'class', quote: true, default: '', suggestions: 'creatures' },
    ],
  },
  {
    key: 'DinoClassDamageMultipliers', group: 'Creatures', kind: 'struct', label: 'Wild damage by class',
    desc: 'Damage multiplier for a specific wild creature class.',
    fields: [
      { name: 'ClassName', label: 'Class', type: 'class', quote: true, default: 'Rex_Character_BP_C', suggestions: 'creatures' },
      { name: 'Multiplier', label: 'Multiplier', type: 'float', default: 1 },
    ],
  },
  {
    key: 'DinoClassResistanceMultipliers', group: 'Creatures', kind: 'struct', label: 'Wild resistance by class',
    desc: 'Damage taken by a specific wild creature class (lower = tougher).',
    fields: [
      { name: 'ClassName', label: 'Class', type: 'class', quote: true, default: 'Rex_Character_BP_C', suggestions: 'creatures' },
      { name: 'Multiplier', label: 'Multiplier', type: 'float', default: 1 },
    ],
  },
  {
    key: 'TamedDinoClassDamageMultipliers', group: 'Creatures', kind: 'struct', label: 'Tamed damage by class',
    desc: 'Damage multiplier for a specific tamed creature class.',
    fields: [
      { name: 'ClassName', label: 'Class', type: 'class', quote: true, default: 'Rex_Character_BP_C', suggestions: 'creatures' },
      { name: 'Multiplier', label: 'Multiplier', type: 'float', default: 1 },
    ],
  },
  {
    key: 'TamedDinoClassResistanceMultipliers', group: 'Creatures', kind: 'struct', label: 'Tamed resistance by class',
    desc: 'Damage taken by a specific tamed creature class (lower = tougher).',
    fields: [
      { name: 'ClassName', label: 'Class', type: 'class', quote: true, default: 'Rex_Character_BP_C', suggestions: 'creatures' },
      { name: 'Multiplier', label: 'Multiplier', type: 'float', default: 1 },
    ],
  },
  {
    key: 'TamedDinoClassSpeedMultipliers', group: 'Creatures', kind: 'struct', label: 'Tamed speed by class',
    desc: 'Movement speed multiplier for a specific tamed creature class.',
    fields: [
      { name: 'ClassName', label: 'Class', type: 'class', quote: true, default: 'Ptero_Character_BP_C', suggestions: 'creatures' },
      { name: 'Multiplier', label: 'Multiplier', type: 'float', default: 1 },
    ],
  },
  {
    key: 'TamedDinoClassStaminaMultipliers', group: 'Creatures', kind: 'struct', label: 'Tamed stamina by class',
    desc: 'Stamina drain multiplier for a specific tamed creature class.',
    fields: [
      { name: 'ClassName', label: 'Class', type: 'class', quote: true, default: 'Ptero_Character_BP_C', suggestions: 'creatures' },
      { name: 'Multiplier', label: 'Multiplier', type: 'float', default: 1 },
    ],
  },
  {
    key: 'PreventDinoTameClassNames', group: 'Creatures', kind: 'string', label: 'Untameable creatures',
    desc: 'Creature classes that cannot be tamed.',
    fields: [{ name: 'value', label: 'Class', type: 'class', quote: true, default: 'Giga_Character_BP_C', suggestions: 'creatures' }],
  },
  {
    key: 'PreventBreedingForClassNames', group: 'Creatures', kind: 'string', label: 'Unbreedable creatures',
    desc: 'Creature classes that cannot breed.',
    fields: [{ name: 'value', label: 'Class', type: 'class', quote: true, default: 'Giga_Character_BP_C', suggestions: 'creatures' }],
  },
  {
    key: 'ConfigOverrideItemMaxQuantity', group: 'Items & Resources', kind: 'struct', label: 'Stack sizes',
    desc: 'Per-item stack size. “Ignore multiplier” stops Item Stack Size Multiplier applying on top.',
    fields: [
      { name: 'ItemClassString', label: 'Item class', type: 'class', quote: true, default: 'PrimalItemResource_Stone_C', suggestions: 'resources' },
      { name: 'MaxItemQuantity', label: 'Max stack', type: 'int', default: 1000, parent: 'Quantity' },
      { name: 'bIgnoreMultiplier', label: 'Ignore multiplier', type: 'bool', default: true, parent: 'Quantity' },
    ],
  },
  {
    key: 'HarvestResourceItemAmountClassMultipliers', group: 'Items & Resources', kind: 'struct', label: 'Harvest amount by resource',
    desc: 'Extra harvest multiplier for one resource (stacks with Harvest Amount Multiplier).',
    fields: [
      { name: 'ClassName', label: 'Resource class', type: 'class', quote: true, default: 'PrimalItemResource_Wood_C', suggestions: 'resources' },
      { name: 'Multiplier', label: 'Multiplier', type: 'float', default: 2 },
    ],
  },
  {
    key: 'EngramEntryAutoUnlocks', group: 'Engrams', kind: 'struct', label: 'Auto-unlocked engrams',
    desc: 'Engrams granted automatically when a player reaches a level.',
    fields: [
      { name: 'EngramClassName', label: 'Engram class', type: 'class', quote: true, default: 'EngramEntry_Campfire_C' },
      { name: 'LevelToAutoUnlock', label: 'Level', type: 'int', default: 1 },
    ],
  },
  {
    key: 'OverrideNamedEngramEntries', group: 'Engrams', kind: 'struct', label: 'Engram overrides',
    desc: 'Change cost, level requirement or visibility of an engram.',
    fields: [
      { name: 'EngramClassName', label: 'Engram class', type: 'class', quote: true, default: 'EngramEntry_Campfire_C' },
      { name: 'EngramHidden', label: 'Hidden', type: 'bool', default: false },
      { name: 'EngramPointsCost', label: 'Points', type: 'int', default: 0 },
      { name: 'EngramLevelRequirement', label: 'Level', type: 'int', default: 1 },
      { name: 'RemoveEngramPreReq', label: 'No prereqs', type: 'bool', default: false },
    ],
  },
  {
    key: 'OverrideEngramEntries', group: 'Engrams', kind: 'struct', label: 'Engram overrides (by index)',
    desc: 'Legacy index-based engram override – prefer the named version above when you know the class name.',
    fields: [
      { name: 'EngramIndex', label: 'Index', type: 'int', default: 0 },
      { name: 'EngramHidden', label: 'Hidden', type: 'bool', default: false },
      { name: 'EngramPointsCost', label: 'Points', type: 'int', default: 0 },
      { name: 'EngramLevelRequirement', label: 'Level', type: 'int', default: 1 },
      { name: 'RemoveEngramPreReq', label: 'No prereqs', type: 'bool', default: false },
    ],
  },
  {
    key: 'ExcludeItemIndices', group: 'Items & Resources', kind: 'string', label: 'Excluded supply-drop items',
    desc: 'Item indices that never appear in supply crates.',
    fields: [{ name: 'value', label: 'Item index', type: 'int', default: 0 }],
  },
  {
    key: 'CheatTeleportLocations', group: 'Spawns & Loot (advanced)', kind: 'struct', label: 'Admin teleport locations',
    desc: 'Named spots admins can jump to with the TP <name> cheat.',
    fields: [
      { name: 'TeleportName', label: 'Name', type: 'string', quote: true, default: 'Base' },
      { name: 'X', label: 'X', type: 'float', default: 0, parent: 'TeleportLocation' },
      { name: 'Y', label: 'Y', type: 'float', default: 0, parent: 'TeleportLocation' },
      { name: 'Z', label: 'Z', type: 'float', default: 0, parent: 'TeleportLocation' },
    ],
  },
  {
    key: 'ConfigAddNPCSpawnEntriesContainer', group: 'Spawns & Loot (advanced)', kind: 'raw', label: 'Add spawn entries',
    desc: 'Add creatures to spawn containers. One struct per entry.',
    example: '(NPCSpawnEntriesContainerClassString="DinoSpawnEntriesBeach_C",NPCSpawnEntries=((AnEntryName="RexSpawner",EntryWeight=0.1,NPCsToSpawnStrings=("Rex_Character_BP_C"))),NPCSpawnLimits=((NPCClassString="Rex_Character_BP_C",MaxPercentageOfDesiredNumToAllow=0.1)))',
  },
  {
    key: 'ConfigSubtractNPCSpawnEntriesContainer', group: 'Spawns & Loot (advanced)', kind: 'raw', label: 'Remove spawn entries',
    desc: 'Remove creatures from spawn containers.',
    example: '(NPCSpawnEntriesContainerClassString="DinoSpawnEntriesBeach_C",NPCSpawnEntries=((NPCsToSpawnStrings=("Raptor_Character_BP_C"))),NPCSpawnLimits=((NPCClassString="Raptor_Character_BP_C")))',
  },
  {
    key: 'ConfigOverrideNPCSpawnEntriesContainer', group: 'Spawns & Loot (advanced)', kind: 'raw', label: 'Override spawn containers',
    desc: 'Completely replace a spawn container’s entries.',
    example: '(NPCSpawnEntriesContainerClassString="DinoSpawnEntriesBeach_C",NPCSpawnEntries=((AnEntryName="Dodos",EntryWeight=1.0,NPCsToSpawnStrings=("Dodo_Character_BP_C"))),NPCSpawnLimits=((NPCClassString="Dodo_Character_BP_C",MaxPercentageOfDesiredNumToAllow=1.0)))',
  },
  {
    key: 'ConfigOverrideSupplyCrateItems', group: 'Spawns & Loot (advanced)', kind: 'raw', label: 'Supply crate contents',
    desc: 'Override loot tables for supply drops and loot crates.',
    example: '(SupplyCrateClassString="SupplyCrate_Level03_C",MinItemSets=1,MaxItemSets=1,NumItemSetsPower=1.0,bSetsRandomWithoutReplacement=true,ItemSets=((MinNumItems=1,MaxNumItems=1,NumItemsPower=1.0,SetWeight=1.0,bItemsRandomWithoutReplacement=true,ItemEntries=((EntryWeight=1.0,ItemClassStrings=("PrimalItemResource_Metal_C"),ItemsWeights=(1.0),MinQuantity=50,MaxQuantity=100,MinQuality=1.0,MaxQuality=1.0,bForceBlueprint=false,ChanceToBeBlueprintOverride=0.0)))))',
  },
  {
    key: 'ConfigOverrideItemCraftingCosts', group: 'Spawns & Loot (advanced)', kind: 'raw', label: 'Crafting costs',
    desc: 'Change the resources needed to craft an item.',
    example: '(ItemClassString="PrimalItem_WeaponMetalPick_C",BaseCraftingResourceRequirements=((ResourceItemTypeString="PrimalItemResource_Metal_C",BaseResourceRequirement=5.0,bCraftingRequireExactResourceType=false)))',
  },
];

export const CREATURE_CLASSES = [
  'Rex_Character_BP_C', 'Giga_Character_BP_C', 'Carno_Character_BP_C', 'Raptor_Character_BP_C', 'Allo_Character_BP_C',
  'Spino_Character_BP_C', 'Ptero_Character_BP_C', 'Argent_Character_BP_C', 'Quetz_Character_BP_C', 'Trike_Character_BP_C',
  'Stego_Character_BP_C', 'Ankylo_Character_BP_C', 'Doed_Character_BP_C', 'Bronto_Character_BP_C', 'Paracer_Character_BP_C',
  'Mammoth_Character_BP_C', 'Sabertooth_Character_BP_C', 'Direwolf_Character_BP_C', 'Thylacoleo_Character_BP_C',
  'Yutyrannus_Character_BP_C', 'Therizino_Character_BP_C', 'Megatherium_Character_BP_C', 'Mosa_Character_BP_C',
  'Plesiosaur_Character_BP_C', 'Megalodon_Character_BP_C', 'Basilosaurus_Character_BP_C', 'Tusoteuthis_Character_BP_C',
  'Dodo_Character_BP_C', 'Dilo_Character_BP_C', 'Parasaur_Character_BP_C', 'Titanosaur_Character_BP_C',
  'Wyvern_Character_BP_Fire_C', 'Wyvern_Character_BP_Lightning_C', 'Wyvern_Character_BP_Poison_C', 'RockDrake_Character_BP_C',
  'Reaper_Character_BP_C', 'Gacha_Character_BP_C', 'Snow_Owl_Character_BP_C', 'Managarmr_Character_BP_C', 'Velonasaur_Character_BP_C',
];

export const RESOURCE_CLASSES = [
  'PrimalItemResource_Wood_C', 'PrimalItemResource_Stone_C', 'PrimalItemResource_Thatch_C', 'PrimalItemResource_Fiber_C',
  'PrimalItemResource_Metal_C', 'PrimalItemResource_MetalIngot_C', 'PrimalItemResource_Flint_C', 'PrimalItemResource_Obsidian_C',
  'PrimalItemResource_Crystal_C', 'PrimalItemResource_Oil_C', 'PrimalItemResource_Silicon_C', 'PrimalItemResource_Hide_C',
  'PrimalItemResource_Chitin_C', 'PrimalItemResource_Keratin_C', 'PrimalItemResource_Pelt_C', 'PrimalItemResource_Polymer_Organic_C',
  'PrimalItemResource_Element_C', 'PrimalItemResource_ElementShard_C', 'PrimalItemResource_BlackPearl_C', 'PrimalItemResource_Sparkpowder_C',
  'PrimalItemResource_Gunpowder_C', 'PrimalItemConsumable_RawMeat_C', 'PrimalItemConsumable_RawPrimeMeat_C', 'PrimalItemResource_Sap_C',
];

export const CREATURE_TAGS = [
  'Rex', 'Giga', 'Carno', 'Raptor', 'Allo', 'Spino', 'Ptero', 'Argent', 'Quetz', 'Trike', 'Stego', 'Ankylo', 'Doed', 'Sauropod',
  'Paracer', 'Mammoth', 'Sabertooth', 'Direwolf', 'Thylacoleo', 'Yutyrannus', 'Therizino', 'Mosasaurus', 'Plesiosaur',
  'Megalodon', 'Dodo', 'Dilo', 'Para', 'Titanosaur', 'Wyvern', 'Bigfoot', 'Turtle', 'Equus',
];

// ── (de)serialisation ───────────────────────────────────────────────────────────

export type ListRow = Record<string, string | number | boolean>;

function fmtValue(f: ListField, v: string | number | boolean): string {
  if (f.type === 'bool') return v ? 'true' : 'false';
  if (f.type === 'float') return Number.isInteger(Number(v)) ? Number(v).toFixed(1) : String(Number(v));
  if (f.type === 'int') return String(Math.round(Number(v)));
  return f.quote ? `"${String(v).replace(/"/g, '')}"` : String(v);
}

export function serializeRow(def: ListEditorDef, row: ListRow): string {
  if (def.kind === 'raw') return String(row.raw ?? '');
  const fields = def.fields!;
  if (def.kind === 'string') return fmtValue(fields[0], row.value ?? '');
  const parts: string[] = [];
  const groups: Record<string, string[]> = {};
  for (const f of fields) {
    const s = `${f.name}=${fmtValue(f, row[f.name] ?? f.default)}`;
    if (f.parent) {
      if (!groups[f.parent]) {
        groups[f.parent] = [];
        parts.push(`\u0000${f.parent}`);
      }
      groups[f.parent].push(s);
    } else parts.push(s);
  }
  return `(${parts.map((p) => (p.startsWith('\u0000') ? `${p.slice(1)}=(${groups[p.slice(1)].join(',')})` : p)).join(',')})`;
}

function readValue(f: ListField, raw: string | undefined): string | number | boolean {
  if (raw === undefined) return f.default;
  if (f.type === 'bool') return raw.toLowerCase() === 'true';
  if (f.type === 'float' || f.type === 'int') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : f.default;
  }
  return unquote(raw);
}

export function parseRow(def: ListEditorDef, value: string): ListRow {
  if (def.kind === 'raw') return { raw: value };
  const fields = def.fields!;
  if (def.kind === 'string') return { value: unquote(value.trim()) };
  const top = parseStruct(value);
  const row: ListRow = {};
  for (const f of fields) {
    const src = f.parent ? parseStruct(top[f.parent] ?? '()') : top;
    row[f.name] = readValue(f, src[f.name]);
  }
  return row;
}

export function newRow(def: ListEditorDef): ListRow {
  if (def.kind === 'raw') return { raw: def.example ?? '()' };
  return Object.fromEntries(def.fields!.map((f) => [f.name, f.default]));
}
