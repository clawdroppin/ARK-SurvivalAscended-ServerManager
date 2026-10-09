import { motion } from 'motion/react';
import { ArrowUpRight, Cpu, Download, MemoryStick, Play, Plus, Server, ShieldCheck, Square, Users } from 'lucide-react';
import { useApp } from '@/store/app';
import { Button } from '@/components/ui/Button';
import { Badge, Card, Empty, STATE_META, StatusDot } from '@/components/ui/Surface';
import { AreaChart } from '@/components/charts/AreaChart';
import { mapHue, mapName } from '@/data/maps';
import { bytes, duration } from '@/lib/format';
import { useServerActions } from '@/hooks/useServerActions';
import type { ServerInstance } from '@/lib/types';

export function Dashboard() {
  const instances = useApp((s) => s.instances);
  const statuses = useApp((s) => s.statuses);
  const telemetry = useApp((s) => s.telemetry);
  const setOverlay = useApp((s) => s.setOverlay);

  const online = instances.filter((i) => statuses[i.id]?.state === 'running');
  const players = online.reduce((a, i) => a + (statuses[i.id]?.players ?? 0), 0);
  // Only servers that are actually up contribute (stopped ones keep their last sample in memory).
  const latest = online.map((i) => telemetry[i.id]?.[telemetry[i.id].length - 1]).filter(Boolean);
  const cpu = latest.reduce((a, t) => a + t.cpu, 0);
  const mem = latest.reduce((a, t) => a + t.memBytes, 0);
  const sysTotal = latest[0]?.sysMemTotal;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-8 py-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-fg">Dashboard</h1>
            <p className="mt-1 text-[13px] text-fg-3">All your ARK: Survival Ascended servers at a glance.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" icon={<Download className="size-3.5" />} onClick={() => setOverlay('import')}>
              Import
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOverlay('newServer')}>
              New server
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-3">
          <Kpi icon={<Server className="size-4" />} label="Servers online" value={`${online.length}`} sub={`of ${instances.length}`} />
          <Kpi icon={<Users className="size-4" />} label="Players" value={`${players}`} sub="across all servers" />
          <Kpi icon={<Cpu className="size-4" />} label="Server CPU" value={`${cpu.toFixed(1)}%`} sub="of host capacity" />
          <Kpi icon={<MemoryStick className="size-4" />} label="Server RAM" value={bytes(mem)} sub={sysTotal ? `of ${bytes(sysTotal, 0)} host` : 'host memory'} />
        </div>

        {instances.length === 0 ? (
          <Card className="mt-6">
            <Empty
              icon={<Server className="size-5" />}
              title="No servers yet"
              body="Create a server and the manager will install SteamCMD, download ASA's dedicated server (AppID 2430930) and set everything up. Already have one? Import its folder."
              action={
                <div className="flex gap-2">
                  <Button variant="outline" icon={<ShieldCheck className="size-3.5" />} onClick={() => setOverlay('prereqs')}>
                    Check prerequisites
                  </Button>
                  <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOverlay('newServer')}>
                    Create server
                  </Button>
                </div>
              }
            />
          </Card>
        ) : (
          <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
            {instances.map((i, n) => (
              <motion.div key={i.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.03, duration: 0.18 }}>
                <ServerCard inst={i} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center gap-2 text-[11.5px] font-medium text-fg-3">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tracking-tight text-fg tabular-nums">{value}</span>
        <span className="text-[11.5px] text-fg-4">{sub}</span>
      </div>
    </Card>
  );
}

function ServerCard({ inst }: { inst: ServerInstance }) {
  const status = useApp((s) => s.statuses[inst.id]);
  const tel = useApp((s) => s.telemetry[inst.id]);
  const openTab = useApp((s) => s.openTab);
  const actions = useServerActions(inst.id);
  const st = status?.state ?? 'stopped';
  const meta = STATE_META[st];
  const hue = mapHue(inst.map);
  const last = tel?.[tel.length - 1];
  const live = st === 'running' || st === 'starting';

  return (
    <Card className="group overflow-hidden transition-colors hover:border-line-strong">
      <div
        className="relative h-[74px] px-4 pt-3.5"
        style={{ background: `radial-gradient(120% 140% at 0% 0%, hsl(${hue} 70% 45% / .22), transparent 60%), linear-gradient(180deg, hsl(${hue} 30% 20% / .25), transparent)` }}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-fg">{inst.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-fg-3">
              {mapName(inst.map)}
              {inst.clusterId && <span className="text-fg-4">· {inst.clusterId}</span>}
              <span className="text-fg-4">· :{inst.gamePort}</span>
            </div>
          </div>
          <Badge tone={meta.tone}>
            <StatusDot state={st} className="!size-1.5" />
            {meta.label}
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 px-4 pt-1">
        <Mini label="Players" value={live && status?.players != null ? `${status.players}/${inst.maxPlayers}` : '—'} />
        <Mini label="CPU" value={live && last ? `${last.cpu.toFixed(1)}%` : '—'} />
        <Mini label="RAM" value={live && last ? bytes(last.memBytes) : '—'} />
      </div>
      <div className="px-2 pt-1">
        <AreaChart data={live ? (tel ?? []).map((t) => t.cpu) : []} height={38} color={`hsl(${hue} 70% 60%)`} />
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        <span className="flex-1 text-[11.5px] text-fg-4">{live && last?.uptimeSecs ? `Up ${duration(last.uptimeSecs)}` : status?.installedBuild ? `Build ${status.installedBuild}` : ''}</span>
        {st === 'running' || st === 'starting' ? (
          <Button size="sm" variant="ghost" icon={<Square className="size-3" />} loading={actions.busy === 'Stop'} onClick={() => actions.stop()}>
            Stop
          </Button>
        ) : st === 'stopped' || st === 'crashed' ? (
          <Button size="sm" variant="ghost" icon={<Play className="size-3" />} loading={actions.busy === 'Start'} onClick={actions.start}>
            Start
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => openTab(inst.id)}>
          Open <ArrowUpRight className="size-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-medium tracking-wide text-fg-4 uppercase">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-fg tabular-nums">{value}</div>
    </div>
  );
}
