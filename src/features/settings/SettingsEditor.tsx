import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3, Boxes, Braces, Wand2, Loader2, Package, PawPrint, Search, Sparkles, Sprout, UserCog, X,
} from 'lucide-react';
import { SETTINGS, SETTING_CATEGORIES } from '@/data/settings.generated';
import type { SettingDef } from '@/data/types';
import { GAME, GUS } from '@/lib/ipc';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Card, Kbd } from '@/components/ui/Surface';
import { Switch } from '@/components/ui/Field';
import { useConfigDraft } from './useConfigDraft';
import { SettingRow, isModified } from './SettingRow';
import { ProfilePanel } from './ProfilePanel';
import { StatGrids } from './StatGrids';
import { LevelingPanel } from './LevelingPanel';
import { ListEditorsPanel } from './ListEditorsPanel';
import { CustomKeysPanel } from './CustomKeysPanel';
import { useSettingsNav } from './nav';
import { PresetsPanel } from './PresetsPanel';

type Special = 'presets' | 'profile' | 'stats' | 'leveling' | 'lists-creatures' | 'lists-items' | 'lists-engrams' | 'lists-spawns' | 'custom';

const SPECIAL: { id: Special; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'presets', label: 'Presets', icon: <Wand2 className="size-3.5" />, desc: 'Start from a popular server style, or from official defaults, then customise anything.' },
  { id: 'profile', label: 'Server profile', icon: <UserCog className="size-3.5" />, desc: 'Name, map, passwords, ports and cluster – synced into the INI on every start.' },
  { id: 'stats', label: 'Stat multipliers', icon: <BarChart3 className="size-3.5" />, desc: 'Per-stat level-up and base multipliers for players, wild and tamed creatures.' },
  { id: 'leveling', label: 'Levels & engram points', icon: <Sparkles className="size-3.5" />, desc: 'Custom max level, XP curve and engram points per level.' },
  { id: 'lists-creatures', label: 'Creature overrides', icon: <PawPrint className="size-3.5" />, desc: 'Per-class damage/resistance, spawn weights, replacements and taming bans.' },
  { id: 'lists-items', label: 'Stacks & harvest', icon: <Package className="size-3.5" />, desc: 'Per-item stack sizes and per-resource harvest multipliers.' },
  { id: 'lists-engrams', label: 'Engram overrides', icon: <Sprout className="size-3.5" />, desc: 'Auto-unlocks and per-engram cost / level / visibility.' },
  { id: 'lists-spawns', label: 'Spawns & loot', icon: <Boxes className="size-3.5" />, desc: 'Advanced spawn containers, supply crate loot and crafting costs.' },
  { id: 'custom', label: 'Custom & mod keys', icon: <Braces className="size-3.5" />, desc: 'Every other key in your files, including mod configuration sections.' },
];

const LIST_GROUP = {
  'lists-creatures': 'Creatures',
  'lists-items': 'Items & Resources',
  'lists-engrams': 'Engrams',
  'lists-spawns': 'Spawns & Loot (advanced)',
} as const;

export function SettingsEditor({ id }: { id: string }) {
  const cfg = useConfigDraft(id);
  const [cat, setCat] = useState<string>('rates');
  const [query, setQuery] = useState('');
  const [onlyModified, setOnlyModified] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nav = useSettingsNav();

  const raw = useCallback((d: SettingDef) => (d.file === 'GUS' ? cfg.gus : cfg.game).get(d.section, d.key), [cfg.gus, cfg.game]);
  const setVal = useCallback((d: SettingDef, v: string) => cfg.edit(d.file === 'GUS' ? GUS : GAME, (doc) => doc.set(d.section, d.key, v)), [cfg]);
  const reset = useCallback((d: SettingDef) => cfg.edit(d.file === 'GUS' ? GUS : GAME, (doc) => doc.remove(d.section, d.key)), [cfg]);

  // Jump-to-setting requests from the command palette.
  useEffect(() => {
    if (!nav.focusKey) return;
    setQuery('');
    setCat(nav.focusCategory ?? 'rates');
    setFlash(nav.focusKey);
    const t = setTimeout(() => document.getElementById(`setting-${nav.focusKey}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    const t2 = setTimeout(() => setFlash(null), 1800);
    // Consume the request so reopening the editor doesn't jump again.
    useSettingsNav.getState().clear();
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [nav.nonce, nav.focusKey, nav.focusCategory]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (cfg.dirtyFiles.length) cfg.save();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [cfg]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of SETTINGS) if (isModified(d, raw(d))) m[d.category] = (m[d.category] ?? 0) + 1;
    return m;
  }, [raw]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = q
      ? SETTINGS.filter((d) => d.label.toLowerCase().includes(q) || d.key.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q))
      : SETTINGS.filter((d) => d.category === cat);
    if (onlyModified) list = list.filter((d) => raw(d) !== undefined);
    if (!showAdvanced) list = list.filter((d) => !d.advanced);
    return list;
  }, [q, cat, onlyModified, showAdvanced, raw]);

  const special = SPECIAL.find((s) => s.id === cat);
  const catLabel = SETTING_CATEGORIES.find((c) => c.id === cat)?.label;

  if (!cfg.loaded)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-fg-3">
        <Loader2 className="size-4 animate-spin" /> Reading configuration…
      </div>
    );

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line">
        <div className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-4" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${SETTINGS.length} settings`}
              className="h-8 w-full rounded-lg border border-line-strong bg-bg-raised pr-7 pl-8 text-[12.5px] text-fg placeholder:text-fg-4 focus:border-accent/50 focus:outline-none"
            />
            {query ? (
              <button onClick={() => setQuery('')} className="absolute top-1/2 right-2 -translate-y-1/2 text-fg-4 hover:text-fg">
                <X className="size-3.5" />
              </button>
            ) : (
              <span className="absolute top-1/2 right-2 -translate-y-1/2">
                <Kbd>F</Kbd>
              </span>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {SPECIAL.slice(0, 4).map((s) => (
            <CatButton key={s.id} active={!q && cat === s.id} onClick={() => { setCat(s.id); setQuery(''); }} icon={s.icon} label={s.label} />
          ))}
          <div className="mt-3 mb-1 px-2.5 text-[10.5px] font-semibold tracking-[0.1em] text-fg-4 uppercase">Gameplay</div>
          {SETTING_CATEGORIES.map((c) => (
            <CatButton key={c.id} active={!q && cat === c.id} onClick={() => { setCat(c.id); setQuery(''); }} label={c.label} count={counts[c.id]} />
          ))}
          <div className="mt-3 mb-1 px-2.5 text-[10.5px] font-semibold tracking-[0.1em] text-fg-4 uppercase">Advanced</div>
          {SPECIAL.slice(4).map((s) => (
            <CatButton key={s.id} active={!q && cat === s.id} onClick={() => { setCat(s.id); setQuery(''); }} icon={s.icon} label={s.label} />
          ))}
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1080px] px-6 pt-5 pb-28">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight text-fg">
                  {q ? `Results for “${query}”` : special?.label ?? catLabel}
                </h2>
                <p className="mt-0.5 text-[12.5px] text-fg-3">
                  {q ? `${visible.length} matching settings` : special?.desc ?? `${visible.length} settings · drag sliders or type exact values · the marker shows the official default`}
                </p>
              </div>
              {(!special || q) && (
                <div className="flex items-center gap-4 text-[12px] text-fg-3">
                  <label className="flex items-center gap-2">
                    <Switch size="sm" checked={onlyModified} onChange={setOnlyModified} /> Set in file only
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch size="sm" checked={showAdvanced} onChange={setShowAdvanced} /> Advanced
                  </label>
                </div>
              )}
            </div>

            {special && !q ? (
              <>
                {cat === 'presets' && <PresetsPanel gus={cfg.gus} game={cfg.game} editBoth={cfg.editBoth} />}
                {cat === 'profile' && <ProfilePanel id={id} />}
                {cat === 'stats' && <StatGrids game={cfg.game} edit={cfg.edit} />}
                {cat === 'leveling' && <LevelingPanel game={cfg.game} edit={cfg.edit} />}
                {cat in LIST_GROUP && <ListEditorsPanel group={LIST_GROUP[cat as keyof typeof LIST_GROUP]} game={cfg.game} edit={cfg.edit} />}
                {cat === 'custom' && <CustomKeysPanel gus={cfg.gus} game={cfg.game} edit={cfg.edit} />}
              </>
            ) : visible.length === 0 ? (
              <div className="py-16 text-center text-[13px] text-fg-3">Nothing here{onlyModified ? ' is set in your files yet' : ''}.</div>
            ) : (
              <Card className="divide-y divide-line/70 p-1">
                {visible.map((d) => (
                  <SettingRow key={`${d.file}:${d.key}`} def={d} raw={raw(d)} onSet={(v) => setVal(d, v)} onReset={() => reset(d)} highlight={flash === d.key} />
                ))}
              </Card>
            )}
          </div>
        </div>
        <SaveBar
          dirty={cfg.dirtyFiles}
          saving={cfg.saving}
          onSave={cfg.save}
          onDiscard={cfg.discard}
        />
      </div>
    </div>
  );
}

function CatButton({ active, onClick, label, count, icon }: { active: boolean; onClick: () => void; label: string; count?: number; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12.5px] transition-colors duration-150',
        active ? 'text-fg' : 'text-fg-3 hover:bg-hover/50 hover:text-fg-2',
      )}
    >
      {active && <motion.span layoutId="settings-cat" className="absolute inset-0 rounded-lg bg-hover" transition={{ type: 'spring', stiffness: 600, damping: 45 }} />}
      {icon && <span className="relative text-fg-3">{icon}</span>}
      <span className="relative flex-1 truncate">{label}</span>
      {!!count && <span className="relative rounded bg-accent/15 px-1.5 text-[10.5px] font-semibold text-accent tabular-nums">{count}</span>}
    </button>
  );
}

export function SaveBar({ dirty, saving, onSave, onDiscard }: { dirty: string[]; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  return (
    <AnimatePresence>
      {dirty.length > 0 && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          className="glass absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-line-strong py-2 pr-2 pl-4 shadow-pop"
        >
          <span className="size-2 rounded-full bg-warn" />
          <span className="text-[12.5px] text-fg-2">
            Unsaved changes in <span className="font-medium text-fg">{dirty.join(' & ')}</span>
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={onDiscard}>
              Discard
            </Button>
            <Button size="sm" variant="primary" loading={saving} onClick={onSave}>
              Save <Kbd>Ctrl S</Kbd>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
