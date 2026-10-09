import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, Loader2, MinusCircle, Play, Stethoscope, Wand2, Wrench } from 'lucide-react';
import { useApp, useStatus } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import type { DiagEvent, DiagOptions, DiagStep } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Surface';
import { Switch } from '@/components/ui/Field';

const OPTION_META: { key: keyof DiagOptions; label: string; hint: string }[] = [
  { key: 'installPrereqs', label: 'Install missing prerequisites', hint: 'VC++ runtime, TLS certificates, DirectX, SteamCMD (one UAC prompt)' },
  { key: 'repairSaves', label: 'Verify & repair world saves', hint: 'SQLite integrity check, roll back to the newest healthy snapshot' },
  { key: 'checkMods', label: 'Analyse mods & crash logs', hint: 'Find mods named in crashes, removed or stale mods; disable suspects' },
  { key: 'cleanCache', label: 'Clear stale locks, temp files & caches', hint: 'Interrupted SteamCMD downloads, lock files, old crash dumps, save journals' },
  { key: 'checkNetwork', label: 'Check ports & conflicts', hint: `Game/query/RCON bindings, duplicate ports between servers` },
  { key: 'openFirewall', label: 'Open Windows Firewall ports', hint: 'Adds inbound UDP rules for the game and query ports (admin prompt)' },
  { key: 'validateFiles', label: 'Validate server files with SteamCMD', hint: 'Re-downloads missing or corrupt files – takes several minutes' },
];

const ICON: Record<DiagStep['status'], React.ReactNode> = {
  pending: <CircleDashed className="size-4 text-fg-4" />,
  running: <Loader2 className="size-4 animate-spin text-accent" />,
  ok: <CheckCircle2 className="size-4 text-ok" />,
  fixed: <Wand2 className="size-4 text-accent" />,
  warning: <AlertTriangle className="size-4 text-warn" />,
  error: <AlertCircle className="size-4 text-err" />,
  skipped: <MinusCircle className="size-4 text-fg-4" />,
};

export function Diagnostics({ id }: { id: string }) {
  const status = useStatus(id);
  const toast = useApp((s) => s.toast);
  const [opts, setOpts] = useState<DiagOptions>({
    applyFixes: true,
    validateFiles: false,
    repairSaves: true,
    checkMods: true,
    cleanCache: true,
    checkNetwork: true,
    openFirewall: false,
    installPrereqs: true,
  });
  const [steps, setSteps] = useState<DiagStep[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const runRef = useRef<string | null>(null);

  useEffect(() => {
    const un = listen<DiagEvent>('diagnostics', (e) => {
      if (e.payload.instanceId !== id) return;
      if (runRef.current && runRef.current !== e.payload.runId) {
        runRef.current = e.payload.runId;
        setSteps([e.payload.step]);
        return;
      }
      runRef.current = e.payload.runId;
      setSteps((prev) => {
        const i = prev.findIndex((s) => s.id === e.payload.step.id);
        if (i < 0) return [...prev, e.payload.step];
        const next = prev.slice();
        next[i] = e.payload.step;
        return next;
      });
    });
    return () => {
      un.then((f) => f());
    };
  }, [id]);

  const run = async () => {
    setSteps([]);
    setDone(false);
    setRunning(true);
    runRef.current = null;
    try {
      const final = await api.runDiagnostics(id, opts);
      setSteps(final);
      setDone(true);
      const errors = final.filter((s) => s.status === 'error').length;
      const fixed = final.reduce((a, s) => a + s.fixes.length, 0);
      toast(errors ? 'warning' : 'success', errors ? `${errors} problem${errors > 1 ? 's' : ''} need attention` : 'Diagnostics complete', fixed ? `${fixed} fix${fixed > 1 ? 'es' : ''} applied` : undefined);
    } catch (e) {
      toast('error', 'Diagnostics failed', errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  const summary = {
    errors: steps.filter((s) => s.status === 'error').length,
    warnings: steps.filter((s) => s.status === 'warning').length,
    fixes: steps.reduce((a, s) => a + s.fixes.length, 0),
  };
  const stopped = status?.state === 'stopped' || status?.state === 'crashed';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[380px_minmax(0,1fr)] gap-5 px-6 py-5">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="relative px-5 pt-6 pb-5" style={{ background: 'radial-gradient(120% 100% at 0% 0%, rgba(45,212,191,.16), transparent 60%)' }}>
              <div className="flex size-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                <Stethoscope className="size-5" />
              </div>
              <h2 className="mt-4 text-[17px] font-semibold tracking-tight text-fg">Fix server issues</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">
                One click runs a full health check and repairs what it safely can. Nothing is deleted outright – saves and configs are moved aside or backed up first.
              </p>
              {status?.crashLoop && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-[12px] text-err">
                  <AlertCircle className="size-4" /> Crash loop detected – recommended to run now
                </div>
              )}
              <Button variant="primary" size="lg" className="mt-5 w-full" icon={running ? undefined : <Wrench className="size-4" />} loading={running} onClick={run}>
                {running ? 'Working…' : opts.applyFixes ? 'Diagnose & fix' : 'Diagnose only'}
              </Button>
            </div>
            <div className="border-t border-line p-3">
              <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
                <div>
                  <div className="text-[12.5px] font-medium text-fg">Apply fixes automatically</div>
                  <div className="text-[11.5px] text-fg-4">Off = report only, change nothing</div>
                </div>
                <Switch checked={opts.applyFixes} onChange={(v) => setOpts({ ...opts, applyFixes: v })} />
              </label>
              {OPTION_META.map((o) => (
                <label key={o.key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.02]">
                  <div>
                    <div className="text-[12.5px] text-fg-2">{o.label}</div>
                    <div className="text-[11px] leading-snug text-fg-4">{o.hint}</div>
                  </div>
                  <Switch size="sm" checked={opts[o.key]} onChange={(v) => setOpts({ ...opts, [o.key]: v })} />
                </label>
              ))}
            </div>
          </Card>
        </div>

        <div>
          {steps.length === 0 && !running ? (
            <Card className="flex h-full min-h-[420px] items-center justify-center">
              <div className="max-w-sm text-center">
                <div className="text-[13.5px] font-medium text-fg">Ready when you are</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">
                  The pipeline checks the process, prerequisites, config files, ports & firewall, stale caches, world saves, mods and finally the server files. Results stream in live.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {done && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="flex items-center gap-4 px-4 py-3">
                    {summary.errors ? <AlertCircle className="size-5 text-err" /> : summary.warnings ? <AlertTriangle className="size-5 text-warn" /> : <CheckCircle2 className="size-5 text-ok" />}
                    <div className="flex-1 text-[13px] text-fg">
                      {summary.errors ? `${summary.errors} issue(s) still need attention` : summary.warnings ? 'Healthy, with some warnings' : 'Everything looks healthy'}
                      <span className="ml-2 text-fg-3">· {summary.fixes} fix{summary.fixes === 1 ? '' : 'es'} applied</span>
                    </div>
                    {stopped && (
                      <Button variant="primary" size="sm" icon={<Play className="size-3.5" />} onClick={() => api.startServer(id).catch((e) => toast('error', 'Start failed', errMsg(e)))}>
                        Start server
                      </Button>
                    )}
                  </Card>
                </motion.div>
              )}
              <AnimatePresence initial={false}>
                {steps.map((s, i) => (
                  <motion.div key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: i * 0.02 }}>
                    <Card className={cn('overflow-hidden', s.status === 'running' && 'border-accent/30')}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        {ICON[s.status]}
                        <div className="flex-1 text-[13px] font-medium text-fg">{s.title}</div>
                        <span className="text-[11px] tracking-wide text-fg-4 uppercase">{s.status}</span>
                      </div>
                      {(s.findings.length > 0 || s.fixes.length > 0) && (
                        <div className="selectable space-y-1 border-t border-line/70 px-4 py-2.5 pl-11">
                          {s.findings.map((f, j) => (
                            <div key={`f${j}`} className="text-[12px] leading-relaxed text-fg-3">
                              {f}
                            </div>
                          ))}
                          {s.fixes.map((f, j) => (
                            <div key={`x${j}`} className="flex items-start gap-1.5 text-[12px] leading-relaxed text-accent">
                              <Wand2 className="mt-0.5 size-3 shrink-0" /> {f}
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
