export type SettingType = 'bool' | 'float' | 'int' | 'string' | 'text';

export interface SettingDef {
  key: string;
  file: 'GUS' | 'Game';
  section: string;
  type: SettingType;
  label: string;
  desc: string;
  category: string;
  default?: boolean | number | string;
  min?: number;
  max?: number;
  step?: number;
  scale?: 'linear' | 'log';
  unit?: 's';
  /** Lower values mean "more"/"faster" (intervals, resistances). */
  inverted?: boolean;
  advanced?: boolean;
}

export interface CategoryDef {
  id: string;
  label: string;
}
