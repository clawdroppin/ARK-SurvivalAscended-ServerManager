export interface MapDef {
  id: string;
  name: string;
  kind: 'canon' | 'free' | 'premium' | 'mod' | 'new';
  hue: number;
  /** CurseForge mod the map needs (added to the server automatically). */
  modId?: number;
  /** Discovered by the live catalog, not known to this build. */
  isNew?: boolean;
}

/** Built-in list (offline fallback). The live catalog adds maps released after this build. */
export const MAPS: MapDef[] = [
  { id: 'TheIsland_WP', name: 'The Island', kind: 'canon', hue: 152 },
  { id: 'ScorchedEarth_WP', name: 'Scorched Earth', kind: 'canon', hue: 32 },
  { id: 'TheCenter_WP', name: 'The Center', kind: 'free', hue: 190 },
  { id: 'Aberration_WP', name: 'Aberration', kind: 'canon', hue: 280 },
  { id: 'Extinction_WP', name: 'Extinction', kind: 'canon', hue: 12 },
  { id: 'Ragnarok_WP', name: 'Ragnarok', kind: 'free', hue: 210 },
  { id: 'Valguero_WP', name: 'Valguero', kind: 'free', hue: 120 },
  { id: 'Astraeos_WP', name: 'Astraeos', kind: 'premium', hue: 48 },
  { id: 'LostColony_WP', name: 'Lost Colony', kind: 'canon', hue: 340 },
  { id: 'Genesis_WP', name: 'Genesis: Part 1', kind: 'canon', hue: 172 },
  { id: 'BobsMissions_WP', name: 'Club ARK', kind: 'mod', hue: 300, modId: 1005639 },
];

export interface LiveMap {
  id: string;
  name: string;
  modId?: number | null;
}

/** Stable pleasant hue from a map id, for maps this build has never seen. */
function hueFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

let registry: MapDef[] = MAPS;

/** Merge the live catalog into the registry; returns the merged list. */
export function mergeLiveMaps(live: LiveMap[]): MapDef[] {
  const merged = [...MAPS];
  for (const m of live) {
    const known = merged.find((x) => x.id.toLowerCase() === m.id.toLowerCase());
    if (known) {
      if (m.modId && !known.modId) known.modId = m.modId;
      continue;
    }
    merged.push({ id: m.id, name: m.name, kind: m.modId ? 'mod' : 'new', hue: hueFor(m.id), modId: m.modId ?? undefined, isNew: true });
  }
  registry = merged;
  return merged;
}

export const allMaps = () => registry;
export const mapName = (id: string) => registry.find((m) => m.id === id)?.name ?? id.replace(/_WP$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
export const mapHue = (id: string) => registry.find((m) => m.id === id)?.hue ?? hueFor(id);
