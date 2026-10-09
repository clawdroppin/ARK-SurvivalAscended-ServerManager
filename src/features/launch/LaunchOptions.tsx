import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Search, Star } from 'lucide-react';
import { useApp, useInstance } from '@/store/app';
import { api } from '@/lib/ipc';
import { LAUNCH_GROUPS, LAUNCH_OPTIONS, type LaunchOptionDef } from '@/data/launchOptions';
import { Card, CardHeader } from '@/components/ui/Surface';
import { Input, Select, Switch } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import type { LaunchValue } from '@/lib/types';

export function LaunchOptions({ id }: { id: string }) {
  const inst = useInstance(id)!;
  const saveInstance = useApp((s) => s.saveInstance);
  const [line, setLine] = useState('');
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.launchLine(id).then(setLine).catch(() => {});
  }, [id, inst]);

  const set = (key: string, v: LaunchValue | null) => {
    const next = { ...inst.launchOptions };
    if (v === null || v === false || v === '') delete next[key];
    else next[key] = v;
    saveInstance({ ...inst, launchOptions: next });
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? LAUNCH_OPTIONS.filter((o) => o.label.toLowerCase().includes(s) || o.key.toLowerCase().includes(s) || o.desc.toLowerCase().includes(s)) : LAUNCH_OPTIONS;
  }, [q]);
  const enabledCount = Object.keys(inst.launchOptions).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] space-y-4 px-6 py-5">
        <Card>
          <CardHeader
            title="Launch command"
            subtitle={`${enabledCount} option${enabledCount === 1 ? '' : 's'} enabled · passwords and session name are written to GameUserSettings.ini instead of the command line`}
            actions={
              <button
                onClick={() => {
                  navigator.clipboard.writeText(line);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg"
                title="Copy"
              >
                {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
              </button>
            }
          />
          <div className="selectable px-4 py-3 font-mono text-[11.5px] leading-relaxed break-all text-fg-2">{line}</div>
        </Card>

        <div className="relative max-w-sm">
          <Input icon={<Search className="size-3.5" />} placeholder="Filter launch options" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {LAUNCH_GROUPS.map((g) => {
          const opts = filtered.filter((o) => o.group === g);
          if (!opts.length) return null;
          return (
            <Card key={g}>
              <CardHeader title={g} />
              <div className="divide-y divide-line/70 p-1">
                {opts.map((o) => (
                  <OptionRow key={o.key} o={o} value={inst.launchOptions[o.key]} onChange={(v) => set(o.key, v)} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function OptionRow({ o, value, onChange }: { o: LaunchOptionDef; value: LaunchValue | undefined; onChange: (v: LaunchValue | null) => void }) {
  const [draft, setDraft] = useState(typeof value === 'string' ? value : '');
  useEffect(() => setDraft(typeof value === 'string' ? value : ''), [value]);
  const on = value !== undefined && value !== false && value !== '';
  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)_260px] items-center gap-6 px-4 py-3">
      {on && <span className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-accent" />}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-fg">{o.label}</span>
          {o.recommended && (
            <span className="flex items-center gap-0.5 text-[10.5px] text-accent">
              <Star className="size-3" /> recommended
            </span>
          )}
          {o.danger && <AlertTriangle className="size-3.5 text-warn" />}
        </div>
        <div className="mt-0.5 text-[12px] text-fg-3">{o.desc}</div>
        <div className="mt-1 font-mono text-[10.5px] text-fg-4">{o.key}{o.kind !== 'flag' && '=<value>'}</div>
      </div>
      <div className={cn('flex justify-end')}>
        {o.kind === 'flag' && <Switch checked={value === true} onChange={(b) => onChange(b ? true : null)} />}
        {o.kind === 'select' && <Select className="w-full" value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v || null)} options={o.options!} />}
        {o.kind === 'value' && (
          <Input
            value={draft}
            mono
            placeholder={o.placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== (typeof value === 'string' ? value : '') && onChange(draft.trim() || null)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        )}
      </div>
    </div>
  );
}
