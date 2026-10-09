import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronRight, Eraser, Pause, Play, Search, SendHorizontal } from 'lucide-react';
import { useApp, useStatus } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import { cn } from '@/lib/cn';
import { clock } from '@/lib/format';
import type { LogEntry } from '@/store/app';

const SOURCES: { id: string; label: string; color: string }[] = [
  { id: 'server', label: 'Server log', color: 'text-fg-3' },
  { id: 'rcon', label: 'RCON', color: 'text-accent' },
  { id: 'chat', label: 'Chat', color: 'text-sky-300' },
  { id: 'manager', label: 'Manager', color: 'text-violet-300' },
  { id: 'steamcmd', label: 'SteamCMD', color: 'text-amber-300' },
];

const QUICK = [
  'ListPlayers', 'SaveWorld', 'GetChat', 'GetGameLog', 'ShowMessageOfTheDay', 'DestroyWildDinos', 'SetTimeOfDay 12:00', 'Broadcast ', 'ServerChat ',
];

const EMPTY: LogEntry[] = [];

function lineTone(e: LogEntry) {
  if (e.source === 'rcon-cmd') return 'text-accent';
  const l = e.line;
  if (/error|fatal|exception|failed/i.test(l)) return 'text-err';
  if (/warning|warn:/i.test(l)) return 'text-warn';
  return SOURCES.find((s) => s.id === e.source)?.color ?? 'text-fg-2';
}

export function Console({ id }: { id: string }) {
  const logs = useApp((s) => s.logs[id] ?? EMPTY);
  const pushLogs = useApp((s) => s.pushLogs);
  const clearLogs = useApp((s) => s.clearLogs);
  const status = useStatus(id);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(SOURCES.map((s) => s.id)));
  const [filter, setFilter] = useState('');
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rcon-history') ?? '[]');
    } catch {
      return [];
    }
  });
  const [hIdx, setHIdx] = useState(-1);
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const frozen = useRef<LogEntry[] | null>(null);

  // Seed the view with the tail of ShooterGame.log the first time it's opened.
  useEffect(() => {
    if (!useApp.getState().logs[id]?.some((l) => l.source === 'server')) {
      api.logTail(id, 400).then((lines) => lines.length && pushLogs({ id, source: 'server', lines, ts: Date.now() })).catch(() => {});
    }
  }, [id, pushLogs]);

  if (paused && !frozen.current) frozen.current = logs;
  if (!paused) frozen.current = null;
  const source = frozen.current ?? logs;

  const f = filter.trim().toLowerCase();
  const shown = useMemo(
    () => source.filter((e) => (enabled.has(e.source) || (e.source === 'rcon-cmd' && enabled.has('rcon'))) && (!f || e.line.toLowerCase().includes(f))),
    [source, enabled, f],
  );
  const visible = shown.length > 2500 ? shown.slice(shown.length - 2500) : shown;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [visible, follow]);

  const send = async (raw?: string) => {
    const c = (raw ?? cmd).trim();
    if (!c) return;
    setSending(true);
    pushLogs({ id, source: 'rcon-cmd', lines: [`> ${c}`], ts: Date.now() });
    const h = [c, ...history.filter((x) => x !== c)].slice(0, 100);
    setHistory(h);
    try {
      localStorage.setItem('rcon-history', JSON.stringify(h));
    } catch {
      /* ignore */
    }
    setCmd('');
    setHIdx(-1);
    try {
      const out = await api.rcon(id, c);
      pushLogs({ id, source: 'rcon', lines: (out || '(no output)').split(/\r?\n/), ts: Date.now() });
    } catch (e) {
      pushLogs({ id, source: 'rcon', lines: [`Error: ${errMsg(e)}`], ts: Date.now() });
    } finally {
      setSending(false);
      setFollow(true);
    }
  };

  const rconReady = status?.rconOk;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setEnabled((prev) => {
              const n = new Set(prev);
              if (n.has(s.id)) n.delete(s.id);
              else n.add(s.id);
              return n;
            })}
            className={cn(
              'h-6 rounded-md border px-2 text-[11.5px] font-medium transition-colors',
              enabled.has(s.id) ? 'border-line-strong bg-hover text-fg' : 'border-transparent text-fg-4 hover:text-fg-3',
            )}
          >
            {s.label}
          </button>
        ))}
        <div className="relative ml-2 w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-fg-4" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter output"
            className="h-6.5 w-full rounded-md border border-line-strong bg-bg-raised pr-2 pl-7 text-[12px] text-fg placeholder:text-fg-4 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <span className="flex-1" />
        <span className="text-[11px] text-fg-4 tabular-nums">{shown.length.toLocaleString()} lines</span>
        <button onClick={() => setPaused((p) => !p)} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg" title={paused ? 'Resume' : 'Pause'}>
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </button>
        <button onClick={() => clearLogs(id)} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg" title="Clear">
          <Eraser className="size-3.5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
          }}
          className="selectable absolute inset-0 overflow-y-auto bg-bg px-4 py-3 font-mono text-[11.5px] leading-[1.65]"
        >
          {visible.length === 0 && <div className="py-10 text-center font-sans text-[12.5px] text-fg-4">No output yet.</div>}
          {visible.map((e) => (
            <div key={e.n} className={cn('flex gap-3 whitespace-pre-wrap break-all', lineTone(e))}>
              <span className="shrink-0 text-fg-4/70 select-none">{clock(e.ts)}</span>
              <span>{e.line}</span>
            </div>
          ))}
        </div>
        {!follow && (
          <button
            onClick={() => setFollow(true)}
            className="glass absolute right-5 bottom-4 flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-[11.5px] text-fg-2 shadow-pop hover:text-fg"
          >
            <ArrowDown className="size-3.5" /> Jump to latest
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-panel/60 px-4 py-2.5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              disabled={!rconReady}
              onClick={() => (q.endsWith(' ') ? setCmd(q) : send(q))}
              className="h-6 rounded-md border border-line bg-bg-raised px-2 font-mono text-[11px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
            >
              {q.trim()}
            </button>
          ))}
        </div>
        <div className={cn('flex items-center gap-2 rounded-lg border bg-bg px-3', rconReady ? 'border-line-strong focus-within:border-accent/50' : 'border-line')}>
          <ChevronRight className={cn('size-4', rconReady ? 'text-accent' : 'text-fg-4')} />
          <input
            value={cmd}
            disabled={!rconReady || sending}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
              if (e.key === 'ArrowUp' && history.length) {
                e.preventDefault();
                const n = Math.min(hIdx + 1, history.length - 1);
                setHIdx(n);
                setCmd(history[n]);
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const n = hIdx - 1;
                setHIdx(Math.max(n, -1));
                setCmd(n >= 0 ? history[n] : '');
              }
            }}
            placeholder={rconReady ? 'Enter an RCON command (↑ for history)' : 'RCON is available once the server is online'}
            className="h-9 flex-1 bg-transparent font-mono text-[12.5px] text-fg outline-none placeholder:font-sans placeholder:text-fg-4"
          />
          <button onClick={() => send()} disabled={!rconReady || !cmd.trim() || sending} className="rounded p-1.5 text-fg-3 hover:text-accent disabled:opacity-40" aria-label="Send">
            <SendHorizontal className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
