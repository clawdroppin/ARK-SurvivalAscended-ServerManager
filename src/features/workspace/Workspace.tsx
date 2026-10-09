import { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import {
  Activity, AlertTriangle, Archive, Download, FileCode2, Loader2, Play, Puzzle, RotateCw, SlidersHorizontal, Square,
  Stethoscope, Terminal, Timer, Users, Wrench, Zap,
} from 'lucide-react';
import { useApp, useInstance, useStatus, type View } from '@/store/app';
import { useServerActions } from '@/hooks/useServerActions';
import { Button } from '@/components/ui/Button';
import { Badge, STATE_META, StatusDot } from '@/components/ui/Surface';
import { cn } from '@/lib/cn';
import { mapHue, mapName } from '@/data/maps';
import { norm, useDraftStore } from '@/features/settings/useConfigDraft';
import { Overview } from '@/features/overview/Overview';
import { SettingsEditor } from '@/features/settings/SettingsEditor';
import { LaunchOptions } from '@/features/launch/LaunchOptions';
import { ModManager } from '@/features/mods/ModManager';
import { Console } from '@/features/console/Console';
import { Players } from '@/features/players/Players';
import { Backups } from '@/features/backups/Backups';
import { Diagnostics } from '@/features/diagnostics/Diagnostics';
import { AutomationView } from '@/features/automation/Automation';
import { ServerMenu } from './ServerMenu';

const RawIniEditor = lazy(() => import('@/features/ini/RawIniEditor'));

const NAV: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'overview', label: 'Overview', icon: <Activity className="size-3.5" /> },
  { view: 'settings', label: 'Settings', icon: <SlidersHorizontal className="size-3.5" /> },
  { view: 'launch', label: 'Launch', icon: <Wrench className="size-3.5" /> },
  { view: 'ini', label: 'INI files', icon: <FileCode2 className="size-3.5" /> },
  { view: 'mods', label: 'Mods', icon: <Puzzle className="size-3.5" /> },
  { view: 'console', label: 'Console', icon: <Terminal className="size-3.5" /> },
  { view: 'players', label: 'Players', icon: <Users className="size-3.5" /> },
  { view: 'backups', label: 'Backups', icon: <Archive className="size-3.5" /> },
  { view: 'automation', label: 'Automation', icon: <Timer className="size-3.5" /> },
  { view: 'diagnostics', label: 'Fix issues', icon: <Stethoscope className="size-3.5" /> },
];

export function Workspace({ id }: { id: string }) {
  const inst = useInstance(id);
  const status = useStatus(id);
  const view = useApp((s) => s.views[id] ?? 'overview');
  const setView = useApp((s) => s.setView);
  const actions = useServerActions(id);
  const configDirty = useDraftStore((s) => {
    const d = s.drafts[id];
    return !!d && Object.keys(d.text).some((f) => norm(d.text[f as keyof typeof d.text]) !== norm(d.orig[f as keyof typeof d.orig]));
  });
  if (!inst) return null;
  const st = status?.state ?? 'stopped';
  const meta = STATE_META[st];
  const hue = mapHue(inst.map);
  const updateAvailable = status?.latestBuild && status?.installedBuild && status.latestBuild !== status.installedBuild;

  return (
    <div className="flex h-full flex-col">
      <header
        className="shrink-0 border-b border-line px-6 pt-4"
        style={{ background: `radial-gradient(60% 180% at 0% 0%, hsl(${hue} 70% 45% / .10), transparent 70%)` }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold"
            style={{ background: `hsl(${hue} 60% 50% / .14)`, color: `hsl(${hue} 70% 70%)`, boxShadow: `inset 0 0 0 1px hsl(${hue} 60% 50% / .3)` }}
          >
            {inst.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-fg">{inst.name}</h1>
              <Badge tone={meta.tone}>
                <StatusDot state={st} className="!size-1.5" />
                {meta.label}
              </Badge>
              {status?.crashLoop && (
                <Badge tone="err">
                  <AlertTriangle className="size-3" /> Crash loop
                </Badge>
              )}
              {status?.pendingConfig && <Badge tone="warn">Config changes apply on restart</Badge>}
              {updateAvailable && <Badge tone="info">Update available</Badge>}
            </div>
            <div className="mt-0.5 text-[12px] text-fg-3">
              {mapName(inst.map)} · port {inst.gamePort} · RCON {inst.rconPort}
              {inst.clusterId && ` · cluster ${inst.clusterId}`}
              {inst.mods.filter((m) => m.enabled).length > 0 && ` · ${inst.mods.filter((m) => m.enabled).length} mods`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {st === 'notInstalled' && (
              <Button variant="primary" icon={<Download className="size-4" />} loading={actions.busy === 'Install'} onClick={actions.install}>
                Install server
              </Button>
            )}
            {st === 'installing' && (
              <Button variant="secondary" disabled icon={<Loader2 className="size-4 animate-spin" />}>
                Installing…
              </Button>
            )}
            {(st === 'stopped' || st === 'crashed') && (
              <>
                {updateAvailable && (
                  <Button variant="outline" icon={<Zap className="size-3.5" />} loading={actions.busy === 'Install'} onClick={actions.install}>
                    Update
                  </Button>
                )}
                <Button variant="primary" icon={<Play className="size-4" />} loading={actions.busy === 'Start'} onClick={actions.start}>
                  Start
                </Button>
              </>
            )}
            {(st === 'running' || st === 'starting') && (
              <>
                <Button variant="outline" icon={<RotateCw className="size-3.5" />} loading={actions.busy === 'Restart'} onClick={() => actions.restart([], !!updateAvailable)}>
                  Restart
                </Button>
                <Button variant="secondary" icon={<Square className="size-3.5" />} loading={actions.busy === 'Stop'} onClick={() => actions.stop()}>
                  Stop
                </Button>
              </>
            )}
            {st === 'stopping' && (
              <Button variant="danger" onClick={() => actions.stop(true)}>
                Force kill
              </Button>
            )}
            <ServerMenu inst={inst} running={st === 'running' || st === 'starting' || st === 'stopping' || st === 'installing'} />
          </div>
        </div>

        <nav className="mt-3.5 -mb-px flex gap-0.5 overflow-x-auto">
          {NAV.map((n) => (
            <button
              key={n.view}
              onClick={() => setView(id, n.view)}
              className={cn(
                'relative flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors duration-150',
                view === n.view ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
                n.view === 'diagnostics' && status?.crashLoop && 'text-err',
              )}
            >
              {n.icon}
              {n.label}
              {configDirty && (n.view === 'settings' || n.view === 'ini') && <span className="size-1.5 rounded-full bg-warn" title="Unsaved changes" />}
              {view === n.view && <motion.span layoutId={`ws-nav-${id}`} className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 600, damping: 45 }} />}
            </button>
          ))}
        </nav>
      </header>

      <div className="relative min-h-0 flex-1">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-fg-3"><Loader2 className="size-4 animate-spin" /></div>}>
          {view === 'overview' && <Overview id={id} />}
          {view === 'settings' && <SettingsEditor id={id} />}
          {view === 'launch' && <LaunchOptions id={id} />}
          {view === 'ini' && <RawIniEditor id={id} />}
          {view === 'mods' && <ModManager id={id} />}
          {view === 'console' && <Console id={id} />}
          {view === 'players' && <Players id={id} />}
          {view === 'backups' && <Backups id={id} />}
          {view === 'automation' && <AutomationView id={id} />}
          {view === 'diagnostics' && <Diagnostics id={id} />}
        </Suspense>
      </div>
    </div>
  );
}
