import type { IniDoc } from '@/lib/ini';
import { SETTINGS } from '@/data/settings.generated';
import { STAT_GRIDS } from '@/data/stats';
import { LIST_EDITORS } from '@/data/listEditors';
import type { Preset, PresetChange } from '@/data/presets';

const GAME_SECTION = '/script/shootergame.shootergamemode';
const LEVELING = ['LevelExperienceRampOverrides', 'OverridePlayerLevelEngramPoints', 'OverrideMaxExperiencePointsPlayer', 'OverrideMaxExperiencePointsDino'];
const INDEXED = [...STAT_GRIDS.map((g) => g.key), 'ItemStatClamps'];

/** Remove every gameplay override (catalog keys, stat grids, list editors, leveling). Profile keys and mod sections stay. */
export function resetToOfficial(gus: IniDoc, game: IniDoc) {
  for (const d of SETTINGS) {
    if (d.key.includes('[')) continue;
    (d.file === 'GUS' ? gus : game).remove(d.section, d.key);
  }
  for (const k of INDEXED) game.removeIndexed(GAME_SECTION, k);
  for (const l of LIST_EDITORS) game.remove(GAME_SECTION, l.key);
  for (const k of LEVELING) game.remove(GAME_SECTION, k);
}

export function applyChanges(changes: PresetChange[], gus: IniDoc, game: IniDoc) {
  for (const c of changes) {
    const doc = c.file === 'GUS' ? gus : game;
    if (c.values) doc.setAll(c.section, c.key, c.values);
    else doc.set(c.section, c.key, c.value);
  }
}

export function applyPreset(p: Preset, reset: boolean, gus: IniDoc, game: IniDoc) {
  if (reset || p.resetFirst) resetToOfficial(gus, game);
  applyChanges(p.changes, gus, game);
}

export interface DiffRow {
  label: string;
  key: string;
  file: 'GUS' | 'Game';
  from: string;
  to: string;
  changed: boolean;
}

const labelFor = (key: string) => SETTINGS.find((d) => d.key === key)?.label ?? key;
const officialFor = (key: string) => {
  const d = SETTINGS.find((x) => x.key === key);
  if (d?.default === undefined) return 'default';
  return typeof d.default === 'boolean' ? (d.default ? 'True' : 'False') : String(d.default);
};

/** What the preset would change, given the current documents. */
export function diffPreset(p: Preset, reset: boolean, gus: IniDoc, game: IniDoc): DiffRow[] {
  return p.changes.map((c) => {
    const doc = c.file === 'GUS' ? gus : game;
    const cur = c.values ? doc.getAll(c.section, c.key).join(' | ') : doc.get(c.section, c.key);
    const from = reset || p.resetFirst ? officialFor(c.key) : cur ?? `${officialFor(c.key)} (official)`;
    const to = c.values ? `${c.values.length} entr${c.values.length === 1 ? 'y' : 'ies'}` : c.value;
    const changed = c.values ? true : Number.isFinite(Number(cur)) && Number.isFinite(Number(c.value)) ? Number(cur) !== Number(c.value) : (cur ?? '').toLowerCase() !== c.value.toLowerCase();
    return { label: labelFor(c.key.split('[')[0]) + (c.key.includes('[') ? ` ${c.key.slice(c.key.indexOf('['))}` : ''), key: c.key, file: c.file, from, to, changed };
  });
}

/** Snapshot every gameplay key currently set in the files as preset changes. */
export function captureCurrent(gus: IniDoc, game: IniDoc): PresetChange[] {
  const out: PresetChange[] = [];
  for (const d of SETTINGS) {
    const doc = d.file === 'GUS' ? gus : game;
    const v = doc.get(d.section, d.key);
    if (v !== undefined) out.push({ file: d.file, section: d.section, key: d.key, value: v });
  }
  for (const k of STAT_GRIDS.map((g) => g.key)) {
    for (const [i, v] of Object.entries(game.getIndexed(GAME_SECTION, k))) out.push({ file: 'Game', section: GAME_SECTION, key: `${k}[${i}]`, value: v });
  }
  for (const k of [...LIST_EDITORS.map((l) => l.key), 'LevelExperienceRampOverrides', 'OverridePlayerLevelEngramPoints']) {
    const vals = game.getAll(GAME_SECTION, k);
    if (vals.length) out.push({ file: 'Game', section: GAME_SECTION, key: k, value: '', values: vals });
  }
  for (const k of ['OverrideMaxExperiencePointsPlayer', 'OverrideMaxExperiencePointsDino']) {
    const v = game.get(GAME_SECTION, k);
    if (v !== undefined) out.push({ file: 'Game', section: GAME_SECTION, key: k, value: v });
  }
  return out;
}
