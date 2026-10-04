<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import TypewriterWidget from './lib/components/TypewriterWidget.svelte'
  import TodoSheet from './lib/components/TodoSheet.svelte'
  import FilePicker from './lib/components/FilePicker.svelte'
  import ListManager from './lib/components/ListManager.svelte'
  import { widgetMode, widgetController } from './lib/stores/widget'
  import {
    COLLAPSED_SIZE,
    EXPANDED_SIZE,
    onNativeResize,
    readCurrentScale,
  } from './lib/services/nativeWindow'
  import { initializePreferences, windowScale } from './lib/stores/preferences'
  import {
    todosState,
    initialize as initializeTodos,
    teardown as teardownTodos,
    toggleTask,
    addTask,
    dismissError,
  } from './lib/stores/todos'
  import {
    profilesState,
    profileController,
    draftFor,
    setDraftFor,
    dayInfo,
  } from './lib/stores/profiles'
  import {
    leftovers,
    refreshLeftovers,
    dismissLeftovers,
    bringOverLeftovers,
  } from './lib/stores/leftovers'
  import { autoUpdateOnLaunch } from './lib/services/tauri'
  import type { TodoItem } from './lib/types'

  let draft = ''
  let draftOwner: string | null = null
  let managerOpen = false
  let expandButtonEl: HTMLButtonElement | undefined
  let sheetContainerEl: HTMLElement | undefined
  let pendingCollapseGeneration = 0
  // Only keyboard-driven collapses move focus back to the expansion button;
  // after a mouse click a programmatic focus would draw a stray focus ring.
  let collapseByKeyboard = false

  $: isExpandedLike = $widgetMode === 'expanding' || $widgetMode === 'expanded'
  $: isExpandedOrTransitioning = $widgetMode !== 'collapsed'
  $: tasks = $todosState.document?.tasks ?? []
  $: hasFile = $todosState.document !== null
  $: errorMessage = $todosState.errorMessage
  $: loading = $todosState.loading
  $: hasProfiles = $profilesState.profiles.length > 0
  $: unavailable = !hasFile && !loading && hasProfiles
  // Offer leftovers from the previous day only for an empty daily note.
  $: dismissKey = $profilesState.activeProfileId
    ? `${$profilesState.activeProfileId}|${$dayInfo.date ?? ''}`
    : null
  $: void refreshLeftovers(
    $todosState.document?.sourceSession ?? null,
    $dayInfo.isDaily && $dayInfo.date !== null && hasFile && tasks.length === 0,
    dismissKey,
  )

  // A draft belongs to one list and, within a daily list, one day.
  $: syncDraftOwner(
    $profilesState.activeProfileId
      ? `${$profilesState.activeProfileId}|${$dayInfo.date ?? ''}`
      : null,
  )

  // Unsent drafts belong to the profile they were typed in: park the
  // current text under its owner and load the newly active profile's own.
  function syncDraftOwner(activeId: string | null) {
    if (activeId === draftOwner) return
    setDraftFor(draftOwner, draft)
    draft = draftFor(activeId)
    draftOwner = activeId
  }

  let resizeUnlisten: (() => void) | undefined
  let resizeDebounceId: ReturnType<typeof setTimeout> | undefined
  let updateTimer: ReturnType<typeof setTimeout> | undefined

  onMount(() => {
    void initializePreferences()
    void profileController.hydrate()
    void initializeTodos()
    // Let the widget appear first, then look for a newer release.
    updateTimer = setTimeout(() => void autoUpdateOnLaunch(), 5000)
    void onNativeResize(handleNativeResize).then((unlisten) => {
      resizeUnlisten = unlisten
    })
  })

  onDestroy(() => {
    void teardownTodos()
    resizeUnlisten?.()
    if (resizeDebounceId) clearTimeout(resizeDebounceId)
    if (updateTimer) clearTimeout(updateTimer)
  })

  // Drag-resize is a live, session-only convenience: the window's own
  // size is the source of truth while open, but nothing is persisted
  // to disk, so the app always launches at the default size.
  function handleNativeResize() {
    if (resizeDebounceId) clearTimeout(resizeDebounceId)
    resizeDebounceId = setTimeout(() => {
      void syncScaleFromWindow()
    }, 250)
  }

  async function syncScaleFromWindow() {
    // Resizing is only offered while expanded; collapsed/transitioning
    // windows are pinned to a fixed size, so a resize event there is
    // always our own programmatic call, not a user drag.
    if (!isExpandedLike) return
    const measured = await readCurrentScale(EXPANDED_SIZE)
    if (measured === null) return
    if (Math.abs(measured - $windowScale) < 0.01) return
    windowScale.set(measured)
  }

  async function handleExpand() {
    await widgetController.requestExpand()
    await tick()
    // Same effective target as before the list switcher existed: the
    // add-task input (header chevrons must not steal initial focus).
    const firstFocusable =
      sheetContainerEl?.querySelector<HTMLElement>('#add-task-input:not([disabled])') ??
      sheetContainerEl?.querySelector<HTMLElement>('.list button, [tabindex]')
    firstFocusable?.focus()
  }

  function handleWidgetClick(event?: MouseEvent) {
    if (isExpandedLike) {
      // detail === 0 means the click came from Enter/Space, not a pointer.
      collapseByKeyboard = !event || event.detail === 0
      handleRequestCollapse()
    } else {
      void handleExpand()
    }
  }

  function handleRequestCollapse() {
    const generation = widgetController.currentGeneration() + 1
    widgetController.requestCollapse()
    pendingCollapseGeneration = generation
  }

  async function onSheetExitComplete() {
    await widgetController.finishCollapse(pendingCollapseGeneration)
    await tick()
    if (collapseByKeyboard) expandButtonEl?.focus()
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  function handleToggle(item: TodoItem) {
    void toggleTask(item)
  }

  function handleAdd(text: string) {
    if (!hasFile || loading) return
    void addTask(text)
    draft = ''
  }

  function handleNavigate(delta: 1 | -1) {
    void profileController.navigate(delta)
  }

  function handleRelinkActive() {
    const id = $profilesState.activeProfileId
    if (id) void profileController.relinkProfile(id)
  }

  async function handleAddProfile(name: string, kind: 'file' | 'daily') {
    if (kind === 'daily') await profileController.addDailyProfile(name)
    else await profileController.addProfile(name)
    managerOpen = false
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if ($widgetMode !== 'expanded') return
    if (managerOpen) {
      managerOpen = false
      return
    }
    if (errorMessage) {
      dismissError()
      return
    }
    if (draft.trim().length > 0) return
    collapseByKeyboard = true
    handleRequestCollapse()
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<main
  class="root"
  data-widget-mode={$widgetMode}
  style="--collapsed-height: {COLLAPSED_SIZE.height / 16}rem; font-size: {16 * $windowScale}px;"
>
  <div class="drag-strip" data-tauri-drag-region aria-hidden="true"></div>

  {#if isExpandedOrTransitioning}
    <div
      class="sheet-slot"
      class:collapsing={$widgetMode === 'collapsing'}
      bind:this={sheetContainerEl}
      on:transitionend={() => {
        if ($widgetMode === 'collapsing') onSheetExitComplete()
      }}
    >
      <div class="sheet-slot-paper">
        {#if !hasFile && !hasProfiles}
          <div class="sheet-shell">
            {#if errorMessage}
              <p class="inline-error" role="alert">{errorMessage}</p>
            {/if}
            <FilePicker
              onChooseFolder={(name) => handleAddProfile(name, 'daily')}
              busy={$todosState.loading}
            />
          </div>
        {:else}
          <TodoSheet
            {tasks}
            bind:draft
            {errorMessage}
            {loading}
            {unavailable}
            profiles={$profilesState.profiles}
            activeProfileId={$profilesState.activeProfileId}
            onToggle={handleToggle}
            onAdd={handleAdd}
            onDismissError={dismissError}
            onManage={() => (managerOpen = true)}
            day={$dayInfo}
            onStepDay={(delta) => void profileController.stepDay(delta)}
            onCreateToday={() => void profileController.createTodayNote()}
            leftover={$leftovers}
            onBringOver={() => void bringOverLeftovers()}
            onDismissLeftover={() => dismissLeftovers(dismissKey)}
            onRemoveList={() => {
              const id = $profilesState.activeProfileId
              if (id) void profileController.removeProfile(id)
            }}
            onRetry={() => void profileController.retry()}
            onRelink={handleRelinkActive}
          />
        {/if}
        {#if managerOpen}
          <ListManager
            profiles={$profilesState.profiles}
            activeProfileId={$profilesState.activeProfileId}
            onClose={() => (managerOpen = false)}
            onAdd={handleAddProfile}
            onRename={(id, name) => void profileController.renameProfile(id, name)}
            onRelink={(id) => void profileController.relinkProfile(id)}
            onRemove={(id) => void profileController.removeProfile(id)}
          />
        {/if}
      </div>
      <div class="platen" aria-hidden="true">
        <span class="platen-shine"></span>
      </div>
    </div>
  {/if}

  <div class="widget-slot">
    <TypewriterWidget
      bind:expandButton={expandButtonEl}
      onExpand={handleWidgetClick}
      expanded={isExpandedLike}
      dockedBelowSheet={isExpandedOrTransitioning}
      doneCount={tasks.filter((t) => t.completed).length}
      totalCount={tasks.length}
      profiles={$profilesState.profiles}
      activeProfileId={$profilesState.activeProfileId}
      onNavigate={handleNavigate}
    />
  </div>
</main>

<style>
  :global(html, body) {
    margin: 0;
    overflow: hidden;
    background: transparent;
    /* Prevent WebKit's text-selection drag (dashed marching-ants box)
       from triggering on click-drag over decorative spans/keys — this
       is a chrome-less widget, not a document, so nothing in it should
       ever be text-selectable. */
    -webkit-user-select: none;
    user-select: none;
  }

  :global(*) {
    -webkit-user-drag: none;
  }

  .root {
    position: relative;
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
  }

  .drag-strip {
    flex-shrink: 0;
    width: 100%;
    height: 0.5rem;
  }

  .widget-slot {
    flex-shrink: 0;
    width: 100%;
    height: calc(var(--collapsed-height, 15.75rem) - 0.5rem);
  }

  .sheet-slot {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    opacity: 1;
    transform: scaleY(1);
    transform-origin: bottom;
    transition:
      opacity var(--duration-sheet-enter) var(--ease-enter),
      transform var(--duration-sheet-enter) var(--ease-enter);
  }

  .sheet-slot.collapsing {
    opacity: 0;
    transform: scaleY(0.92);
    transition:
      opacity var(--duration-sheet-exit) var(--ease-exit),
      transform var(--duration-sheet-exit) var(--ease-exit);
  }

  .sheet-slot-paper {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .platen {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1rem;
    background: #2a2a2e;
  }

  .platen-shine {
    width: 92%;
    height: 0.3rem;
    border-radius: 999px;
    background: #44444a;
  }

  .sheet-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: var(--color-paper);
    border: 2px dashed var(--color-paper-edge);
    border-bottom: none;
    border-radius: var(--radius-widget) var(--radius-widget) 0 0;
    box-shadow: var(--shadow-paper);
    overflow: hidden;
  }

  .inline-error {
    margin: var(--space-2) var(--space-3) 0;
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--color-danger);
  }
</style>
