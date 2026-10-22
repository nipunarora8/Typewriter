<script lang="ts">
  import type { TodoItem } from '../types'
  import { displayText } from '../displayText'

  export let item: TodoItem
  export let onToggle: (item: TodoItem) => void
  export let onDragStart: (item: TodoItem, e: PointerEvent) => void = () => {}
  export let onMoveKey: (item: TodoItem, e: KeyboardEvent) => void = () => {}

  function handlePointerDown(e: PointerEvent) {
    // The checkbox only completes a task; the rest of the row drags it.
    if ((e.target as HTMLElement).closest('input')) return
    onDragStart(item, e)
  }
</script>

<div
  role="presentation"
  class="task"
  class:completed={item.completed}
  on:pointerdown={handlePointerDown}
>
  <input
    type="checkbox"
    checked={item.completed}
    on:change={() => onToggle(item)}
    on:keydown={(e) => onMoveKey(item, e)}
    aria-label={displayText(item.text)}
    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
  />
  <span class="text">{displayText(item.text)}</span>
</div>

<style>
  .task {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-1);
    cursor: grab;
    touch-action: none;
    border-radius: var(--radius-control);
  }

  .task:focus-within {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  input[type='checkbox'] {
    appearance: none;
    width: 1.25rem;
    height: 1.25rem;
    min-width: 24px;
    min-height: 24px;
    margin-top: 0.1rem;
    flex-shrink: 0;
    border: 2px solid var(--color-ink);
    border-radius: 0.2rem;
    background: var(--color-paper);
    display: grid;
    place-content: center;
    cursor: pointer;
  }

  input[type='checkbox']:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  input[type='checkbox']:checked {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  input[type='checkbox']:checked::after {
    content: '';
    width: 0.55rem;
    height: 0.3rem;
    border-left: 2px solid var(--color-accent-ink);
    border-bottom: 2px solid var(--color-accent-ink);
    transform: rotate(-45deg) translateY(-1px);
  }

  .text {
    font-family: var(--font-body);
    font-size: 0.9rem;
    line-height: 1.4;
    color: var(--color-ink);
    word-break: break-word;
    transition: color var(--duration-fast) var(--ease-exit);
  }

  .completed .text {
    color: var(--color-muted-ink);
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
    text-decoration-color: var(--color-accent);
  }
</style>
