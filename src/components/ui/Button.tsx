import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-zinc-950 hover:bg-[#5eead4] shadow-[0_0_0_1px_rgba(45,212,191,.4),0_6px_20px_-6px_rgba(45,212,191,.55)] font-semibold',
  secondary: 'bg-panel-2 text-fg hover:bg-hover border border-line-strong',
  outline: 'border border-line-strong text-fg-2 hover:text-fg hover:bg-hover',
  ghost: 'text-fg-2 hover:text-fg hover:bg-hover',
  danger: 'bg-err/12 text-err border border-err/25 hover:bg-err/20',
};
const sizes: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-md',
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-lg',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  className,
  label,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-fg-3 transition-colors duration-150 hover:bg-hover hover:text-fg disabled:opacity-40',
        className,
      )}
      {...rest}
    />
  );
}
