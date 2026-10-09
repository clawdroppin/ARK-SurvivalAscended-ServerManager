import { forwardRef, useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

export const inputBase =
  'w-full rounded-lg border border-line-strong bg-bg-raised px-2.5 text-[13px] text-fg placeholder:text-fg-4 transition-[border,box-shadow] duration-150 hover:border-[#3a3a44] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; mono?: boolean }>(
  function Input({ className, icon, mono, ...rest }, ref) {
    return (
      <div className="relative w-full">
        {icon && <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3">{icon}</span>}
        <input ref={ref} className={cn(inputBase, 'h-8', icon && 'pl-8', mono && 'font-mono text-[12px]', className)} spellCheck={false} {...rest} />
      </div>
    );
  },
);

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative w-full">
      <input {...props} type={show ? 'text' : 'password'} className={cn(inputBase, 'h-8 pr-9 font-mono text-[12px]', props.className)} spellCheck={false} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg"
        aria-label={show ? 'Hide' : 'Show'}
      >
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(inputBase, 'min-h-20 py-2 leading-relaxed', className)} spellCheck={false} {...rest} />;
});

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputBase, 'h-8 appearance-none pr-8')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-panel">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const w = size === 'sm' ? 28 : 34;
  const h = size === 'sm' ? 16 : 20;
  const k = h - 6;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ width: w, height: h }}
      className={cn(
        'relative shrink-0 rounded-full border transition-colors duration-150 disabled:opacity-40',
        checked ? 'border-accent/50 bg-accent/90' : 'border-line-strong bg-[#26262d]',
      )}
    >
      <motion.span
        className={cn('absolute top-[2px] left-[2px] rounded-full shadow', checked ? 'bg-zinc-950' : 'bg-fg-2')}
        style={{ width: k, height: k }}
        animate={{ x: checked ? w - k - 6 : 0 }}
        transition={{ type: 'spring', stiffness: 700, damping: 40 }}
      />
    </button>
  );
}

/** Numeric input that commits on blur/Enter and accepts any value (even outside the slider range). */
export function NumberInput({
  value,
  onCommit,
  step = 1,
  integer,
  className,
  placeholder,
}: {
  value: number | undefined;
  onCommit: (v: number) => void;
  step?: number;
  integer?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string>(value === undefined ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value === undefined ? '' : String(value));
  }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(value === undefined ? '' : String(value));
      return;
    }
    onCommit(integer ? Math.round(n) : n);
  };
  return (
    <input
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const mult = e.shiftKey ? 10 : 1;
          const n = (Number(draft) || 0) + (e.key === 'ArrowUp' ? step : -step) * mult;
          const v = integer ? Math.round(n) : Number(n.toFixed(6));
          setDraft(String(v));
          onCommit(v);
        }
      }}
      className={cn(inputBase, 'h-7 w-[84px] px-2 text-right font-mono text-[12px] tabular-nums', className)}
    />
  );
}

/**
 * Slider with optional logarithmic mapping so multipliers like 0.1×–100× are equally reachable.
 * `def` marks the official default on the track.
 */
export function Slider({
  value,
  min,
  max,
  step,
  scale = 'linear',
  def,
  onChange,
  onCommit,
  inverted,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  scale?: 'linear' | 'log';
  def?: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  inverted?: boolean;
}) {
  const RES = 1000;
  const useLog = scale === 'log' && max > 0;
  const lo = useLog ? Math.max(min, step > 0 ? step : 0.01, max / 10000) : min;
  const toPos = useMemo(
    () => (v: number) => {
      const c = Math.min(Math.max(v, min), max);
      if (!useLog) return ((c - min) / (max - min || 1)) * RES;
      if (c <= lo) return 0;
      return (Math.log(c / lo) / Math.log(max / lo)) * RES;
    },
    [min, max, lo, useLog],
  );
  const fromPos = (p: number) => {
    let v = useLog ? (p <= 0 ? min : lo * Math.pow(max / lo, p / RES)) : min + (p / RES) * (max - min);
    if (step > 0) {
      // Snap to a precision relative to magnitude so log sliders stay smooth.
      const s = useLog ? Math.max(step, Math.pow(10, Math.floor(Math.log10(Math.max(Math.abs(v), 1e-9))) - 1)) : step;
      v = Math.round(v / s) * s;
    }
    return Number(Math.min(Math.max(v, min), max).toFixed(6));
  };
  const pos = toPos(value);
  const pct = (pos / RES) * 100;
  const defPct = def !== undefined ? (toPos(def) / RES) * 100 : undefined;
  return (
    <div className="relative flex h-[22px] w-full items-center">
      <div className="absolute inset-x-0 h-1 rounded-full bg-[#26262d]" />
      <div
        className={cn('absolute h-1 rounded-full', inverted ? 'bg-gradient-to-r from-sky-400/80 to-accent' : 'bg-gradient-to-r from-accent-strong to-accent')}
        style={{ width: `${pct}%` }}
      />
      {defPct !== undefined && (
        <div className="absolute h-2.5 w-0.5 rounded bg-fg-3/70" style={{ left: `calc(${defPct}% - 1px)` }} title={`Official: ${def}`} />
      )}
      <input
        type="range"
        className="range relative"
        min={0}
        max={RES}
        step={1}
        value={pos}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  );
}

export function Label({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-1.5 flex items-baseline justify-between gap-2', className)}>
      <span className="text-[12px] font-medium text-fg-2">{children}</span>
      {hint && <span className="text-[11px] text-fg-4">{hint}</span>}
    </div>
  );
}
