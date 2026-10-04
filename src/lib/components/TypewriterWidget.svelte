<script lang="ts">
  export let onExpand: () => void
  export let expanded: boolean
</script>

<button
  type="button"
  class="typewriter"
  aria-expanded={expanded}
  aria-controls="todo-sheet"
  on:click={onExpand}
>
  <span class="body">
    <span class="carriage"></span>
    <span class="keys" aria-hidden="true">
      {#each { length: 3 } as _}
        <span class="key-row">
          {#each { length: 6 } as _}
            <span class="key"></span>
          {/each}
        </span>
      {/each}
    </span>
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
    gap: var(--space-1);
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

  .body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .carriage {
    width: 64%;
    height: 0.4rem;
    background: var(--color-paper);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-control);
  }

  .keys {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .key-row {
    display: flex;
    gap: 0.15rem;
  }

  .key {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--color-on-surface);
    opacity: 0.55;
  }

  .label {
    font-family: var(--font-body);
    font-size: 0.7rem;
    color: var(--color-on-surface-muted);
    letter-spacing: 0.02em;
    margin-top: var(--space-1);
  }
</style>
