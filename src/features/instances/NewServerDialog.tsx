import { useEffect, useMemo, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Check, FolderOpen, Globe, PencilLine, RefreshCw } from 'lucide-react';
import { useApp } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import { relTime } from '@/lib/format';
import { PRESETS } from '@/data/presets';
import { IniDoc } from '@/lib/ini';
import { applyPreset } from '@/features/settings/presetApply';
import { GAME, GUS } from '@/lib/ipc';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Surface';
import { Input, Label, NumberInput, Switch } from '@/components/ui/Field';
import { SteamCmdLocation } from '@/features/prereqs/SteamCmdLocation';

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'server';

export function NewServerDialog() {
  const open = useApp((s) => s.overlay === 'newServer');
  const appInfo = useApp((s) => s.appInfo);
  const instances = useApp((s) => s.instances);
  const { setOverlay, upsertInstance, openTab, toast } = useApp.getState();
  const [name, setName] = useState('');
  const [map, setMap] = useState('TheIsland_WP');
  const [dir, setDir] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(70);
  const [cluster, setCluster] = useState('');
  const [installNow, setInstallNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ports, setPorts] = useState<{ gamePort: number; rconPort: number } | null>(null);
  const maps = useApp((s) => s.maps);
  const mapsMeta = useApp((s) => s.mapsMeta);
  const [custom, setCustom] = useState(false);
  const [customMap, setCustomMap] = useState('');
  const [customMod, setCustomMod] = useState('');
  const [presetId, setPresetId] = useState('official');
  /** True until the user types their own name – then map clicks stop renaming. */
  const [autoName, setAutoName] = useState(true);

  useEffect(() => {
    if (open) {
      setName(`${maps.find((m) => m.id === map)?.name ?? 'ARK'} Server`);
      setAutoName(true);
      setCustom(false);
      // Re-check the live catalog when the dialog opens (cached for 24 h, so this is instant).
      useApp.getState().refreshMaps();
      setDir(null);
      api.suggestPorts().then(setPorts).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const clusters = useMemo(() => [...new Set(instances.map((i) => i.clusterId).filter(Boolean))] as string[], [instances]);
  const installDir = dir ?? `${appInfo?.defaultInstallRoot ?? ''}\\${slug(name)}`;

  const create = async () => {
    setBusy(true);
    try {
      const mapId = custom ? customMap.trim().replace(/\s+/g, '') : map;
      if (!mapId) throw new Error('Enter the map name (e.g. MyModMap_WP)');
      let inst = await api.createInstance({ name: name.trim() || 'ASA Server', map: mapId, installDir, maxPlayers, clusterId: cluster.trim() || null });
      // Maps that live in a mod (Club ARK, community maps) need that mod loaded.
      const modId = custom ? Number(customMod) : maps.find((m) => m.id === mapId)?.modId;
      if (modId && Number.isInteger(modId) && modId > 0) {
        inst = await api.updateInstance({ ...inst, mods: [{ id: modId, name: `Map mod ${modId}`, enabled: true, passive: false }] });
      }
      // Seed the config files with the chosen preset (core profile keys are synced on every start).
      const preset = PRESETS.find((p) => p.id === presetId);
      if (preset && preset.changes.length) {
        const g = IniDoc.parse('[ServerSettings]');
        const m = IniDoc.parse('[/script/shootergame.shootergamemode]');
        applyPreset(preset, false, g, m);
        await api.writeConfig(inst.id, GUS, g.toText());
        await api.writeConfig(inst.id, GAME, m.toText());
      }
      upsertInstance(inst);
      setOverlay(null);
      openTab(inst.id, 'overview');
      if (installNow) api.installServer(inst.id).catch((e) => toast('error', 'Install failed', errMsg(e)));
      else toast('success', 'Server created', 'Install the server files from its Overview when ready.');
    } catch (e) {
      toast('error', 'Could not create server', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOverlay(null)}
      title="New server"
      description="Creates a fresh ASA dedicated server. SteamCMD is downloaded automatically if needed."
      width={680}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-[12.5px] text-fg-2">
            <Switch size="sm" checked={installNow} onChange={setInstallNow} /> Download server files now (~12 GB)
          </label>
          <Button variant="ghost" onClick={() => setOverlay(null)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={create}>
            Create server
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setAutoName(false);
            }}
            autoFocus
          />
        </div>
        <div>
          <Label
            hint={
              <span className="flex items-center gap-1.5">
                <Globe className="size-3" />
                {mapsMeta.source === 'live' || mapsMeta.source === 'cache'
                  ? `Live map list · updated ${relTime(mapsMeta.fetchedAt)}`
                  : mapsMeta.error
                    ? 'Offline – using built-in list'
                    : 'Built-in list'}
                <button onClick={() => useApp.getState().refreshMaps(true)} className="rounded p-0.5 text-fg-3 hover:text-fg" title="Check for new maps now">
                  <RefreshCw className={cn('size-3', mapsMeta.loading && 'animate-spin')} />
                </button>
              </span>
            }
          >
            Map
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {maps.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  if (autoName) setName(`${m.name} Server`);
                  setMap(m.id);
                  setCustom(false);
                }}
                className={cn(
                  'relative overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-all duration-150',
                  !custom && map === m.id ? 'border-accent/60 ring-2 ring-accent/15' : 'border-line hover:border-line-strong',
                )}
                style={{ background: `radial-gradient(120% 120% at 0% 0%, hsl(${m.hue} 70% 45% / ${!custom && map === m.id ? 0.22 : 0.1}), transparent 65%)` }}
              >
                <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
                  {m.name}
                  {m.isNew && <span className="rounded bg-info/15 px-1 text-[9px] font-bold tracking-wide text-info">NEW</span>}
                </div>
                <div className="font-mono text-[10.5px] text-fg-4">
                  {m.id}
                  {m.modId && <span className="ml-1 font-sans text-fg-3">· mod {m.modId}</span>}
                </div>
                {!custom && map === m.id && <Check className="absolute top-2 right-2 size-3.5 text-accent" />}
              </button>
            ))}
            <button
              onClick={() => setCustom(true)}
              className={cn(
                'relative rounded-lg border border-dashed px-3 py-2.5 text-left transition-all duration-150',
                custom ? 'border-accent/60 ring-2 ring-accent/15' : 'border-line-strong hover:border-fg-4',
              )}
            >
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
                <PencilLine className="size-3.5" /> Custom / mod map
              </div>
              <div className="text-[10.5px] text-fg-4">Any map name, e.g. a brand-new release</div>
            </button>
          </div>
          {custom && (
            <div className="mt-3 grid grid-cols-[1fr_200px] gap-3">
              <div>
                <Label hint="the <map_name> launch argument">Map name</Label>
                <Input value={customMap} onChange={(e) => setCustomMap(e.target.value)} placeholder="NewMap_WP" mono autoFocus />
              </div>
              <div>
                <Label hint="optional">CurseForge mod ID</Label>
                <Input value={customMod} onChange={(e) => setCustomMod(e.target.value.replace(/\D/g, ''))} placeholder="for mod maps" mono />
              </div>
            </div>
          )}
        </div>
        <div>
          <Label hint="needs ~20 GB free">Install location</Label>
          <div className="flex gap-2">
            <Input value={installDir} onChange={(e) => setDir(e.target.value)} mono />
            <Button
              icon={<FolderOpen className="size-3.5" />}
              onClick={async () => {
                const p = await openDialog({ directory: true, title: 'Choose a folder for the server' });
                if (typeof p !== 'string') return;
                // Use an empty folder exactly as picked; inside a non-empty one, create a subfolder for this server.
                const probe = await api.probeSteamcmdDir(p).catch(() => null);
                setDir(probe?.empty ? p : `${p.replace(/[\\/]+$/, '')}\\${slug(name)}`);
              }}
            >
              Browse
            </Button>
          </div>
        </div>
        <div>
          <Label hint="every setting can be changed later">Starting preset</Label>
          <Select
            value={presetId}
            onChange={setPresetId}
            options={PRESETS.map((p) => ({ value: p.id, label: `${p.name} – ${p.tagline}` }))}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Max players</Label>
            <NumberInput className="w-full text-left" value={maxPlayers} integer onCommit={(v) => setMaxPlayers(Math.max(1, v))} />
          </div>
          <div>
            <Label hint="optional">Cluster ID</Label>
            <Input value={cluster} onChange={(e) => setCluster(e.target.value)} list="dl-clusters" placeholder="None" />
            <datalist id="dl-clusters">{clusters.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <Label>Ports (auto)</Label>
            <div className="flex h-8 items-center rounded-lg border border-line bg-bg-raised px-2.5 font-mono text-[12px] text-fg-3">
              {ports ? `${ports.gamePort} · RCON ${ports.rconPort}` : '…'}
            </div>
          </div>
        </div>
        {!appInfo?.steamcmdInstalled && installNow && (
          <div>
            <Label hint="downloaded once, shared by all servers">SteamCMD will be installed to</Label>
            <SteamCmdLocation compact />
          </div>
        )}
        <p className="text-[11.5px] text-fg-4">A random admin password is generated – find it under Settings → Server profile.</p>
      </div>
    </Dialog>
  );
}
