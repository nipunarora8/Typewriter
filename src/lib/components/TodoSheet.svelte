<script lang="ts">
  import { tick } from 'svelte'
  import { NOT_DAILY, type DayInfo, type Profile, type TodoItem as TodoItemType } from '../types'
  import TodoItemRow from './TodoItem.svelte'
  import AddTaskForm from './AddTaskForm.svelte'
  import EmptyState from './EmptyState.svelte'
  import ErrorNotice from './ErrorNotice.svelte'

  export let tasks: TodoItemType[]
  export let draft: string
  export let errorMessage: string | null
  export let onToggle: (item: TodoItemType) => void
  export let onAdd: (text: string) => void
  export let onMove: (lineId: string, beforeLineId: string | null) => void = () => {}
  export let onDismissError: () => void
  export let profiles: Profile[] = []
  export let activeProfileId: string | null = null
  export let onManage: () => void = () => {}
  export let loading = false
  export let unavailable = false
  export let onRetry: () => void = () => {}
  export let onRelink: () => void = () => {}
  export let day: DayInfo = NOT_DAILY
  export let onStepDay: (delta: 1 | -1) => void = () => {}
  export let onCreateToday: () => void = () => {}
  export let onRemoveList: () => void = () => {}
  export let leftover: { fromDate: string; count: number } | null = null
  export let onBringOver: () => void = () => {}
  export let onDismissLeftover: () => void = () => {}

  $: activeName = profiles.find((p) => p.id === activeProfileId)?.displayName ?? 'No list'

  // Scroll offsets are kept per list, and per day within a daily list.
  $: scrollKey = activeProfileId ? `${activeProfileId}:${day.date ?? ''}` : null

  const scrollByKey: Record<string, number> = {}

  function handleScroll(el: HTMLElement) {
    if (scrollKey) scrollByKey[scrollKey] = el.scrollTop
  }

  // ---- drag to reorder ----
  // `dropBefore`: undefined = no valid target yet, null = after the last
  // task, string = before that task's lineId.
  let dragId: string | null = null
  let dropBefore: string | null | undefined = undefined
  let listEl: HTMLElement | null = null

  function targetFor(y: number): string | null {
    if (!listEl) return null
    const rows = Array.from(listEl.querySelectorAll<HTMLElement>('[data-line-id]'))
    for (const row of rows) {
      if (row.dataset.lineId === dragId) continue
      const r = row.getBoundingClientRect()
      if (y < r.top + r.height / 2) return row.dataset.lineId ?? null
    }
    return null
  }

  const DRAG_THRESHOLD = 5

  function handleDragStart(item: TodoItemType, e: PointerEvent) {
    if (e.button !== 0) return
    const row = e.currentTarget as HTMLElement
    const startX = e.clientX
    const startY = e.clientY
    const pointerId = e.pointerId
    let dragging = false

    function move(ev: PointerEvent) {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return
        dragging = true
        row.setPointerCapture(pointerId)
        dragId = item.lineId
      }
      dropBefore = targetFor(ev.clientY)
      if (listEl) {
        const r = listEl.getBoundingClientRect()
        if (ev.clientY < r.top + 24) listEl.scrollTop -= 8
        else if (ev.clientY > r.bottom - 24) listEl.scrollTop += 8
      }
    }
    function finish(commit: boolean) {
      row.removeEventListener('pointermove', move)
      row.removeEventListener('pointerup', up)
      row.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', esc, true)
      const id = dragId
      const target = dropBefore
      dragId = null
      dropBefore = undefined
      if (commit && dragging && id && target !== undefined) onMove(id, target)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation()
        finish(false)
      }
    }
    row.addEventListener('pointermove', move)
    row.addEventListener('pointerup', up)
    row.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', esc, true)
  }

  // Keyboard: Alt+Up/Down on a task's checkbox moves it one place. Focus
  // returns to that checkbox at its new position after the list re-renders.
  let refocusIndex: number | null = null

  function handleMoveKey(item: TodoItemType, e: KeyboardEvent) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const i = tasks.findIndex((t) => t.lineId === item.lineId)
    if (e.key === 'ArrowUp' && i > 0) {
      refocusIndex = i - 1
      onMove(item.lineId, tasks[i - 1].lineId)
    } else if (e.key === 'ArrowDown' && i < tasks.length - 1) {
      refocusIndex = i + 1
      onMove(item.lineId, i + 2 < tasks.length ? tasks[i + 2].lineId : null)
    }
  }

  $: if (tasks && refocusIndex !== null) {
    const idx = refocusIndex
    void tick().then(() => {
      listEl?.querySelectorAll<HTMLElement>('input[type="checkbox"]')[idx]?.focus()
    })
  }

  // The list element is recreated on every profile switch/load, so
  // restoring on mount regains a returning profile's scroll offset.
  function restoreScroll(node: HTMLElement) {
    const key = scrollKey
    void tick().then(() => {
      node.scrollTop = key ? (scrollByKey[key] ?? 0) : 0
    })
  }
</script>

<section id="todo-sheet" class="sheet" aria-label="Todo list">
  <header class="title-bar" data-tauri-drag-region>
    <span class="title-text" title={activeName} data-tauri-drag-region>{activeName}</span>
    {#if day.isDaily}
      <span class="day" role="group" aria-label="Day">
        <button
          type="button"
          class="day-step"
          aria-label="Older day"
          disabled={!day.hasOlder}
          on:click={() => onStepDay(-1)}>‹</button
        >
        <span class="day-date" data-testid="day-date">{day.date ?? 'no note'}</span>
        <button
          type="button"
          class="day-step"
          aria-label="Newer day"
          disabled={!day.hasNewer}
          on:click={() => onStepDay(1)}>›</button
        >
      </span>
      <button
        type="button"
        class="new-note"
        aria-label="New note for today"
        title="New note for today"
        disabled={loading}
        on:click={onCreateToday}>+</button
      >
    {/if}
    <button type="button" class="manage" aria-label="Manage lists" on:click={onManage}>⚙</button>
    <span class="title-badge" aria-hidden="true" data-tauri-drag-region></span>
  </header>

  {#if leftover && !unavailable && !loading}
    <div class="leftover" role="status">
      <span class="leftover-text">
        {leftover.count} unfinished from {leftover.fromDate}
      </span>
      <button type="button" class="leftover-primary" on:click={onBringOver}>Bring them over</button>
      <button type="button" on:click={onDismissLeftover}>Not now</button>
    </div>
  {/if}

  {#if unavailable}
    <div class="unavailable" role="alert">
      <p class="unavailable-message">
        {#if day.isDaily && day.date === null}
          No note in this folder yet.
        {:else}
          {errorMessage ?? 'This note is unavailable.'}
        {/if}
      </p>
      <div class="unavailable-actions">
        {#if day.isDaily && day.date === null}
          <button type="button" on:click={onCreateToday}>Create today's note</button>
        {/if}
        <button type="button" on:click={onRelink}>
          {day.isDaily ? 'Browse for folder' : 'Browse for note'}
        </button>
        <button type="button" on:click={onRetry}>Retry</button>
        <button type="button" class="quiet" on:click={onRemoveList}>Remove this list</button>
      </div>
      <p class="unavailable-hint">Removing a list only forgets it. Your notes are never deleted.</p>
    </div>
  {:else}
    {#if errorMessage}
      <ErrorNotice message={errorMessage} onDismiss={onDismissError} />
    {/if}

    {#key `${scrollKey}:${loading}`}
      <div
        class="list swap"
        class:dragging={dragId !== null}
        class:drop-end={dragId !== null && dropBefore === null}
        role="list"
        bind:this={listEl}
        use:restoreScroll
        on:scroll={(e) => handleScroll(e.currentTarget)}
      >
        {#if loading}
          <!-- placeholder while the newly selected list loads -->
        {:else if tasks.length === 0}
          <EmptyState />
        {:else}
          {#each tasks as task (task.lineId)}
            <div
              role="listitem"
              data-line-id={task.lineId}
              class:drag-source={dragId === task.lineId}
              class:drop-before={dragId !== null && dropBefore === task.lineId}
            >
              <TodoItemRow
                item={task}
                {onToggle}
                onDragStart={handleDragStart}
                onMoveKey={handleMoveKey}
              />
            </div>
          {/each}
        {/if}
      </div>
    {/key}
  {/if}

  <AddTaskForm bind:draft onSubmit={onAdd} disabled={unavailable || loading} />
</section>

<style>
  .sheet {
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

  .title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3) var(--space-2);
    border-bottom: 1px dashed var(--border-subtle);
  }

  .title-text {
    flex: 1;
    min-width: 0;
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--color-ink);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .manage {
    all: unset;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    font-size: 1.15rem;
    line-height: 1;
    color: var(--color-ink);
    border-radius: var(--radius-control);
  }

  .manage:hover {
    background: var(--border-subtle);
  }

  .manage:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  .leftover {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--border-subtle);
    border-bottom: 1px dashed var(--border-subtle);
    font-family: var(--font-body);
    font-size: 0.75rem;
    color: var(--color-ink);
  }

  .leftover-text {
    flex: 1;
    min-width: 0;
  }

  .leftover button {
    all: unset;
    cursor: pointer;
    padding: 0.1rem var(--space-2);
    font-size: 0.72rem;
    color: var(--color-ink);
    border-radius: var(--radius-control);
  }

  .leftover button:hover {
    text-decoration: underline;
  }

  .leftover .leftover-primary {
    font-weight: 700;
    color: var(--color-accent-ink);
    background: var(--color-accent);
  }

  .leftover button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  .day {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .day-date {
    font-family: var(--font-body);
    font-size: 0.7rem;
    color: var(--color-muted-ink);
    white-space: nowrap;
  }

  .day-step,
  .new-note {
    all: unset;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.1rem;
    height: 1.1rem;
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1;
    color: var(--color-ink);
    border-radius: var(--radius-control);
  }

  .new-note {
    color: var(--color-accent-ink);
    background: var(--color-accent);
  }

  .day-step:disabled,
  .new-note:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .day-step:focus-visible,
  .new-note:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  .title-badge {
    flex-shrink: 0;
    width: 0.55rem;
    height: 0.55rem;
    background: var(--color-accent);
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) var(--space-3);
  }

  .list.dragging {
    cursor: grabbing;
    user-select: none;
    -webkit-user-select: none;
  }

  [role='listitem'].drag-source {
    opacity: 0.45;
  }

  [role='listitem'].drop-before {
    box-shadow: 0 -2px 0 0 var(--color-accent);
  }

  .list.drop-end {
    box-shadow: inset 0 -2px 0 0 var(--color-accent);
  }

  .swap {
    animation: paper-swap 140ms ease-out;
  }

  @keyframes paper-swap {
    from {
      opacity: 0;
      transform: translateY(0.25rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .swap {
      animation: none;
    }
  }

  .unavailable {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-4);
    text-align: center;
  }

  .unavailable-message {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--color-danger);
  }

  .unavailable-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
  }

  .unavailable-actions button {
    min-height: 28px;
    padding: var(--space-1) var(--space-3);
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-accent-ink);
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-control);
    cursor: pointer;
  }

  .unavailable-actions button.quiet {
    color: var(--color-ink);
    background: var(--border-subtle);
  }

  .unavailable-hint {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.7rem;
    color: var(--color-muted-ink);
  }

  .unavailable-actions button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
