import { create } from 'zustand';
import { api, errMsg } from '@/lib/ipc';
import { MAPS, mergeLiveMaps, type MapDef } from '@/data/maps';
import type {
  AppInfo,
  AppSettings,
  LogBatch,
  ServerInstance,
  ServerStatus,
  TaskEvent,
  TelemetrySample,
} from '@/lib/types';

export type View =
  | 'overview'
  | 'settings'
  | 'launch'
  | 'ini'
  | 'mods'
  | 'console'
  | 'players'
  | 'backups'
  | 'diagnostics'
  | 'automation';

export interface LogEntry {
  n: number;
  source: string;
  line: string;
  ts: number;
}

export interface Toast {
  id: number;
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body?: string;
}

export interface TaskState extends TaskEvent {
  startedAt: number;
  updatedAt: number;
}

type Overlay = 'newServer' | 'import' | 'prereqs' | 'appSettings' | 'palette' | null;

const TELEMETRY_KEEP = 150;
const LOG_KEEP = 4000;
let logCounter = 0;
let toastCounter = 0;

interface Store {
  ready: boolean;
  appInfo?: AppInfo;
  settings?: AppSettings;
  instances: ServerInstance[];
  statuses: Record<string, ServerStatus>;
  openTabs: string[];
  activeTab: string | null;
  views: Record<string, View>;
  telemetry: Record<string, TelemetrySample[]>;
  logs: Record<string, LogEntry[]>;
  tasks: Record<string, TaskState>;
  toasts: Toast[];
  overlay: Overlay;
  maps: MapDef[];
  mapsMeta: { source: 'live' | 'cache' | 'none' | 'builtin'; fetchedAt?: number | null; error?: string | null; loading: boolean };

  refreshMaps: (force?: boolean) => Promise<void>;
  init: () => Promise<void>;
  refreshInstances: () => Promise<void>;
  upsertInstance: (i: ServerInstance) => void;
  removeInstance: (id: string) => void;
  saveInstance: (i: ServerInstance) => Promise<ServerInstance | undefined>;
  setStatus: (s: ServerStatus) => void;
  pushTelemetry: (t: TelemetrySample) => void;
  pushLogs: (b: LogBatch) => void;
  clearLogs: (id: string) => void;
  upsertTask: (t: TaskEvent) => void;
  dismissTask: (taskId: string) => void;
  toast: (level: Toast['level'], title: string, body?: string) => void;
  dismissToast: (id: number) => void;
  openTab: (id: string, view?: View) => void;
  closeTab: (id: string) => void;
  goHome: () => void;
  setView: (id: string, view: View) => void;
  setOverlay: (o: Overlay) => void;
  saveSettings: (s: AppSettings) => Promise<void>;
}

const persisted = (() => {
  try {
    return JSON.parse(localStorage.getItem('asa-ui') ?? '{}') as { openTabs?: string[]; activeTab?: string | null; views?: Record<string, View> };
  } catch {
    return {};
  }
})();

export const useApp = create<Store>((set, get) => ({
  ready: false,
  instances: [],
  statuses: {},
  openTabs: persisted.openTabs ?? [],
  activeTab: persisted.activeTab ?? null,
  views: persisted.views ?? {},
  telemetry: {},
  logs: {},
  tasks: {},
  toasts: [],
  overlay: null,
  maps: MAPS,
  mapsMeta: { source: 'builtin', loading: false },

  refreshMaps: async (force = false) => {
    set((s) => ({ mapsMeta: { ...s.mapsMeta, loading: true } }));
    try {
      const c = await api.mapCatalog(force);
      const maps = mergeLiveMaps(c.maps);
      set({ maps, mapsMeta: { source: c.source, fetchedAt: c.fetchedAt, error: c.error, loading: false } });
      // Announce only maps this user hasn't been told about before.
      let seen: string[] = [];
      try {
        seen = JSON.parse(localStorage.getItem('seen-maps') ?? '[]');
        localStorage.setItem('seen-maps', JSON.stringify(maps.map((m) => m.id)));
      } catch {
        /* storage unavailable – skip announcements */
        seen = maps.map((m) => m.id);
      }
      const added = maps.filter((m) => m.isNew && !seen.includes(m.id));
      if (added.length && get().ready) get().toast('info', `New map${added.length > 1 ? 's' : ''} available`, added.map((m) => m.name).join(', '));
    } catch (e) {
      set((s) => ({ mapsMeta: { ...s.mapsMeta, loading: false, error: errMsg(e) } }));
    }
  },

  init: async () => {
    const [appInfo, settings, instances, statuses] = await Promise.all([
      api.appInfo(),
      api.getSettings(),
      api.listInstances(),
      api.getStatuses(),
    ]);
    const ids = new Set(instances.map((i) => i.id));
    const openTabs = get().openTabs.filter((t) => ids.has(t));
    const activeTab = get().activeTab && ids.has(get().activeTab!) ? get().activeTab : null;
    set({
      appInfo,
      settings,
      instances,
      statuses: Object.fromEntries(statuses.map((s) => [s.id, s])),
      openTabs,
      activeTab,
      ready: true,
      overlay: settings.onboardingComplete ? null : 'prereqs',
    });
    // Live map catalog – non-blocking; the built-in list is used until it arrives.
    get().refreshMaps();
  },

  refreshInstances: async () => {
    const [instances, statuses] = await Promise.all([api.listInstances(), api.getStatuses()]);
    set({ instances, statuses: Object.fromEntries(statuses.map((s) => [s.id, s])) });
  },

  upsertInstance: (i) =>
    set((s) => {
      const exists = s.instances.some((x) => x.id === i.id);
      return { instances: exists ? s.instances.map((x) => (x.id === i.id ? i : x)) : [...s.instances, i] };
    }),

  removeInstance: (id) =>
    set((s) => ({
      instances: s.instances.filter((x) => x.id !== id),
      openTabs: s.openTabs.filter((t) => t !== id),
      activeTab: s.activeTab === id ? null : s.activeTab,
    })),

  saveInstance: async (i) => {
    try {
      const saved = await api.updateInstance(i);
      get().upsertInstance(saved);
      return saved;
    } catch (e) {
      get().toast('error', 'Could not save server profile', errMsg(e));
      return undefined;
    }
  },

  setStatus: (st) => set((s) => ({ statuses: { ...s.statuses, [st.id]: st } })),

  pushTelemetry: (t) =>
    set((s) => {
      const prev = s.telemetry[t.id] ?? [];
      const next = prev.length >= TELEMETRY_KEEP ? [...prev.slice(prev.length - TELEMETRY_KEEP + 1), t] : [...prev, t];
      return { telemetry: { ...s.telemetry, [t.id]: next } };
    }),

  pushLogs: (b) =>
    set((s) => {
      const key = b.id || '_global';
      const prev = s.logs[key] ?? [];
      const add = b.lines.map((line) => ({ n: ++logCounter, source: b.source, line, ts: b.ts }));
      const merged = prev.concat(add);
      return { logs: { ...s.logs, [key]: merged.length > LOG_KEEP ? merged.slice(merged.length - LOG_KEEP) : merged } };
    }),

  clearLogs: (id) => set((s) => ({ logs: { ...s.logs, [id]: [] } })),

  upsertTask: (t) =>
    set((s) => {
      const prev = s.tasks[t.taskId];
      const now = Date.now();
      return { tasks: { ...s.tasks, [t.taskId]: { ...t, startedAt: prev?.startedAt ?? now, updatedAt: now } } };
    }),

  dismissTask: (taskId) =>
    set((s) => {
      const { [taskId]: _, ...rest } = s.tasks;
      return { tasks: rest };
    }),

  toast: (level, title, body) => {
    const id = ++toastCounter;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, level, title, body }] }));
    setTimeout(() => get().dismissToast(id), level === 'error' ? 9000 : 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  openTab: (id, view) =>
    set((s) => ({
      openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
      activeTab: id,
      views: view ? { ...s.views, [id]: view } : s.views,
    })),
  closeTab: (id) =>
    set((s) => {
      const idx = s.openTabs.indexOf(id);
      const openTabs = s.openTabs.filter((t) => t !== id);
      const activeTab = s.activeTab === id ? (openTabs[idx] ?? openTabs[idx - 1] ?? null) : s.activeTab;
      return { openTabs, activeTab };
    }),
  goHome: () => set({ activeTab: null }),
  setView: (id, view) => set((s) => ({ views: { ...s.views, [id]: view } })),
  setOverlay: (overlay) => set({ overlay }),

  saveSettings: async (settings) => {
    await api.saveSettings(settings);
    set({ settings, appInfo: await api.appInfo() });
  },
}));

// Persist tab layout between sessions.
useApp.subscribe((s, prev) => {
  if (s.openTabs !== prev.openTabs || s.activeTab !== prev.activeTab || s.views !== prev.views) {
    try {
      localStorage.setItem('asa-ui', JSON.stringify({ openTabs: s.openTabs, activeTab: s.activeTab, views: s.views }));
    } catch {
      /* storage unavailable */
    }
  }
});

export const useInstance = (id: string | null | undefined) =>
  useApp((s) => (id ? s.instances.find((i) => i.id === id) : undefined));
export const useStatus = (id: string | null | undefined) => useApp((s) => (id ? s.statuses[id] : undefined));
