# AGENTS.md – guide for AI assistants and contributors

This file is the hand-off document for anyone (human or AI model) continuing work on **ASA Server Manager**, a Windows desktop app for running *ARK: Survival Ascended* dedicated servers. Read it fully before changing code. `CLAUDE.md` points here.

---

## 1. What the app is

A Tauri v2 desktop app: **Rust backend** (all process, file, network and SteamCMD work, on tokio) + **React frontend** (UI only, talks to Rust through typed `invoke` commands and events). Windows-only by design – ASA's dedicated server is a Windows binary.

Core capabilities: prerequisite installer · SteamCMD install/update/validate · multi-server profiles & clusters · graphical editor for 334 INI settings + presets + raw INI editor · launch options · CurseForge mods · RCON console/players · live telemetry · backups/saves/rollback · automation (crash restart, schedules, backups, update checks) · one-click "Fix Server Issues" diagnostics · installer *and* portable editions · live map catalog.

## 2. Stack & commands

| Layer | Tech |
|---|---|
| Shell | Tauri 2 (`src-tauri/tauri.conf.json`, window created in code – see §5) |
| Backend | Rust 2021, tokio, reqwest (native-tls), sysinfo, rusqlite (bundled), zip, regex |
| Frontend | React 19, TypeScript 7, Vite 8, Tailwind CSS 4, Motion (framer-motion), Zustand, CodeMirror 6, cmdk, lucide-react |

```bash
npm install
npm run tauri dev          # full app, hot reload (Rust rebuilds on change)
npm run dev                # UI only in a browser with the MOCK backend (src/lib/devMock.ts)
npx tsc -p tsconfig.json --noEmit     # typecheck frontend
cd src-tauri && cargo test --lib      # Rust unit tests
cd src-tauri && cargo check           # must stay warning-free
npm run build:installer    # NSIS + MSI  -> src-tauri/target/release/bundle/
npm run build:portable     # portable    -> release/ASA-Server-Manager-Portable-<ver>/ (+ .zip)
npm run build:all          # both
node scripts/screenshots.mjs          # regenerate docs/screenshots (needs `npm run dev` running)
```

## 3. Repository map

```
src-tauri/src/
  lib.rs              app setup: resolves data dir, creates the main window, registers commands, starts supervisor
  commands.rs         every #[tauri::command] (thin; delegates to core/*). Errors -> AppError (serialised as string)
  state.rs            AppState (settings, instances, runtime map, RCON pool, locks), TaskReporter, safe JSON IO
  models.rs           persisted & event types (serde camelCase) – ASA_APP_ID lives here
  paths.rs            installed vs portable data dir, path re-rooting when a portable folder moves
  error.rs            AppError / AppResult
  core/
    ini.rs            lossless ARK INI document + validator (mirrored by src/lib/ini.ts)
    server.rs         launch-line builder, INI sync of profile keys, start/stop, RCON access, restart w/ warnings
    supervisor.rs     single background loop: process tracking, telemetry, log tail, chat, crash restart, scheduler
    steamcmd.rs       bootstrap, app_update with retries + error explanations, build ids
    jobs.rs           install/update/check-update jobs (steam_lock, shared latest-build cache)
    diagnostics.rs    "Fix Server Issues" pipeline (steps emit `diagnostics` events)
    prereqs.rs        checks + one-UAC installer (VC++, Amazon certs, DirectX, SteamCMD)
    saves.rs          SQLite .ark integrity checks, WAL checkpoint, rollback to snapshot
    archive.rs        backups, .asapack export/import
    curseforge.rs     CurseForge API (gameId 83374), user-supplied key
    maps.rs           live map catalog parsed from the ARK wiki, cached 24 h
    rcon.rs a2s.rs    RCON client (tokio TCP), A2S probe (best effort)
    proc.rs           hidden process spawning, elevation, PID discovery, port owners
src/
  App.tsx main.tsx    root; main.tsx installs the mock backend ONLY in browser dev (isTauri() false)
  store/app.ts        global Zustand store (instances, statuses, telemetry, logs, tasks, toasts, maps)
  hooks/              backend event bridge, server lifecycle actions
  lib/                ipc.ts (typed commands), types.ts (mirrors Rust models), ini.ts, format.ts, cn.ts, devMock.ts
  data/
    settings.generated.ts   GENERATED catalog – never hand-edit (see §6)
    stats.ts listEditors.ts launchOptions.ts maps.ts presets.ts types.ts
  features/<view>/    one folder per view (overview, settings, ini, launch, mods, console, players, backups, automation, diagnostics, instances, prereqs, appsettings, dashboard, workspace)
  components/ui, layout     design-system primitives and app shell
scripts/              gen_settings.py, parse_wiki.py, build-portable.mjs, screenshots.mjs
.github/workflows/    ci.yml (typecheck/test/build), release.yml (tag -> GitHub Release)
```

## 4. Data flow

- **UI → Rust:** `src/lib/ipc.ts` wraps every command. Add a command in three places: `commands.rs`, `lib.rs` `generate_handler!`, and `ipc.ts` (+ `types.ts` if it returns a new shape).
- **Rust → UI events:** `server-status`, `telemetry`, `log-lines` (batched), `task` (progress for long jobs), `server-event` (toasts), `diagnostics`, `backup-created`. Bridged in `src/hooks/useBackendEvents.ts`.
- **Long jobs** use `TaskReporter` (progress + log lines + done/fail) so they appear in the task tray. Cancellable jobs register a flag in `AppState.cancels`.
- **INI editing:** both the graphical editor and the raw editor operate on the same per-server **draft text** (`features/settings/useConfigDraft.ts`). Nothing touches disk until Save → `write_config`.

## 5. Invariants & gotchas (read these!)

1. **Steam AppID is `2430930`** (the free *ARK Survival Ascended Dedicated Server* tool). `2399830` is the *game* and fails with "No subscription". It's `ASA_APP_ID` in `models.rs`.
2. **ASA rewrites `GameUserSettings.ini` on shutdown.** Configs saved while a server runs are stored in `Runtime.pending_configs` and re-applied after the process exits (`server::apply_pending_configs`). Keep this behaviour.
3. **Passwords and session names never go on the command line** (visible to every process). `server::sync_core_ini` writes profile-owned keys into GUS on every start; `build_args` only puts ports/map/flags on the URL. Command-line args are passed with `raw_arg` for exact quoting.
4. **INI files must round-trip losslessly** – unknown lines, comments, ordering, repeated keys (`ConfigOverrideItemMaxQuantity=` …), indexed keys (`Key[3]=`) and struct values. Use `IniDoc` (`ini.rs` / `ini.ts`); never regex-replace INI text. `set()` replaces one key, `setAll()` handles repeatable keys, `removeIndexed()` clears `Key[n]`.
5. **Setting file placement matters:** a key in the wrong file (GUS vs Game.ini) is silently ignored by ARK. The catalog records the file; presets must use `gus()` / `game()` accordingly – run `python scripts/check_presets.py` after editing presets.
6. **The mock backend must never ship.** `main.tsx` installs it only when `import.meta.env.DEV && !isTauri()`. Don't import `devMock` anywhere else.
7. **SteamCMD is single-instance:** wrap any steamcmd call in `state.steam_lock`. Update checks share `latest_build_cache` (10 min).
8. **Never lose user data:** `write_json_atomic` keeps a `.bak`; `load_json_safe` preserves unreadable files as `.corrupt-<ts>`. Save rollbacks and restores move files to `_quarantine`. Deleting a server keeps its `Backups` folder. Config history (`_history`) is pruned to 30 per file.
9. **Data locations:** installed → `%APPDATA%\com.asaservermanager.app`; portable (a `portable.txt` beside the exe) → `<exe dir>\data`, including the WebView2 profile (which is why the main window is created in `lib.rs` with `"create": false` in the config). Stored absolute paths are re-rooted when the portable folder moves (`paths::rebase`).
10. **Backups** default to `<server install dir>\Backups`, or `<override>\<server id>` if App settings sets a folder. The pre-0.2 location `<data>\backups\<id>` is still listed for restores.
11. **Heavy work stays off the UI thread:** blocking IO goes through `spawn_blocking` (`commands::blocking`). The supervisor is one tokio task; don't add per-instance loops.
12. **Windows quirks:** spawn helpers with `CREATE_NO_WINDOW` (`proc::hidden_command`); elevation goes through `proc::powershell_elevated` (one UAC prompt, transcript captured).
13. **Facts, not guesses, about ASA:** when unsure about a setting, RCON command or file layout, check the ARK wiki server configuration page and verify. Vanilla RCON exposes no tick rate or inventories – the UI says so honestly.

## 6. The settings catalog

`src/data/settings.generated.ts` (334 entries) is produced by `scripts/gen_settings.py` from a parsed copy of the ARK wiki's server-configuration page:

```bash
curl -sL "https://ark.wiki.gg/wiki/Server_configuration?action=raw" -o wiki.txt
python scripts/parse_wiki.py wiki.txt vars.json
python scripts/gen_settings.py vars.json src/data/settings.generated.ts
```

The generator holds the hand-written descriptions (`D`), categories (`RULES`/`OVERRIDE_CAT`), slider ranges (`R`), skips (`SKIP` – profile-managed/structured keys) and audited extras (item stat clamps, legacy keys). **Edit the generator, not the output.** Descriptions are written in our own words – don't paste wiki prose (licence). Structured Game.ini lists live in `data/listEditors.ts`, stat grids in `data/stats.ts`, command-line options in `data/launchOptions.ts`.

To audit coverage after a game patch: re-download the wiki page, re-parse it, then run `python scripts/audit_coverage.py vars.json` – it lists every ASA option not exposed by the catalog, list editors, stat grids, launch options or the profile.

## 7. Verifying changes

- Rust: `cargo check` (zero warnings) and `cargo test --lib`. Add unit tests next to the code for parsers and pure logic.
- Frontend: `npx tsc -p tsconfig.json --noEmit`; then `npm run dev` and click through the affected view in a browser (mock backend). Extend `devMock.ts` when you add commands so the preview keeps working.
- Real backend: `npm run tauri dev`. When killing a dev run, make sure `asa-server-manager.exe` is gone too, otherwise WebView2's profile stays locked ("resource in use" on next launch).
- Releases: `npm run build:all` must succeed locally before tagging.

## 8. Releasing

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`; add a `CHANGELOG.md` entry.
2. Commit, then `git tag vX.Y.Z && git push --tags`.
3. `.github/workflows/release.yml` builds on `windows-latest` and publishes `ASA-Server-Manager-Setup.exe`, `ASA-Server-Manager.msi` and `ASA-Server-Manager-Portable.zip` (stable names so README links to `releases/latest/download/...` keep working).

## 9. Code style

- Match the surrounding code: small focused modules, explicit types, comments only where intent isn't obvious.
- Frontend: Tailwind utility classes with the design tokens in `src/index.css` (`bg-panel`, `text-fg-3`, `accent` …), `cn()` (tailwind-merge) for class merging, UI primitives from `components/ui`. Animations 150–200 ms.
- Rust: return `AppResult<T>`; user-facing errors should say what to do next.
- Keep the app honest: if ASA can't do something, say so in the UI instead of faking it.

## 10. Known limitations & ideas for next steps

- Not yet battle-tested against many real servers: RCON command set (KickPlayer/BanPlayer/AllowPlayerToJoinNoCheck/ServerChatToPlayer), crash-log mod matching heuristics and certificate/firewall installers deserve real-world verification.
- No code signing → SmartScreen warning. Consider an OV/EV certificate and Tauri's updater plugin for auto-updates.
- A2S is best effort (ASA uses EOS). An EOS server-list lookup could show public visibility.
- Ideas: auto-updater, Discord webhooks for events, per-cluster bulk actions, mod bisect mode, Linux/Proton support, localisation, unit tests for presets/apply logic in TS (vitest).
- Coverage audit method: parse every `{{Server config variable}}` from the wiki (`parse_wiki.py`), drop `inASA = No` and DynamicConfig, then check each name exists in the catalog, list editors, stat grids, launch options or the profile-managed set. Remaining intentional exclusions: official-host-only switches (Nitrado/official versioning), save-format migration flags, renderer/engine flags (`-vulkan`, `-d3d11`, `-game`, `-server`).
