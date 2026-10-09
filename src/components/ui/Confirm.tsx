import { useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Button } from './Button';
import { Dialog } from './Surface';
import { Switch } from './Field';

interface ConfirmReq {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Optional checkbox, e.g. "also delete files". Its value is returned. */
  option?: string;
  resolve: (r: { ok: boolean; option: boolean }) => void;
}

const useConfirmStore = create<{ req: ConfirmReq | null; set: (r: ConfirmReq | null) => void }>((set) => ({
  req: null,
  set: (req) => set({ req }),
}));

export function confirm(opts: Omit<ConfirmReq, 'resolve'>): Promise<{ ok: boolean; option: boolean }> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...opts, resolve }));
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore();
  const [opt, setOpt] = useState(false);
  const close = (ok: boolean) => {
    req?.resolve({ ok, option: opt });
    setOpt(false);
    set(null);
  };
  return (
    <Dialog
      open={!!req}
      onClose={() => close(false)}
      title={req?.title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {req?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {req?.body && <div className="text-[13px] leading-relaxed text-fg-2">{req.body}</div>}
      {req?.option && (
        <label className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-bg-raised px-3 py-2.5 text-[12.5px] text-fg-2">
          <Switch checked={opt} onChange={setOpt} size="sm" />
          {req.option}
        </label>
      )}
    </Dialog>
  );
}
