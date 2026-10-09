import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Boxes, Download, FolderOpen, House, Plus, Settings2, ShieldCheck, Users } from 'lucide-react';
import { openPath } from '@tauri-apps/plugin-opener';
import { useApp } from '@/store/app';
import { cn } from '@/lib/cn';
import { StatusDot } from '@/components/ui/Surface';
import { mapHue, mapName } from '@/data/maps';
import type { ServerInstance } from '@/lib/types';

export function Sidebar() {
  const instances = useApp((s) => s.instances);
  const activeTab = useApp((s) => s.activeTab);
  const { goHome, setOverlay } = useApp.getState();

  const groups = useMemo(() => {
    const m = new Map<string, ServerInstance[]>();
    for (const i of [...instances].sort((a, b) => a.createdAt - b.createdAt)) {
      const k = i.clusterId?.trim() || '';
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [instances]);

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-line bg-bg">
      <div className="px-2.5 pt-3">
        <NavItem icon={<House className="size-4" />} label="Dashboard" active={activeTab === null} onClick={goHome} />
      </div>

      <div className="mt-4 flex items-center justify-between px-4">
        <span className="text-[10.5px] font-semibold tracking-[0.1em] text-fg-4 uppercase">Servers</span>
        <button onClick={() => setOverlay('newServer')} className="rounded p-0.5 text-fg-3 hover:bg-hover hover:text-fg" title="New server">
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {instances.length === 0 && (
          <button
            onClick={() => setOverlay('newServer')}
            className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-3 text-[12px] text-fg-3 transition-colors hover:border-accent/40 hover:text-fg"
          >
            <Plus className="size-3.5" /> Create your first server
          </button>
        )}
        {groups.map(([cluster, list]) => (
          <div key={cluster || '_'} className="mb-2">
            {cluster && (
              <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-medium text-fg-3">
                <Boxes className="size-3" /> {cluster}
              </div>
            )}
            {list.map((i) => (
              <ServerRow key={i.id} inst={i} active={activeTab === i.id} indent={!!cluster} />
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-line p-2.5">
        <NavItem icon={<Download className="size-4" />} label="Import server" onClick={() => setOverlay('import')} />
        <NavItem icon={<ShieldCheck className="size-4" />} label="Prerequisites" onClick={() => setOverlay('prereqs')} />
        <NavItem
          icon={<FolderOpen className="size-4" />}
          label="Profile folder"
          onClick={() => {
            const dir = useApp.getState().appInfo?.dataDir;
            if (dir) openPath(dir).catch((e) => useApp.getState().toast('error', 'Could not open folder', String(e)));
          }}
        />
        <NavItem icon={<Settings2 className="size-4" />} label="App settings" onClick={() => setOverlay('appSettings')} />
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors duration-150',
        active ? 'text-fg' : 'text-fg-3 hover:bg-hover/60 hover:text-fg-2',
      )}
    >
      {active && <motion.span layoutId="side-active" className="absolute inset-0 rounded-lg bg-hover" transition={{ type: 'spring', stiffness: 600, damping: 45 }} />}
      <span className="relative">{icon}</span>
      <span className="relative">{label}</span>
    </button>
  );
}

function ServerRow({ inst, active, indent }: { inst: ServerInstance; active: boolean; indent: boolean }) {
  const status = useApp((s) => s.statuses[inst.id]);
  const openTab = useApp((s) => s.openTab);
  const hue = mapHue(inst.map);
  return (
    <button
      onClick={() => openTab(inst.id)}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-lg py-1.5 pr-2 text-left transition-colors duration-150',
        indent ? 'pl-4' : 'pl-2',
        active ? '' : 'hover:bg-hover/60',
      )}
    >
      {active && <motion.span layoutId="side-active" className="absolute inset-0 rounded-lg bg-hover" transition={{ type: 'spring', stiffness: 600, damping: 45 }} />}
      <span
        className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
        style={{ background: `hsl(${hue} 60% 50% / .13)`, color: `hsl(${hue} 70% 68%)`, boxShadow: `inset 0 0 0 1px hsl(${hue} 60% 50% / .25)` }}
      >
        {inst.name.slice(0, 2).toUpperCase()}
        <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-bg p-[2px]">
          <StatusDot state={status?.state} />
        </span>
      </span>
      <span className="relative min-w-0 flex-1">
        <span className={cn('block truncate text-[12.5px] font-medium', active ? 'text-fg' : 'text-fg-2 group-hover:text-fg')}>{inst.name}</span>
        <span className="block truncate text-[11px] text-fg-4">{mapName(inst.map)}</span>
      </span>
      {status?.state === 'running' && status.players != null && (
        <span className="relative flex items-center gap-1 text-[11px] text-fg-3 tabular-nums">
          <Users className="size-3" />
          {status.players}
        </span>
      )}
    </button>
  );
}
