<script lang="ts">
  import type { TodoItem } from '../types'

  export let item: TodoItem
  export let onToggle: (item: TodoItem) => void
</script>

<label class="task" class:completed={item.completed}>
  <input
    type="checkbox"
    checked={item.completed}
    on:change={() => onToggle(item)}
    aria-label={item.text}
  />
  <span class="text">{item.text}</span>
</label>

<style>
  .task {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-1);
    cursor: pointer;
    border-radius: var(--radius-control);
  }

  .task:focus-within {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  input[type='checkbox'] {
    width: 1.25rem;
    height: 1.25rem;
    min-width: 24px;
    min-height: 24px;
    margin-top: 0.1rem;
    accent-color: var(--color-accent);
    flex-shrink: 0;
  }

  .text {
    font-family: var(--font-body);
    font-size: 0.95rem;
    line-height: 1.4;
    color: var(--color-ink);
    word-break: break-word;
    transition: color var(--duration-fast) var(--ease-exit);
  }

  .completed .text {
    color: var(--color-muted-ink);
  }
</style>
