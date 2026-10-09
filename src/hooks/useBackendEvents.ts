import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useApp } from '@/store/app';
import type { LogBatch, ServerEvent, ServerStatus, TaskEvent, TelemetrySample } from '@/lib/types';

/**
 * Bridges Rust → UI events into the store. Log lines are coalesced per animation frame so a
 * burst of thousands of SteamCMD lines never causes more than one render per frame.
 */
export function useBackendEvents() {
  useEffect(() => {
    const s = useApp.getState();
    let pending: LogBatch[] = [];
    let raf = 0;
    const flush = () => {
      raf = 0;
      const batches = pending;
      pending = [];
      const merged = new Map<string, LogBatch>();
      for (const b of batches) {
        const k = `${b.id}\u0000${b.source}`;
        const m = merged.get(k);
        if (m) m.lines.push(...b.lines);
        else merged.set(k, { ...b, lines: [...b.lines] });
      }
      merged.forEach((b) => useApp.getState().pushLogs(b));
    };

    const subs = [
      listen<ServerStatus>('server-status', (e) => s.setStatus(e.payload)),
      listen<TelemetrySample>('telemetry', (e) => useApp.getState().pushTelemetry(e.payload)),
      listen<LogBatch>('log-lines', (e) => {
        pending.push(e.payload);
        if (!raf) raf = requestAnimationFrame(flush);
      }),
      listen<TaskEvent>('task', (e) => {
        const st = useApp.getState();
        st.upsertTask(e.payload);
        if (e.payload.done) {
          if (e.payload.error) st.toast('error', e.payload.title, e.payload.error);
          else if (e.payload.kind !== 'update-check') st.toast('success', e.payload.title, e.payload.message);
          setTimeout(() => useApp.getState().dismissTask(e.payload.taskId), e.payload.error ? 15000 : 6000);
        }
      }),
      listen<ServerEvent>('server-event', (e) => useApp.getState().toast(e.payload.level, e.payload.message)),
    ];
    return () => {
      subs.forEach((p) => p.then((un) => un()));
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
