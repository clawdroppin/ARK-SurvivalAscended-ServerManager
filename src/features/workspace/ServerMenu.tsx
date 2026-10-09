import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { openPath } from '@tauri-apps/plugin-opener';
import { Copy, FolderOpen, MoreHorizontal, PackageOpen, Trash2 } from 'lucide-react';
import { useApp } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import type { ServerInstance } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Surface';
import { Input, Label } from '@/components/ui/Field';
import { confirm } from '@/components/ui/Confirm';
import { cn } from '@/lib/cn';

/** Per-server actions: clone, export, open folder, delete. */
export function ServerMenu({ inst, running }: { inst: ServerInstance; running: boolean }) {
  const [open, setOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { toast, removeInstance, upsertInstance, openTab, setView } = useApp.getState();

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const del = async () => {
    setOpen(false);
    const r = await confirm({
      title: `Remove ${inst.name}?`,
      body: (
        <>
          The server is removed from the manager. Its files stay on disk unless you tick the box below.
          <span className="mt-2 block text-fg-3">Backups in the server’s Backups folder are always kept.</span>
        </>
      ),
      option: `Also delete server files in ${inst.installDir}`,
      confirmLabel: 'Remove server',
      danger: true,
    });
    if (!r.ok) return;
    try {
      await api.deleteInstance(inst.id, r.option);
      removeInstance(inst.id);
      toast('success', `${inst.name} removed`, r.option ? 'Server files deleted (backups kept).' : 'Files were left on disk.');
    } catch (e) {
      toast('error', 'Could not remove server', errMsg(e));
    }
  };

  const items: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }[] = [
    { icon: <Copy className="size-3.5" />, label: 'Clone server…', onClick: () => { setOpen(false); setCloneOpen(true); } },
    { icon: <PackageOpen className="size-3.5" />, label: 'Export / backups', onClick: () => { setOpen(false); setView(inst.id, 'backups'); } },
    { icon: <FolderOpen className="size-3.5" />, label: 'Open server folder', onClick: () => { setOpen(false); openPath(inst.installDir).catch((e) => toast('error', 'Folder not found', errMsg(e))); } },
    { icon: <Trash2 className="size-3.5" />, label: 'Remove server…', onClick: del, danger: true, disabled: running, hint: running ? 'Stop it first' : undefined },
  ];

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex size-8 items-center justify-center rounded-lg border border-line-strong text-fg-3 hover:bg-hover hover:text-fg" aria-label="Server actions">
        <MoreHorizontal className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-10 right-0 z-30 w-56 overflow-hidden rounded-xl border border-line-strong bg-panel p-1 shadow-pop"
          >
            {items.map((it) => (
              <button
                key={it.label}
                disabled={it.disabled}
                onClick={it.onClick}
                className={cn(
                  'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] disabled:opacity-40',
                  it.danger ? 'text-err hover:bg-err/10' : 'text-fg-2 hover:bg-hover hover:text-fg',
                )}
              >
                {it.icon}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-[10.5px] text-fg-4">{it.hint}</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <CloneDialog
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        inst={inst}
        onDone={(c) => {
          upsertInstance(c);
          openTab(c.id, 'overview');
        }}
      />
    </div>
  );
}

function CloneDialog({ open, onClose, inst, onDone }: { open: boolean; onClose: () => void; inst: ServerInstance; onDone: (c: ServerInstance) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    if (open) setName(`${inst.name} (copy)`);
  }, [open, inst.name]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Clone ${inst.name}`}
      description="Copies the profile, mods, launch options, automation and both config files to a new server with fresh ports. World saves are not copied – the new server starts with a fresh world and needs its own install."
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const c = await api.cloneInstance(inst.id, name.trim());
                toast('success', `Created ${c.name}`, 'Install its server files from the Overview.');
                onDone(c);
                onClose();
              } catch (e) {
                toast('error', 'Clone failed', errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Clone
          </Button>
        </>
      }
    >
      <Label>New server name</Label>
      <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
    </Dialog>
  );
}
