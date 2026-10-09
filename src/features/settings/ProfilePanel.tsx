import { useEffect, useState } from 'react';
import { Dices } from 'lucide-react';
import { useApp, useInstance } from '@/store/app';
import { Input, Label, NumberInput, PasswordInput, Select, Slider } from '@/components/ui/Field';
import { Card } from '@/components/ui/Surface';
import type { ServerInstance } from '@/lib/types';

/**
 * Profile-owned values. These are written into GameUserSettings.ini on every start (and on
 * the launch line where ASA requires it), so they never drift from the manager's view.
 */
export function ProfilePanel({ id }: { id: string }) {
  const inst = useInstance(id)!;
  const saveInstance = useApp((s) => s.saveInstance);
  const [d, setD] = useState<ServerInstance>(inst);
  useEffect(() => setD(inst), [inst]);
  const commit = (patch: Partial<ServerInstance>) => {
    const next = { ...d, ...patch };
    setD(next);
    saveInstance(next);
  };
  const text = (k: keyof ServerInstance) => ({
    value: (d[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }),
    onBlur: () => (d[k] !== inst[k] ? saveInstance(d) : undefined),
  });
  const maps = useApp((s) => s.maps);
  const knownMap = maps.some((m) => m.id === d.map);

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-x-6 gap-y-4 p-5">
        <div>
          <Label hint="shown in this app">Display name</Label>
          <Input {...text('name')} />
        </div>
        <div>
          <Label hint="shown in the in-game server browser">Session name</Label>
          <Input {...text('sessionName')} placeholder={d.name} />
        </div>
        <div>
          <Label>Map</Label>
          <Select
            value={knownMap ? d.map : '__custom'}
            onChange={(v) => v !== '__custom' && commit({ map: v })}
            options={[...maps.map((m) => ({ value: m.id, label: `${m.name}${m.isNew ? ' (new)' : ''} – ${m.id}` })), { value: '__custom', label: 'Custom / mod map…' }]}
          />
          {!knownMap && <Input className="mt-2" {...text('map')} mono placeholder="MyModMap_WP" />}
        </div>
        <div>
          <Label hint={`${d.maxPlayers} slots`}>Max players</Label>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Slider value={d.maxPlayers} min={1} max={200} step={1} def={70} onChange={(v) => setD({ ...d, maxPlayers: v })} onCommit={() => saveInstance(d)} />
            </div>
            <NumberInput value={d.maxPlayers} integer onCommit={(v) => commit({ maxPlayers: Math.max(1, v) })} />
          </div>
        </div>
      </Card>

      <Card className="grid grid-cols-3 gap-x-6 gap-y-4 p-5">
        <div>
          <Label hint="required – RCON & shutdown">Admin password</Label>
          <div className="flex gap-1.5">
            <PasswordInput {...text('adminPassword')} />
            <button
              className="rounded-lg border border-line-strong px-2 text-fg-3 hover:bg-hover hover:text-fg"
              title="Generate"
              onClick={() => commit({ adminPassword: crypto.randomUUID().replace(/-/g, '').slice(0, 16) })}
            >
              <Dices className="size-3.5" />
            </button>
          </div>
        </div>
        <div>
          <Label hint="empty = public">Join password</Label>
          <PasswordInput {...text('serverPassword')} />
        </div>
        <div>
          <Label>Spectator password</Label>
          <PasswordInput {...text('spectatorPassword')} />
        </div>
      </Card>

      <Card className="grid grid-cols-3 gap-x-6 gap-y-4 p-5">
        <div>
          <Label hint="UDP – forward this">Game port</Label>
          <NumberInput className="w-full text-left" value={d.gamePort} integer onCommit={(v) => commit({ gamePort: v })} />
        </div>
        <div>
          <Label hint="UDP">Query port</Label>
          <NumberInput className="w-full text-left" value={d.queryPort} integer onCommit={(v) => commit({ queryPort: v })} />
        </div>
        <div>
          <Label hint="TCP – keep local">RCON port</Label>
          <NumberInput className="w-full text-left" value={d.rconPort} integer onCommit={(v) => commit({ rconPort: v })} />
        </div>
      </Card>

      <Card className="grid grid-cols-2 gap-x-6 gap-y-4 p-5">
        <div>
          <Label hint="same ID = shared transfers">Cluster ID</Label>
          <Input
            value={d.clusterId ?? ''}
            onChange={(e) => setD({ ...d, clusterId: e.target.value })}
            onBlur={() => {
              const cid = d.clusterId?.trim() || null;
              const dir = cid ? d.clusterDir || `${useApp.getState().appInfo?.dataDir}\\clusters\\${cid}` : null;
              saveInstance({ ...d, clusterId: cid, clusterDir: dir });
            }}
            placeholder="Not clustered"
          />
        </div>
        <div>
          <Label hint="all servers in a cluster must share it">Cluster directory</Label>
          <Input {...text('clusterDir')} mono disabled={!d.clusterId} placeholder="Auto" />
        </div>
        <div>
          <Label hint="separate saves for the same map">Alt save directory</Label>
          <Input {...text('altSaveDirectory')} mono placeholder="Default" />
        </div>
        <div>
          <Label hint="appended verbatim">Extra launch arguments</Label>
          <Input {...text('customArgs')} mono placeholder="-MyModOption=1" />
        </div>
      </Card>
    </div>
  );
}
