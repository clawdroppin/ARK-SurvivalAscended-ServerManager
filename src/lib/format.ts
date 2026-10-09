export function bytes(n: number | undefined | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${u[i]}`;
}

export const rate = (bps: number | undefined | null) => (bps == null ? '—' : `${bytes(bps)}/s`);

export function duration(secs: number | undefined | null): string {
  if (secs == null) return '—';
  const s = Math.max(0, Math.floor(secs));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Human-friendly seconds value for setting hints (e.g. 86400 → "1 day"). */
export function secondsHuman(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (v === 0) return 'off';
  const units: [number, string][] = [[604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
  for (const [n, name] of units) {
    if (v >= n) {
      const q = v / n;
      const r = Math.round(q * 10) / 10;
      return `${r} ${name}${r === 1 ? '' : 's'}`;
    }
  }
  return `${v} s`;
}

export function relTime(ms: number | undefined | null): string {
  if (!ms) return '—';
  const diff = (Date.now() - ms) / 1000;
  const fut = diff < 0;
  const a = Math.abs(diff);
  let s: string;
  if (a < 45) s = 'moments';
  else if (a < 3600) s = `${Math.round(a / 60)} min`;
  else if (a < 86400) s = `${Math.round(a / 3600)} h`;
  else s = `${Math.round(a / 86400)} d`;
  return fut ? `in ${s}` : `${s} ago`;
}

export const compact = (n: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
