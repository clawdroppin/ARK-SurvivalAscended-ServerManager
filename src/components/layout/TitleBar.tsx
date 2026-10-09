import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Command, Minus, Square, Copy, X } from 'lucide-react';
import { useApp } from '@/store/app';
import { Kbd } from '@/components/ui/Surface';

export function TitleBar() {
  const win = getCurrentWindow();
  const [max, setMax] = useState(false);
  const setOverlay = useApp((s) => s.setOverlay);
  const running = useApp((s) => Object.values(s.statuses).filter((x) => x.state === 'running').length);
  const total = useApp((s) => s.instances.length);
  const portable = useApp((s) => s.appInfo?.portable);

  useEffect(() => {
    win.isMaximized().then(setMax);
    const un = win.onResized(() => win.isMaximized().then(setMax));
    return () => {
      un.then((f) => f());
    };
  }, [win]);

  return (
    <div data-tauri-drag-region className="relative z-40 flex h-10 shrink-0 items-center border-b border-line bg-bg pl-3.5">
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <svg viewBox="0 0 1024 1024" className="size-[18px]" aria-hidden>
          <defs>
            <linearGradient id="tb-fg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5eead4" />
              <stop offset="1" stopColor="#10b981" />
            </linearGradient>
          </defs>
          <path d="M512 150 L800 800 H652 L600 680 H424 L372 800 H224 Z M512 400 L462 560 H562 Z" fill="url(#tb-fg)" />
        </svg>
        <span data-tauri-drag-region className="text-[12.5px] font-semibold tracking-tight text-fg">
          ASA Server Manager
        </span>
        <span data-tauri-drag-region className="text-[11px] text-fg-4">
          {running}/{total} online
        </span>
        {portable && (
          <span data-tauri-drag-region className="rounded border border-accent/25 bg-accent/10 px-1.5 text-[10px] font-semibold tracking-wide text-accent">
            PORTABLE
          </span>
        )}
      </div>

      <div data-tauri-drag-region className="flex flex-1 justify-center">
        <button
          onClick={() => setOverlay('palette')}
          className="flex h-6.5 w-[340px] items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-[12px] text-fg-4 transition-colors hover:border-line-strong hover:text-fg-3"
        >
          <Command className="size-3.5" />
          <span className="flex-1 text-left">Search servers, settings, actions…</span>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </button>
      </div>

      <div className="flex h-full">
        <button onClick={() => win.minimize()} className="flex h-full w-11 items-center justify-center text-fg-3 hover:bg-hover hover:text-fg" aria-label="Minimize">
          <Minus className="size-3.5" />
        </button>
        <button onClick={() => win.toggleMaximize()} className="flex h-full w-11 items-center justify-center text-fg-3 hover:bg-hover hover:text-fg" aria-label="Maximize">
          {max ? <Copy className="size-3 -scale-x-100" /> : <Square className="size-3" />}
        </button>
        <button onClick={() => win.close()} className="flex h-full w-11 items-center justify-center text-fg-3 hover:bg-[#e81123] hover:text-white" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
