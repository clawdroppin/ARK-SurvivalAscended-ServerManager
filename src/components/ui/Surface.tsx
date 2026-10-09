import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ServerState } from '@/lib/types';

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-line bg-panel', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
      {icon && <div className="text-fg-3">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-fg">{title}</div>
        {subtitle && <div className="truncate text-[11.5px] text-fg-3">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-white/5 text-fg-2 border-white/8',
  accent: 'bg-accent/10 text-accent border-accent/20',
  ok: 'bg-ok/10 text-ok border-ok/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  err: 'bg-err/10 text-err border-err/20',
  info: 'bg-info/10 text-info border-info/20',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[10.5px] font-medium tracking-wide', tones[tone], className)}>
      {children}
    </span>
  );
}

export const STATE_META: Record<ServerState, { label: string; tone: Tone; dot: string; pulse?: boolean }> = {
  notInstalled: { label: 'Not installed', tone: 'neutral', dot: 'bg-fg-4' },
  stopped: { label: 'Stopped', tone: 'neutral', dot: 'bg-fg-3' },
  installing: { label: 'Installing', tone: 'info', dot: 'bg-info', pulse: true },
  starting: { label: 'Starting', tone: 'warn', dot: 'bg-warn', pulse: true },
  running: { label: 'Online', tone: 'ok', dot: 'bg-ok' },
  stopping: { label: 'Stopping', tone: 'warn', dot: 'bg-warn', pulse: true },
  crashed: { label: 'Crashed', tone: 'err', dot: 'bg-err' },
};

export function StatusDot({ state, className }: { state?: ServerState; className?: string }) {
  const m = STATE_META[state ?? 'stopped'];
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {state === 'running' && <span className="absolute inset-0 animate-ping rounded-full bg-ok/50 [animation-duration:2.4s]" />}
      <span className={cn('relative inline-flex size-2 rounded-full', m.dot, m.pulse && 'animate-pulse-soft')} />
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line-strong bg-panel-2 px-1 font-sans text-[10px] font-medium text-fg-3">
      {children}
    </kbd>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-panel-2 text-fg-3">{icon}</div>}
      <div>
        <div className="text-sm font-semibold text-fg">{title}</div>
        {body && <div className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-fg-3">{body}</div>}
      </div>
      {action}
    </div>
  );
}

export function Progress({ value, className, tone = 'accent' }: { value?: number | null; className?: string; tone?: 'accent' | 'err' }) {
  const indeterminate = value == null;
  return (
    <div className={cn('relative h-1 w-full overflow-hidden rounded-full bg-white/6', className)}>
      {indeterminate ? (
        <div className="shimmer-bar absolute inset-0" />
      ) : (
        <motion.div
          className={cn('absolute inset-y-0 left-0 rounded-full', tone === 'err' ? 'bg-err' : 'bg-gradient-to-r from-accent-strong to-accent')}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        />
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative flex items-center gap-1.5 rounded-md font-medium transition-colors duration-150',
            size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-3 text-[12px]',
            value === o.value ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-md bg-hover shadow-sm" transition={{ type: 'spring', stiffness: 600, damping: 40 }} />
          )}
          <span className="relative flex items-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            className="flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-pop"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="flex items-start gap-3 px-5 pt-5 pb-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-fg">{title}</div>
                {description && <div className="mt-1 text-[12.5px] leading-relaxed text-fg-3">{description}</div>}
              </div>
              <button onClick={onClose} className="-mt-1 -mr-1 rounded-md p-1.5 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-bg-raised/60 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">{children}</div>
      {actions}
    </div>
  );
}
