import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { useApp } from '@/store/app';
import { useBackendEvents } from '@/hooks/useBackendEvents';
import { errMsg } from '@/lib/ipc';
import { TitleBar } from '@/components/layout/TitleBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { TabBar } from '@/components/layout/TabBar';
import { TaskTray, Toaster } from '@/components/layout/Overlays';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ConfirmHost } from '@/components/ui/Confirm';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { Workspace } from '@/features/workspace/Workspace';
import { NewServerDialog } from '@/features/instances/NewServerDialog';
import { ImportDialog } from '@/features/instances/ImportDialog';
import { PrereqDialog } from '@/features/prereqs/PrereqDialog';
import { AppSettingsDialog } from '@/features/appsettings/AppSettingsDialog';

export function App() {
  const ready = useApp((s) => s.ready);
  const activeTab = useApp((s) => s.activeTab);
  const [error, setError] = useState<string | null>(null);
  useBackendEvents();

  useEffect(() => {
    useApp.getState().init().catch((e) => setError(errMsg(e)));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {!ready ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-fg-3">
          {error ? <span className="text-err">Failed to start: {error}</span> : <><Loader2 className="size-4 animate-spin" /> Loading…</>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col bg-bg">
            <TabBar />
            <div className="relative min-h-0 flex-1 bg-panel/40">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab ?? 'home'}
                  className="absolute inset-0"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                >
                  {activeTab ? <Workspace id={activeTab} /> : <Dashboard />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      )}
      <NewServerDialog />
      <ImportDialog />
      <PrereqDialog />
      <AppSettingsDialog />
      <CommandPalette />
      <ConfirmHost />
      <Toaster />
      <TaskTray />
    </div>
  );
}
