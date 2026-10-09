import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GAME } from '@/lib/ipc';
import type { IniDoc } from '@/lib/ini';
import {
  CREATURE_CLASSES, CREATURE_TAGS, LIST_EDITORS, RESOURCE_CLASSES, newRow, parseRow, serializeRow,
  type ListEditorDef, type ListField, type ListRow,
} from '@/data/listEditors';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Surface';
import { Input, NumberInput, Switch, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

const SECTION = '/script/shootergame.shootergamemode';

export function ListEditorsPanel({ group, game, edit }: { group: ListEditorDef['group']; game: IniDoc; edit: (f: typeof GAME, fn: (d: IniDoc) => void) => void }) {
  const defs = LIST_EDITORS.filter((d) => d.group === group);
  return (
    <div className="space-y-4">
      <datalist id="dl-creatures">{CREATURE_CLASSES.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-resources">{RESOURCE_CLASSES.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-tags">{CREATURE_TAGS.map((c) => <option key={c} value={c} />)}</datalist>
      {defs.map((def) => (
        <ListEditor key={def.key} def={def} values={game.getAll(SECTION, def.key)} onChange={(vals) => edit(GAME, (d) => d.setAll(SECTION, def.key, vals))} />
      ))}
    </div>
  );
}

function ListEditor({ def, values, onChange }: { def: ListEditorDef; values: string[]; onChange: (v: string[]) => void }) {
  const rows = useMemo(() => values.map((v) => parseRow(def, v)), [values, def]);
  const update = (i: number, row: ListRow) => onChange(rows.map((r, j) => serializeRow(def, j === i ? row : r)));
  const remove = (i: number) => onChange(values.filter((_, j) => j !== i));
  const add = () => onChange([...values, serializeRow(def, newRow(def))]);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {def.label}
            {values.length > 0 && <span className="rounded bg-accent/15 px-1.5 text-[10.5px] font-semibold text-accent">{values.length}</span>}
          </span>
        }
        subtitle={def.desc}
        actions={
          <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={add}>
            Add
          </Button>
        }
      />
      {rows.length === 0 ? (
        <div className="px-4 py-3 font-mono text-[11px] text-fg-4">{def.key} – none configured</div>
      ) : def.kind === 'raw' ? (
        <div className="space-y-2 p-3">
          {rows.map((r, i) => {
            const raw = String(r.raw);
            const balanced = isBalanced(raw);
            return (
              <div key={`${i}:${raw}`} className="flex gap-2">
                <Textarea
                  defaultValue={raw}
                  onBlur={(e) => e.target.value !== raw && update(i, { raw: e.target.value.replace(/\s*\n\s*/g, '') })}
                  className={cn('min-h-16 font-mono text-[11.5px]', !balanced && 'border-err/60')}
                />
                <button onClick={() => remove(i)} className="self-start rounded p-1.5 text-fg-4 hover:bg-hover hover:text-err" title="Remove">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-2">
          <div className="grid gap-2 px-2 pb-1 text-[10.5px] font-semibold tracking-wide text-fg-4 uppercase" style={{ gridTemplateColumns: cols(def) }}>
            {def.fields!.map((f) => (
              <span key={f.name}>{f.label}</span>
            ))}
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.02]" style={{ gridTemplateColumns: cols(def) }}>
              {def.fields!.map((f) => (
                <FieldInput key={f.name} f={f} value={r[f.name]} onChange={(v) => update(i, { ...r, [f.name]: v })} />
              ))}
              <button onClick={() => remove(i)} className="rounded p-1 text-fg-4 hover:bg-hover hover:text-err" title="Remove">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function cols(def: ListEditorDef) {
  return (
    def.fields!.map((f) => (f.type === 'class' || f.type === 'string' ? 'minmax(0,2fr)' : f.type === 'bool' ? '90px' : '110px')).join(' ') + ' 28px'
  );
}

function FieldInput({ f, value, onChange }: { f: ListField; value: ListRow[string]; onChange: (v: string | number | boolean) => void }) {
  if (f.type === 'bool') return <Switch size="sm" checked={!!value} onChange={onChange} />;
  if (f.type === 'float' || f.type === 'int')
    return <NumberInput className="w-full" value={Number(value)} integer={f.type === 'int'} step={f.type === 'int' ? 1 : 0.1} onCommit={onChange} />;
  const list = f.suggestions === 'creatures' ? 'dl-creatures' : f.suggestions === 'resources' ? 'dl-resources' : f.suggestions === 'tags' ? 'dl-tags' : undefined;
  return (
    <Input
      key={String(value)}
      defaultValue={String(value ?? '')}
      list={list}
      mono
      className="h-7 text-[11.5px]"
      onBlur={(e) => e.target.value !== value && onChange(e.target.value.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function isBalanced(s: string) {
  let d = 0;
  let q = false;
  for (const c of s) {
    if (c === '"') q = !q;
    else if (!q && c === '(') d++;
    else if (!q && c === ')') d--;
    if (d < 0) return false;
  }
  return d === 0 && !q;
}
