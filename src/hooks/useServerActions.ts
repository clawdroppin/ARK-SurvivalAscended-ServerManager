import { useCallback, useState } from 'react';
import { api, errMsg } from '@/lib/ipc';
import { useApp } from '@/store/app';
import { confirm } from '@/components/ui/Confirm';

/** Lifecycle actions with consistent toasts / confirmation, plus a per-action busy flag. */
export function useServerActions(id: string) {
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useApp((s) => s.toast);
  const run = useCallback(
    async (name: string, fn: () => Promise<unknown>, okMsg?: string) => {
      setBusy(name);
      try {
        await fn();
        if (okMsg) toast('success', okMsg);
      } catch (e) {
        toast('error', `${name} failed`, errMsg(e));
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  return {
    busy,
    start: () => run('Start', () => api.startServer(id)),
    stop: async (force = false) => {
      if (force) {
        const r = await confirm({
          title: 'Force-kill the server?',
          body: 'The process is terminated immediately without saving. Anything since the last autosave is lost.',
          confirmLabel: 'Kill process',
          danger: true,
        });
        if (!r.ok) return;
      }
      return run(force ? 'Kill' : 'Stop', () => api.stopServer(id, force), force ? 'Server killed' : 'Server stopped');
    },
    restart: (warn: number[] = [], update = false) => run('Restart', () => api.restartServer(id, warn, update), 'Server restarted'),
    install: () => run('Install', () => api.installServer(id, false)),
    validate: () => run('Validate', () => api.installServer(id, true)),
    checkUpdate: () =>
      run('Update check', async () => {
        const has = await api.checkServerUpdate(id);
        toast(has ? 'info' : 'success', has ? 'Server update available' : 'Server is up to date');
      }),
  };
}
