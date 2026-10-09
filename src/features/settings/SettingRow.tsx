import { memo, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { SettingDef } from '@/data/types';
import { formatNumber, parseBool } from '@/lib/ini';
import { secondsHuman } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Input, NumberInput, Slider, Switch, Textarea } from '@/components/ui/Field';

export interface RowProps {
  def: SettingDef;
  /** Raw value from the INI, undefined when the key is absent (official default applies). */
  raw: string | undefined;
  onSet: (v: string) => void;
  onReset: () => void;
  highlight?: boolean;
}

export function isModified(def: SettingDef, raw: string | undefined): boolean {
  if (raw === undefined) return false;
  if (def.default === undefined) return raw.trim() !== '';
  if (def.type === 'bool') return parseBool(raw) !== def.default;
  if (def.type === 'float' || def.type === 'int') return Number(raw) !== Number(def.default);
  return raw !== String(def.default);
}

export const SettingRow = memo(function SettingRow({ def, raw, onSet, onReset, highlight }: RowProps) {
  const present = raw !== undefined;
  const modified = isModified(def, raw);
  return (
    <div
      id={`setting-${def.key}`}
      className={cn(
        'group relative grid grid-cols-[minmax(0,1fr)_minmax(260px,380px)] items-center gap-6 rounded-lg px-4 py-3 transition-colors duration-300',
        highlight ? 'bg-accent/10' : 'hover:bg-white/[0.02]',
      )}
    >
      {modified && <span className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-accent" />}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-fg">{def.label}</span>
          {def.file === 'Game' && <span className="rounded bg-white/5 px-1 text-[9.5px] font-semibold tracking-wide text-fg-4">GAME.INI</span>}
          {def.advanced && <span className="rounded bg-warn/10 px-1 text-[9.5px] font-semibold tracking-wide text-warn/80">ADV</span>}
        </div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-fg-3">{def.desc}</div>
        <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px] text-fg-4">
          <span className="selectable">{def.key}</span>
          {def.default !== undefined && def.type !== 'text' && (
            <span>· official {def.type === 'bool' ? (def.default ? 'True' : 'False') : String(def.default)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Control def={def} raw={raw} onSet={onSet} />
        <button
          onClick={onReset}
          disabled={!present}
          title={present ? 'Remove from file (use official default)' : 'Using official default'}
          className={cn('rounded p-1 text-fg-4 transition-opacity hover:bg-hover hover:text-fg', present ? 'opacity-100' : 'pointer-events-none opacity-0')}
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </div>
  );
});

function Control({ def, raw, onSet }: { def: SettingDef; raw: string | undefined; onSet: (v: string) => void }) {
  if (def.type === 'bool') {
    const v = parseBool(raw) ?? (def.default as boolean | undefined) ?? false;
    return <Switch checked={v} onChange={(b) => onSet(b ? 'True' : 'False')} />;
  }
  if (def.type === 'float' || def.type === 'int') return <NumberControl def={def} raw={raw} onSet={onSet} />;
  if (def.type === 'text') {
    return <TextControl raw={raw} def={def} onSet={onSet} multiline />;
  }
  return <TextControl raw={raw} def={def} onSet={onSet} />;
}

function NumberControl({ def, raw, onSet }: { def: SettingDef; raw: string | undefined; onSet: (v: string) => void }) {
  const fromRaw = raw !== undefined && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
  const value = fromRaw ?? (typeof def.default === 'number' ? def.default : 0);
  const [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);
  const integer = def.type === 'int';
  const commit = (v: number) => onSet(formatNumber(v, integer ? 'int' : 'float'));
  const hasRange = def.min !== undefined && def.max !== undefined;
  return (
    <div className="flex w-full items-center gap-3">
      {hasRange && (
        <div className="min-w-0 flex-1">
          <Slider
            value={live}
            min={def.min!}
            max={def.max!}
            step={def.step ?? (integer ? 1 : 0.01)}
            scale={def.scale}
            def={typeof def.default === 'number' ? def.default : undefined}
            inverted={def.inverted}
            onChange={setLive}
            onCommit={() => live !== value && commit(live)}
          />
          {def.unit === 's' && <div className="mt-0.5 text-right text-[10.5px] text-fg-4">{secondsHuman(live)}</div>}
        </div>
      )}
      <NumberInput value={live} integer={integer} step={def.step ?? 1} onCommit={(v) => { setLive(v); commit(v); }} />
    </div>
  );
}

function TextControl({ def, raw, onSet, multiline }: { def: SettingDef; raw: string | undefined; onSet: (v: string) => void; multiline?: boolean }) {
  const shown = raw ?? '';
  const [v, setV] = useState(multiline ? shown.replace(/\\n/g, '\n') : shown);
  useEffect(() => setV(multiline ? shown.replace(/\\n/g, '\n') : shown), [shown, multiline]);
  const commit = () => {
    const out = multiline ? v.replace(/\r?\n/g, '\\n') : v;
    if (out !== shown) onSet(out);
  };
  if (multiline)
    return <Textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder="Welcome to the server!" className="min-h-24 text-[12.5px]" />;
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={typeof def.default === 'string' ? def.default : ''}
      mono
    />
  );
}
