import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { useApp } from '@/store/app';
import { api } from '@/lib/ipc';
import { cn } from '@/lib/cn';
import { Progress } from '@/components/ui/Surface';

const ICONS = {
  info: <Info className="size-4 text-info" />,
  success: <CheckCircle2 className="size-4 text-ok" />,
  warning: <AlertTriangle className="size-4 text-warn" />,
  error: <XCircle className="size-4 text-err" />,
};

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed top-12 right-4 z-[60] flex w-[360px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="glass pointer-events-auto flex gap-3 rounded-xl border border-line-strong px-3.5 py-3 shadow-pop"
          >
            <div className="mt-px">{ICONS[t.level]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-fg">{t.title}</div>
              {t.body && <div className="selectable mt-0.5 line-clamp-4 text-[12px] break-words text-fg-3">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="-mt-0.5 -mr-1 self-start rounded p-1 text-fg-4 hover:text-fg" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function TaskTray() {
  const tasks = useApp((s) => s.tasks);
  const dismiss = useApp((s) => s.dismissTask);
  const list = Object.values(tasks)
    .filter((t) => t.kind !== 'update-check' || t.error)
    .sort((a, b) => a.startedAt - b.startedAt);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[55] flex w-[380px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.taskId}
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18 }}
            className="glass pointer-events-auto rounded-xl border border-line-strong p-3 shadow-pop"
          >
            <div className="flex items-center gap-2.5">
              {t.done ? (t.error ? <XCircle className="size-4 text-err" /> : <CheckCircle2 className="size-4 text-ok" />) : <Loader2 className="size-4 animate-spin text-accent" />}
              <div className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{t.title}</div>
              {!t.done && t.kind === 'steamcmd' && (
                <button onClick={() => api.cancelTask(t.taskId)} className="rounded px-1.5 py-0.5 text-[11px] text-fg-3 hover:bg-hover hover:text-fg">
                  Cancel
                </button>
              )}
              {t.done && (
                <button onClick={() => dismiss(t.taskId)} className="rounded p-0.5 text-fg-4 hover:text-fg" aria-label="Dismiss">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className={cn('selectable mt-1.5 truncate pl-6.5 text-[11.5px]', t.error ? 'text-err' : 'text-fg-3')} title={t.message}>
              {t.message}
            </div>
            {!t.done && <Progress value={t.progress} className="mt-2 ml-6.5 w-[calc(100%-1.625rem)]" />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
