import { useEffect, useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowDownToLine, Check, CheckCheck, Download, ExternalLink, GripVertical, KeyRound, Loader2, Plus, Puzzle, RefreshCw, Search, Trash2,
} from 'lucide-react';
import { useApp, useInstance, useStatus } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import type { CfMod, ModEntry, ServerInstance } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge, Card, CardHeader, Empty, Segmented } from '@/components/ui/Surface';
import { Input, Select, Switch } from '@/components/ui/Field';
import { confirm } from '@/components/ui/Confirm';
import { compact, relTime } from '@/lib/format';

const hasUpdate = (m: ModEntry) => !!m.latestDate && !!m.knownDate && new Date(m.latestDate) > new Date(m.knownDate);

export function ModManager({ id }: { id: string }) {
  const inst = useInstance(id)!;
  const [tab, setTab] = useState<'installed' | 'browse'>(inst.mods.length ? 'installed' : 'browse');
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-2.5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'installed', label: `Installed (${inst.mods.length})`, icon: <Puzzle className="size-3.5" /> },
            { value: 'browse', label: 'Browse CurseForge', icon: <Search className="size-3.5" /> },
          ]}
        />
        <span className="text-[12px] text-fg-4">The server downloads and updates mods automatically from CurseForge on start.</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tab === 'installed' ? <Installed inst={inst} /> : <Browse inst={inst} />}</div>
    </div>
  );
}

function Installed({ inst }: { inst: ServerInstance }) {
  const saveInstance = useApp((s) => s.saveInstance);
  const upsert = useApp((s) => s.upsertInstance);
  const toast = useApp((s) => s.toast);
  const status = useStatus(inst.id);
  const [order, setOrder] = useState(inst.mods);
  const [addIds, setAddIds] = useState('');
  const [checking, setChecking] = useState(false);
  useEffect(() => setOrder(inst.mods), [inst.mods]);
  const running = status?.state === 'running' || status?.state === 'starting';

  const save = (mods: ModEntry[]) => saveInstance({ ...inst, mods });
  const patch = (mid: number, p: Partial<ModEntry>) => save(inst.mods.map((m) => (m.id === mid ? { ...m, ...p } : m)));

  const addByIds = async () => {
    const ids = [...new Set(addIds.split(/[\s,;]+/).map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0))].filter(
      (n) => !inst.mods.some((m) => m.id === n),
    );
    if (!ids.length) return;
    let found: CfMod[] = [];
    try {
      found = await api.cfGetMods(ids);
    } catch {
      /* no key – add with placeholder names */
    }
    const added: ModEntry[] = ids.map((mid) => {
      const f = found.find((x) => x.id === mid);
      return { id: mid, name: f?.name ?? `Mod ${mid}`, enabled: true, passive: false, logoUrl: f?.logoUrl, summary: f?.summary, websiteUrl: f?.websiteUrl, knownDate: f?.dateModified, latestDate: f?.dateModified };
    });
    await save([...inst.mods, ...added]);
    setAddIds('');
    toast('success', `Added ${added.length} mod${added.length > 1 ? 's' : ''}`);
  };

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const updated = await api.checkModUpdates(inst.id);
      upsert(updated);
      const n = updated.mods.filter(hasUpdate).length;
      toast(n ? 'info' : 'success', n ? `${n} mod update${n > 1 ? 's' : ''} available` : 'All mods are up to date', n ? 'Restart the server to download them.' : undefined);
    } catch (e) {
      toast('error', 'Update check failed', errMsg(e));
    } finally {
      setChecking(false);
    }
  };

  const updates = inst.mods.filter(hasUpdate).length;

  return (
    <div className="mx-auto max-w-[1080px] space-y-4 px-6 py-5">
      <Card>
        <div className="flex items-center gap-3 p-3">
          <Input value={addIds} onChange={(e) => setAddIds(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addByIds()} placeholder="Add by CurseForge project ID – e.g. 928548, 929420" mono />
          <Button icon={<Plus className="size-3.5" />} onClick={addByIds} disabled={!addIds.trim()}>
            Add
          </Button>
          <div className="h-5 w-px bg-line" />
          <Button variant="outline" icon={<RefreshCw className={checking ? 'size-3.5 animate-spin' : 'size-3.5'} />} onClick={checkUpdates} disabled={!inst.mods.length || checking}>
            Check updates
          </Button>
          {updates > 0 && (
            <Button variant="primary" icon={<CheckCheck className="size-3.5" />} onClick={() => save(inst.mods.map((m) => ({ ...m, knownDate: m.latestDate ?? m.knownDate })))}>
              Acknowledge {updates}
            </Button>
          )}
        </div>
      </Card>

      {order.length === 0 ? (
        <Card>
          <Empty icon={<Puzzle className="size-5" />} title="No mods" body="Browse CurseForge or paste project IDs above. Mods are passed to the server with -mods= and downloaded automatically on start." />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Load order" subtitle="Drag to reorder – top loads first. Passive mods load assets only (-passivemods)." />
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="p-1.5">
            {order.map((m, i) => (
              <ModRow
                key={m.id}
                m={m}
                index={i}
                running={running}
                onDragEnd={() => save(order)}
                onToggle={(enabled) => patch(m.id, { enabled })}
                onPassive={(passive) => patch(m.id, { passive })}
                onAck={() => patch(m.id, { knownDate: m.latestDate })}
                onPurge={async () => {
                  try {
                    const n = await api.purgeModFiles(inst.id, m.id);
                    toast('success', n ? 'Cached mod files removed' : 'No cached files found', 'They will be re-downloaded on next start.');
                  } catch (e) {
                    toast('error', 'Could not clear mod files', errMsg(e));
                  }
                }}
                onRemove={async () => {
                  const r = await confirm({ title: `Remove ${m.name}?`, body: 'Items and structures from this mod will disappear from the world on next start.', confirmLabel: 'Remove mod', danger: true });
                  if (r.ok) save(inst.mods.filter((x) => x.id !== m.id));
                }}
              />
            ))}
          </Reorder.Group>
        </Card>
      )}
    </div>
  );
}

function ModRow({
  m, index, running, onDragEnd, onToggle, onPassive, onAck, onPurge, onRemove,
}: {
  m: ModEntry; index: number; running: boolean; onDragEnd: () => void; onToggle: (b: boolean) => void; onPassive: (b: boolean) => void;
  onAck: () => void; onPurge: () => void; onRemove: () => void;
}) {
  const controls = useDragControls();
  const upd = hasUpdate(m);
  return (
    <Reorder.Item
      value={m}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="group flex items-center gap-3 rounded-lg bg-panel px-2 py-2 hover:bg-white/[0.025]"
      whileDrag={{ scale: 1.01, boxShadow: '0 10px 30px -10px rgba(0,0,0,.6)', zIndex: 5 }}
    >
      <button onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none p-1 text-fg-4 hover:text-fg-2 active:cursor-grabbing" aria-label="Drag to reorder">
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 text-right font-mono text-[11px] text-fg-4">{index + 1}</span>
      {m.logoUrl ? (
        <img src={m.logoUrl} className="size-9 rounded-md object-cover" alt="" draggable={false} />
      ) : (
        <div className="flex size-9 items-center justify-center rounded-md bg-panel-2 text-fg-4">
          <Puzzle className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={m.enabled ? 'truncate text-[13px] font-medium text-fg' : 'truncate text-[13px] font-medium text-fg-4 line-through'}>{m.name}</span>
          {upd && <Badge tone="info">Update {relTime(new Date(m.latestDate!).getTime())}</Badge>}
          {m.passive && <Badge>Passive</Badge>}
        </div>
        <div className="truncate font-mono text-[11px] text-fg-4">
          {m.id}
          {m.summary && <span className="ml-2 font-sans text-fg-3">{m.summary}</span>}
        </div>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-fg-3" title="Passive mods only load content (e.g. for cluster compatibility)">
        Passive <Switch size="sm" checked={m.passive} onChange={onPassive} />
      </label>
      <Switch checked={m.enabled} onChange={onToggle} />
      <div className="flex opacity-60 transition-opacity group-hover:opacity-100">
        {upd && (
          <button onClick={onAck} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg" title="Mark as updated">
            <Check className="size-3.5" />
          </button>
        )}
        <button onClick={onPurge} disabled={running} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg disabled:opacity-30" title="Delete cached files (force re-download)">
          <ArrowDownToLine className="size-3.5" />
        </button>
        <button onClick={() => openUrl(m.websiteUrl || `https://www.curseforge.com/ark-survival-ascended/search?search=${m.id}`)} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg" title="Open on CurseForge">
          <ExternalLink className="size-3.5" />
        </button>
        <button onClick={onRemove} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-err" title="Remove">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </Reorder.Item>
  );
}

const SORTS = [
  { value: '2', label: 'Popularity' },
  { value: '6', label: 'Total downloads' },
  { value: '3', label: 'Recently updated' },
  { value: '11', label: 'Newest' },
  { value: '4', label: 'Name' },
];

function Browse({ inst }: { inst: ServerInstance }) {
  const settings = useApp((s) => s.settings);
  const saveInstance = useApp((s) => s.saveInstance);
  const toast = useApp((s) => s.toast);
  const setOverlay = useApp((s) => s.setOverlay);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('2');
  const [results, setResults] = useState<CfMod[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasKey = !!settings?.curseforgeApiKey.trim();

  const run = async (append = false) => {
    if (!hasKey) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.cfSearch(q, Number(sort), append ? results.length : 0);
      setResults(append ? [...results, ...r.mods] : r.mods);
      setTotal(r.total);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => run(false), q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort, hasKey]);

  const add = (m: CfMod) => {
    saveInstance({
      ...inst,
      mods: [...inst.mods, { id: m.id, name: m.name, enabled: true, passive: false, logoUrl: m.logoUrl, summary: m.summary, websiteUrl: m.websiteUrl, knownDate: m.dateModified, latestDate: m.dateModified }],
    });
    toast('success', `Added ${m.name}`, 'It will download on next server start.');
  };

  if (!hasKey)
    return (
      <div className="mx-auto max-w-xl px-6 py-10">
        <Card>
          <Empty
            icon={<KeyRound className="size-5" />}
            title="Connect CurseForge"
            body="Browsing needs a free CurseForge API key (console.curseforge.com → API keys). You can always add mods by project ID without one."
            action={
              <div className="flex gap-2">
                <Button variant="outline" icon={<ExternalLink className="size-3.5" />} onClick={() => openUrl('https://console.curseforge.com/')}>
                  Get a key
                </Button>
                <Button variant="primary" onClick={() => setOverlay('appSettings')}>
                  Add API key
                </Button>
              </div>
            }
          />
        </Card>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-5">
      <div className="mb-4 flex gap-3">
        <Input icon={<Search className="size-3.5" />} placeholder="Search ARK: Survival Ascended mods" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <Select className="w-52" value={sort} onChange={setSort} options={SORTS} />
      </div>
      {error && <div className="mb-3 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-[12.5px] text-err">{error}</div>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {results.map((m) => {
          const added = inst.mods.some((x) => x.id === m.id);
          return (
            <Card key={m.id} className="flex flex-col p-3.5 transition-colors hover:border-line-strong">
              <div className="flex gap-3">
                {m.logoUrl ? <img src={m.logoUrl} className="size-12 shrink-0 rounded-lg object-cover" alt="" /> : <div className="size-12 shrink-0 rounded-lg bg-panel-2" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-fg">{m.name}</div>
                  <div className="truncate text-[11.5px] text-fg-3">by {m.authors.join(', ') || 'unknown'}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-4">
                    <span className="flex items-center gap-1">
                      <Download className="size-3" />
                      {compact(m.downloadCount)}
                    </span>
                    {m.dateModified && <span>updated {relTime(new Date(m.dateModified).getTime())}</span>}
                  </div>
                </div>
              </div>
              <p className="mt-2.5 line-clamp-2 flex-1 text-[12px] leading-relaxed text-fg-3">{m.summary}</p>
              <div className="mt-3 flex items-center gap-1.5">
                {m.categories.slice(0, 2).map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
                <span className="flex-1" />
                <button onClick={() => m.websiteUrl && openUrl(m.websiteUrl)} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg" title="Open page">
                  <ExternalLink className="size-3.5" />
                </button>
                <Button size="sm" variant={added ? 'ghost' : 'primary'} disabled={added} icon={added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} onClick={() => add(m)}>
                  {added ? 'Added' : 'Add'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      {loading && (
        <div className="flex justify-center py-8 text-fg-3">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {!loading && results.length < total && (
        <div className="flex justify-center py-6">
          <Button variant="outline" onClick={() => run(true)}>
            Load more ({total - results.length} left)
          </Button>
        </div>
      )}
    </div>
  );
}
