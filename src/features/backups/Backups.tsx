import { useCallback, useEffect, useState } from 'react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { Archive, CheckCircle2, CircleHelp, FolderOpen, HardDriveDownload, History, Loader2, PackageOpen, RotateCcw, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useApp, useInstance, useStatus } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import type { BackupInfo, SaveCheck } from '@/lib/types';
import { bytes, relTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge, Card, CardHeader, Dialog, Empty } from '@/components/ui/Surface';
import { Input, Switch } from '@/components/ui/Field';
import { confirm } from '@/components/ui/Confirm';

export function Backups({ id }: { id: string }) {
  const inst = useInstance(id)!;
  const status = useStatus(id);
  const toast = useApp((s) => s.toast);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [saves, setSaves] = useState<SaveCheck[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const running = !!status?.pid;

  const load = useCallback(() => api.listBackups(id).then(setBackups).catch(() => {}), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy('create');
    try {
      const b = await api.createBackup(id, label || 'manual');
      toast('success', 'Backup created', `${b.name} · ${bytes(b.size)}`);
      setLabel('');
      load();
    } catch (e) {
      toast('error', 'Backup failed', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (b: BackupInfo) => {
    const r = await confirm({
      title: `Restore ${b.name}?`,
      body: 'The current world is moved to a _quarantine folder first, so nothing is lost.',
      option: 'Also restore GameUserSettings.ini and Game.ini',
      confirmLabel: 'Restore',
    });
    if (!r.ok) return;
    setBusy(b.path);
    try {
      await api.restoreBackup(id, b.path, r.option);
      toast('success', 'Backup restored');
    } catch (e) {
      toast('error', 'Restore failed', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy('check');
    try {
      setSaves(await api.checkSaves(id));
    } catch (e) {
      toast('error', 'Integrity check failed', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const rollback = async (s: SaveCheck) => {
    const r = await confirm({ title: `Roll back to ${s.file.name}?`, body: 'The current world file is moved to _quarantine and this snapshot becomes the active save.', confirmLabel: 'Roll back' });
    if (!r.ok) return;
    try {
      const q = await api.rollbackSave(id, s.file.path);
      toast('success', 'World rolled back', `Previous save kept in ${q}`);
      check();
    } catch (e) {
      toast('error', 'Rollback failed', errMsg(e));
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 px-6 py-5">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Create backup" subtitle="World save + both config files, zipped. Runs SaveWorld first when online." icon={<Archive className="size-4" />} />
            <div className="flex gap-2 p-3">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional) – e.g. before-wipe" onKeyDown={(e) => e.key === 'Enter' && create()} />
              <Button variant="primary" loading={busy === 'create'} onClick={create}>
                Back up now
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={`Backups (${backups.length})`}
              subtitle={`Stored in the server folder · automatic backups keep the newest ${inst.automation.backupRetention}`}
              icon={<History className="size-4" />}
              actions={
                <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => api.backupDir(id).then((d) => openPath(d)).catch(() => toast('info', 'No backups yet', 'The folder is created with the first backup.'))}>
                  Folder
                </Button>
              }
            />
            {backups.length === 0 ? (
              <Empty title="No backups yet" body="Create one manually or enable automatic backups in Automation." />
            ) : (
              <div className="max-h-[520px] overflow-y-auto p-1.5">
                {backups.map((b) => (
                  <div key={b.path} className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.025]">
                    <Archive className="size-4 shrink-0 text-fg-4" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[12px] text-fg">{b.name}</div>
                      <div className="text-[11px] text-fg-4">
                        {bytes(b.size)} · {relTime(b.created)}
                        {b.name.endsWith('_auto.zip') && <Badge className="ml-2">auto</Badge>}
                      </div>
                    </div>
                    <Button size="xs" variant="outline" icon={busy === b.path ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} disabled={running} onClick={() => restore(b)} title={running ? 'Stop the server first' : 'Restore'}>
                      Restore
                    </Button>
                    <button
                      onClick={async () => {
                        if (!(await confirm({ title: 'Delete backup?', body: b.name, confirmLabel: 'Delete', danger: true })).ok) return;
                        api.deleteBackup(id, b.path).then(load).catch((e) => toast('error', 'Delete failed', errMsg(e)));
                      }}
                      className="rounded p-1 text-fg-4 opacity-0 group-hover:opacity-100 hover:text-err"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="World save integrity"
              subtitle="ASA saves are SQLite databases – checked with SQLite's own integrity check"
              icon={<ShieldAlert className="size-4" />}
              actions={
                <Button size="sm" variant="outline" loading={busy === 'check'} onClick={check}>
                  Check now
                </Button>
              }
            />
            {saves === null ? (
              <div className="px-4 py-4 text-[12.5px] text-fg-3">Run a check to verify the active world and every rolling snapshot ({inst.map}_DD.MM.YYYY…ark).</div>
            ) : saves.length === 0 ? (
              <Empty title="No world save yet" body="Start the server once to create the world." />
            ) : (
              <div className="max-h-[440px] overflow-y-auto p-1.5">
                {saves.map((s) => (
                  <div key={s.file.path} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.025]">
                    {s.status === 'ok' ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : s.status === 'corrupt' ? <ShieldAlert className="size-4 shrink-0 text-err" /> : <CircleHelp className="size-4 shrink-0 text-fg-4" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[12px] text-fg">{s.file.name}</span>
                        {s.file.isPrimary && <Badge tone="accent">active</Badge>}
                      </div>
                      <div className="truncate text-[11px] text-fg-4">
                        {bytes(s.file.size)} · {relTime(s.file.modified)} · {s.detail}
                      </div>
                    </div>
                    {!s.file.isPrimary && s.status !== 'corrupt' && (
                      <Button size="xs" variant="outline" disabled={running} onClick={() => rollback(s)} title={running ? 'Stop the server first' : 'Make this the active save'}>
                        Roll back
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Portable pack" subtitle="Move or share this server: settings, mods, launch options and optionally saves" icon={<PackageOpen className="size-4" />} />
            <div className="flex gap-2 p-3">
              <Button variant="outline" icon={<Upload className="size-3.5" />} onClick={() => setExportOpen(true)}>
                Export .asapack
              </Button>
              <Button variant="ghost" icon={<HardDriveDownload className="size-3.5" />} onClick={() => useApp.getState().setOverlay('import')}>
                Import…
              </Button>
            </div>
          </Card>
        </div>
      </div>
      <ExportDialog id={id} name={inst.name} open={exportOpen} onClose={() => setExportOpen(false)} hasCluster={!!inst.clusterId} />
    </div>
  );
}

function ExportDialog({ id, name, open, onClose, hasCluster }: { id: string; name: string; open: boolean; onClose: () => void; hasCluster: boolean }) {
  const toast = useApp((s) => s.toast);
  const [saves, setSaves] = useState(true);
  const [cluster, setCluster] = useState(false);
  const [passwords, setPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const dest = await saveDialog({ defaultPath: `${name.replace(/[^\w-]+/g, '_')}.asapack`, filters: [{ name: 'ASA Server Pack', extensions: ['asapack', 'zip'] }] });
    if (!dest) return;
    setBusy(true);
    try {
      await api.exportPack(id, dest, { includeSaves: saves, includeCluster: cluster, includePasswords: passwords });
      toast('success', 'Export complete', dest);
      onClose();
    } catch (e) {
      toast('error', 'Export failed', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export server pack"
      description="A single .asapack (zip) file containing the profile, mod list, launch options and config files."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={go}>
            Choose location…
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Toggle label="Include world saves" hint="Players, tribes, tames and structures" v={saves} set={setSaves} />
        <Toggle label="Include cluster transfer data" hint="Uploaded characters/items" v={cluster} set={setCluster} disabled={!hasCluster} />
        <Toggle label="Include passwords" hint="Admin / join passwords – only for private transfers" v={passwords} set={setPasswords} />
      </div>
    </Dialog>
  );
}

function Toggle({ label, hint, v, set, disabled }: { label: string; hint: string; v: boolean; set: (b: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-line bg-bg-raised px-3 py-2.5">
      <Switch checked={v} onChange={set} disabled={disabled} />
      <div>
        <div className="text-[12.5px] font-medium text-fg">{label}</div>
        <div className="text-[11.5px] text-fg-4">{hint}</div>
      </div>
    </label>
  );
}
