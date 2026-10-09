// Regenerates docs/screenshots/*.png from the browser preview (mock backend).
// Usage: start `npm run dev` (port 1420), then `node scripts/screenshots.mjs`.
// Drives headless Microsoft Edge over the Chrome DevTools Protocol – no extra dependencies.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'docs', 'screenshots');
const EDGE = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const profile = join(process.env.TEMP ?? root, `asm-shots-${Date.now()}`);

const SHOTS = [
  ['dashboard', 'shot=dashboard', 4000],
  ['new-server', 'shot=dashboard&overlay=newServer', 4000],
  ['overview', 'shot=overview', 24000],
  ['presets', 'shot=settings&cat=presets', 3000],
  ['settings', 'shot=settings', 3000],
  ['stats', 'shot=settings&cat=stats', 3000],
  ['ini', 'shot=ini', 4000],
  ['launch', 'shot=launch', 3000],
  ['mods', 'shot=mods', 3000],
  ['console', 'shot=console', 6000],
  ['fix-issues', 'shot=diagnostics', 3000],
];

mkdirSync(outDir, { recursive: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Edge DevTools endpoint did not come up');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((r) => {
    const id = nextId++;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

  for (const [name, query, wait] of SHOTS) {
    await send('Page.navigate', { url: `http://localhost:1420/?${query}` });
    await sleep(wait);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(shot.result.data, 'base64'));
    console.log(`✓ ${name}.png`);
  }
  ws.close();
} finally {
  edge.kill();
  await sleep(800);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked – harmless temp dir */ }
}
