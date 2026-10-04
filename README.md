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

- Saved named lists with `< NAME >` navigation (see below)

Deferred: theme switcher UI, Linux verification, packaging (Phase 5),
phase-grouped todo content, automated tests for the resize feature.

## Lists

Each list is a saved profile: a name plus one Markdown file you pick. Only
the active list is read, watched, and written; the Markdown file stays the
only copy of your tasks. Profiles live in the app config
(`config.json` in the OS app config dir), never the todo text.

- **First start:** open the sheet and choose a Markdown file (for example
  `Personal.md` in your Obsidian vault). It becomes the first list, named
  after the file.
- **Switch:** click `<` / `>` next to the list name (wraps at the ends;
  hidden when you have one list). Unsent text in the add box stays with its
  own list.
- **Manage:** click the gear. Click a name to rename it, `relink` to point it
  at a different file, `remove` (then `confirm remove`) to forget it — the
  Markdown file is never deleted. To add a list, type a name and press
  `+ add list`, then pick its file.
- **Missing note:** if a list's file is gone, that list shows a `Retry` /
  `Relink note` panel. Other lists keep working. The app never recreates a
  missing note.
- **Upgrading:** an older single-file config becomes the first list
  ("Personal") automatically.

Set `TYPEWRITER_CONFIG_DIR` to run against a throwaway config (used for
testing; the real config is never touched).

## Development

```bash
npm install
npm run tauri dev
```

Requires a Rust toolchain pinned via `rust-toolchain.toml` (installed via
`rustup`, not the Homebrew `rust` package).

## Scripts

| Command                   | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `npm run dev`             | Vite dev server only (no Tauri window)    |
| `npm run tauri dev`       | Full native app, hot-reloaded             |
| `npm run build`           | Build frontend assets                     |
| `npm run check`           | Svelte + TypeScript type checking         |
| `npm run lint` / `format` | ESLint / Prettier                         |
| `npm run test:unit`       | Vitest unit tests                         |
| `npm run test:ui`         | Playwright UI tests (mocked native layer) |
| `npm run test:visual`     | Playwright screenshot regression suite    |

`cargo test` from `src-tauri/` runs the Rust unit/integration tests.

## What is verified

Rust (58 tests), unit (8), and Playwright UI/visual suites run against a
mocked native layer. The native app was checked by hand with repo-local
fixtures: switching, writes landing only in the active file, external-edit
refresh, missing-note recovery, restart restore, drag, resize, scrolling,
legacy-config migration. Not verified: the native file picker dialogs
(add/relink need a human), Linux, and VoiceOver.

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
