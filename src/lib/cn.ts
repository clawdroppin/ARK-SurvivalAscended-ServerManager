import clsx, { type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge about the project's custom color tokens so e.g. `text-fg` vs `text-fg-3` dedupe.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['bg', 'bg-raised', 'panel', 'panel-2', 'hover', 'line', 'line-strong', 'fg', 'fg-2', 'fg-3', 'fg-4', 'accent', 'accent-strong', 'accent-dim', 'ok', 'warn', 'err', 'info'],
    },
  },
});

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
