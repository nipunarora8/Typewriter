<script lang="ts">
  import { onMount, tick } from 'svelte'
  import TypewriterWidget from './lib/components/TypewriterWidget.svelte'
  import TodoSheet from './lib/components/TodoSheet.svelte'
  import { widgetMode, widgetController } from './lib/stores/widget'
  import { applyTheme, resolveThemeId, THEME_IDS, type ThemeId } from './lib/theme/theme'
  import { fictionalTasks } from './lib/fixtures/fictionalTasks'
  import type { TodoItem } from './lib/types'

  let tasks: TodoItem[] = fictionalTasks
  let draft = ''
  let errorMessage: string | null = null
  let themeId: ThemeId = resolveThemeId(null)

  let expandButtonEl: HTMLElement | undefined
  let sheetContainerEl: HTMLElement | undefined

  $: isExpandedLike = $widgetMode === 'expanding' || $widgetMode === 'expanded'

  onMount(() => {
    applyTheme(themeId)
  })

  function handleThemeChange(id: ThemeId) {
    themeId = id
    applyTheme(id)
  }

  async function handleExpand() {
    await widgetController.requestExpand()
    await tick()
    const firstFocusable = sheetContainerEl?.querySelector<HTMLElement>(
      'input[type="text"], button, [tabindex]',
    )
    firstFocusable?.focus()
  }

  function handleRequestCollapse() {
    const generation = widgetController.currentGeneration() + 1
    widgetController.requestCollapse()
    // The sheet's own CSS exit transition drives timing; finishCollapse
    // is invoked from the transition's outro callback below.
    pendingCollapseGeneration = generation
  }

  let pendingCollapseGeneration = 0

  async function onSheetExitComplete() {
    await widgetController.finishCollapse(pendingCollapseGeneration)
    await tick()
    expandButtonEl?.focus()
  }

  function handleToggle(item: TodoItem) {
    tasks = tasks.map((t) => (t.lineId === item.lineId ? { ...t, completed: !t.completed } : t))
  }

  function handleAdd(text: string) {
    tasks = [
      ...tasks,
      {
        lineId: `fictional:${Date.now()}`,
        lineIndex: tasks.length,
        text,
        completed: false,
        indent: '',
      },
    ]
    draft = ''
  }

  function dismissError() {
    errorMessage = null
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if ($widgetMode !== 'expanded') return
    if (errorMessage) {
      dismissError()
      return
    }
    if (draft.trim().length > 0) return
    handleRequestCollapse()
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<main class="root" data-widget-mode={$widgetMode}>
  <div class="widget-slot" class:hidden={isExpandedLike}>
    <div bind:this={expandButtonEl} style="width: 100%; height: 100%;">
      <TypewriterWidget onExpand={handleExpand} expanded={isExpandedLike} />
    </div>
  </div>

  {#if $widgetMode !== 'collapsed'}
    <div
      class="sheet-slot"
      class:collapsing={$widgetMode === 'collapsing'}
      bind:this={sheetContainerEl}
      on:transitionend={() => {
        if ($widgetMode === 'collapsing') onSheetExitComplete()
      }}
    >
      <TodoSheet
        {tasks}
        bind:draft
        {errorMessage}
        onToggle={handleToggle}
        onAdd={handleAdd}
        onDismissError={dismissError}
      />
    </div>
  {/if}

  <div class="dev-theme-switcher" aria-label="Theme switcher (Phase 0A prototype)">
    {#each THEME_IDS as id}
      <button type="button" class:active={themeId === id} on:click={() => handleThemeChange(id)}>
        {id}
      </button>
    {/each}
  </div>
</main>

<style>
  :global(html, body) {
    margin: 0;
    background: transparent;
  }

  .root {
    position: relative;
    width: 100%;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-body);
  }

  .widget-slot {
    width: 100%;
    height: 100%;
  }

  .widget-slot.hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .sheet-slot {
    position: absolute;
    inset: 0;
    opacity: 1;
    transform: scale(1) translateY(0);
    transition:
      opacity var(--duration-sheet-enter) var(--ease-enter),
      transform var(--duration-sheet-enter) var(--ease-enter);
  }

  .sheet-slot.collapsing {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
    transition:
      opacity var(--duration-sheet-exit) var(--ease-exit),
      transform var(--duration-sheet-exit) var(--ease-exit);
  }

  .dev-theme-switcher {
    position: fixed;
    bottom: 4px;
    right: 4px;
    display: flex;
    gap: 2px;
    font-size: 9px;
    z-index: 100;
  }

  .dev-theme-switcher button {
    all: unset;
    cursor: pointer;
    padding: 2px 4px;
    background: var(--color-surface);
    color: var(--color-ink);
    border: 1px solid var(--border-subtle);
  }

  .dev-theme-switcher button.active {
    outline: 1px solid var(--color-focus);
  }
</style>
