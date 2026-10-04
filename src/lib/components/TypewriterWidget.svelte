<script lang="ts">
  import type { Profile } from '../types'
  import ProfileSwitcher from './ProfileSwitcher.svelte'

  export let onExpand: (event: MouseEvent) => void
  export let expanded: boolean
  export let dockedBelowSheet = false
  export let doneCount = 0
  export let totalCount = 0
  export let profiles: Profile[] = []
  export let activeProfileId: string | null = null
  export let onNavigate: (delta: 1 | -1) => void = () => {}
  export let expandButton: HTMLButtonElement | undefined = undefined

  const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM!?']
</script>

<div class="typewriter" class:docked={dockedBelowSheet} data-tauri-drag-region>
  <div class="stack" data-tauri-drag-region>
    <div class="display" data-tauri-drag-region>
      <ProfileSwitcher {profiles} {activeProfileId} {onNavigate} {doneCount} {totalCount} />
    </div>
    <button
      type="button"
      class="clickable-area"
      aria-label={expanded ? 'Close todo list' : 'Open todo list'}
      aria-expanded={expanded}
      aria-controls="todo-sheet"
      bind:this={expandButton}
      on:click={onExpand}
    >
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

  .stack {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
  }

  .clickable-area {
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .clickable-area:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 3px;
  }

  .display {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    align-self: center;
    /* Zero intrinsic width: the keys set the stack width, so a long list
       name truncates instead of stretching the housing. */
    width: 0;
    min-width: 92%;
    padding: 0.5rem var(--space-2);
    background: var(--color-key);
    border: 2px solid var(--color-key-ink);
    border-radius: var(--radius-control);
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
