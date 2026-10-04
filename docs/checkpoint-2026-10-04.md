# Checkpoint — 2026-10-04, named-list switcher

**Constraint to preserve:** the user-approved aesthetics, scrolling, keyboard,
paper, transitions and resize/collapse behavior from Phase 4 must stay intact.
Named lists are an additive change to the cream display strip only.

## Phase

Milestone B (named lists + left/right switcher) implemented and verified in
the browser-mocked suites and the real native app against repo-local
fixtures. Milestone A (real vault `Personal.md`) deliberately deferred: the
user connects their own note manually (no access to the real vault from
automated runs).

## Decisions

- Profile = immutable UUID + display name + one explicit `.md` path; exactly
  one active; config stores metadata only (never todo content).
- Legacy `selected_path` migrates into a first profile named "Personal".
- All path-taking commands go through the native picker +
  `validate_selected_path`; the frontend never supplies raw paths.
- Switching mints a fresh source session; stale session writes/events are
  rejected. Frontend supersedes the old session synchronously on switch.
- Drafts are stored per profile id; add is disabled while loading/unavailable.
- Missing note => per-profile "Retry / Relink note" state; other lists stay
  navigable. Rust unit-variant errors serialize as `{category}` only, so the
  frontend maps categories to messages (`errorMessageFor`).
- `TYPEWRITER_CONFIG_DIR` env var overrides the config dir for dev/test runs.
- Compaction: project `.claude/settings.json` sets `autoCompactWindow: 350000`;
  `/autocompact 350k` confirmed for Sonnet 5.5 in this session.
- Svelte 5 legacy `$:` tracks reads inside called helpers: a reactive
  scroll-restore helper froze the page. Use mount-time actions instead.

## Changed files

Rust: `src-tauri/src/{config,commands,errors,lib}.rs`.
Frontend: `src/App.svelte`, `src/lib/{types.ts,services/tauri.ts,stores/{todos,profiles}.ts}`,
`components/{TodoSheet,ProfileSwitcher,ListManager}.svelte`.
Tests: `src/tests/e2e/{fakeAdapter.ts,widget.ui.spec.ts,profiles.ui.spec.ts,visual.visual.spec.ts}` + snapshots.
Config: `.claude/settings.json`, `.gitignore`.

## Test results (latest)

- `cargo test`: 58 passed.
- `npm run test:unit`: 8 passed. `npm run check`/`lint`/`format:check`: clean.
- Playwright ui 23 + visual 12: all passing. Visual baselines were stale
  before this work (pre-redesign look, wrong viewport); regenerated at the
  real 380x252 / 380x636 sizes after reviewing each image.
- Native (repo-local fixtures, `.claude-scratch/native`): collapsed/expanded,
  switching, duplicate task text independence on disk, external edit refresh,
  missing note + retry recovery, restart restores active list, per-list
  drafts, rapid clicks, rename, remove (file preserved).

## Placement correction (later 2026-10-04)

Switcher moved from the paper header into the cream display above the keys,
usable collapsed and expanded. `TypewriterWidget` now renders the display
(`ProfileSwitcher`: prev, name, count, next) as a sibling of the expansion
button (keyboard artwork, aria-label Open/Close todo list); nothing
interactive is nested in a button. Paper header: name heading + gear + drag
region + red badge. App passes profiles/navigate to the widget and collapse
focus returns to the real expansion button. Display width is zero-intrinsic so
long names truncate instead of widening the housing.

Results (exit 0): check, lint, format:check, unit 8, ui 43, visual 15, build,
cargo 58 (pinned toolchain; put `~/.cargo/bin` first on PATH). Visual diffs
were limited to the cream display and paper heading before baselines were
regenerated; the long-name baseline first showed the box stretching and was
fixed.

Evidence: `.claude-scratch/evidence-display-nav/` (before/after, native n01,
n06, n07, gates.txt). Native verification partial (see plan.md): interrupted
when another person began using the machine. Re-run unchanged-geometry, drag,
resize, keyboard, long name, missing note and restart checks natively.

## Daily folder lists (later 2026-10-04)

Personal/Work-style lists are folders of `YYYY-MM-DD.md` notes; `+` in the
paper header creates today's note from a template; `‹ ›` steps days; Groceries
stays a single file. Details and the safety rules are in plan.md ("daily
folder lists"). Results (exit 0): check, lint, format:check, unit 8, ui 55,
visual 17, build, cargo 68. Native run with a daily folder NOT done (machine
in use). Evidence: `.claude-scratch/evidence-display-nav/gates3.txt`.

## Remaining

- Native re-check listed above, plus a native daily-folder run (picker, `+`, stepping, restart); native picker flows; Linux; VoiceOver;
  native reduced motion; transition recording. Not fully accepted on macOS
  or Debian.
- Not committed; nothing pushed.
