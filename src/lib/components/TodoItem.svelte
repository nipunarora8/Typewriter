<script lang="ts">
  import type { TodoItem } from '../types'
  import { displayText } from '../displayText'

  export let item: TodoItem
  export let onToggle: (item: TodoItem) => void
  export let onGripDown: (item: TodoItem, e: PointerEvent) => void = () => {}
  export let onGripKey: (item: TodoItem, e: KeyboardEvent) => void = () => {}
</script>

<label class="task" class:completed={item.completed}>
  <input
    type="checkbox"
    checked={item.completed}
    on:change={() => onToggle(item)}
    aria-label={displayText(item.text)}
  />
  <span class="text">{displayText(item.text)}</span>
  <button
    type="button"
    class="grip"
    aria-label="Reorder: drag, or press Up or Down arrow"
    title="Drag to reorder"
    on:click|preventDefault|stopPropagation
    on:pointerdown={(e) => onGripDown(item, e)}
    on:keydown={(e) => onGripKey(item, e)}>⠿</button
  >
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

  .grip {
    margin-left: auto;
    flex-shrink: 0;
    min-width: 24px;
    min-height: 24px;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-muted-ink);
    font-size: 1rem;
    line-height: 1;
    cursor: grab;
    opacity: 0.35;
    touch-action: none;
    transition: opacity var(--duration-fast) var(--ease-exit);
  }

  .task:hover .grip,
  .grip:focus-visible {
    opacity: 1;
  }

  .grip:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
    border-radius: 0.2rem;
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
