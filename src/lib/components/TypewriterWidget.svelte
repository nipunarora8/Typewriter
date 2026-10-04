<script lang="ts">
  export let onExpand: () => void
  export let expanded: boolean
  export let doneCount = 0
  export let totalCount = 0

  const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']
</script>

<button
  type="button"
  class="typewriter"
  aria-expanded={expanded}
  aria-controls="todo-sheet"
  on:click={onExpand}
>
  <span class="counter" aria-hidden="true">
    <span class="arrow">‹</span>
    <span class="count">{totalCount > 0 ? `${doneCount}/${totalCount} done` : 'no tasks'}</span>
    <span class="arrow">›</span>
  </span>
  <span class="keys" aria-hidden="true">
    {#each rows as row}
      <span class="key-row">
        {#each row as letter}
          <span class="key">{letter}</span>
        {/each}
      </span>
    {/each}
  </span>
  <span class="label">Open todos</span>
</button>

<style>
  .typewriter {
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    cursor: pointer;
    background: var(--color-surface);
    border-radius: var(--radius-widget);
    box-shadow: var(--shadow-widget);
  }

  .typewriter:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 3px;
  }

  .counter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 86%;
    padding: 0.2rem var(--space-2);
    background: var(--color-surface-shade);
    border-radius: var(--radius-control);
  }

  .arrow {
    font-size: 0.65rem;
    color: var(--color-on-surface-muted);
    line-height: 1;
  }

  .count {
    font-family: var(--font-body);
    font-size: 0.65rem;
    color: var(--color-on-surface);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .keys {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.14rem;
  }

  .key-row {
    display: flex;
    gap: 0.14rem;
  }

  .key {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    background: var(--color-key);
    border: 1px solid var(--border-key);
    color: var(--color-key-ink);
    font-family: var(--font-body);
    font-size: 0.4rem;
    font-weight: 700;
    line-height: 1;
  }

  .label {
    font-family: var(--font-body);
    font-size: 0.65rem;
    color: var(--color-on-surface-muted);
    letter-spacing: 0.02em;
    margin-top: 0.1rem;
  }
</style>
