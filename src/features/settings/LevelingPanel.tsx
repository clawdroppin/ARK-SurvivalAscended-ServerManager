import { useMemo, useState } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { GAME } from '@/lib/ipc';
import type { IniDoc } from '@/lib/ini';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, Segmented } from '@/components/ui/Surface';
import { Label, NumberInput, Slider } from '@/components/ui/Field';
import { AreaChart } from '@/components/charts/AreaChart';
import { compact } from '@/lib/format';

const SECTION = '/script/shootergame.shootergamemode';
type Curve = 'linear' | 'gentle' | 'official' | 'steep';
const EXP: Record<Curve, number> = { linear: 1, gentle: 1.6, official: 2.4, steep: 3.2 };

/** Generates LevelExperienceRampOverrides + OverridePlayerLevelEngramPoints. */
export function LevelingPanel({ game, edit }: { game: IniDoc; edit: (file: typeof GAME, fn: (d: IniDoc) => void) => void }) {
  const existingRamps = game.getAll(SECTION, 'LevelExperienceRampOverrides');
  const existingPoints = game.getAll(SECTION, 'OverridePlayerLevelEngramPoints');

  const [target, setTarget] = useState<'player' | 'dino'>('player');
  const [maxLevel, setMaxLevel] = useState(150);
  const [totalXp, setTotalXp] = useState(5_000_000);
  const [curve, setCurve] = useState<Curve>('official');
  const [pointsBase, setPointsBase] = useState(8);
  const [pointsStep, setPointsStep] = useState(4);
  const [pointsEvery, setPointsEvery] = useState(10);

  const xp = useMemo(() => {
    const n = Math.max(1, maxLevel - 1);
    return Array.from({ length: n }, (_, i) => Math.max(i + 1, Math.round(totalXp * Math.pow((i + 1) / n, EXP[curve]))));
  }, [maxLevel, totalXp, curve]);
  const points = useMemo(
    () => Array.from({ length: maxLevel }, (_, lvl) => (lvl === 0 ? 0 : pointsBase + Math.floor(lvl / Math.max(1, pointsEvery)) * pointsStep)),
    [maxLevel, pointsBase, pointsStep, pointsEvery],
  );
  const totalPoints = points.reduce((a, b) => a + b, 0);

  const apply = () =>
    edit(GAME, (d) => {
      const ramp = `(${xp.map((v, i) => `ExperiencePointsForLevel[${i}]=${v}`).join(',')})`;
      // Order matters: the first ramp override is players, the second is tamed creatures.
      const ramps = d.getAll(SECTION, 'LevelExperienceRampOverrides');
      const playerRamp = target === 'player' ? ramp : ramps[0] ?? `(${xp.map((_, i) => `ExperiencePointsForLevel[${i}]=${i + 1}`).join(',')})`;
      const next = target === 'player' ? [ramp, ...ramps.slice(1)] : [playerRamp, ramp];
      d.setAll(SECTION, 'LevelExperienceRampOverrides', next);
      if (target === 'player') {
        d.setAll(SECTION, 'OverridePlayerLevelEngramPoints', points.map(String));
        d.set(SECTION, 'OverrideMaxExperiencePointsPlayer', String(xp[xp.length - 1]));
      } else {
        d.set(SECTION, 'OverrideMaxExperiencePointsDino', String(xp[xp.length - 1]));
      }
    });

  const clear = () =>
    edit(GAME, (d) => {
      for (const k of ['LevelExperienceRampOverrides', 'OverridePlayerLevelEngramPoints', 'OverrideMaxExperiencePointsPlayer', 'OverrideMaxExperiencePointsDino'])
        d.remove(SECTION, k);
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Current overrides"
          subtitle={
            existingRamps.length || existingPoints.length
              ? `${existingRamps.length} XP ramp(s) · ${existingPoints.length} engram-point levels configured`
              : 'Using official leveling'
          }
          actions={
            (existingRamps.length > 0 || existingPoints.length > 0) && (
              <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={clear}>
                Remove overrides
              </Button>
            )
          }
        />
      </Card>

      <Card>
        <CardHeader title="Level curve generator" subtitle="Builds the XP table and engram points for you" actions={<Segmented value={target} onChange={setTarget} size="sm" options={[{ value: 'player', label: 'Players' }, { value: 'dino', label: 'Tamed creatures' }]} />} />
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 p-5">
          <div>
            <Label hint={`${maxLevel - 1} level-ups`}>Max level</Label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Slider value={maxLevel} min={2} max={target === 'player' ? 500 : 1000} step={1} def={target === 'player' ? 105 : 88} onChange={setMaxLevel} />
              </div>
              <NumberInput value={maxLevel} integer onCommit={(v) => setMaxLevel(Math.max(2, v))} />
            </div>
          </div>
          <div>
            <Label hint={compact(totalXp)}>Total XP to max level</Label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Slider value={totalXp} min={1000} max={100_000_000} step={1000} scale="log" onChange={setTotalXp} />
              </div>
              <NumberInput className="w-[110px]" value={totalXp} integer onCommit={(v) => setTotalXp(Math.max(maxLevel, v))} />
            </div>
          </div>
          <div className="col-span-2">
            <Label>Curve shape</Label>
            <Segmented value={curve} onChange={setCurve} options={[{ value: 'linear', label: 'Linear' }, { value: 'gentle', label: 'Gentle' }, { value: 'official', label: 'Official-like' }, { value: 'steep', label: 'Steep' }]} />
            <div className="mt-3 rounded-lg border border-line bg-bg-raised p-2">
              <AreaChart data={xp} height={90} />
              <div className="flex justify-between px-1 pt-1 text-[10.5px] text-fg-4">
                <span>Lv 2: {compact(xp[0] ?? 0)} XP</span>
                <span>Lv {Math.round(maxLevel / 2)}: {compact(xp[Math.round(xp.length / 2)] ?? 0)} XP</span>
                <span>Lv {maxLevel}: {compact(xp[xp.length - 1] ?? 0)} XP</span>
              </div>
            </div>
          </div>
          {target === 'player' && (
            <div className="col-span-2 grid grid-cols-3 gap-6">
              <div>
                <Label>Engram points per level</Label>
                <NumberInput className="w-full text-left" value={pointsBase} integer onCommit={setPointsBase} />
              </div>
              <div>
                <Label>…increase by</Label>
                <NumberInput className="w-full text-left" value={pointsStep} integer onCommit={setPointsStep} />
              </div>
              <div>
                <Label>…every N levels</Label>
                <NumberInput className="w-full text-left" value={pointsEvery} integer onCommit={(v) => setPointsEvery(Math.max(1, v))} />
              </div>
              <div className="col-span-3 text-[12px] text-fg-3">
                Total engram points at max level: <span className="font-semibold text-fg tabular-nums">{totalPoints.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <Button variant="primary" icon={<Sparkles className="size-3.5" />} onClick={apply}>
            Apply to Game.ini
          </Button>
        </div>
      </Card>
    </div>
  );
}
