# Typewriter Todo Widget — V1 Implementation Plan

Reviewed and revised: 2026-10-04. This revision replaces ambiguous requirements in the original plan; reconcile existing implementation with it rather than restarting the project.

## Instructions for an agent joining work already underway

1. Read repository instructions and inspect the working tree before modifying anything. Preserve work from the user and other agents. Never reset, clean, or re-scaffold the repository to match this document's example layout.
2. Inventory completed, partial, and missing work against the phases below. Reuse correct components and tests, and record discrepancies with the updated contract.
3. Settle the early design/window prototype and write-safety rules before adding more functionality. If the prototype is already built, review and test it rather than making a second one.
4. Use plain Svelte + TypeScript + Vite, with no SvelteKit router, adapter, or server rendering. The scaffold already observed during this review uses plain Svelte + Vite; verify the current checkout.
5. Use rustup and pin an exact compatible stable release in `rust-toolchain.toml`. Verify the compiler requirement from the resolved dependencies/build output; do not assume every Tauri 2 release has the same minimum version. Check that both `cargo` and `rustc` use the intended toolchain, document PATH setup, and avoid removing the existing Homebrew installation.
6. Report what was changed and actually verified, including unavailable platform checks. Browser mocks and an untested Debian package are not evidence of a passing native Debian workflow.

## Purpose and product boundary

Build a polished, local-first desktop widget for macOS and Debian Linux using **Rust, Tauri 2, and Svelte**. It presents one selected Markdown todo file from the Obsidian vault as a compact typewriter on the desktop. Clicking the typewriter opens a paper-like todo sheet where tasks can be added or checked off. The Markdown file remains the sole source of truth.

Initial Obsidian workspace folder:

```text
/Users/nipunarora/obsidian_vault/navel_vault/Typewriter
```

V1 deliberately includes exactly one configured Markdown file and one todo list. It does **not** include date-driven daily notes, templates, multiple lists, tags, cloud services, accounts, or sync logic. Those are later extensions; the architecture should leave clean seams for them.

## Product principles

- **Local and private:** no backend, telemetry, account, or runtime network dependency. Todo content is stored only in the selected file and the bounded local recovery snapshots specified below; never in an app database or telemetry.
- **Obsidian-first:** edits made in Obsidian appear in the widget; widget actions update ordinary Markdown compatible with Obsidian.
- **Small but tactile:** a quiet desktop object when collapsed, an immediately useful paper sheet when expanded.
- **Aesthetic quality is functional quality:** typography, spacing, material, shadow, and motion are first-class acceptance criteria.
- **Theme-friendly by design:** color, type, paper texture, trim, shadow, and motion variables must be easy to adjust without rewriting component styles.
- **Predictable file ownership:** read safely, write minimally, reject detected conflicts, and preserve recoverable observed versions. Explain the remaining non-cooperating editor race honestly; do not claim atomic replacement provides conflict-free editing.

## Technology choices

- **Shell:** Tauri 2.
- **Native layer:** Rust.
- **UI:** Svelte with TypeScript and Vite.
- **Styling:** scoped component styles plus global CSS custom properties for design tokens. Do not introduce a large component library; the widget needs bespoke, restrained styling.
- **File watching:** Rust `notify` crate (or Tauri-supported equivalent), watching the configured Markdown file and its parent directory to survive atomic-save rename patterns.
- **Persistence:** Tauri store/plugin or a small app configuration file for only the selected file path and UI preferences. Never persist todo contents as an alternate source of truth.
- **Testing:** Rust unit/integration tests, Svelte component tests, Playwright browser UI/screenshot tests with an injected native-service mock, and a separate native Tauri smoke/E2E harness. Browser tests do not exercise the real picker, watcher, native resize, or file writes.

Use stable, mutually compatible dependencies. Preserve a working existing scaffold; upgrade only when required for compatibility or a specific fix. Pin dependencies with the project lockfiles and the Rust compiler with `rust-toolchain.toml`. Choose one package manager (retain npm if already in use).

## Suggested repository layout

```text
typewriter/
├── README.md
├── plan.md
├── package.json
├── package-lock.json | pnpm-lock.yaml
├── vite.config.ts
├── playwright.config.ts
├── wdio.conf.ts                    # native Tauri tests if using WDIO
├── rust-toolchain.toml
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
│       ├── lib.rs                  # retain Tauri's generated entry structure
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

The layout is guidance, not a requirement to rename working modules. Keep file-system capabilities narrow. The user selects a single Markdown file using a native picker. Store that explicit path; task commands operate only on that selected file. The sole additional content-write location is its `.typewriter-recovery` sibling directory, derived and controlled by Rust. Never accept arbitrary frontend paths for file operations or recovery.

Custom Rust commands must enforce this boundary themselves; a frontend filesystem plugin scope does not automatically restrict `std::fs`. Treat note text as untrusted content: render escaped text in V1, without raw HTML, remote images, or automatic URL loading. Configure a production CSP for local assets/Tauri IPC and remove unused opener/shell/network permissions. Development HMR and a test-only embedded driver are distinct from production runtime access; exclude driver plugins and server startup from distributed builds.

## Markdown contract

V1 recognizes the explicitly supported task lines throughout the file, excluding code and metadata contexts. One selected file is the combined list even if tasks occur under several headings; adding always targets the single `## Todos` section below.

```md
# Work list

## Todos

- [ ] Finish singing test
- [x] Review code
- [ ] German lesson
```

Rules:

- Recognize `- [ ] text` and `- [x] text` / `- [X] text` on ordinary Markdown list lines, preserving indentation and all text after the checkbox. Other bullets, blockquotes, and Obsidian-specific checkbox states are preserved but not editable in V1; describe this supported subset in the README.
- Exclude fenced code (backtick and tilde fences), indented code, leading YAML frontmatter, and HTML comment/block contexts. Use a Markdown parser with source offsets where practical; mutate original byte ranges rather than reserializing an AST. Test every supported and excluded context.
- Preserve every byte outside the intended edit: headings, prose, links, frontmatter, blank lines, and unsupported task syntax. A toggle replaces just the checkbox marker byte (` `, `x`, or `X`); an add inserts new bytes at a documented position.
- Maintain source order. Nested task support may be parsed for display; V1 can retain indentation but should not need to provide hierarchy controls.
- Adding targets the first exact level-two `## Todos` heading outside excluded contexts (allow trailing horizontal whitespace). Its section ends at the next heading of level one or two or EOF; level-three-and-deeper subsections remain inside it. Insert immediately after the last recognized task in that section, or immediately after the heading if there are none, leaving existing prose intact. For duplicate `## Todos` headings, use the first and test that deterministic behavior. An alternative more ergonomic insertion rule needs an explicit documented decision and fixture before implementation.
- If no target heading exists, append a blank-line-separated `## Todos` section and the new task. Never rearrange existing notes. If the file ends in an unclosed fence, frontmatter block, or other excluded block that would swallow the appended task, reject Add with an actionable explanation instead of appending a hidden task.
- Add accepts a single trimmed, nonempty UTF-8 line, at most 2,000 Unicode scalar values. Reject CR/LF, NUL, and other control characters rather than allowing heading/task injection via pasted multiline text. Preserve valid inline Markdown as literal display text in V1. Existing tasks are not truncated by this entry limit.
- Each `line_id` is valid only within one document revision/source session, based on the task's source offset/line index. It is not a persistent identity. Reject every stale mutation; never relocate a task by matching its text, especially when duplicate task text exists. Durable IDs are a later opt-in migration.
- Preserve BOM, UTF-8 bytes, existing newline bytes, and existing final-newline behavior on toggles. For additions, use the file's first observed newline convention (LF if none); add required separators but do not normalize existing mixed endings. Document unavoidable EOF newline changes caused by insertion.

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
    source_session: String, // changes whenever a file is selected/reselected
    revision: String, // cryptographic hash of original bytes; not an ordering key
    sequence: u64, // monotonically increasing within a source session
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

1. Register frontend event listeners before requesting the initial app/document snapshot. On launch, load the saved selected-file path.
2. Validate it exists, is a readable `.md` file, and load/parse it in Rust.
3. Emit a typed `todos:updated` event to the frontend, including the revision and parsed tasks.
4. The Svelte store renders the latest native document; it never treats its copy as authoritative.
5. For toggle/add, the frontend sends intent (`task line_id`, desired completion state, or task text) plus the last revision and source session. Queue frontend mutations so rapid actions derive their revision from the preceding result; serialize native reads/mutations/publication per source, independent of window animation.
6. Rust re-reads the file, rejects any stale session/revision, applies the smallest safe line edit, runs the guarded write/recovery procedure below, reparses, and returns/emits the same authoritative snapshot.
7. The watcher detects changes made by Obsidian or another process; after debounce, Rust reloads/parses and emits an update.
8. Suppress duplicate refreshes caused by the app’s own write by comparing a short-lived expected revision, but always accept a genuinely different external revision.
9. Apply command results and events through one reducer. Ignore old-source sessions and lower sequence numbers; identical session/sequence snapshots are duplicates. A content hash is not a timestamp. Keep pending visual state separate so a failed optimistic write cannot roll back a newer external update.
10. On file selection/reselection, cancel and dispose the old watcher/debounce work, change the source session, and reject any queued mutation from the old source. Every watcher callback validates its captured session before publishing. On frontend teardown, dispose event listeners.

The UI may optimistically animate a checkbox, but must reconcile to the native result. On failure, restore the factual state and show a concise, actionable notice.

## Native commands and events

Create a small, typed boundary. Suggested commands:

- `get_app_state()` → selected path, current theme, UI preferences.
- `choose_todo_file()` → opens native picker, validates selection, persists path, loads document.
- `load_todos()` → reads and parses the currently selected file.
- `toggle_todo({ line_id, completed, revision, source_session })` → guarded update and refreshed document.
- `add_todo({ text, revision, source_session })` → guarded insertion and refreshed document.
- `set_preferences({ theme_id, ... })` → persists presentation-only preferences.
- `show_main_window()` / `set_widget_mode()` only if the native window behavior needs an explicit command.

Suggested events:

- `todos:updated` — parsed document with session/sequence and source (`startup`, `user-write`, `external-change`).
- `todos:error` — categorized, user-safe error payload with session/sequence.
- `file:status` — missing, inaccessible, moved, or watching status with session/sequence.

Never expose raw arbitrary-path read/write commands to the webview. Validate all command inputs, restrict the selected-file extension to `.md` (case-insensitive), and ensure the resolved path remains the configured file.

## File watching and concurrent-edit strategy

- Watch both the selected file and its immediate parent directory because Obsidian/editor saves may arrive as replace/rename sequences.
- Parent-directory watching is the durable subscription; re-arm direct-file watching after replacement if the chosen backend requires it. Filter unrelated siblings and recovery/temp-file events. Missing-file status must not permanently stop parent watching; a file recreated at the same path should recover automatically.
- Debounce event bursts for roughly 150–300 ms; use a trailing refresh.
- Before parsing after an event, retry a few short times if an atomic replacement is briefly unavailable.
- Ignore non-content metadata events when possible; content hashing is the final authority.
- Serialize writes with a native mutex/actor per selected source. Re-read original bytes and hash them; reject every stale revision/session with “The note changed; refreshed the list—please try again.” Validate the task offset and checkbox against that exact version. Never auto-rebase a toggle onto a different line.
- Before replacing the file, save its current observed bytes as a recovery snapshot (see below). Create an exclusively named temporary file alongside the target, write candidate bytes, preserve original permissions, and flush/sync as appropriate. Immediately before replacement re-read/re-hash the target; if it changed, discard the candidate, reload, and return Conflict. If it disappeared, return Missing; do not recreate it silently.
- Replace atomically using tested macOS/Linux semantics, sync the parent directory where supported, and re-read the target before publishing success. If it differs from the candidate, preserve the newly observed version for recovery, publish disk truth and a conflict status, and do not automatically retry or overwrite. Post-replacement sync/read failures are “write outcome uncertain,” not proof that the original survived; reload before allowing another mutation.
- **Concurrency limit:** Obsidian and arbitrary editors do not necessarily cooperate with the app's lock. A save can occur in the tiny interval between the last hash check and replacement, or immediately afterward. Portable atomic replacement is not a cross-process compare-and-swap. V1 detects observed conflicts and keeps recovery versions but cannot promise zero lost updates for all simultaneous writers. Document this limit and test an injected race in that interval; never claim the mutex locks Obsidian.
- On watcher errors, retain the last visible list, show a non-alarming “Live updates paused” state, and provide a Retry/Reload control. The next successful watcher event should clear it.
- Handle deletion, rename, permission loss, invalid UTF-8, directory selection, and malformed content explicitly. A note with no tasks is valid, not an error.

### Recovery snapshots and filesystem boundaries

- The selected note remains the only authoritative todo source. Recovery is a small local safety mechanism, not another task database or automatic sync/merge feature.
- Before every widget mutation, persist the current observed original bytes under `<note-parent>/.typewriter-recovery/<source-key>/`, named by content hash with `.snapshot` extension. Deduplicate and retain at most 10 observed versions per configured file; preserve a conflicted candidate separately when needed within the same bound. Snapshot only selected-source bytes, never enumerate or copy the vault. If recovery creation fails, fail the mutation before replacement.
- Document the recovery directory when choosing a file and in the README. Snapshots contain note text, inherit appropriate access permissions, and may be included by the user's existing vault sync/backup settings; make no extra security/encryption promise. Provide the recovery path in an error/help surface for manual inspection. Do not implement automatic restore/overwrite in V1.
- Retention deletes only app-owned hash-named `.snapshot` files inside the validated per-source directory. Do not delete arbitrary sibling content. Reject symlinked recovery paths and define a selected-file symlink policy (V1: reject symlink files with a friendly explanation). Reject unsupported special files. Test temp-file cleanup and permission preservation.
- Retaining snapshots of observed versions cannot preserve a version the app never saw. Keep this limitation explicit. Do not market recovery as a guarantee against the residual external-edit race.

## Window and widget behavior

Use one small, always-available main window for V1.

- On first launch start collapsed: a compact typewriter object with a clear focus/hover affordance and a semantic expansion button. On subsequent launches restore the saved mode. Establish whether the outer window is transparent or opaque in the early native prototype; the typewriter itself remains opaque and legible.
- Click, Enter, or Space expands to the todo sheet. Escape collapses it unless focus is inside a text entry with unsaved input.
- The sheet should feel attached to the typewriter: it grows from the carriage/paper slot instead of appearing as a disconnected dialog.
- Default to a modest floating size (for example, collapsed ~300×150 logical pixels; expanded ~380×560), with sensible min/max constraints. Make the expanded sheet vertically scrollable only inside the task list.
- Preserve the user’s last screen position where supported and expanded/collapsed mode across launches; if an old position is offscreen, recenter it where supported. On Wayland accept compositor-controlled placement and gracefully handle unavailable position APIs. Identify tested Debian version, desktop session/backend, and CPU architecture rather than claiming every Linux environment behaves identically.
- Prefer an unobtrusive default: visible in the dock/task switcher according to platform convention, not forced always-on-top. Add “keep above other windows” later only if needed.
- Native title bar should be visually minimal. Use native drag regions deliberately; never place interactive controls inside the drag region.
- Support close-to-quit in V1; a menu-bar/tray residency model can be an optional later phase.
- Check macOS Retina and common Debian X11/Wayland scaling. All dimensions must be logical pixels/rem units, never hard-coded physical pixels.

### Native resize and motion choreography

CSS transitions cannot resize the native window. Prototype the following coordinated sequence before committing to the final artwork:

1. Use an explicit `collapsed → expanding → expanded → collapsing` controller with one latest requested destination. Record a typewriter anchor in local coordinates; keep its screen position fixed across mode changes on platforms that allow positioning.
2. For expansion, request the expanded native size once, wait for the operation and actual webview resize/layout, then animate paper/controls with transform/opacity. Do not animate native dimensions frame by frame. Render the typewriter at its anchor while the window grows.
3. For collapse, animate paper/controls away first, then shrink the native window and restore the collapsed layout. Return focus to the expansion button. Prevent invisible controls from receiving focus or clicks.
4. Handle repeated clicks by reversing/settling toward the latest destination, without accumulating native resize calls or applying stale completion callbacks. Task data events continue independently and cannot be delayed behind animation.
5. If resize, transparency, or positioning is unavailable or visibly unstable, use a documented opaque native-window fallback with the same attached-paper metaphor. Do not reserve a large invisible window that blocks clicks over the desktop. Verify macOS transparency requirements and fallback without enabling private APIs casually.
6. Verify monitor edges, changed display scale, disconnect/reconnect, keyboard focus, dragging, a draft in the add field, and an error during a transition. Record a short real native-window video; browser screenshots do not prove this sequence.

## Visual system and theme experimentation

### Default visual direction

Aim for a premium editorial typewriter rather than novelty pixel art: warm cream paper, charcoal/ink frame, restrained oxblood accent, slightly imperfect material depth, generous whitespace, and a literate serif for headlines paired with an extremely legible UI sans. Avoid fake skeuomorphic clutter that harms clarity.

Use local/system fonts by default so V1 remains offline and robust. A licensed bundled display font can be added only with correct licensing and explicit asset loading.

Before substantial feature work, build a disposable-data design prototype of the collapsed typewriter and expanded sheet. Review three themes with empty, populated, long-text, completed, error, and keyboard-focus states. Save screenshots and a short native transition recording in a development artifact location; keep test note content fictional. Establish a reviewed baseline for typography, spacing, paper/housing proportions, and anchor continuity. Ask for aesthetic feedback at this milestone while continuing independent backend/test work; do not treat a self-generated screenshot baseline as user approval.

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

Document “add a theme” with one worked token override. Missing overrides fall back to valid default tokens; unknown saved theme IDs fall back to Ivory. Theme switching must preserve focus, drafts, scroll position, task state, and window mode. Give color/shadow transitions an explicit short duration (roughly 120–180 ms); typography/layout token changes may apply discretely to avoid reflow jitter. Disable decorative transitions for reduced motion. Do not use blanket `transition: all`.

### Animation principles

- Use CSS/Svelte transitions for visual changes; do not use JavaScript animation loops for routine UI movement.
- The expand/collapse transition should coordinate size, paper translation, opacity, and a very subtle shadow shift from one shared origin. Target 220–320 ms on enter and 160–220 ms on exit, using a natural non-bouncy ease.
- Animate only composited properties (`transform`, `opacity`) whenever possible. Avoid layout thrashing, filters over large areas, and long/springy motion.
- Checkbox completion should be restrained: brief check reveal and text-color transition, no theatrical strike-through.
- Respect `prefers-reduced-motion`: make transition durations near-instant, omit decorative movement, and retain unambiguous state changes.
- Do not block clicks, keyboard input, or file refresh while an animation runs. Apply external updates to the authoritative store immediately; visual animation must not become a data synchronization barrier. Disable only unavailable controls and the specific queued mutation when needed.

## Interaction design and accessibility

- Use semantic buttons, checkbox inputs, labels, and a real form for adding tasks.
- Keyboard path: Tab/Shift+Tab moves predictably; Enter submits the add field; Space toggles focused checkbox; Escape collapses or dismisses a non-critical notice.
- Visible `:focus-visible` rings must meet contrast requirements in every theme.
- Never convey state only by color: checked tasks also have checkbox state and text treatment; errors use icon/text, not just red.
- Meet WCAG 2.2 AA for text and interactive controls; check contrast of subdued paper/ink combinations per theme.
- Provide accessible names for icon-only controls and status updates via an appropriate polite live region.
- Keep pointer targets at least 24×24 CSS pixels, preferably 32×32 for primary controls.
- Ensure the default compact mode can be expanded without hover and without relying on a drag gesture.
- Expansion uses `aria-expanded` and `aria-controls`; collapsed content is hidden/inert, not merely transparent. Move focus deliberately when expanding, restore it on collapse, and preserve an unsent draft. Define Escape consistently: dismiss the active notice/settings first, otherwise collapse if there is no draft; retain a draft rather than discarding it. Manually check VoiceOver on macOS and the available Linux screen reader.

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
| Failure before replacement | Reconcile pending UI; leave source bytes intact | Retry after fixing the reported cause |
| Failure after replacement/outcome uncertain | Reload disk truth; disable writes until known | Inspect recovery versions; no automatic retry |
| Recovery snapshot unavailable | Refuse the write before replacement | Fix permission/storage issue and Retry |
| Watcher fails | Status “Live updates paused”; manual Reload remains available | Retry watcher/reselect file |

For developer diagnostics, keep local structured logs without writing todo text unnecessarily. User-facing messages should be concise and non-technical.

## Testing strategy

### Rust tests

- Parser fixtures: basic tasks, upper-case `X`, indentation, mixed prose, multiple headings, no Todos heading, CRLF, no trailing newline, unicode, and task-like text inside code fences (define and test expected behavior).
- Mutation tests: toggle only changes bracket state; add preserves unrelated content; creates `## Todos` correctly; preserves newline style.
- Race/stale revision tests: reject all stale requests, including duplicate task text and insertion above a target; serialize two queued widget writes; reject a mutation from a previously selected file.
- Inject changes before initial read, during temp creation, immediately before replacement, in the residual check/replace interval, and after replacement. Assert the documented detection/recovery limits rather than asserting an impossible universal no-race guarantee.
- Path validation tests: reject non-Markdown, directories, unset path, and frontend attempts to target another path.
- Watcher/debounce tests behind a testable abstraction, including replace/rename-style sequences.
- Inject failures in snapshot creation, temporary write, permission application, flush, replacement, and post-replacement read/sync. Assert intact original only for pre-replacement failures; uncertain outcomes reload safely. Verify snapshot retention and guarded cleanup.

### Frontend tests

- Component tests for empty, loading, normal, completed, long-task, error, and external-refresh states.
- Store tests ensure events replace stale local state and failed optimistic mutations roll back.
- Accessibility tests using automated checks plus keyboard-flow coverage.
- Theme tests confirm all theme IDs apply semantic tokens and focus styles.
- Feed events/results deliberately out of order, including events during initial load and after file switching; old sessions/sequences must never replace current truth. Confirm teardown disposes listeners and watcher/debounce jobs.

### End-to-end tests

Separate these layers explicitly:

- **Browser UI/visual tests:** Playwright against Vite with an injected service adapter and deterministic fake data. Cover keyboard behavior, themes, drafts, queued actions, event ordering, and reduced motion. Label reports as browser/mock tests.
- **Native integration tests:** exercise real Rust commands against temporary files and the real watcher; then launch the actual Tauri binary for picker, IPC, resizing, and packaged smoke tests. Current [Tauri guidance](https://v2.tauri.app/develop/tests/webdriver/) recommends WebdriverIO plus `@wdio/tauri-service` with an embedded driver that supports macOS/Linux. Verify a minimal launch test with pinned versions before relying on it. Gate automation plugins/server behind a dedicated test feature; verify their absence in production. Native file-picker interactions may need a documented manual step; never pass off a test-only file-selection hook as picker coverage.
- If a native automation route cannot run in the available environment, execute the native manual checklist, retain evidence, and report the remaining platform checks as pending. Full acceptance still requires checks on both declared platforms.

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
- Use per-platform/browser baselines with fixed viewport, scale, font availability, fake note data, and disabled animations for still captures. Review actual native-window recordings separately for resize/anchor continuity; compare complete windows, not cropped paper alone.

## Implementation phases and mandatory verification

### Phase 0 — Project foundation

1. Scaffold the Tauri 2 + Svelte + TypeScript app and set up linting, formatting, unit-test, E2E, and screenshot-test commands.
2. Add a concise README describing local-only scope, prerequisites, development commands, and selected-file behavior.
3. Configure least-privilege Tauri capabilities and package metadata for macOS/Linux.
4. Pin Rust with rustup, retain the working plain Svelte/Vite scaffold, and verify a minimal browser-test/native-test harness. Document production versus test-only capabilities.

Verification checks:

- Run dependency installation, formatter check, linter, frontend unit-test command, Rust test command, and production build successfully.
- Launch the development app; confirm it opens a native window with no browser-only assumptions.
- Inspect Tauri capabilities: no broad arbitrary filesystem access, no network capability unless a dependency explicitly requires it (it should not).
- Verify `rustup show active-toolchain`, `rustc --version`, and `cargo --version` from the project and resolve any Homebrew/rustup PATH ambiguity. Add and verify the command contract below.

### Phase 0A — Early aesthetic and native-window feasibility gate

1. Use fictional fixtures to prototype the typewriter and paper in all three themes, with actual native resizing and the explicit transition controller.
2. Review typography, proportions, paper origin, long tasks, focus, drafts, theme switching, and reduced motion before expanding feature implementation. Reuse an existing correct prototype.
3. Establish reviewed screenshots and a native transition recording. Obtain aesthetic feedback when available; continue independent backend work while awaiting it. Record fallback choices/platform limits as implementation decisions.

Verification checks:

- Repeatedly expand/collapse via mouse and keyboard; the typewriter stays visually anchored where supported, paper does not clip, and no invisible window region blocks desktop clicks.
- Switch themes during expansion and while typing; drafts/focus/data survive without a flash of unstyled content.
- Test native resize/transparency on macOS and the declared Debian environment; if one is unavailable, report it as pending and keep the fallback explicit.
- Capture the state/theme matrix and native motion video with fictional data. A visual regression baseline requires intentional review, not automatic blessing.

### Phase 1 — File model and native Markdown engine

1. Implement models, errors, parser, document hashing/revisions, selected-file persistence, and strict path validation.
2. Implement read, add, and toggle commands using atomic write semantics.
3. Create the fixture set before expanding UI work.

Verification checks:

- Run all Rust tests, including parser/mutation/revision/path fixtures.
- Diff every mutated fixture to confirm only the intended checkbox or added section changed.
- Manually choose a disposable `.md` file in the provided Obsidian Typewriter folder; confirm add/toggle works and the file remains readable by Obsidian.
- Verify non-`.md` selection and a missing file yield friendly errors and no write.
- Check byte-for-byte preservation outside edit spans, excluded Markdown contexts, duplicate headings/tasks, multiline rejection, recovery permission failures, and post-replacement uncertain outcomes.

### Phase 2 — Live synchronization

1. Add a debounced watcher for file and parent directory.
2. Define typed events and make the native layer the frontend’s single update channel.
3. Add external-change, deletion, rename, permission, and watcher-health states.

Verification checks:

- Edit and save the selected file in Obsidian; changed tasks appear in the widget in under 750 ms.
- Simulate repeated atomic-save replacement (write temp then rename); watching survives every replacement. Duplicate OS events may occur, but identical snapshots must not trigger redundant state changes.
- Toggle a task while externally editing the note; confirm no external content disappears and the user receives a safe refresh/retry result if conflict cannot be resolved.
- Stop/restart watching in a test harness; confirm manual Reload works and health state recovers.
- Switch files while callbacks/commands are pending and deliver events out of order; confirm only the current source and newest sequence render. Delete/recreate at the same path and verify automatic recovery.

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
   Refine the Phase 0A prototype rather than postponing the core visual/window design until this phase.
2. Introduce semantic tokens, Ivory/Midnight/High Contrast themes, and a live theme switcher.
3. Add one coherent shared expand/collapse transition and reduced-motion behavior.
4. Tune sizing, scroll containment, drag regions, persistence of position/mode, focus states, and platform scaling.

Verification checks:

- Run visual screenshot suite for every shipped theme/state and review diffs intentionally.
- Inspect macOS and Debian builds at normal and high-DPI scale: no blurred text, clipped paper, inaccessible drag area, or overlapping controls.
- With reduced motion enabled, confirm transitions are effectively instant yet state changes remain clear.
- Repeatedly expand/collapse during task updates; confirm the latest task state is rendered and interaction stays responsive.
- Verify resize-before-expand, shrink-after-collapse, latest-intent behavior, anchor preservation/fallback, focus return, draft retention, and graceful Wayland positioning limits in an actual native window.
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
- Verify production builds omit native automation driver plugins/server, use the restrictive CSP, render note text without HTML/remote resources, and document recovery snapshots and the residual simultaneous-editor race.
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
- Rust, frontend, browser/mock tests, native integration, packaging smoke, and visual QA checks pass on the declared macOS and Debian environments. Report missing native/platform evidence explicitly; do not count mocked IPC as native coverage.
- Every stale revision/source mutation is rejected, ordered updates cannot regress the displayed document, and recovery/uncertain-write behavior is verified. Documentation states the residual non-cooperating editor race instead of promising impossible compare-and-swap semantics.
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

## Concrete verification command contract

Phase 0 must wire these scripts (or document one exact equivalent per command) in `package.json`. Keep the package manager consistent with the existing lockfile. They are intended commands, not a claim that the scaffold already implements them:

```sh
npm ci
npm run check
npm run lint
npm run format:check
npm run test:unit -- --run
npm run test:ui
npm run test:visual
npm run test:native
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

- `test:unit`: frontend/store/component tests; `test:ui`: mocked browser interaction tests; `test:visual`: deterministic screenshots; `test:native`: real Tauri harness with test-only driver feature and disposable files. Do not put the driver feature in the default production build.
- Add meaningful tests as features land; scaffold verification must not claim a placeholder test proves file safety or native interoperability. Run the relevant commands and phase-specific manual checks after each phase; run the complete suite at release.
- Record command, platform/toolchain, result, and evidence location. When a test or native launch is blocked, record the actual reason and remaining check rather than repeatedly upgrading dependencies or marking it passed.

## Status as of 2026-10-04 (post-revision work)

This section tracks what's actually done vs. still open, to be updated as phases close. Verify against `git log --oneline` before trusting it — it can drift.

**Committed (`git log`):**
- Phase 0, 0A, 1, 2, 3 — scaffold, Markdown parser + write-safety, file watcher, functional Svelte shell. Last commit: `0cea73a test: wire real test:visual screenshot regression suite`.

**Done (committed earlier; list kept for history):**
- Visual redesign to match the user's reference screenshot: oxblood/brick typewriter housing, full QWERTY+number-row keyboard with spacebar, dashed-border paper sheet, dark "platen" roller bar between paper and keys (animates together with the paper, not separately), rounded corners handled correctly (native macOS window shadow disabled via `set_shadow(false)` in `lib.rs` — CSS `border-radius` alone left a visible square shadow box otherwise).
- Fixed window choreography bugs: `resizable:false` was blocking programmatic `setSize` too (now `resizable:true` with min/max pinning instead); window now grows/shrinks *upward* on expand/collapse (position adjusted by height delta) instead of just extending downward, matching the reference's "slides up" feel.
- Fixed a real Tauri capabilities bug: `core:default` only grants read-only window APIs — `set_size`/`set_min_size`/`set_max_size`/`set_position`/`start_dragging` needed explicit permissions in `src-tauri/capabilities/default.json`, or those calls silently no-op (this was the root cause of "clicking the widget does nothing" and "can't drag the window").
- Click-vs-drag split on the collapsed widget: only the keypad/counter area is clickable (expand/collapse); the surrounding red housing is a drag region (`data-tauri-drag-region`) so the window can still be moved.
- **User-resizable window**: dragging any edge/corner resizes the widget while the todo list is open (expanded state only — collapsed widget is pinned to a fixed size via `tauri.conf.json`'s `minWidth`/`minHeight`/`maxWidth`/`maxHeight` plus matching `setMinSize`/`setMaxSize` pinning in `nativeWindow.ts`). Scaling is CSS `font-size`-driven (not `transform: scale()`, which blurred text) so every `rem`-based measurement — fonts, keys, spacing — re-renders crisply at any size. Collapsing always resets the scale back to 1 and the window back to its exact default 380×252 size; nothing about window size is persisted to disk, so every launch starts at the default size regardless of how the user last left it.

**Explicitly deferred / not done:**
- Full manual native click-through verification beyond what's been screenshot-tested during this session (native file picker end-to-end, real toggle/add through the live UI with a real vault file) — spot-checked via `cliclick`/`screencapture` self-tests during development, not a formal pass.
- VoiceOver / Linux screen reader checks — manual, not done. No Linux environment available.
- Phase 5 (packaging: signed macOS build, Debian package, CSP hardening — currently `"csp": null` — privacy statement, strip test-only driver code, release notes). Explicitly deferred by the user until ready to actually distribute/install, not just `npm run tauri dev`.
- Content/structure of the todo list itself (phase-grouped sections with colored sub-headings like the reference screenshot's "PHASE 1: CONTENT" groups) — explicitly deferred; current parser reads one flat task list under `## Todos`, no sub-heading grouping.
- Automated tests do not yet cover the new resize/scale behavior (drag-resize bounds, scale-reset-on-collapse, pinned-when-collapsed) — only manually verified via the `cliclick` self-tests described above.

**How to apply:** before resuming, run `git status` and `git log --oneline` to confirm this still matches reality, then decide whether to commit the pending visual/resize work before starting anything new.


## Extension (user-approved 2026-10-04): saved named lists, one active file at a time

The V1 boundary of "exactly one configured Markdown file" is deliberately widened to **several saved named lists with exactly one active (and watched) file at a time**. Everything else in the product boundary is unchanged: Markdown stays the only source of truth, no daily-note templates, no folder scanning, no cloud.

**Implemented**
- Profile = immutable UUID + display name + one explicit `.md` path, kept in local app config only (never todo content). Legacy `selected_path` migrates into a first profile named "Personal"; theme and window position are preserved.
- Rust commands: `add_profile`, `rename_profile`, `relink_profile`, `remove_profile` (config only, never deletes the note), `switch_profile`. Paths only ever come from the native picker and go through `validate_selected_path`; the frontend never supplies a raw path. Task mutations resolve the active source internally.
- Switching mints a fresh source session (old watcher dropped, old session/sequence rejected as stale). The frontend supersedes the old session synchronously, so late results/events from the previous list cannot show under the new list's name.
- UI: `<  NAME  >` switcher lives in the **cream display on the housing above the keys** (collapsed and expanded; chevrons hidden with one list, "No list" with none, name truncates with full-text tooltip, done count shown compactly with an accessible description). It is a sibling of, not nested in, the separate expansion button (the keyboard artwork, labelled Open/Close todo list). The paper header keeps the list name as heading, the gear, the drag region and the red accent, with no arrows. Gear opens a lightweight list manager (rename inline, relink, two-step remove, add by name + picker). Paper heading shows the list name instead of a date. Per-list drafts and scroll offsets; short fade/slide of paper content only (disabled under `prefers-reduced-motion`); typewriter housing never moves.
- Missing/inaccessible note: per-list "Retry / Relink note" state with an actionable message; other lists stay navigable.
- `TYPEWRITER_CONFIG_DIR` overrides the config directory so dev/test runs never touch the real per-user config.
- Compaction: project `.claude/settings.json` sets `autoCompactEnabled: true`, `autoCompactWindow: 350000` (loaded at session start; `/autocompact 350k` confirmed for Sonnet 5.5).

**Verified (real results)**
- `cargo test`: 58 passed. `npm run test:unit`: 8 passed. `check`, `lint`, `format:check`: clean.
- Placement correction (cream display), verified 2026-10-04 with real exit codes (all 0): `npm run check`, `lint`, `format:check`, `test:unit` (8), `test:ui` (43, run 3x stable), `test:visual` (15), `build`, `cargo test` with the pinned 1.99.0 toolchain (58; the Homebrew rustc 1.85 earlier on PATH fails, put `~/.cargo/bin` first). New `display.ui.spec.ts` covers placement in both modes, collapsed/expanded switching, Enter/Space/click never toggling expansion, no nested interactive elements, accessible names, focus return, long names, one/no list, missing note, rapid clicks, drafts, correct-file writes, reduced motion. Cream-box geometry is unchanged (312x35 at the same offset).
- Playwright (mocked native layer, earlier run): ui 23 + visual 12 passing. The old visual baselines predated the approved redesign (wrong viewport, old look); they were regenerated at the real 380x252 / 380x636 sizes after reviewing each image. New baselines cover second list, long name, missing note, list manager.
- Native app (`npm run tauri dev`, repo-local fixtures and an isolated config): collapsed/expanded, switching, duplicate task text toggling only the active file on disk, external-edit refresh, missing note then Retry after the file appears, restart restores the active list, per-list drafts (never written to any file), rapid clicks settling on the last request, rename, remove (note file preserved), title-bar/housing drag, edge resize with crisp text, long-list scrolling and per-list scroll restore, legacy-config migration.
- Bugs found and fixed through native testing: switcher swallowed the title-bar drag region; rename input was not focused; Rust unit-variant errors serialize without a `message`, so users saw "Something unexpected went wrong"; two stale UI tests and all visual baselines predated earlier work.

**Not verified / open**
- Native pass after the placement correction was only partial: collapsed and expanded renders showed the display with arrows, and a few real clicks switched lists and opened the manager. The run was cut short because someone else began using the machine (cursor jumping, window moved), so unchanged-geometry-on-arrow-click, drag, resize, scroll restore, keyboard activation, long name, missing note and restart-restore were NOT re-checked natively after the change (they were checked before it, with the old placement). Redo these with `.claude-scratch/native/launch.sh` when the machine is idle.
- Screen recording of transition smoothness: not done.
- Native picker flows (add list, relink, first-file choose) need a human click; only the Rust validation and the mocked UI paths were exercised.
- Real Obsidian vault note (`Personal.md`): not touched by automated runs; the user connects it manually.
- Native `prefers-reduced-motion` and the switch transition itself (no screen recording tool); reduced motion is covered by a browser test only.
- Linux and VoiceOver: no environment available.
- Dev-only quirk: a Vite hot reload while expanded resets the webview to collapsed but leaves the native window tall. Restart the app.
- Expanding near the top of the screen is clamped by macOS (window cannot grow upward past the menu bar).

## Extension (user-approved 2026-10-04): daily folder lists

Lists whose content changes daily (Personal, Work) are **folders of dated notes**; evergreen lists (Groceries) stay a single file. User decision: a `+` button creates a note initialised with today's date in that folder.

**Implemented**
- `Profile.folder: Option<PathBuf>` (absent in old configs, which load unchanged). For a daily list `path` is the note currently shown (or a never-created `.typewriter-no-note.md` placeholder inside the folder, so the watcher watches the right directory). All existing machinery (watcher, sessions, guarded writes, recovery) still operates on one active file.
- Commands: `add_daily_profile` (native folder picker, opens on newest note, never creates files), `create_today_note(date)` (only creator of notes: `create_new`, template `# <List> — <date>` / blank / `## Todos`, an existing note is opened and never overwritten), `step_day(delta)` (older/newer existing note, error `no-such-day` at the ends), `get_day_info`. `switch_profile` opens a daily list on its newest note. `SwitchResult` now carries `day` so the date and document update together.
- The frontend supplies today's local date (no date crate; adding a dependency was out of bounds) and Rust validates it strictly as `YYYY-MM-DD`. Folder and date inputs are validated (`validate_selected_folder`, `validate_date`); only dated regular files are listed (no symlinks or sub-folders).
- UI: paper header shows `NAME  ‹ date ›  [+]  ⚙` for daily lists; empty folder shows "Create today's note". List manager add form has `+ daily folder` and `+ single file`; daily rows are tagged. Drafts and scroll offsets are kept per list and per day. Cream-display list switching is unchanged.
- Not built (by choice): carry-over of unchecked tasks, midnight auto-rollover, `+` in the collapsed state, folder scanning beyond dated notes.

**Verified (2026-10-04, exit 0):** `check`, `lint`, `format:check`, `test:unit` (8), `test:ui` (55, incl. 12 in `daily.ui.spec.ts`), `test:visual` (17, incl. daily header and empty-folder baselines), `build`, `cargo fmt --check`, `cargo test` (68, pinned toolchain). Rust tests cover date validation, listing/sorting, placeholder, folder validation, template creation without overwrite, a task added to a fresh note, neighbour stepping and day info. Real file creation is exercised by Rust unit tests on a temp dir; the browser tests use the mock adapter.

**Not verified:** the native app with a daily folder (folder picker, `+`, stepping, restart restore) was not run, because the machine was in use; Linux; VoiceOver; the real vault (never touched).

**Correction (same day):** an automatic one-folder setup that created Personal, Work and Groceries was tried and removed. The user creates and chooses every list folder themselves (first run: name + `Choose folder`; later: gear, `+ choose folder`); every list is a folder whose `+` creates a note dated today. Single-file lists remain only as an advanced option and for old configs.

**Second correction (same day):** adding a list now asks for a *parent* folder and creates `<parent>/<list name>/` plus today's dated note inside it (name validated as a single safe folder name; existing folders/notes reused, files or symlinks in the way rejected). The single-file option and the "Choose Markdown file" button were removed from the interface (backend still supports old single-file lists) to cut clutter. The start screen is one name field and one button.

**Leftovers (same day):** `get_leftovers` (read-only: unchecked tasks of the nearest earlier note) and `bring_over_leftovers` (one guarded write adding them to the shown note, skipping texts already present). The frontend offers a banner only for an empty daily note, dismissal lasts for the session per list+day. Tests: 3 Rust, 5 browser, 1 visual. Dummy data for manual testing lives in a new `Typewriter/Dummy/` folder in the user's vault (three fictional earlier days), created at the user's request.

**Same-folder lists (same day):** only the first list opens the folder picker. Later lists are created in the parent of the most recently added folder list (`default_parent`), with no dialog; the picker returns only if that location no longer exists. The list manager shows where new lists go. Moving a single list elsewhere is still possible with `relink`.
