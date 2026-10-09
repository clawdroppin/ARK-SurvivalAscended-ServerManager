/**
 * Lossless ARK INI document for the editors. Mirrors src-tauri/src/core/ini.rs:
 * case-insensitive sections/keys, repeatable keys, indexed keys (`Key[3]`), struct values, and
 * untouched lines are preserved byte-for-byte so ASA-written content survives round trips.
 */

type Line =
  | { t: 'section'; name: string; raw: string }
  | { t: 'pair'; key: string; value: string; raw?: string }
  | { t: 'other'; raw: string };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export interface OutlineEntry {
  section: string;
  key: string;
  value: string;
  line: number;
}

export class IniDoc {
  private constructor(private lines: Line[]) {}

  static parse(text: string): IniDoc {
    const lines: Line[] = [];
    for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
      const t = raw.trim();
      if (t.startsWith('[') && t.endsWith(']') && t.length >= 2) {
        lines.push({ t: 'section', name: t.slice(1, -1).trim(), raw });
      } else if (!t || t.startsWith(';') || t.startsWith('#')) {
        lines.push({ t: 'other', raw });
      } else {
        const i = raw.indexOf('=');
        if (i >= 0) lines.push({ t: 'pair', key: raw.slice(0, i).trim(), value: raw.slice(i + 1), raw });
        else lines.push({ t: 'other', raw });
      }
    }
    // A trailing newline produces one empty line – drop it so toText() round-trips.
    if (lines.length && lines[lines.length - 1].t === 'other' && lines[lines.length - 1].raw === '') lines.pop();
    return new IniDoc(lines);
  }

  clone(): IniDoc {
    return new IniDoc(this.lines.slice());
  }

  private range(section: string): [number, number] | null {
    const s = this.lines.findIndex((l) => l.t === 'section' && eq(l.name, section));
    if (s < 0) return null;
    let e = s + 1;
    while (e < this.lines.length && this.lines[e].t !== 'section') e++;
    return [s, e];
  }

  private ensureSection(section: string): [number, number] {
    const r = this.range(section);
    if (r) return r;
    const last = this.lines[this.lines.length - 1];
    if (last && !(last.t === 'other' && !last.raw.trim())) this.lines.push({ t: 'other', raw: '' });
    this.lines.push({ t: 'section', name: section, raw: `[${section}]` });
    return [this.lines.length - 1, this.lines.length];
  }

  get(section: string, key: string): string | undefined {
    const r = this.range(section);
    if (!r) return undefined;
    for (let i = r[0] + 1; i < r[1]; i++) {
      const l = this.lines[i];
      if (l.t === 'pair' && eq(l.key, key)) return l.value.trim();
    }
    return undefined;
  }

  getAll(section: string, key: string): string[] {
    const r = this.range(section);
    if (!r) return [];
    const out: string[] = [];
    for (let i = r[0] + 1; i < r[1]; i++) {
      const l = this.lines[i];
      if (l.t === 'pair' && eq(l.key, key)) out.push(l.value.trim());
    }
    return out;
  }

  has(section: string, key: string) {
    return this.get(section, key) !== undefined;
  }

  /** Set a single-valued key (first occurrence replaced, later duplicates removed). */
  set(section: string, key: string, value: string) {
    let [s, e] = this.ensureSection(section);
    let found = false;
    let lastPair = s;
    for (let i = s + 1; i < e; i++) {
      const l = this.lines[i];
      if (l.t !== 'pair') continue;
      if (eq(l.key, key)) {
        if (!found) {
          this.lines[i] = { t: 'pair', key, value };
          found = true;
        } else {
          this.lines.splice(i, 1);
          i--;
          e--;
          continue;
        }
      }
      lastPair = i;
    }
    if (!found) this.lines.splice(lastPair + 1, 0, { t: 'pair', key, value });
  }

  remove(section: string, key: string) {
    const r = this.range(section);
    if (!r) return;
    let [s, e] = r;
    for (let i = s + 1; i < e; i++) {
      const l = this.lines[i];
      if (l.t === 'pair' && eq(l.key, key)) {
        this.lines.splice(i, 1);
        i--;
        e--;
      }
    }
  }

  /** Replace every occurrence of a repeatable key with `values`, keeping its position. */
  setAll(section: string, key: string, values: string[]) {
    const [s, e] = this.ensureSection(section);
    let insertAt = -1;
    let lastPair = -1;
    const kept: Line[] = [];
    for (let i = s + 1; i < e; i++) {
      const l = this.lines[i];
      if (l.t === 'pair' && eq(l.key, key)) {
        if (insertAt < 0) insertAt = kept.length;
        continue;
      }
      if (l.t === 'pair') lastPair = kept.length;
      kept.push(l);
    }
    const at = insertAt >= 0 ? insertAt : lastPair + 1;
    const fresh: Line[] = values.map((v) => ({ t: 'pair', key, value: v }));
    kept.splice(at, 0, ...fresh);
    this.lines.splice(s + 1, e - s - 1, ...kept);
  }

  /** All keys in a section matching `prefix[` → map of index → value. */
  getIndexed(section: string, prefix: string): Record<number, string> {
    const r = this.range(section);
    const out: Record<number, string> = {};
    if (!r) return out;
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]$`, 'i');
    for (let i = r[0] + 1; i < r[1]; i++) {
      const l = this.lines[i];
      if (l.t !== 'pair') continue;
      const m = re.exec(l.key);
      if (m) out[Number(m[1])] = l.value.trim();
    }
    return out;
  }

  /** Remove every `prefix[n]` key in a section. */
  removeIndexed(section: string, prefix: string) {
    const r = this.range(section);
    if (!r) return;
    let [s, e] = r;
    const p = prefix.toLowerCase() + '[';
    for (let i = s + 1; i < e; i++) {
      const l = this.lines[i];
      if (l.t === 'pair' && l.key.toLowerCase().startsWith(p)) {
        this.lines.splice(i, 1);
        i--;
        e--;
      }
    }
  }

  outline(): OutlineEntry[] {
    const out: OutlineEntry[] = [];
    let section = '';
    this.lines.forEach((l, i) => {
      if (l.t === 'section') section = l.name;
      else if (l.t === 'pair') out.push({ section, key: l.key, value: l.value.trim(), line: i + 1 });
    });
    return out;
  }

  sections(): string[] {
    return this.lines.flatMap((l) => (l.t === 'section' ? [l.name] : []));
  }

  toText(): string {
    return (
      this.lines
        .map((l) => (l.t === 'section' ? l.raw : l.t === 'other' ? l.raw : l.raw ?? `${l.key}=${l.value}`))
        .join('\r\n') + '\r\n'
    );
  }
}

// ── Value helpers ─────────────────────────────────────────────────────────────────

export function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

export function formatNumber(n: number, type: 'int' | 'float'): string {
  if (type === 'int') return String(Math.round(n));
  if (Number.isInteger(n)) return n.toFixed(1);
  return String(Number(n.toFixed(6)));
}

/** Parse an Unreal struct literal `(A=1,B="x",C=(D=2))` into a flat key→raw-value map (top level only). */
export function parseStruct(src: string): Record<string, string> {
  const s = src.trim().replace(/^\(/, '').replace(/\)$/, '');
  const out: Record<string, string> = {};
  let depth = 0;
  let quote = false;
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') quote = !quote;
    else if (!quote && c === '(') depth++;
    else if (!quote && c === ')') depth--;
    else if (!quote && depth === 0 && c === ',') {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return out;
}

export function unquote(v: string | undefined): string {
  if (!v) return '';
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}
