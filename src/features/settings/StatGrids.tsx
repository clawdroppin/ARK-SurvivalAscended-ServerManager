import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { STAT_GRIDS, STAT_NAMES } from '@/data/stats';
import { GAME } from '@/lib/ipc';
import { formatNumber, type IniDoc } from '@/lib/ini';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Surface';
import { NumberInput, Slider } from '@/components/ui/Field';

const SECTION = '/script/shootergame.shootergamemode';

export function StatGrids({ game, edit }: { game: IniDoc; edit: (file: typeof GAME, fn: (d: IniDoc) => void) => void }) {
  const [active, setActive] = useState(STAT_GRIDS[0].key);
  const grid = STAT_GRIDS.find((g) => g.key === active)!;
  const values = game.getIndexed(SECTION, grid.key);

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <div className="space-y-0.5">
        {STAT_GRIDS.map((g) => {
          const n = Object.keys(game.getIndexed(SECTION, g.key)).length;
          return (
            <button
              key={g.key}
              onClick={() => setActive(g.key)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors',
                active === g.key ? 'bg-hover text-fg' : 'text-fg-3 hover:bg-hover/50 hover:text-fg-2',
              )}
            >
              {g.label}
              {n > 0 && <span className="rounded bg-accent/15 px-1.5 text-[10.5px] font-semibold text-accent">{n}</span>}
            </button>
          );
        })}
      </div>
      <Card className="p-1">
        <div className="border-b border-line px-4 py-3">
          <div className="text-[13px] font-semibold text-fg">{grid.label}</div>
          <div className="mt-0.5 text-[12px] text-fg-3">{grid.desc}</div>
          <div className="mt-1 font-mono text-[10.5px] text-fg-4">{grid.key}[index]=value · Game.ini</div>
        </div>
        {STAT_NAMES.map((name, i) => {
          const def = grid.defaults[i];
          if (def === null) return null;
          const raw = values[i];
          const v = raw !== undefined && Number.isFinite(Number(raw)) ? Number(raw) : def;
          const set = (n: number) => edit(GAME, (d) => d.set(SECTION, `${grid.key}[${i}]`, formatNumber(n, grid.type)));
          return (
            <div key={i} className="relative grid grid-cols-[150px_minmax(0,1fr)_84px_24px] items-center gap-4 px-4 py-2.5">
              {raw !== undefined && Number(raw) !== def && <span className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full bg-accent" />}
              <div>
                <div className="text-[12.5px] font-medium text-fg">{name}</div>
                <div className="font-mono text-[10.5px] text-fg-4">
                  [{i}] · official {def}
                </div>
              </div>
              <StatSlider value={v} def={def} max={grid.max} step={grid.step} onCommit={set} />
              <NumberInput value={v} integer={grid.type === 'int'} step={grid.step} onCommit={set} />
              <button
                onClick={() => edit(GAME, (d) => d.remove(SECTION, `${grid.key}[${i}]`))}
                className={cn('rounded p-1 text-fg-4 hover:bg-hover hover:text-fg', raw === undefined && 'invisible')}
                title="Reset to official"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function StatSlider({ value, def, max, step, onCommit }: { value: number; def: number; max: number; step: number; onCommit: (v: number) => void }) {
  const [live, setLive] = useState<number | null>(null);
  return (
    <Slider
      value={live ?? value}
      min={0}
      max={max}
      step={step}
      scale="log"
      def={def}
      onChange={setLive}
      onCommit={() => {
        if (live !== null && live !== value) onCommit(live);
        setLive(null);
      }}
    />
  );
}
