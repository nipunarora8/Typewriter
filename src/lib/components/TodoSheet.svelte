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
        role="list"
        use:restoreScroll
        on:scroll={(e) => handleScroll(e.currentTarget)}
      >
        {#if loading}
          <!-- placeholder while the newly selected list loads -->
        {:else if tasks.length === 0}
          <EmptyState />
        {:else}
          {#each tasks as task (task.lineId)}
            <div role="listitem">
              <TodoItemRow item={task} {onToggle} />
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
