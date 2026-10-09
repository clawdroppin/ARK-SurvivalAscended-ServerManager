import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useApp } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import type { Prereq } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge, Dialog } from '@/components/ui/Surface';
import { cn } from '@/lib/cn';
import { SteamCmdLocation } from './SteamCmdLocation';
import { Fragment } from 'react';

export function PrereqDialog() {
  const open = useApp((s) => s.overlay === 'prereqs');
  const settings = useApp((s) => s.settings);
  const { setOverlay, saveSettings, toast } = useApp.getState();
  const [list, setList] = useState<Prereq[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const firstRun = !settings?.onboardingComplete;

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setList(await api.checkPrereqs());
    } catch (e) {
      toast('error', 'Prerequisite check failed', errMsg(e));
    } finally {
      setChecking(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) check();
  }, [open, check]);

  const fixable = (list ?? []).filter((p) => p.installable && (p.status === 'missing' || (p.status === 'warning' && p.id === 'vcredist') || (p.status === 'warning' && p.id === 'directx')));

  const installAll = async (ids = fixable.map((p) => p.id)) => {
    setInstalling(true);
    try {
      await api.installPrereqs(ids);
      await check();
    } catch (e) {
      toast('error', 'Installation failed', errMsg(e));
    } finally {
      setInstalling(false);
    }
  };

  const close = async () => {
    if (settings && firstRun) await saveSettings({ ...settings, onboardingComplete: true });
    setOverlay(null);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      width={640}
      title={firstRun ? 'Welcome to ASA Server Manager' : 'Prerequisites'}
      description={
        firstRun
          ? 'Let’s make sure this PC can run an ARK: Survival Ascended dedicated server. Anything missing can be installed in one click – you’ll see a single Windows admin prompt.'
          : 'Everything the dedicated server needs on Windows.'
      }
      footer={
        <>
          <Button variant="ghost" icon={<RefreshCw className={cn('size-3.5', checking && 'animate-spin')} />} onClick={check} disabled={checking || installing}>
            Re-check
          </Button>
          <span className="flex-1" />
          {fixable.length > 0 && (
            <Button variant="primary" icon={<Download className="size-4" />} loading={installing} onClick={() => installAll()}>
              Install {fixable.length} missing
            </Button>
          )}
          <Button variant={fixable.length ? 'secondary' : 'primary'} onClick={close}>
            {firstRun ? (fixable.length ? 'Skip for now' : 'Get started') : 'Done'}
          </Button>
        </>
      }
    >
      {!list ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-fg-3">
          <Loader2 className="size-4 animate-spin" /> Checking your system…
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((p, i) => (
            <Fragment key={p.id}>
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.15 }}
              className="flex items-center gap-3 rounded-xl border border-line bg-bg-raised px-3.5 py-3"
            >
              {p.status === 'ok' ? <CheckCircle2 className="size-5 shrink-0 text-ok" /> : p.status === 'warning' ? <AlertTriangle className="size-5 shrink-0 text-warn" /> : <XCircle className="size-5 shrink-0 text-err" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-fg">{p.name}</span>
                  {p.required ? <Badge>required</Badge> : <Badge>recommended</Badge>}
                </div>
                <div className="text-[11.5px] text-fg-4">{p.description}</div>
                <div className={cn('mt-0.5 text-[12px]', p.status === 'ok' ? 'text-fg-3' : p.status === 'warning' ? 'text-warn' : 'text-err')}>{p.detail}</div>
              </div>
              {p.installable && p.status !== 'ok' && (
                <Button size="sm" variant="outline" disabled={installing} onClick={() => installAll([p.id])}>
                  Install
                </Button>
              )}
            </motion.div>
            {p.id === 'steamcmd' && <SteamCmdLocation compact onChanged={check} />}
            </Fragment>
          ))}
          <p className="pt-2 text-[11.5px] leading-relaxed text-fg-4">
            Installers are downloaded from Microsoft, Amazon Trust Services and Valve directly. The certificates are what Epic Online Services uses – without them ASA servers often never appear in the server browser.
          </p>
        </div>
      )}
    </Dialog>
  );
}
