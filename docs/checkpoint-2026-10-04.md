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

## Remaining

- Native drag + resize re-check with switcher, legacy-config migration run,
  reduced-motion (native), scroll state, update plan.md/README.md, commit.
- Not verifiable here: native picker flows (add/relink need a human click),
  Linux, real vault.
