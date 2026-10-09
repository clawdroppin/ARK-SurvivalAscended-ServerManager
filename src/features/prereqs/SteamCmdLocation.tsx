import { useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { CheckCircle2, FolderOpen, RotateCcw, Terminal } from 'lucide-react';
import { useApp } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import { Button } from '@/components/ui/Button';
import { confirm } from '@/components/ui/Confirm';
import { cn } from '@/lib/cn';

/**
 * Lets the user choose where SteamCMD lives (or point at an existing install). Saves immediately
 * to app settings so every later install/update uses it.
 */
export function SteamCmdLocation({ compact, onChanged }: { compact?: boolean; onChanged?: () => void }) {
  const appInfo = useApp((s) => s.appInfo);
  const settings = useApp((s) => s.settings);
  const { saveSettings, toast } = useApp.getState();
  const [busy, setBusy] = useState(false);
  if (!appInfo || !settings) return null;
  const custom = !!settings.steamcmdDir;

  const apply = async (dir: string | null) => {
    setBusy(true);
    try {
      await saveSettings({ ...settings, steamcmdDir: dir });
      onChanged?.();
    } catch (e) {
      toast('error', 'Could not change SteamCMD location', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    const p = await openDialog({ directory: true, title: 'Choose a folder for SteamCMD (or an existing SteamCMD folder)' });
    if (typeof p !== 'string') return;
    const probe = await api.probeSteamcmdDir(p);
    if (probe.hasSteamcmd) {
      toast('success', 'Existing SteamCMD found', 'It will be used as-is.');
      return apply(p);
    }
    if (!probe.writable) {
      toast('error', 'That folder is not writable', 'Pick a folder you have write access to (avoid Program Files).');
      return;
    }
    if (!probe.empty) {
      const sub = `${p.replace(/[\/]+$/, '')}\steamcmd`;
      const r = await confirm({
        title: 'Folder is not empty',
        body: (
          <>
            SteamCMD creates many files. Install into a dedicated subfolder instead?
            <span className="mt-2 block font-mono text-[12px] text-fg">{sub}</span>
          </>
        ),
        confirmLabel: 'Use subfolder',
      });
      return apply(r.ok ? sub : p);
    }
    return apply(p);
  };

  return (
    <div className={cn('rounded-lg border border-line bg-bg-raised', compact ? 'px-3 py-2' : 'p-3')}>
      <div className="flex items-center gap-3">
        <Terminal className="size-4 shrink-0 text-fg-3" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px] font-medium text-fg-2">
            SteamCMD location
            {appInfo.steamcmdInstalled && (
              <span className="flex items-center gap-1 text-[11px] font-normal text-ok">
                <CheckCircle2 className="size-3" /> installed
              </span>
            )}
            {!custom && <span className="text-[11px] font-normal text-fg-4">default</span>}
          </div>
          <div className="selectable truncate font-mono text-[11.5px] text-fg-3" title={appInfo.steamcmdDir}>
            {appInfo.steamcmdDir}
          </div>
        </div>
        {custom && (
          <button onClick={() => apply(null)} disabled={busy} className="rounded p-1.5 text-fg-4 hover:bg-hover hover:text-fg" title="Reset to default location">
            <RotateCcw className="size-3.5" />
          </button>
        )}
        <Button size="sm" variant="outline" icon={<FolderOpen className="size-3.5" />} loading={busy} onClick={pick}>
          Change…
        </Button>
      </div>
    </div>
  );
}
