import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GAME, GUS, type IniFileName } from '@/lib/ipc';
import type { IniDoc } from '@/lib/ini';
import { SETTINGS } from '@/data/settings.generated';
import { STAT_GRIDS } from '@/data/stats';
import { LIST_EDITORS } from '@/data/listEditors';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, Empty } from '@/components/ui/Surface';
import { Input, Label, Select } from '@/components/ui/Field';

/** Keys the profile writes on every start – shown elsewhere. */
const MANAGED = new Set(
  ['SessionName', 'Port', 'QueryPort', 'RCONEnabled', 'RCONPort', 'ServerAdminPassword', 'ServerPassword', 'SpectatorPassword', 'MaxPlayers',
    'OverridePlayerLevelEngramPoints', 'LevelExperienceRampOverrides', 'OverrideMaxExperiencePointsPlayer', 'OverrideMaxExperiencePointsDino'].map((k) => k.toLowerCase()),
);

/**
 * Everything in the files that the catalog doesn't know about: mod sections, new settings added by
 * patches, or experimental keys. Nothing is ever hidden from the user.
 */
export function CustomKeysPanel({ gus, game, edit }: { gus: IniDoc; game: IniDoc; edit: (f: IniFileName, fn: (d: IniDoc) => void) => void }) {
  const known = useMemo(() => {
    const s = new Set<string>();
    for (const d of SETTINGS) s.add(`${d.file === 'GUS' ? GUS : GAME}|${d.section}|${d.key}`.toLowerCase());
    return s;
  }, []);
  const prefixes = useMemo(() => [...STAT_GRIDS.map((g) => g.key.toLowerCase() + '['), 'itemstatclamps['], []);
  const listKeys = useMemo(() => new Set(LIST_EDITORS.map((l) => l.key.toLowerCase())), []);

  const groups = useMemo(() => {
    const out: { file: IniFileName; section: string; entries: { key: string; value: string; line: number }[] }[] = [];
    for (const [file, doc] of [[GUS, gus], [GAME, game]] as const) {
      for (const e of doc.outline()) {
        const k = e.key.toLowerCase();
        if (MANAGED.has(k) || known.has(`${file}|${e.section}|${e.key}`.toLowerCase())) continue;
        if (file === GAME && (prefixes.some((p) => k.startsWith(p)) || listKeys.has(k))) continue;
        let g = out.find((x) => x.file === file && x.section.toLowerCase() === e.section.toLowerCase());
        if (!g) out.push((g = { file, section: e.section, entries: [] }));
        g.entries.push(e);
      }
    }
    return out;
  }, [gus, game, known, prefixes, listKeys]);

  const [file, setFile] = useState<IniFileName>(GUS);
  const [section, setSection] = useState('ServerSettings');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Add a key" subtitle="For mod settings or anything not covered by the editor" />
        <div className="grid grid-cols-[150px_1fr_1fr_1fr_auto] items-end gap-3 p-4">
          <div>
            <Label>File</Label>
            <Select value={file} onChange={(v) => setFile(v as IniFileName)} options={[{ value: GUS, label: 'GameUserSettings' }, { value: GAME, label: 'Game.ini' }]} />
          </div>
          <div>
            <Label>Section</Label>
            <Input value={section} onChange={(e) => setSection(e.target.value)} list="dl-sections" mono />
            <datalist id="dl-sections">
              {[...new Set([...gus.sections(), ...game.sections(), 'ServerSettings', '/script/shootergame.shootergamemode'])].map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <Label>Key</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} mono placeholder="MyModSetting" />
          </div>
          <div>
            <Label>Value</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} mono />
          </div>
          <Button
            variant="primary"
            icon={<Plus className="size-3.5" />}
            disabled={!key.trim() || !section.trim()}
            onClick={() => {
              edit(file, (d) => d.set(section.trim(), key.trim(), value));
              setKey('');
              setValue('');
            }}
          >
            Add
          </Button>
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card>
          <Empty title="No custom keys" body="Every key in your config files is handled by a dedicated editor." />
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.file + g.section}>
            <CardHeader title={<span className="font-mono text-[12.5px]">[{g.section}]</span>} subtitle={g.file} />
            <div className="p-2">
              {g.entries.map((e, i) => (
                <div key={`${e.line}:${e.key}:${e.value}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_28px] items-center gap-3 rounded-lg px-2 py-1 hover:bg-white/[0.02]">
                  <span className="selectable truncate font-mono text-[12px] text-fg-2" title={e.key}>{e.key}</span>
                  <Input
                    defaultValue={e.value}
                    mono
                    className="h-7 text-[11.5px]"
                    onBlur={(ev) => ev.target.value !== e.value && edit(g.file, (d) => replaceNth(d, g.section, e.key, i, g, ev.target.value))}
                    onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
                  />
                  <button onClick={() => edit(g.file, (d) => d.remove(g.section, e.key))} className="rounded p-1 text-fg-4 hover:bg-hover hover:text-err" title="Remove key">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

/** Edit the n-th occurrence of a possibly repeated key while keeping the others. */
function replaceNth(d: IniDoc, section: string, key: string, rowIndex: number, g: { entries: { key: string }[] }, value: string) {
  const sameKeyBefore = g.entries.slice(0, rowIndex).filter((x) => x.key.toLowerCase() === key.toLowerCase()).length;
  const all = d.getAll(section, key);
  if (all.length <= 1) d.set(section, key, value);
  else d.setAll(section, key, all.map((v, j) => (j === sameKeyBefore ? value : v)));
}
