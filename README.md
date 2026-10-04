# Typewriter

Desktop todo widget for macOS and Linux, built with Rust, Tauri 2, and Svelte.

It sits on the desktop as a small typewriter. Click it to slide up a paper
todo sheet backed by a single Markdown file in an Obsidian vault. The
Markdown file is the only source of truth — no database, no account, no
network calls.

## Status

Active development. See [`plan.md`](./plan.md) for the full spec and a
running status log of what's implemented vs. deferred.

Implemented so far:
- Rust domain model, Markdown parser, guarded write safety (conflict
  detection, atomic writes, recovery snapshots)
- Debounced native file watcher (survives atomic-save rename patterns)
- Tauri 2 shell with a themeable Svelte UI
- Collapsed/expanded widget with native window resize and "slide up"
  paper animation
- User-resizable window while the todo sheet is open; collapsing always
  resets to the default size

Deferred: theme switcher UI, Linux verification, packaging (Phase 5),
phase-grouped todo content, automated tests for the resize feature.

## Development

```bash
npm install
npm run tauri dev
```

Requires a Rust toolchain pinned via `rust-toolchain.toml` (installed via
`rustup`, not the Homebrew `rust` package).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server only (no Tauri window) |
| `npm run tauri dev` | Full native app, hot-reloaded |
| `npm run build` | Build frontend assets |
| `npm run check` | Svelte + TypeScript type checking |
| `npm run lint` / `format` | ESLint / Prettier |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:ui` | Playwright UI tests (mocked native layer) |
| `npm run test:visual` | Playwright screenshot regression suite |

`cargo test` from `src-tauri/` runs the Rust unit/integration tests.

## Architecture

- `src-tauri/` — Rust backend: file watching, Markdown parsing, write
  safety, window commands
- `src/` — Svelte + TypeScript frontend
  - `lib/stores/` — widget mode state machine, todo document store
  - `lib/services/nativeWindow.ts` — thin boundary over Tauri window APIs
  - `lib/theme/tokens.css` — design tokens (spacing, radius, color)

The frontend never calls `@tauri-apps/api` directly outside
`nativeWindow.ts`, so Playwright tests can run against the plain Vite dev
server with a mocked native layer.
