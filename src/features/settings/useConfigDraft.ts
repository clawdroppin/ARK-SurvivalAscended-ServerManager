import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { api, errMsg, GAME, GUS, type IniFileName } from '@/lib/ipc';
import { IniDoc } from '@/lib/ini';
import { useApp } from '@/store/app';

/**
 * Unsaved INI drafts per instance. Both the graphical settings editor and the raw INI editor read
 * and write the same draft text, so switching views never loses edits and the two stay in sync.
 */
interface Draft {
  loaded: boolean;
  loading: boolean;
  orig: Record<IniFileName, string>;
  text: Record<IniFileName, string>;
  saving: boolean;
}

interface DraftStore {
  drafts: Record<string, Draft>;
  load: (id: string, force?: boolean) => Promise<void>;
  setText: (id: string, file: IniFileName, text: string) => void;
  edit: (id: string, file: IniFileName, fn: (doc: IniDoc) => void) => void;
  editBoth: (id: string, fn: (gus: IniDoc, game: IniDoc) => void) => void;
  discard: (id: string) => void;
  save: (id: string) => Promise<boolean>;
}

const empty = (): Draft => ({
  loaded: false,
  loading: false,
  orig: { [GUS]: '', [GAME]: '' } as Record<IniFileName, string>,
  text: { [GUS]: '', [GAME]: '' } as Record<IniFileName, string>,
  saving: false,
});

export const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

export const useDraftStore = create<DraftStore>((set, get) => ({
  drafts: {},

  load: async (id, force) => {
    const cur = get().drafts[id];
    if (cur?.loading || (cur?.loaded && !force)) return;
    set((s) => ({ drafts: { ...s.drafts, [id]: { ...(cur ?? empty()), loading: true } } }));
    try {
      const [g, m] = await Promise.all([api.readConfig(id, GUS), api.readConfig(id, GAME)]);
      const gameText = m.text.trim() ? m.text : '[/script/shootergame.shootergamemode]\r\n';
      set((s) => ({
        drafts: {
          ...s.drafts,
          [id]: { loaded: true, loading: false, saving: false, orig: { [GUS]: g.text, [GAME]: gameText } as Record<IniFileName, string>, text: { [GUS]: g.text, [GAME]: gameText } as Record<IniFileName, string> },
        },
      }));
    } catch (e) {
      set((s) => ({ drafts: { ...s.drafts, [id]: { ...(s.drafts[id] ?? empty()), loading: false } } }));
      useApp.getState().toast('error', 'Could not read config files', errMsg(e));
    }
  },

  setText: (id, file, text) =>
    set((s) => {
      const d = s.drafts[id] ?? empty();
      return { drafts: { ...s.drafts, [id]: { ...d, text: { ...d.text, [file]: text } } } };
    }),

  edit: (id, file, fn) => {
    const d = get().drafts[id];
    if (!d) return;
    const doc = IniDoc.parse(d.text[file]);
    fn(doc);
    get().setText(id, file, doc.toText());
  },

  editBoth: (id, fn) => {
    const d = get().drafts[id];
    if (!d) return;
    const g = IniDoc.parse(d.text[GUS]);
    const m = IniDoc.parse(d.text[GAME]);
    fn(g, m);
    set((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], text: { [GUS]: g.toText(), [GAME]: m.toText() } as Record<IniFileName, string> } } }));
  },

  discard: (id) =>
    set((s) => {
      const d = s.drafts[id];
      return d ? { drafts: { ...s.drafts, [id]: { ...d, text: { ...d.orig } } } } : s;
    }),

  save: async (id) => {
    const d = get().drafts[id];
    if (!d) return false;
    set((s) => ({ drafts: { ...s.drafts, [id]: { ...d, saving: true } } }));
    try {
      let deferred = false;
      for (const f of [GUS, GAME]) {
        if (norm(d.text[f]) !== norm(d.orig[f])) {
          const r = await api.writeConfig(id, f, d.text[f]);
          deferred ||= r.deferred;
        }
      }
      set((s) => ({ drafts: { ...s.drafts, [id]: { ...d, saving: false, orig: { ...d.text } } } }));
      useApp
        .getState()
        .toast(
          'success',
          'Configuration saved',
          deferred ? 'The server is running – changes take effect after a restart (and are re-applied automatically because ASA rewrites its config on shutdown).' : undefined,
        );
      return true;
    } catch (e) {
      set((s) => ({ drafts: { ...s.drafts, [id]: { ...d, saving: false } } }));
      useApp.getState().toast('error', 'Save failed', errMsg(e));
      return false;
    }
  },
}));

/** Parsed documents + helpers for one instance. */
export function useConfigDraft(id: string) {
  const draft = useDraftStore((s) => s.drafts[id]);
  const { load, edit, editBoth, discard, save, setText } = useDraftStore.getState();
  useEffect(() => {
    load(id);
  }, [id, load]);

  const gusText = draft?.text[GUS] ?? '';
  const gameText = draft?.text[GAME] ?? '';
  const gus = useMemo(() => IniDoc.parse(gusText), [gusText]);
  const game = useMemo(() => IniDoc.parse(gameText), [gameText]);
  const dirtyFiles = draft
    ? [GUS, GAME].filter((f) => norm(draft.text[f]) !== norm(draft.orig[f]))
    : [];

  return {
    loaded: !!draft?.loaded,
    saving: !!draft?.saving,
    gus,
    game,
    text: draft?.text,
    orig: draft?.orig,
    dirtyFiles,
    edit: useCallback((file: IniFileName, fn: (d: IniDoc) => void) => edit(id, file, fn), [id, edit]),
    editBoth: useCallback((fn: (g: IniDoc, m: IniDoc) => void) => editBoth(id, fn), [id, editBoth]),
    setText: useCallback((file: IniFileName, t: string) => setText(id, file, t), [id, setText]),
    discard: () => discard(id),
    save: () => save(id),
    reload: () => load(id, true),
  };
}
