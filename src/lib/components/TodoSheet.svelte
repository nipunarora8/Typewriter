<script lang="ts">
  import type { TodoItem as TodoItemType } from '../types'
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

  const title = new Date().toISOString().slice(0, 10)
</script>

<section id="todo-sheet" class="sheet" aria-label="Todo list">
  <header class="title-bar" data-tauri-drag-region>
    <span class="title-text">··· {title} — TODOS</span>
    <span class="title-badge" aria-hidden="true"></span>
  </header>

  {#if errorMessage}
    <ErrorNotice message={errorMessage} onDismiss={onDismissError} />
  {/if}

  <div class="list" role="list">
    {#if tasks.length === 0}
      <EmptyState />
    {:else}
      {#each tasks as task (task.lineId)}
        <div role="listitem">
          <TodoItemRow item={task} {onToggle} />
        </div>
      {/each}
    {/if}
  </div>

  <AddTaskForm bind:draft onSubmit={onAdd} />
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
</style>
