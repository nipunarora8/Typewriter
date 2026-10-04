<script lang="ts">
  import { tick } from 'svelte'
  import type { Profile, TodoItem as TodoItemType } from '../types'
  import TodoItemRow from './TodoItem.svelte'
  import AddTaskForm from './AddTaskForm.svelte'
  import EmptyState from './EmptyState.svelte'
  import ErrorNotice from './ErrorNotice.svelte'
  import ProfileSwitcher from './ProfileSwitcher.svelte'

  export let tasks: TodoItemType[]
  export let draft: string
  export let errorMessage: string | null
  export let onToggle: (item: TodoItemType) => void
  export let onAdd: (text: string) => void
  export let onDismissError: () => void
  export let profiles: Profile[] = []
  export let activeProfileId: string | null = null
  export let onNavigate: (delta: 1 | -1) => void = () => {}
  export let onManage: () => void = () => {}
  export let loading = false
  export let unavailable = false
  export let onRetry: () => void = () => {}
  export let onRelink: () => void = () => {}

  const scrollByProfile: Record<string, number> = {}

  function handleScroll(el: HTMLElement) {
    if (activeProfileId) scrollByProfile[activeProfileId] = el.scrollTop
  }

  // The list element is recreated on every profile switch/load, so
  // restoring on mount regains a returning profile's scroll offset.
  function restoreScroll(node: HTMLElement) {
    const id = activeProfileId
    void tick().then(() => {
      node.scrollTop = id ? (scrollByProfile[id] ?? 0) : 0
    })
  }
</script>

<section id="todo-sheet" class="sheet" aria-label="Todo list">
  <header class="title-bar" data-tauri-drag-region>
    <ProfileSwitcher {profiles} {activeProfileId} {onNavigate} {onManage} />
    <span class="title-badge" aria-hidden="true" data-tauri-drag-region></span>
  </header>

  {#if unavailable}
    <div class="unavailable" role="alert">
      <p class="unavailable-message">{errorMessage ?? 'This note is unavailable.'}</p>
      <div class="unavailable-actions">
        <button type="button" on:click={onRetry}>Retry</button>
        <button type="button" on:click={onRelink}>Relink note</button>
      </div>
    </div>
  {:else}
    {#if errorMessage}
      <ErrorNotice message={errorMessage} onDismiss={onDismissError} />
    {/if}

    {#key `${activeProfileId}:${loading}`}
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

  .unavailable-actions button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
