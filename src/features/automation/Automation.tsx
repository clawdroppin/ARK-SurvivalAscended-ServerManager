import { useState } from 'react';
import { Archive, BellRing, Clock, Plus, Power, RefreshCcw, ShieldPlus, X } from 'lucide-react';
import { useApp, useInstance, useStatus } from '@/store/app';
import type { Automation } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/Surface';
import { Label, NumberInput, Slider, Switch } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { relTime } from '@/lib/format';

export function AutomationView({ id }: { id: string }) {
  const inst = useInstance(id)!;
  const status = useStatus(id);
  const saveInstance = useApp((s) => s.saveInstance);
  const a = inst.automation;
  const set = (p: Partial<Automation>) => saveInstance({ ...inst, automation: { ...a, ...p } });
  const [time, setTime] = useState('04:00');
  const [warn, setWarn] = useState('');

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1080px] grid-cols-2 gap-4 px-6 py-5">
        <Card>
          <CardHeader title="Crash recovery" icon={<ShieldPlus className="size-4" />} />
          <div className="space-y-4 p-4">
            <Row label="Restart automatically after a crash" hint="Waits 10 seconds, then relaunches">
              <Switch checked={a.autoRestartOnCrash} onChange={(v) => set({ autoRestartOnCrash: v })} />
            </Row>
            <div>
              <Label hint="within 15 minutes, then pause & flag a crash loop">Max automatic restarts</Label>
              <Num value={a.maxCrashRestarts} min={1} max={10} onCommit={(v) => set({ maxCrashRestarts: v })} />
            </div>
            <Row label="Start with the app" hint="Launch this server when ASA Server Manager opens">
              <Switch checked={a.autoStartWithApp} onChange={(v) => set({ autoStartWithApp: v })} />
            </Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Automatic backups" icon={<Archive className="size-4" />} />
          <div className="space-y-4 p-4">
            <div>
              <Label hint={a.autoBackupMinutes ? `every ${a.autoBackupMinutes} min while running` : 'disabled'}>Interval (minutes)</Label>
              <Num value={a.autoBackupMinutes} min={0} max={720} onCommit={(v) => set({ autoBackupMinutes: v })} />
            </div>
            <div>
              <Label hint="manual backups are never pruned">Keep newest</Label>
              <Num value={a.backupRetention} min={1} max={200} onCommit={(v) => set({ backupRetention: v })} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Scheduled restarts" subtitle={status?.nextRestart ? `Next ${relTime(status.nextRestart)}` : 'Daily, local time'} icon={<Clock className="size-4" />} />
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-1.5">
              {a.restartTimes.length === 0 && <span className="text-[12px] text-fg-4">No scheduled restarts</span>}
              {a.restartTimes.map((t) => (
                <span key={t} className="flex h-7 items-center gap-1 rounded-md border border-line-strong bg-bg-raised pr-1 pl-2.5 font-mono text-[12px] text-fg">
                  {t}
                  <button onClick={() => set({ restartTimes: a.restartTimes.filter((x) => x !== t) })} className="rounded p-0.5 text-fg-4 hover:text-err">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-8 rounded-lg border border-line-strong bg-bg-raised px-2.5 font-mono text-[12.5px] text-fg [color-scheme:dark] focus:border-accent/60 focus:outline-none"
              />
              <Button icon={<Plus className="size-3.5" />} onClick={() => time && !a.restartTimes.includes(time) && set({ restartTimes: [...a.restartTimes, time].sort() })}>
                Add time
              </Button>
            </div>
            <Row label="Update before restarting" hint="Applies a pending SteamCMD update during scheduled restarts">
              <Switch checked={a.updateOnRestart} onChange={(v) => set({ updateOnRestart: v })} />
            </Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Restart warnings" subtitle="Broadcast in chat before scheduled restarts" icon={<BellRing className="size-4" />} />
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-1.5">
              {[...a.restartWarnings].sort((x, y) => y - x).map((w) => (
                <span key={w} className="flex h-7 items-center gap-1 rounded-md border border-line-strong bg-bg-raised pr-1 pl-2.5 text-[12px] text-fg">
                  {w} min
                  <button onClick={() => set({ restartWarnings: a.restartWarnings.filter((x) => x !== w) })} className="rounded p-0.5 text-fg-4 hover:text-err">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={warn}
                onChange={(e) => setWarn(e.target.value.replace(/\D/g, ''))}
                placeholder="Minutes"
                className="h-8 w-28 rounded-lg border border-line-strong bg-bg-raised px-2.5 text-[12.5px] text-fg focus:border-accent/60 focus:outline-none"
              />
              <Button
                icon={<Plus className="size-3.5" />}
                onClick={() => {
                  const n = Number(warn);
                  if (n > 0 && !a.restartWarnings.includes(n)) set({ restartWarnings: [...a.restartWarnings, n] });
                  setWarn('');
                }}
              >
                Add warning
              </Button>
            </div>
          </div>
        </Card>

        <Card className="col-span-2">
          <CardHeader title="Update checks" icon={<RefreshCcw className="size-4" />} />
          <div className="grid grid-cols-2 gap-6 p-4">
            <div>
              <Label hint={a.checkUpdatesMinutes ? `every ${a.checkUpdatesMinutes} min` : 'disabled'}>Check Steam for new server builds</Label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <LiveSlider value={a.checkUpdatesMinutes} onCommit={(v) => set({ checkUpdatesMinutes: v })} />
                </div>
                <Num value={a.checkUpdatesMinutes} min={0} max={1440} onCommit={(v) => set({ checkUpdatesMinutes: v })} />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-line bg-bg-raised px-3 text-[12px] text-fg-3">
              <Power className="size-4 text-fg-4" />
              Installed build {status?.installedBuild ?? '—'}
              {status?.latestBuild && ` · latest ${status.latestBuild}`}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[12.5px] font-medium text-fg">{label}</div>
        <div className="text-[11.5px] text-fg-4">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function Num({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (v: number) => void }) {
  return <NumberInput value={value} integer onCommit={(v) => onCommit(Math.min(max, Math.max(min, v)))} className="w-28 text-left" />;
}

function LiveSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [live, setLive] = useState<number | null>(null);
  return (
    <Slider
      value={live ?? value}
      min={0}
      max={240}
      step={5}
      def={30}
      onChange={setLive}
      onCommit={() => {
        if (live !== null && live !== value) onCommit(live);
        setLive(null);
      }}
    />
  );
}
