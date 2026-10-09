# CLAUDE.md

All project guidance for AI assistants lives in **[AGENTS.md](AGENTS.md)** – read it before making changes.

Quick reminders:
- Steam AppID for the dedicated server is **2430930** (not 2399830).
- Never hand-edit `src/data/settings.generated.ts`; edit `scripts/gen_settings.py`.
- Keep `cargo check` warning-free, `cargo test --lib` and `npx tsc -p tsconfig.json --noEmit` passing.
- The mock backend (`src/lib/devMock.ts`) must only load in browser dev (`!isTauri()`).
