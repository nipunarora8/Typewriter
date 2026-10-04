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
</script>

<section id="todo-sheet" class="sheet" aria-label="Todo list">
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
    border: 1px solid var(--color-paper-edge);
    border-radius: var(--radius-paper);
    box-shadow: var(--shadow-paper);
    overflow: hidden;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) var(--space-3);
  }
</style>
