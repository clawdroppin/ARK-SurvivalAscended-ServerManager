import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, BookmarkPlus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { PRESETS, type Preset } from '@/data/presets';
import { api, errMsg } from '@/lib/ipc';
import type { IniDoc } from '@/lib/ini';
import { useApp } from '@/store/app';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Badge, Card, Dialog, Segmented } from '@/components/ui/Surface';
import { Input, Label, Textarea } from '@/components/ui/Field';
import { confirm } from '@/components/ui/Confirm';
import { applyPreset, captureCurrent, diffPreset } from './presetApply';

type EditBoth = (fn: (gus: IniDoc, game: IniDoc) => void) => void;

function fmtRate(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}×`;
}

export function PresetsPanel({ gus, game, editBoth }: { gus: IniDoc; game: IniDoc; editBoth: EditBoth }) {
  const toast = useApp((s) => s.toast);
  const [userPresets, setUserPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<Preset | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    api.listUserPresets().then((l) => setUserPresets(l as Preset[])).catch(() => {});
  }, []);

  const persist = async (list: Preset[]) => {
    setUserPresets(list);
    try {
      await api.saveUserPresets(list);
    } catch (e) {
      toast('error', 'Could not save presets', errMsg(e));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4 px-5 py-4" style={{ background: 'radial-gradient(80% 160% at 0% 0%, rgba(45,212,191,.10), transparent 60%)' }}>
        <Sparkles className="size-5 shrink-0 text-accent" />
        <div className="flex-1 text-[12.5px] leading-relaxed text-fg-3">
          Pick a style to start from, preview exactly what changes, then fine-tune any individual setting afterwards. Nothing is written to disk until you press <span className="text-fg">Save</span>.
        </div>
        <Button variant="outline" icon={<BookmarkPlus className="size-3.5" />} onClick={() => setSaveOpen(true)}>
          Save current as preset
        </Button>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {PRESETS.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02, duration: 0.16 }}>
            <PresetCard p={p} onClick={() => setSelected(p)} />
          </motion.div>
        ))}
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">Your presets</div>
        {userPresets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-[12.5px] text-fg-4">
            Tune a server the way you like it and save it as a preset to reuse on other servers. Saved presets live in <span className="font-mono text-fg-3">presets.json</span> in the profile folder.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {userPresets.map((p) => (
              <PresetCard
                key={p.id}
                p={p}
                onClick={() => setSelected(p)}
                onDelete={async () => {
                  if ((await confirm({ title: `Delete preset “${p.name}”?`, confirmLabel: 'Delete', danger: true })).ok) persist(userPresets.filter((x) => x.id !== p.id));
                }}
              />
            ))}
          </div>
        )}
      </div>

      <ApplyDialog preset={selected} onClose={() => setSelected(null)} gus={gus} game={game} editBoth={editBoth} />
      <SaveDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={(name, description) => {
          const changes = captureCurrent(gus, game);
          const num = (k: string) => Number(changes.find((c) => c.key === k)?.value ?? 1) || 1;
          const preset: Preset = {
            id: crypto.randomUUID(),
            name,
            tagline: `${changes.length} settings · saved ${new Date().toLocaleDateString()}`,
            description: description || 'Custom preset',
            tags: ['Custom'],
            hue: Math.floor(Math.random() * 360),
            rates: { xp: num('XPMultiplier'), harvest: num('HarvestAmountMultiplier'), taming: num('TamingSpeedMultiplier'), breeding: num('BabyMatureSpeedMultiplier') },
            changes,
            // A saved preset describes a complete configuration, so it applies on a clean slate.
            resetFirst: true,
          };
          persist([...userPresets, preset]);
          toast('success', `Saved preset “${name}”`, `${changes.length} settings captured`);
          setSaveOpen(false);
        }}
      />
    </div>
  );
}

function PresetCard({ p, onClick, onDelete }: { p: Preset; onClick: () => void; onDelete?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-panel p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-line-strong"
      style={{ background: `radial-gradient(120% 90% at 0% 0%, hsl(${p.hue} 70% 45% / .16), transparent 60%)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13.5px] font-semibold text-fg">{p.name}</div>
          <div className="mt-0.5 text-[11.5px] text-fg-3">{p.tagline}</div>
        </div>
        {onDelete && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 text-fg-4 opacity-0 transition-opacity group-hover:opacity-100 hover:text-err"
          >
            <Trash2 className="size-3.5" />
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {(
          [
            ['XP', p.rates.xp],
            ['Harvest', p.rates.harvest],
            ['Taming', p.rates.taming],
            ['Breeding', p.rates.breeding],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-md border border-white/6 bg-black/20 px-1.5 py-1 text-center">
            <div className="text-[12px] font-semibold text-fg tabular-nums">{fmtRate(v)}</div>
            <div className="text-[9.5px] tracking-wide text-fg-4 uppercase">{k}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {p.tags.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
    </button>
  );
}

function ApplyDialog({ preset, onClose, gus, game, editBoth }: { preset: Preset | null; onClose: () => void; gus: IniDoc; game: IniDoc; editBoth: EditBoth }) {
  const toast = useApp((s) => s.toast);
  const [mode, setMode] = useState<'merge' | 'reset'>('merge');
  useEffect(() => {
    if (preset) setMode(preset.resetFirst ? 'reset' : 'merge');
  }, [preset]);
  const rows = useMemo(() => (preset ? diffPreset(preset, mode === 'reset', gus, game) : []), [preset, mode, gus, game]);
  const changed = rows.filter((r) => r.changed).length;

  const apply = () => {
    if (!preset) return;
    editBoth((g, m) => applyPreset(preset, mode === 'reset', g, m));
    toast('success', `Applied “${preset.name}”`, 'Review any setting, then press Save to write the files.');
    onClose();
  };

  return (
    <Dialog
      open={!!preset}
      onClose={onClose}
      width={640}
      title={preset?.name}
      description={preset?.description}
      footer={
        <>
          <span className="mr-auto text-[12px] text-fg-3">
            {preset?.resetFirst && preset.changes.length === 0 ? 'Removes all gameplay overrides' : `${changed} of ${rows.length} settings change`}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Wand2 className="size-3.5" />} onClick={apply}>
            Apply preset
          </Button>
        </>
      }
    >
      {preset && !preset.resetFirst && (
        <div className="mb-4">
          <Label>How to apply</Label>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merge', label: 'On top of current settings' },
              { value: 'reset', label: 'Reset to official first' },
            ]}
          />
          <p className="mt-1.5 text-[11.5px] text-fg-4">
            {mode === 'merge'
              ? 'Only the settings below change; everything else you configured stays.'
              : 'All gameplay overrides are cleared first (passwords, ports and mod sections are kept), then the preset is applied.'}
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          {rows.map((r) => (
            <div key={r.file + r.key} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line/60 px-3 py-2 last:border-0', !r.changed && 'opacity-45')}>
              <div className="min-w-0">
                <div className="truncate text-[12.5px] text-fg">{r.label}</div>
                <div className="truncate font-mono text-[10.5px] text-fg-4">
                  {r.key} · {r.file === 'GUS' ? 'GameUserSettings' : 'Game.ini'}
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11.5px]">
                <span className="max-w-[140px] truncate text-fg-4">{r.from}</span>
                <ArrowRight className="size-3 text-fg-4" />
                <span className={cn('max-w-[140px] truncate', r.changed ? 'text-accent' : 'text-fg-3')}>{r.to}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function SaveDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string, description: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => {
    if (open) {
      setName('');
      setDesc('');
    }
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save current settings as a preset"
      description="Captures every gameplay setting currently in this server's files – rates, stat grids, levels and list editors. Profile values (passwords, ports) are not included."
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name.trim(), desc.trim())}>
            Save preset
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Our cluster rates" autoFocus />
        </div>
        <div>
          <Label hint="optional">Description</Label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-16" />
        </div>
      </div>
    </Dialog>
  );
}
