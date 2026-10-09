import { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { ExternalLink, FolderOpen } from 'lucide-react';
import { useApp } from '@/store/app';
import { errMsg } from '@/lib/ipc';
import type { AppSettings } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Surface';
import { Input, Label, PasswordInput, Select } from '@/components/ui/Field';
import { SteamCmdLocation } from '@/features/prereqs/SteamCmdLocation';
import { Badge } from '@/components/ui/Surface';

export function AppSettingsDialog() {
  const open = useApp((s) => s.overlay === 'appSettings');
  const settings = useApp((s) => s.settings);
  const appInfo = useApp((s) => s.appInfo);
  const { setOverlay, saveSettings, toast } = useApp.getState();
  const [d, setD] = useState<AppSettings | undefined>(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setD(useApp.getState().settings);
  }, [open]);
  if (!d) return null;

  const pickDir = async (key: 'defaultInstallRoot' | 'backupDir') => {
    const p = await openDialog({ directory: true });
    if (typeof p === 'string') setD({ ...d, [key]: p });
  };

  const save = async () => {
    setBusy(true);
    try {
      // SteamCMD location is saved instantly by its own picker – don't overwrite it with the draft.
      await saveSettings({ ...d, steamcmdDir: useApp.getState().settings?.steamcmdDir ?? null });
      toast('success', 'Settings saved');
      setOverlay(null);
    } catch (e) {
      toast('error', 'Could not save settings', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const dirRow = (key: 'defaultInstallRoot' | 'backupDir', label: string, fallback?: string) => (
    <div>
      <Label hint="leave empty for default">{label}</Label>
      <div className="flex gap-2">
        <Input value={d[key] ?? ''} onChange={(e) => setD({ ...d, [key]: e.target.value || null })} placeholder={fallback} mono />
        <Button icon={<FolderOpen className="size-3.5" />} onClick={() => pickDir(key)}>
          Browse
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={() => setOverlay(null)}
      title="App settings"
      width={600}
      footer={
        <>
          <Button variant="ghost" icon={<FolderOpen className="size-3.5" />} className="mr-auto" onClick={() => appInfo && openPath(appInfo.dataDir)}>
            Profile folder
          </Button>
          <Button variant="ghost" onClick={() => setOverlay(null)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-bg-raised px-3 py-2.5">
          <Badge tone={appInfo?.portable ? 'accent' : 'neutral'}>{appInfo?.portable ? 'PORTABLE' : 'INSTALLED'}</Badge>
          <div className="min-w-0 flex-1 text-[12px] text-fg-3">
            {appInfo?.portable ? 'All data is stored next to the app:' : 'Data is stored in your user profile:'}
            <div className="selectable truncate font-mono text-[11.5px] text-fg-2">{appInfo?.dataDir}</div>
          </div>
        </div>
        <div>
          <Label
            hint={
              <button onClick={() => openUrl('https://console.curseforge.com/')} className="flex items-center gap-1 text-accent hover:underline">
                Get a free key <ExternalLink className="size-3" />
              </button>
            }
          >
            CurseForge API key
          </Label>
          <PasswordInput value={d.curseforgeApiKey} onChange={(e) => setD({ ...d, curseforgeApiKey: e.target.value })} placeholder="$2a$10$…" />
          <p className="mt-1.5 text-[11.5px] text-fg-4">Used for browsing mods and checking for mod updates. Stored locally only.</p>
        </div>
        {dirRow('defaultInstallRoot', 'Default server install folder', appInfo?.defaultInstallRoot)}
        <SteamCmdLocation />
        {dirRow('backupDir', 'Backup folder override', "Default: each server's own \Backups folder")}
        <div>
          <Label hint="lower = smoother charts, slightly more CPU">Telemetry refresh</Label>
          <Select
            value={String(d.telemetryIntervalMs)}
            onChange={(v) => setD({ ...d, telemetryIntervalMs: Number(v) })}
            options={[
              { value: '1000', label: 'Every second' },
              { value: '2000', label: 'Every 2 seconds' },
              { value: '5000', label: 'Every 5 seconds' },
            ]}
          />
        </div>
        <div className="text-[11.5px] text-fg-4">ASA Server Manager v{appInfo?.version}</div>
      </div>
    </Dialog>
  );
}
