import { useEffect, useState } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';
import {
  Archive, Check, Copy, Cpu, Download, FolderOpen, Gauge, HardDrive, MemoryStick, Megaphone, Network, RefreshCw, Save, ShieldCheck, Users,
} from 'lucide-react';
import { useApp, useInstance, useStatus } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import { bytes, duration, rate, relTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, Empty } from '@/components/ui/Surface';
import { Input } from '@/components/ui/Field';
import { AreaChart } from '@/components/charts/AreaChart';
import { useServerActions } from '@/hooks/useServerActions';
import { mapName } from '@/data/maps';
import { cn } from '@/lib/cn';

const EMPTY: never[] = [];

export function Overview({ id }: { id: string }) {
  const inst = useInstance(id)!;
  const status = useStatus(id);
  const tel = useApp((s) => s.telemetry[id] ?? EMPTY);
  const toast = useApp((s) => s.toast);
  const actions = useServerActions(id);
  const [launch, setLaunch] = useState('');
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');
  const st = status?.state ?? 'stopped';
  const live = st === 'running' || st === 'starting';
  const last = live ? tel[tel.length - 1] : undefined;
  const series = live ? tel : EMPTY;

  useEffect(() => {
    api.launchLine(id).then(setLaunch).catch(() => {});
  }, [id, inst]);

  const rconCmd = async (cmd: string, ok: string) => {
    try {
      await api.rcon(id, cmd);
      toast('success', ok);
    } catch (e) {
      toast('error', 'RCON command failed', errMsg(e));
    }
  };

  if (st === 'notInstalled' || st === 'installing') {
    return (
      <div className="h-full overflow-y-auto p-6">
        <Card className="mx-auto max-w-2xl">
          <Empty
            icon={<Download className="size-5" />}
            title={st === 'installing' ? 'Installing server files…' : 'Server files not installed'}
            body={
              <>
                SteamCMD will download ARK: Survival Ascended Dedicated Server (AppID 2430930, ~12 GB) into
                <span className="selectable mt-1 block font-mono text-[11.5px] text-fg-2">{inst.installDir}</span>
              </>
            }
            action={
              st === 'notInstalled' ? (
                <div className="flex gap-2">
                  <Button variant="outline" icon={<ShieldCheck className="size-3.5" />} onClick={() => useApp.getState().setOverlay('prereqs')}>
                    Prerequisites
                  </Button>
                  <Button variant="primary" icon={<Download className="size-4" />} loading={actions.busy === 'Install'} onClick={actions.install}>
                    Install now
                  </Button>
                </div>
              ) : (
                <div className="text-[12px] text-fg-3">Progress is shown in the task tray. You can configure settings meanwhile.</div>
              )
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4 p-6">
        <div className="grid min-w-0 grid-cols-2 content-start gap-3">
          <Metric
            icon={<Cpu className="size-3.5" />}
            label="CPU"
            value={last ? `${last.cpu.toFixed(1)}%` : '—'}
            sub="of total host capacity"
            data={series.map((t) => t.cpu)}
            max={Math.max(10, ...series.map((t) => t.cpu))}
            color="#2dd4bf"
          />
          <Metric
            icon={<MemoryStick className="size-3.5" />}
            label="Memory"
            value={last ? bytes(last.memBytes) : '—'}
            sub={last ? `host ${bytes(last.sysMemUsed, 0)} / ${bytes(last.sysMemTotal, 0)}` : 'working set'}
            data={series.map((t) => t.memBytes / 1073741824)}
            color="#a78bfa"
          />
          <Metric
            icon={<Users className="size-3.5" />}
            label="Players"
            value={status?.players != null && live ? `${status.players} / ${inst.maxPlayers}` : '—'}
            sub={status?.rconOk ? 'via RCON ListPlayers' : live ? 'waiting for RCON…' : 'offline'}
            data={series.map((t) => t.players ?? 0)}
            max={Math.max(4, inst.maxPlayers / 4)}
            color="#34d399"
          />
          <Metric
            icon={<Gauge className="size-3.5" />}
            label="Server responsiveness"
            value={last?.rconLatencyMs != null ? `${last.rconLatencyMs} ms` : '—'}
            sub="RCON round-trip – spikes mean the game thread is stalling"
            data={series.filter((t) => t.rconLatencyMs != null).map((t) => t.rconLatencyMs!)}
            color="#fbbf24"
          />
          <Metric
            icon={<Network className="size-3.5" />}
            label="Network (host)"
            value={last ? `↓ ${rate(last.netRxBps)}` : '—'}
            sub={last ? `↑ ${rate(last.netTxBps)}` : 'all adapters'}
            data={series.map((t) => t.netRxBps + t.netTxBps)}
            color="#60a5fa"
          />
          <Metric
            icon={<HardDrive className="size-3.5" />}
            label="Disk I/O"
            value={last ? `R ${rate(last.diskReadBps)}` : '—'}
            sub={last ? `W ${rate(last.diskWriteBps)}` : 'server process'}
            data={series.map((t) => t.diskReadBps + t.diskWriteBps)}
            color="#f472b6"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <CardHeader title="Server" subtitle={mapName(inst.map)} />
            <div className="space-y-2.5 px-4 py-3 text-[12.5px]">
              <Row k="Uptime" v={last?.uptimeSecs != null ? duration(last.uptimeSecs) : '—'} />
              <Row k="PID" v={status?.pid ?? '—'} />
              <Row
                k="Build"
                v={
                  <span className="flex items-center gap-2">
                    {status?.installedBuild ?? '—'}
                    {status?.latestBuild && status.latestBuild !== status.installedBuild && <span className="text-info">→ {status.latestBuild}</span>}
                    <button onClick={actions.checkUpdate} className="rounded p-0.5 text-fg-4 hover:text-fg" title="Check for updates">
                      <RefreshCw className={cn('size-3', actions.busy === 'Update check' && 'animate-spin')} />
                    </button>
                  </span>
                }
              />
              <Row k="Ports" v={`game ${inst.gamePort}/udp · rcon ${inst.rconPort}/tcp`} />
              {status?.nextRestart && <Row k="Next restart" v={relTime(status.nextRestart)} />}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button size="sm" variant="outline" icon={<FolderOpen className="size-3.5" />} onClick={() => openPath(inst.installDir).catch(() => {})}>
                  Install
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<FolderOpen className="size-3.5" />}
                  onClick={() => openPath(`${inst.installDir}\\ShooterGame\\Saved`).catch((e) => toast('error', 'Folder not found', errMsg(e)))}
                >
                  Saved
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<FolderOpen className="size-3.5" />}
                  onClick={() => openPath(`${inst.installDir}\\ShooterGame\\Saved\\Config\\WindowsServer`).catch(() => toast('info', 'Config folder not created yet', 'It appears after the first install or save.'))}
                >
                  Config
                </Button>
                <Button size="sm" variant="outline" icon={<ShieldCheck className="size-3.5" />} loading={actions.busy === 'Validate'} onClick={actions.validate} disabled={live}>
                  Validate
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Quick actions" />
            <div className="space-y-2.5 p-4">
              <div className="flex gap-2">
                <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Broadcast to all players…" disabled={!status?.rconOk} onKeyDown={(e) => e.key === 'Enter' && msg && rconCmd(`ServerChat ${msg}`, 'Message sent').then(() => setMsg(''))} />
                <Button icon={<Megaphone className="size-3.5" />} disabled={!status?.rconOk || !msg} onClick={() => rconCmd(`ServerChat ${msg}`, 'Message sent').then(() => setMsg(''))}>
                  Send
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" icon={<Save className="size-3.5" />} disabled={!status?.rconOk} onClick={() => rconCmd('SaveWorld', 'World saved')}>
                  Save world
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Archive className="size-3.5" />}
                  onClick={() => api.createBackup(id, 'manual').then((b) => toast('success', 'Backup created', b.name)).catch((e) => toast('error', 'Backup failed', errMsg(e)))}
                >
                  Backup now
                </Button>
                <Button size="sm" variant="outline" disabled={!status?.rconOk} onClick={() => rconCmd('DestroyWildDinos', 'Wild creatures wiped – they respawn shortly')}>
                  Wipe wild dinos
                </Button>
                <Button size="sm" variant="outline" disabled={!status?.rconOk} onClick={() => rconCmd('ShowMessageOfTheDay', 'MOTD shown')}>
                  Show MOTD
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Launch command"
              actions={
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(launch);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }}
                  className="rounded p-1 text-fg-3 hover:bg-hover hover:text-fg"
                  title="Copy"
                >
                  {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
                </button>
              }
            />
            <div className="selectable max-h-40 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed break-all text-fg-3">{launch}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-fg-3">{k}</span>
      <span className="selectable truncate text-right text-fg tabular-nums">{v}</span>
    </div>
  );
}

function Metric({
  icon, label, value, sub, data, max, color,
}: {
  icon: React.ReactNode; label: string; value: string; sub: string; data: number[]; max?: number; color: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-3.5">
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg-3">
          {icon}
          {label}
        </div>
        <div className="mt-1.5 text-[20px] font-semibold tracking-tight text-fg tabular-nums">{value}</div>
        <div className="truncate text-[11px] text-fg-4">{sub}</div>
      </div>
      <div className="mt-2">
        <AreaChart data={data} max={max} color={color} height={64} />
      </div>
    </Card>
  );
}
