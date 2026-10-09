import { useEffect, useMemo } from 'react';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity, Archive, Download, FileCode2, Play, Plus, Puzzle, RotateCw, Search, Settings2, ShieldCheck, SlidersHorizontal,
  Square, Stethoscope, Terminal, Timer, Users, Wrench, FolderOpen,
} from 'lucide-react';
import { useApp, type View } from '@/store/app';
import { openPath } from '@tauri-apps/plugin-opener';
import { api, errMsg } from '@/lib/ipc';
import { SETTINGS } from '@/data/settings.generated';
import { useSettingsNav } from '@/features/settings/nav';

const VIEWS: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'overview', label: 'Overview', icon: <Activity className="size-4" /> },
  { view: 'settings', label: 'Game settings', icon: <SlidersHorizontal className="size-4" /> },
  { view: 'launch', label: 'Launch options', icon: <Wrench className="size-4" /> },
  { view: 'ini', label: 'Raw INI editor', icon: <FileCode2 className="size-4" /> },
  { view: 'mods', label: 'Mods', icon: <Puzzle className="size-4" /> },
  { view: 'console', label: 'Console & logs', icon: <Terminal className="size-4" /> },
  { view: 'players', label: 'Players', icon: <Users className="size-4" /> },
  { view: 'backups', label: 'Backups & saves', icon: <Archive className="size-4" /> },
  { view: 'automation', label: 'Automation', icon: <Timer className="size-4" /> },
  { view: 'diagnostics', label: 'Fix server issues', icon: <Stethoscope className="size-4" /> },
];

export function CommandPalette() {
  const open = useApp((s) => s.overlay === 'palette');
  const instances = useApp((s) => s.instances);
  const activeTab = useApp((s) => s.activeTab);
  const statuses = useApp((s) => s.statuses);
  const { setOverlay, openTab, toast } = useApp.getState();
  const active = instances.find((i) => i.id === activeTab);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOverlay(useApp.getState().overlay === 'palette' ? null : 'palette');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setOverlay]);

  const close = () => setOverlay(null);
  const act = (fn: () => unknown) => () => {
    close();
    fn();
  };
  const wrap = (p: Promise<unknown>, ok: string) => p.then(() => toast('success', ok)).catch((e) => toast('error', 'Action failed', errMsg(e)));

  const settingItems = useMemo(() => SETTINGS.map((s) => ({ key: s.key, label: s.label, cat: s.category })), []);
  const st = active ? statuses[active.id]?.state : undefined;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <Command
              loop
              className="w-[620px] overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-pop"
              onKeyDown={(e) => e.key === 'Escape' && close()}
            >
              <div className="flex items-center gap-2.5 border-b border-line px-4">
                <Search className="size-4 text-fg-3" />
                <Command.Input autoFocus placeholder="Type a command or search…" className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-4" />
              </div>
              <Command.List className="max-h-[420px] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-fg-4 [&_[cmdk-group-heading]]:uppercase">
                <Command.Empty className="py-10 text-center text-[13px] text-fg-3">No results.</Command.Empty>

                {active && (
                  <Command.Group heading={active.name}>
                    {(st === 'stopped' || st === 'crashed') && <Item icon={<Play className="size-4" />} onSelect={act(() => wrap(api.startServer(active.id), 'Starting server'))}>Start server</Item>}
                    {(st === 'running' || st === 'starting') && <Item icon={<Square className="size-4" />} onSelect={act(() => wrap(api.stopServer(active.id), 'Server stopped'))}>Stop server (save & exit)</Item>}
                    {st === 'running' && <Item icon={<RotateCw className="size-4" />} onSelect={act(() => wrap(api.restartServer(active.id, [], false), 'Server restarted'))}>Restart now</Item>}
                    <Item icon={<Archive className="size-4" />} onSelect={act(() => wrap(api.createBackup(active.id, 'manual'), 'Backup created'))}>Create backup</Item>
                    {VIEWS.map((v) => (
                      <Item key={v.view} icon={v.icon} onSelect={act(() => openTab(active.id, v.view))}>
                        Go to {v.label}
                      </Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group heading="Servers">
                  {instances.map((i) => (
                    <Item key={i.id} icon={<span className="size-4 text-center text-[10px] font-bold text-accent">{i.name.slice(0, 2).toUpperCase()}</span>} onSelect={act(() => openTab(i.id))}>
                      Open {i.name}
                    </Item>
                  ))}
                  <Item icon={<Plus className="size-4" />} onSelect={act(() => setOverlay('newServer'))}>New server…</Item>
                  <Item icon={<Download className="size-4" />} onSelect={act(() => setOverlay('import'))}>Import server…</Item>
                </Command.Group>

                <Command.Group heading="App">
                  <Item icon={<ShieldCheck className="size-4" />} onSelect={act(() => setOverlay('prereqs'))}>Check prerequisites</Item>
                  <Item icon={<Settings2 className="size-4" />} onSelect={act(() => setOverlay('appSettings'))}>App settings</Item>
                  <Item icon={<FolderOpen className="size-4" />} onSelect={act(() => { const d = useApp.getState().appInfo?.dataDir; if (d) openPath(d); })}>Open profile folder</Item>
                </Command.Group>

                {active && (
                  <Command.Group heading="Settings">
                    {settingItems.map((s) => (
                      <Item
                        key={s.key}
                        value={`setting ${s.label} ${s.key}`}
                        icon={<SlidersHorizontal className="size-4" />}
                        onSelect={act(() => {
                          openTab(active.id, 'settings');
                          useSettingsNav.getState().focus(s.key, s.cat);
                        })}
                      >
                        {s.label} <span className="ml-1 font-mono text-[11px] text-fg-4">{s.key}</span>
                      </Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Item({ children, icon, onSelect, value }: { children: React.ReactNode; icon: React.ReactNode; onSelect: () => void; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center gap-3 rounded-lg px-2.5 text-[13px] text-fg-2 data-[selected=true]:bg-hover data-[selected=true]:text-fg"
    >
      <span className="text-fg-3">{icon}</span>
      <span className="truncate">{children}</span>
    </Command.Item>
  );
}
