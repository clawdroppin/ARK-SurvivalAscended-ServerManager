import { AnimatePresence, motion } from 'motion/react';
import { LayoutGrid, X } from 'lucide-react';
import { useApp } from '@/store/app';
import { cn } from '@/lib/cn';
import { StatusDot } from '@/components/ui/Surface';

export function TabBar() {
  const openTabs = useApp((s) => s.openTabs);
  const activeTab = useApp((s) => s.activeTab);
  const instances = useApp((s) => s.instances);
  const statuses = useApp((s) => s.statuses);
  const { openTab, closeTab, goHome } = useApp.getState();

  return (
    <div className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-line bg-bg px-2" onAuxClick={(e) => e.preventDefault()}>
      <TabButton active={activeTab === null} onClick={goHome}>
        <LayoutGrid className="size-3.5" /> Dashboard
      </TabButton>
      <AnimatePresence initial={false}>
        {openTabs.map((id) => {
          const inst = instances.find((i) => i.id === id);
          if (!inst) return null;
          return (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.16 }}
              className="overflow-hidden"
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  closeTab(id);
                }
              }}
            >
              <TabButton active={activeTab === id} onClick={() => openTab(id)} onClose={() => closeTab(id)}>
                <StatusDot state={statuses[id]?.state} />
                <span className="max-w-[160px] truncate">{inst.name}</span>
              </TabButton>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, onClose, children }: { active: boolean; onClick: () => void; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex h-8 items-center gap-2 rounded-t-lg px-3 text-[12px] font-medium whitespace-nowrap transition-colors duration-150',
        active ? 'bg-panel text-fg' : 'text-fg-3 hover:bg-panel/50 hover:text-fg-2',
      )}
    >
      {active && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-px bg-accent" transition={{ type: 'spring', stiffness: 600, damping: 45 }} />}
      {children}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn('-mr-1 rounded p-0.5 text-fg-4 hover:bg-hover hover:text-fg', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
          aria-label="Close tab"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
