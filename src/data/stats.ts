/** Attribute index table used by every indexed stat setting. */
export const STAT_NAMES = [
  'Health', 'Stamina', 'Torpidity', 'Oxygen', 'Food', 'Water',
  'Temperature', 'Weight', 'Melee Damage', 'Movement Speed', 'Fortitude', 'Crafting Speed',
] as const;

export interface StatGridDef {
  key: string;
  label: string;
  desc: string;
  type: 'float' | 'int';
  /** Official default per stat index; null = not applicable for this grid. */
  defaults: (number | null)[];
  max: number;
  step: number;
}

const ones = (skip: number[] = []) => STAT_NAMES.map((_, i) => (skip.includes(i) ? null : 1));

export const STAT_GRIDS: StatGridDef[] = [
  {
    key: 'PerLevelStatsMultiplier_Player',
    label: 'Player – per level',
    desc: 'Stat gained per level-up point spent by players. Use 0.01 to nearly disable (0 resets to 1.0).',
    type: 'float', defaults: ones([2, 6]), max: 20, step: 0.05,
  },
  {
    key: 'PlayerBaseStatMultipliers',
    label: 'Player – base stats',
    desc: 'Multiplies the starting stats of a freshly spawned character.',
    type: 'float', defaults: [1, 1, 1, 1, 1, 1, null, 1, null, null, null, null], max: 20, step: 0.05,
  },
  {
    key: 'PerLevelStatsMultiplier_DinoWild',
    label: 'Wild creatures – per level',
    desc: 'Stat gained per level for wild creatures (affects tamed base stats too).',
    type: 'float', defaults: ones([6, 10, 11]), max: 20, step: 0.05,
  },
  {
    key: 'PerLevelStatsMultiplier_DinoTamed',
    label: 'Tamed – per level',
    desc: 'Stat gained per level-up point on tamed creatures.',
    type: 'float', defaults: [0.2, 1, 1, 1, 1, 1, null, 1, 0.17, 1, null, 1], max: 20, step: 0.01,
  },
  {
    key: 'PerLevelStatsMultiplier_DinoTamed_Add',
    label: 'Tamed – taming bonus (additive)',
    desc: 'Flat bonus added when a creature is tamed.',
    type: 'float', defaults: [0.14, 1, 1, 1, 1, 1, null, 1, 0.14, 1, null, 1], max: 20, step: 0.01,
  },
  {
    key: 'PerLevelStatsMultiplier_DinoTamed_Affinity',
    label: 'Tamed – taming effectiveness bonus',
    desc: 'Bonus scaled by taming effectiveness.',
    type: 'float', defaults: [0.44, 1, 1, 1, 1, 1, null, 1, 0.44, 1, null, 1], max: 20, step: 0.01,
  },
  {
    key: 'MutagenLevelBoost',
    label: 'Mutagen – wild-caught tames',
    desc: 'Levels added per stat when Mutagen is used on tames with wild ancestry.',
    type: 'int', defaults: [5, 5, null, null, null, null, null, 5, 5, null, null, null], max: 100, step: 1,
  },
  {
    key: 'MutagenLevelBoost_Bred',
    label: 'Mutagen – bred tames',
    desc: 'Levels added per stat when Mutagen is used on bred tames.',
    type: 'int', defaults: [1, 1, null, null, null, null, null, 1, 1, null, null, null], max: 100, step: 1,
  },
];
