# Typewriter Todo Widget — V1 Implementation Plan

## Purpose and product boundary

Build a polished, local-first desktop widget for macOS and Debian Linux using **Rust, Tauri 2, and Svelte**. It presents one selected Markdown todo file from the Obsidian vault as a compact typewriter on the desktop. Clicking the typewriter opens a paper-like todo sheet where tasks can be added or checked off. The Markdown file remains the sole source of truth.

Initial Obsidian workspace folder:

```text
/Users/nipunarora/obsidian_vault/navel_vault/Typewriter
```

V1 deliberately includes exactly one configured Markdown file and one todo list. It does **not** include date-driven daily notes, templates, multiple lists, tags, cloud services, accounts, or sync logic. Those are later extensions; the architecture should leave clean seams for them.

## Product principles

- **Local and private:** no backend, telemetry, account, network dependency, or copy of vault data outside the configured file.
- **Obsidian-first:** edits made in Obsidian appear in the widget; widget actions update ordinary Markdown compatible with Obsidian.
- **Small but tactile:** a quiet desktop object when collapsed, an immediately useful paper sheet when expanded.
- **Aesthetic quality is functional quality:** typography, spacing, material, shadow, and motion are first-class acceptance criteria.
- **Theme-friendly by design:** color, type, paper texture, trim, shadow, and motion variables must be easy to adjust without rewriting component styles.
- **Predictable file ownership:** read safely, write minimally, and never silently discard external changes.

## Technology choices

- **Shell:** Tauri 2.
- **Native layer:** Rust.
- **UI:** Svelte with TypeScript and Vite.
- **Styling:** scoped component styles plus global CSS custom properties for design tokens. Do not introduce a large component library; the widget needs bespoke, restrained styling.
- **File watching:** Rust `notify` crate (or Tauri-supported equivalent), watching the configured Markdown file and its parent directory to survive atomic-save rename patterns.
- **Persistence:** Tauri store/plugin or a small app configuration file for only the selected file path and UI preferences. Never persist todo contents as an alternate source of truth.
- **Testing:** Rust unit/integration tests, Svelte component tests, Playwright end-to-end tests, and screenshot-based visual regression tests.

Use current stable, mutually compatible Tauri 2, Rust, Svelte, TypeScript, and Node releases when scaffolding. Pin dependencies with the project lockfiles.

## Suggested repository layout

```text
typewriter/
├── README.md
├── plan.md
├── package.json
├── package-lock.json | pnpm-lock.yaml
├── vite.config.ts
├── playwright.config.ts
├── src/
│   ├── app.css                     # reset, tokens, global motion preferences
│   ├── main.ts
│   ├── App.svelte
│   ├── lib/
│   │   ├── components/
│   │   │   ├── TypewriterWidget.svelte
│   │   │   ├── TodoSheet.svelte
│   │   │   ├── TodoItem.svelte
│   │   │   ├── AddTaskForm.svelte
│   │   │   ├── FilePicker.svelte
│   │   │   ├── EmptyState.svelte
│   │   │   └── ErrorNotice.svelte
│   │   ├── stores/
│   │   │   ├── todos.ts
│   │   │   ├── widget.ts
│   │   │   └── preferences.ts
│   │   ├── services/
│   │   │   └── tauri.ts            # typed invoke/event boundary only
│   │   ├── theme/
│   │   │   ├── tokens.css
│   │   │   ├── themes.css
│   │   │   └── theme.ts
│   │   └── types.ts
│   └── tests/
│       ├── components/
│       └── e2e/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs
│       ├── commands.rs
│       ├── config.rs
│       ├── markdown.rs
│       ├── watcher.rs
│       ├── errors.rs
│       └── models.rs
└── fixtures/
    ├── todos-basic.md
    ├── todos-mixed-content.md
    └── malformed-or-no-todos.md
```

Keep file-system capabilities narrow. The user selects a single Markdown file using a native picker. Store that explicit path; commands may read/write/watch only that selected file, rather than allowing arbitrary frontend-provided paths.

## Markdown contract

V1 recognizes standard task lines anywhere in the selected file:

```md
# Work list

## Todos

- [ ] Finish singing test
- [x] Review code
- [ ] German lesson
```

Rules:

- Recognize `- [ ] text` and `- [x] text` / `- [X] text`, preserving the original bullet indentation and non-checkbox text.
- Preserve every non-task line byte-for-byte whenever practical: headings, prose, links, frontmatter, blank lines, and unsupported task syntax.
- Maintain source order. Nested task support may be parsed for display; V1 can retain indentation but should not need to provide hierarchy controls.
- Add tasks to a dedicated `## Todos` section if it exists. If absent, append a final `## Todos` section with a blank line separator. Do not rearrange existing notes.
- Task text is plain Markdown text entered by the user. Do not interpret, execute, or strip valid Markdown content.
- Define each displayed task with a stable V1 `line_id` based on its current line index plus an occurrence discriminator. Treat it as ephemeral: re-read before each write and resolve against current content. A future version can add durable HTML comments/IDs only through an explicit migration.
- Do not silently “format” a file. Preserve newline convention (LF or CRLF), final-newline behavior where possible, and UTF-8 content.

Rust domain types:

```rust
struct TodoItem {
    line_id: String,
    line_index: usize,
    text: String,
    completed: bool,
    indent: String,
}

struct TodoDocument {
    path: PathBuf,
    revision: String, // content hash, for stale-write detection
    tasks: Vec<TodoItem>,
}
```

## State and data flow

```text
Selected Markdown file
        │ read/parse
        ▼
Rust TodoDocument + content revision ── Tauri events ──► Svelte todo store
        ▲                                                       │
        │ re-read / guarded mutation                            │ user intent
        │                                                       ▼
Native file watcher ◄── write selected file ◄── typed invoke command
```

1. On launch, load the saved selected-file path.
2. Validate it exists, is a readable `.md` file, and load/parse it in Rust.
3. Emit a typed `todos:updated` event to the frontend, including the revision and parsed tasks.
4. The Svelte store renders the latest native document; it never treats its copy as authoritative.
5. For toggle/add, the frontend sends intent (`task line_id`, desired completion state, or task text) plus the last revision.
6. Rust re-reads the file, validates the revision or re-resolves the intended task, applies the smallest safe line edit, writes atomically, reparses, and emits an updated document.
7. The watcher detects changes made by Obsidian or another process; after debounce, Rust reloads/parses and emits an update.
8. Suppress duplicate refreshes caused by the app’s own write by comparing a short-lived expected revision, but always accept a genuinely different external revision.

The UI may optimistically animate a checkbox, but must reconcile to the native result. On failure, restore the factual state and show a concise, actionable notice.

## Native commands and events

Create a small, typed boundary. Suggested commands:

- `get_app_state()` → selected path, current theme, UI preferences.
- `choose_todo_file()` → opens native picker, validates selection, persists path, loads document.
- `load_todos()` → reads and parses the currently selected file.
- `toggle_todo({ line_id, completed, revision })` → guarded update and refreshed document.
- `add_todo({ text, revision })` → guarded append to Todos section and refreshed document.
- `set_preferences({ theme_id, ... })` → persists presentation-only preferences.
- `show_main_window()` / `set_widget_mode()` only if the native window behavior needs an explicit command.

Suggested events:

- `todos:updated` — parsed document and source (`startup`, `user-write`, `external-change`).
- `todos:error` — categorized, user-safe error payload.
- `file:status` — missing, inaccessible, moved, or watching status.

Never expose raw arbitrary-path read/write commands to the webview. Validate all command inputs, restrict the selected-file extension to `.md` (case-insensitive), and ensure the resolved path remains the configured file.

## File watching and concurrent-edit strategy

- Watch both the selected file and its immediate parent directory because Obsidian/editor saves may arrive as replace/rename sequences.
- Debounce event bursts for roughly 150–300 ms; use a trailing refresh.
- Before parsing after an event, retry a few short times if an atomic replacement is briefly unavailable.
- Ignore non-content metadata events when possible; content hashing is the final authority.
- On each user write, re-read the disk file immediately before mutation. If the frontend revision is stale, re-resolve by exact current line when safe; otherwise reject with “The note changed; refreshed the list—please try again.” Never overwrite an unseen external edit.
- Write atomically: create a temporary file alongside the target, flush it, then rename/replace using platform-safe semantics. Preserve permissions where feasible.
- On watcher errors, retain the last visible list, show a non-alarming “Live updates paused” state, and provide a Retry/Reload control. The next successful watcher event should clear it.
- Handle deletion, rename, permission loss, invalid UTF-8, directory selection, and malformed content explicitly. A note with no tasks is valid, not an error.

## Window and widget behavior

Use one small, always-available main window for V1.

- Start collapsed: a compact, opaque typewriter object with a clear focus/hover affordance and an accessible button role.
- Click, Enter, or Space expands to the todo sheet. Escape collapses it unless focus is inside a text entry with unsaved input.
- The sheet should feel attached to the typewriter: it grows from the carriage/paper slot instead of appearing as a disconnected dialog.
- Default to a modest floating size (for example, collapsed ~300×150 logical pixels; expanded ~380×560), with sensible min/max constraints. Make the expanded sheet vertically scrollable only inside the task list.
- Preserve the user’s last screen position and expanded/collapsed mode across launches; if an old position is offscreen, recenter it.
- Prefer an unobtrusive default: visible in the dock/task switcher according to platform convention, not forced always-on-top. Add “keep above other windows” later only if needed.
- Native title bar should be visually minimal. Use native drag regions deliberately; never place interactive controls inside the drag region.
- Support close-to-quit in V1; a menu-bar/tray residency model can be an optional later phase.
- Check macOS Retina and common Debian X11/Wayland scaling. All dimensions must be logical pixels/rem units, never hard-coded physical pixels.

## Visual system and theme experimentation

### Default visual direction

Aim for a premium editorial typewriter rather than novelty pixel art: warm cream paper, charcoal/ink frame, restrained oxblood accent, slightly imperfect material depth, generous whitespace, and a literate serif for headlines paired with an extremely legible UI sans. Avoid fake skeuomorphic clutter that harms clarity.

Use local/system fonts by default so V1 remains offline and robust. A licensed bundled display font can be added only with correct licensing and explicit asset loading.

### Tokens first

Every visual decision should route through semantic tokens in `src/lib/theme/tokens.css`, not hard-coded component hex values:

```css
:root {
  --color-surface: ...;
  --color-paper: ...;
  --color-ink: ...;
  --color-muted-ink: ...;
  --color-accent: ...;
  --color-focus: ...;
  --border-subtle: ...;
  --shadow-widget: ...;
  --shadow-paper: ...;
  --font-display: ...;
  --font-body: ...;
  --space-1: ...;
  --space-2: ...;
  --radius-widget: ...;
  --radius-paper: ...;
  --duration-fast: ...;
  --duration-sheet: ...;
  --ease-enter: ...;
  --ease-exit: ...;
}
```

Organize themes as attribute-scoped overrides, e.g. `[data-theme="ivory"]`, `[data-theme="midnight"]`, and `[data-theme="high-contrast"]`. Theme selection applies `data-theme` at the document root and persists only the theme ID. Do not embed user-provided CSS in V1.

Include at least:

- **Ivory (default):** cream paper, charcoal housing, oxblood accent.
- **Midnight:** deep graphite/indigo surface with warm, low-glare paper.
- **High contrast:** WCAG-focused contrast, visible focus rings, minimal texture.

Provide a lightweight in-app theme switcher or settings surface with live preview. Keep individual themes compact and token-only so experiments are safe, quick, and reviewable.

### Animation principles

- Use CSS/Svelte transitions for visual changes; do not use JavaScript animation loops for routine UI movement.
- The expand/collapse transition should coordinate size, paper translation, opacity, and a very subtle shadow shift from one shared origin. Target 220–320 ms on enter and 160–220 ms on exit, using a natural non-bouncy ease.
- Animate only composited properties (`transform`, `opacity`) whenever possible. Avoid layout thrashing, filters over large areas, and long/springy motion.
- Checkbox completion should be restrained: brief check reveal and text-color transition, no theatrical strike-through.
- Respect `prefers-reduced-motion`: make transition durations near-instant, omit decorative movement, and retain unambiguous state changes.
- Do not block clicks, keyboard input, or file refresh while an animation runs. If external updates arrive during a transition, apply the latest state coherently at its completion or safely interrupt to the current truth.

## Interaction design and accessibility

- Use semantic buttons, checkbox inputs, labels, and a real form for adding tasks.
- Keyboard path: Tab/Shift+Tab moves predictably; Enter submits the add field; Space toggles focused checkbox; Escape collapses or dismisses a non-critical notice.
- Visible `:focus-visible` rings must meet contrast requirements in every theme.
- Never convey state only by color: checked tasks also have checkbox state and text treatment; errors use icon/text, not just red.
- Meet WCAG 2.2 AA for text and interactive controls; check contrast of subdued paper/ink combinations per theme.
- Provide accessible names for icon-only controls and status updates via an appropriate polite live region.
- Keep pointer targets at least 24×24 CSS pixels, preferably 32×32 for primary controls.
- Ensure the default compact mode can be expanded without hover and without relying on a drag gesture.

## Performance targets

- Cold launch to usable collapsed widget: under 1.5 s on a representative modern laptop (measure release build).
- Expand/collapse feels immediate: input acknowledgement under 100 ms; visual transition starts on the next frame.
- External file edit reflected after save in under 750 ms under normal conditions.
- Toggle/add round-trip against a typical note (under 1 MB): under 250 ms, excluding filesystem stalls.
- Maintain smooth animation (roughly 60 fps on standard displays) with a list of at least 100 tasks.
- Avoid polling; the watcher should be idle when no file change occurs.

## Failure states and recovery

| Situation | UI behavior | Recovery |
| --- | --- | --- |
| No file selected | Warm onboarding state with “Choose Markdown file” | Native picker |
| Selected file moved/deleted | Keep last tasks visually distinct but disable mutations | Locate file again or choose another |
| Permission denied | Explain that the widget cannot read/write that note | Choose another file or fix permissions then Retry |
| Invalid UTF-8/read error | Show exact safe category, never corrupt the file | Reload after correcting in editor |
| Markdown has no tasks | Show calm empty state and Add task control | Appends `## Todos` safely |
| External edit races a toggle | Refresh current note; do not force user change | User retries intentionally |
| Atomic write fails | Revert optimistic UI and retain error detail for logs | Retry; original remains untouched |
| Watcher fails | Status “Live updates paused”; manual Reload remains available | Retry watcher/reselect file |

For developer diagnostics, keep local structured logs without writing todo text unnecessarily. User-facing messages should be concise and non-technical.

## Testing strategy

### Rust tests

- Parser fixtures: basic tasks, upper-case `X`, indentation, mixed prose, multiple headings, no Todos heading, CRLF, no trailing newline, unicode, and task-like text inside code fences (define and test expected behavior).
- Mutation tests: toggle only changes bracket state; add preserves unrelated content; creates `## Todos` correctly; preserves newline style.
- Race/stale revision tests: stale client requests do not overwrite modified fixtures.
- Path validation tests: reject non-Markdown, directories, unset path, and frontend attempts to target another path.
- Watcher/debounce tests behind a testable abstraction, including replace/rename-style sequences.
- Atomic write failure simulation leaves original file intact.

### Frontend tests

- Component tests for empty, loading, normal, completed, long-task, error, and external-refresh states.
- Store tests ensure events replace stale local state and failed optimistic mutations roll back.
- Accessibility tests using automated checks plus keyboard-flow coverage.
- Theme tests confirm all theme IDs apply semantic tokens and focus styles.

### End-to-end tests

- Select fixture file, load tasks, toggle, relaunch/reload and verify Markdown changed.
- Add a task and verify it is present in both UI and file.
- Edit the fixture externally during the test and verify UI refreshes.
- Test deleted/moved file recovery and denied-write handling where platform permits.
- Test expand/collapse through pointer and keyboard.
- Run on macOS and Debian CI runners or equivalent packaged smoke-test environments before release.

### Visual QA

- Capture deterministic screenshots of collapsed and expanded widget in every shipped theme, including empty, populated, completed, error, and focus states.
- Compare screenshots with a deliberately reviewed baseline. Treat unexpected shifts in spacing, typography, clipping, contrast, or shadows as regressions.
- Manually inspect on Retina macOS and a Linux scale factor (100% and 125%/150% if available): paper edges, type baseline, drag region, scroll behavior, focus rings, and no clipped controls.
- Test both motion settings. Record short screen captures when adjusting the shared expand/collapse transition to evaluate continuity, not just still frames.

## Implementation phases and mandatory verification

### Phase 0 — Project foundation

1. Scaffold the Tauri 2 + Svelte + TypeScript app and set up linting, formatting, unit-test, E2E, and screenshot-test commands.
2. Add a concise README describing local-only scope, prerequisites, development commands, and selected-file behavior.
3. Configure least-privilege Tauri capabilities and package metadata for macOS/Linux.

Verification checks:

- Run dependency installation, formatter check, linter, frontend unit-test command, Rust test command, and production build successfully.
- Launch the development app; confirm it opens a native window with no browser-only assumptions.
- Inspect Tauri capabilities: no broad arbitrary filesystem access, no network capability unless a dependency explicitly requires it (it should not).

### Phase 1 — File model and native Markdown engine

1. Implement models, errors, parser, document hashing/revisions, selected-file persistence, and strict path validation.
2. Implement read, add, and toggle commands using atomic write semantics.
3. Create the fixture set before expanding UI work.

Verification checks:

- Run all Rust tests, including parser/mutation/revision/path fixtures.
- Diff every mutated fixture to confirm only the intended checkbox or added section changed.
- Manually choose a disposable `.md` file in the provided Obsidian Typewriter folder; confirm add/toggle works and the file remains readable by Obsidian.
- Verify non-`.md` selection and a missing file yield friendly errors and no write.

### Phase 2 — Live synchronization

1. Add a debounced watcher for file and parent directory.
2. Define typed events and make the native layer the frontend’s single update channel.
3. Add external-change, deletion, rename, permission, and watcher-health states.

Verification checks:

- Edit and save the selected file in Obsidian; changed tasks appear in the widget in under 750 ms.
- Simulate atomic-save replacement (write temp then rename); UI still updates exactly once after debounce.
- Toggle a task while externally editing the note; confirm no external content disappears and the user receives a safe refresh/retry result if conflict cannot be resolved.
- Stop/restart watching in a test harness; confirm manual Reload works and health state recovers.

### Phase 3 — Functional Svelte shell

1. Implement typed service calls, stores, onboarding/file picker, task list, add form, empty state, errors, and loading states.
2. Wire the interaction model with native command/event behavior; use a small optimistic interaction layer only with reliable rollback.
3. Add keyboard operation and accessible live statuses.

Verification checks:

- Run component/store tests and automated accessibility checks.
- Complete a keyboard-only flow: choose file, expand, toggle a task, add a task, collapse.
- Verify completed state, empty state, long text wrapping, errors, and external updates without UI clipping or stale content.
- Run E2E file read/write/refresh test against a disposable fixture.

### Phase 4 — Window choreography and premium visual system

1. Build the collapsed typewriter and attached expanded paper sheet as separate, composable components.
2. Introduce semantic tokens, Ivory/Midnight/High Contrast themes, and a live theme switcher.
3. Add one coherent shared expand/collapse transition and reduced-motion behavior.
4. Tune sizing, scroll containment, drag regions, persistence of position/mode, focus states, and platform scaling.

Verification checks:

- Run visual screenshot suite for every shipped theme/state and review diffs intentionally.
- Inspect macOS and Debian builds at normal and high-DPI scale: no blurred text, clipped paper, inaccessible drag area, or overlapping controls.
- With reduced motion enabled, confirm transitions are effectively instant yet state changes remain clear.
- Repeatedly expand/collapse during task updates; confirm the latest task state is rendered and interaction stays responsive.
- Measure initial launch, expand response, update latency, and 100-task list behavior against the performance targets.

### Phase 5 — Packaging, hardening, and release readiness

1. Build signed/notarized macOS distribution only when signing credentials are intentionally configured; otherwise produce an unsigned development artifact clearly labeled as such.
2. Produce Debian-appropriate package(s), document dependencies, and test fresh-install behavior.
3. Add a privacy statement: local file access only, no accounts, no telemetry/network service.
4. Run a clean-machine/install smoke test and finalize user-facing setup guidance.

Verification checks:

- Production builds complete for macOS and Debian targets.
- Fresh install can choose a note in the Obsidian Typewriter folder, read it, write a checkbox change, and receive an external Obsidian edit.
- Audit packaged configuration/capabilities for no unexpected network or broad filesystem permission.
- Execute the full automated test suite and visual baseline suite from a clean checkout; save results with release notes.

## V1 acceptance criteria

V1 is done only when all of the following are true:

- A user on macOS or Debian can choose one `.md` file, and its standard Markdown checkboxes render as todos.
- Checking/unchecking and adding a task make minimal, valid Markdown edits to that exact source file.
- Edits saved by Obsidian refresh the widget automatically and safely.
- The app needs no account, server, cloud database, or network connection to function.
- The collapsed typewriter expands into a connected todo sheet with polished, interruption-safe motion and reduced-motion support.
- Users can switch among at least three token-based themes and immediately preview the result; components contain no theme-specific hard-coded colors.
- Keyboard navigation, focus visibility, contrast, and status messages meet the accessibility requirements above.
- Expected failure states are recoverable, never destroy note contents, and clearly tell the user what to do next.
- Rust, frontend, E2E, packaging smoke, and visual QA checks pass on the supported platforms.
- The codebase has documented seams for later daily-note path resolution, templates, multiple lists, tags, and optional window/tray behavior—without shipping those features prematurely.

## Deliberate later-phase extension points

Keep these interfaces narrow but do not implement the features in V1:

- Replace the single selected path with a `TodoSource` trait/interface (`SelectedFileSource`, future `DailyNoteSource`).
- Add a `TodoTarget`/section selector only after real use demonstrates the need for multiple lists.
- Allow an optional daily-note resolver and template creator behind a separate permission/confirmation flow.
- Consider durable task IDs only if line-based re-resolution proves insufficient for frequent concurrent editing.
- Consider optional menu-bar/tray behavior, notifications, sorting/filtering, and theme packs after the core interaction has been validated.

## Agent handoff checklist

Before claiming a phase complete, the implementing agent must:

1. Run the phase’s listed verification checks and record results in the pull request/commit notes or README development log.
2. Inspect the actual Markdown diff created by manual UI operations; do not infer correctness from a passing UI test alone.
3. Review a screenshot or live build for visual regressions whenever CSS, tokens, layout, typography, or animation changes.
4. Preserve the user’s existing files and treat the configured Obsidian note as valuable data: no destructive test should target it. Use copies/fixtures for automation.
5. Keep V1 scope intact. Propose, but do not fold in, date-aware notes, templates, multi-list support, tags, or cloud sync without an explicit follow-up decision.
