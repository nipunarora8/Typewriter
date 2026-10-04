# Typewriter: development notes

User-facing overview: see the [README](../README.md). Screenshots below the README come from the mocked-browser visual tests, with fictional data.

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

- Saved named lists with `<  NAME  >` navigation in the cream display above the keys (see below)

Deferred: theme switcher UI, Linux verification, packaging (Phase 5),
phase-grouped todo content, automated tests for the resize feature.

## Quick start (Mac)

1. Build once: `export PATH="$HOME/.cargo/bin:$PATH"; npm run tauri build -- --bundles app` (about 2 minutes).
2. Open the app: `open src-tauri/target/release/bundle/macos/Typewriter.app`. For permanent use, drag `Typewriter.app` into Applications.
3. The first launch of an unsigned app: right-click it, choose Open, then Open again.
4. Click the keyboard to open the sheet. Type a list name (for example `Personal`) and press `Choose where to keep it`. Pick a parent folder such as `Typewriter` (the Mac picker has a `New Folder` button). The app creates `Typewriter/Personal/` and today's note inside it.
5. Add more lists (Work, Groceries, ...) with the gear (⚙) on the paper: type a name and press `+ add list`. No picker opens again. The new list is created next to your first one, for example `Typewriter/Work/`.
6. Press the red `+` to start a note named with today's date in the current list's folder.
7. If you see "Typewriter isn't allowed to open that file", press `Remove this list` and add it again.

## Lists

A list is either a **daily folder** or a **single file**. Only the active
list's current note is read, watched and written; Markdown stays the only
copy of your tasks. Profiles live in the app config (`config.json` in the
OS app config dir), never the todo text.

**Every list is a folder** of dated notes. When you add a list called `Work`
and pick `Typewriter` as the parent, the app creates `Typewriter/Work/` and
`2026-10-05.md` inside it (an existing folder or note is reused, never
overwritten). The note starts as `# Work — 2026-10-05`, a blank line, then
`## Todos`.

- Press the red `+` in the paper header any time to create (or open) today's
  note. It is the only way new notes appear. The app never creates one by
  itself.
- **Leftovers:** when you press `+` and the previous day had unfinished
  tasks, a one-line banner says `N unfinished from <date>` with `Bring them
over` and `Not now`. Bringing them over copies the unchecked tasks into
  today's note and never changes the earlier note. Nothing is offered
  automatically, and nothing pops up at midnight.
- `‹` / `›` next to the date step to older or newer existing notes.
- If the app stays open past midnight it keeps showing the old day until you
  press `+`.
- **Switch lists:** `<` / `>` in the cream display on the typewriter housing,
  just above the keys. It works collapsed and expanded, wraps at the ends,
  and the arrows are hidden with one list. Switching never opens, closes,
  moves or resizes the window. The done count (`1/3`) sits beside the name.
  Unsent text in the add box stays with its own list and day.
- **Open/close the sheet:** press the keyboard artwork, or Escape while open.
- **Manage:** the gear in the paper header. Click a name to rename it,
  `relink` to point it at another folder, `remove` to forget it. Your notes
  are never deleted.
- **Unavailable folder:** the sheet offers `Browse for folder`, `Retry` and
  `Remove this list`.
- **Upgrading:** older single-file lists keep working but can no longer be
  added from the interface.

Example layout: `Typewriter/Personal/`, `Typewriter/Work/`, `Typewriter/Groceries/`. A list you rarely use (Groceries) just gets a note when you press `+`.

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

## Launch like a normal app

After building, copy the app into your Applications folder once:

```sh
cp -R src-tauri/target/release/bundle/macos/Typewriter.app ~/Applications/Typewriter.app
```

Then press `Cmd + Space`, type `Typewriter` and press Enter. To keep it in the
Dock, right-click its icon while it runs and choose Options > Keep in Dock.
To start it at login: System Settings > General > Login Items > `+` > Typewriter.

## Sharing it with other people

Other people need no npm, Rust or Terminal setup. They only need the `.dmg`.

**You (once per release):**

```sh
npm run tauri build -- --bundles app
scripts/make-dmg.sh
```

Send `src-tauri/target/release/bundle/dmg/Typewriter-arm64.dmg` (about 3 MB),
for example as a GitHub Release file.

**Them:**

1. Double-click the `.dmg` and drag Typewriter onto Applications.
2. Open Typewriter from Launchpad or Spotlight. The first time, right-click
   the app and choose Open, then Open again.
3. If macOS says the app is damaged, open Terminal once and run
   `xattr -dr com.apple.quarantine /Applications/Typewriter.app`.

The app is not signed or notarized, which is why step 2 is needed. Removing
that step requires a paid Apple Developer account. A build only runs on the
same chip type it was made on (`arm64` is Apple Silicon, `x86_64` is Intel).

## Branches and releases

- `develop` is the working branch: all source, tests and workflows.
- `main` is for users only: README, license and screenshots. Never merge
  `develop` into it. Update it with `scripts/publish-main.sh`.

### Releasing (and updates)

Installed apps never check for updates on their own. Users press **Check for
updates** in the gear menu, which reads `latest.json` from the latest GitHub Release.

1. Bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
   and `package.json` (same number everywhere).
2. Commit and push `develop`.
3. Tag and push: `git tag v0.1.1 && git push origin v0.1.1`.
   The Release workflow checks the tag matches the version, builds the Mac
   `.dmg` and Linux `.AppImage`, signs the update files and publishes
   `latest.json`.

One-time setup: the update signing key lives at `~/.tauri/typewriter.key`
(never commit it; back it up). Add its contents as the GitHub secret
`TAURI_SIGNING_PRIVATE_KEY`. The key has no password, and the workflow passes
an empty one. The matching
public key is in `tauri.conf.json`. If the private key is lost, installed
apps can no longer update to new versions.

Apps from before the updater was added (0.1.0) cannot update themselves and
need one manual reinstall.
