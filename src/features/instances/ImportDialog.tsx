import { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FileArchive, FolderInput, Package } from 'lucide-react';
import { useApp } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import type { PackManifest } from '@/lib/types';
import { mapName } from '@/data/maps';
import { Button } from '@/components/ui/Button';
import { Badge, Dialog, Segmented } from '@/components/ui/Surface';
import { Input, Label } from '@/components/ui/Field';

export function ImportDialog() {
  const open = useApp((s) => s.overlay === 'import');
  const { setOverlay, upsertInstance, openTab, toast } = useApp.getState();
  const [mode, setMode] = useState<'pack' | 'folder'>('pack');
  const [path, setPath] = useState('');
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPath('');
      setManifest(null);
      setName('');
    }
  }, [open, mode]);

  const pick = async () => {
    const p =
      mode === 'pack'
        ? await openDialog({ filters: [{ name: 'ASA Server Pack', extensions: ['asapack', 'zip'] }], title: 'Choose a server pack' })
        : await openDialog({ directory: true, title: 'Choose the server folder (contains ShooterGame)' });
    if (typeof p !== 'string') return;
    setPath(p);
    if (mode === 'pack') {
      try {
        const m = await api.readPack(p);
        setManifest(m);
        setName(m.profile.name);
      } catch (e) {
        toast('error', 'Not a valid pack', errMsg(e));
      }
    }
  };

  const go = async () => {
    setBusy(true);
    try {
      const inst = mode === 'pack' ? await api.importPack(path, name || 'Imported server') : await api.importExisting(path, name || undefined);
      upsertInstance(inst);
      setOverlay(null);
      openTab(inst.id, 'overview');
      toast('success', `Imported ${inst.name}`);
    } catch (e) {
      toast('error', 'Import failed', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOverlay(null)}
      title="Import a server"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOverlay(null)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!path || (mode === 'pack' && !manifest)} loading={busy} onClick={go}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'pack', label: 'From .asapack', icon: <Package className="size-3.5" /> },
            { value: 'folder', label: 'Existing install folder', icon: <FolderInput className="size-3.5" /> },
          ]}
        />
        <p className="text-[12.5px] leading-relaxed text-fg-3">
          {mode === 'pack'
            ? 'Recreates a server exported from ASA Server Manager – profile, mods, launch options, configs and (if included) world saves. New ports are assigned automatically.'
            : 'Adopts a server you already have (e.g. from another manager or a manual SteamCMD install). Ports, passwords and session name are read from its GameUserSettings.ini; nothing is moved.'}
        </p>
        <div>
          <Label>{mode === 'pack' ? 'Pack file' : 'Server folder'}</Label>
          <div className="flex gap-2">
            <Input value={path} readOnly mono placeholder="Nothing selected" />
            <Button icon={<FileArchive className="size-3.5" />} onClick={pick}>
              Browse
            </Button>
          </div>
        </div>
        {manifest && (
          <div className="rounded-lg border border-line bg-bg-raised p-3 text-[12.5px]">
            <div className="font-medium text-fg">{manifest.profile.name}</div>
            <div className="mt-0.5 text-fg-3">
              {mapName(manifest.profile.map)} · {manifest.profile.mods.length} mods · exported {new Date(manifest.createdAt).toLocaleString()}
            </div>
            <div className="mt-2 flex gap-1.5">
              {manifest.includesSaves && <Badge tone="accent">World saves</Badge>}
              {manifest.includesCluster && <Badge tone="accent">Cluster data</Badge>}
              {manifest.includesPasswords ? <Badge tone="warn">Passwords</Badge> : <Badge>No passwords</Badge>}
            </div>
          </div>
        )}
        {path && (
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'folder' ? 'Read from session name' : ''} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
