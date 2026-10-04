<script lang="ts">
  export let onExpand: () => void
  export let expanded: boolean
  export let dockedBelowSheet = false
  export let doneCount = 0
  export let totalCount = 0

  const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM!?']
</script>

<div class="typewriter" class:docked={dockedBelowSheet} data-tauri-drag-region>
  <button
    type="button"
    class="clickable-area"
    aria-expanded={expanded}
    aria-controls="todo-sheet"
    on:click={onExpand}
  >
    <span class="counter" aria-hidden="true">
      <span class="plus">+</span>
      <span class="count">{totalCount > 0 ? `${doneCount}/${totalCount} done` : 'no tasks'}</span>
      <span class="plus">+</span>
    </span>
    <span class="keys" aria-hidden="true">
      {#each rows as row}
        <span class="key-row">
          {#each row as letter}
            <span class="key">{letter}</span>
          {/each}
        </span>
      {/each}
      <span class="spacebar"></span>
    </span>
  </button>
</div>

<style>
  .typewriter {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border-radius: var(--radius-widget);
    box-shadow: var(--shadow-widget);
  }

  .typewriter.docked {
    border-radius: 0 0 var(--radius-widget) var(--radius-widget);
  }

  .clickable-area {
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    cursor: pointer;
  }

  .clickable-area:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 3px;
  }

  .counter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 92%;
    padding: 0.5rem var(--space-2);
    background: var(--color-key);
    border: 2px solid var(--color-key-ink);
    border-radius: var(--radius-control);
  }

  .plus {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-key-ink);
    line-height: 1;
  }

  .count {
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--color-key-ink);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .keys {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }

  .key-row {
    display: flex;
    gap: 0.3rem;
  }

  .key {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 999px;
    background: var(--color-key);
    border: 2px solid var(--color-key-ink);
    color: var(--color-key-ink);
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1;
  }

  .spacebar {
    width: 78%;
    height: 1.4rem;
    margin-top: 0.05rem;
    background: var(--color-key);
    border: 2px solid var(--color-key-ink);
    border-radius: var(--radius-control);
  }
</style>
