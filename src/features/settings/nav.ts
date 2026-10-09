import { create } from 'zustand';

/** Cross-component request to scroll the settings editor to a specific key. */
export const useSettingsNav = create<{
  focusKey: string | null;
  focusCategory: string | null;
  nonce: number;
  focus: (key: string, category: string) => void;
  clear: () => void;
}>((set) => ({
  focusKey: null,
  focusCategory: null,
  nonce: 0,
  focus: (focusKey, focusCategory) => set((s) => ({ focusKey, focusCategory, nonce: s.nonce + 1 })),
  clear: () => set({ focusKey: null, focusCategory: null }),
}));
