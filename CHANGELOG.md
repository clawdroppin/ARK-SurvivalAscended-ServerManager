# Changelog

## v0.1.1

- First downloadable release (v0.1.0 was tagged but its release packaging failed).
- Release workflow: stable asset names, SHA256 checksums, only hyphenated tags are pre-releases.

## v0.1.0 – first public release

- Desktop app (Tauri 2 + Rust + React) for ARK: Survival Ascended dedicated servers on Windows.
- First-run prerequisite installer: VC++ runtime, Amazon TLS certificates (EOS), DirectX, SteamCMD – one UAC prompt; choose where SteamCMD goes or reuse an existing install.
- SteamCMD install / update / validate for the dedicated server (AppID 2430930) with progress, retries and plain-language errors.
- 334-setting graphical editor with sliders, official-default markers and reset; stat grids, level-curve generator, creature/item/engram/spawn/loot list editors, custom & mod keys, raw INI editor with live validation and split view.
- 12 built-in presets with change preview, merge or clean-slate apply, and user presets.
- 81 launch options with live command preview.
- Live map catalog from the ARK wiki (new maps appear automatically), custom/mod maps.
- CurseForge mod browser, load order, passive mods, update detection.
- RCON console, chat feed, server log, player management with custom quick actions.
- Live telemetry: CPU, RAM, network, disk, players, RCON responsiveness.
- Backups in each server's folder, automatic backups with retention, SQLite save integrity checks and rollback, `.asapack` import/export, existing-install import.
- Automation: crash auto-restart with crash-loop detection, scheduled restarts with chat countdowns, update checks, auto-start.
- One-click Fix Server Issues pipeline.
- Installer (NSIS/MSI) and portable editions; corruption-safe profile storage.
