<script lang="ts">
  import type { Profile } from '../types'

  export let profiles: Profile[]
  export let activeProfileId: string | null
  export let onNavigate: (delta: 1 | -1) => void
  export let onManage: () => void

  $: activeIndex = profiles.findIndex((p) => p.id === activeProfileId)
  $: activeName = activeIndex >= 0 ? profiles[activeIndex].displayName : 'No list'
  $: canNavigate = profiles.length > 1
</script>

<div class="switcher" data-tauri-drag-region>
  {#if canNavigate}
    <button
      type="button"
      class="chevron"
      aria-label="Previous list"
      on:click={() => onNavigate(-1)}
    >
      &lt;
    </button>
  {/if}
  <span class="name" class:solo={!canNavigate} title={activeName} data-tauri-drag-region
    >{activeName}</span
  >
  {#if canNavigate}
    <button type="button" class="chevron" aria-label="Next list" on:click={() => onNavigate(1)}>
      &gt;
    </button>
  {/if}
  <button type="button" class="manage" aria-label="Manage lists" on:click={onManage}>⚙</button>
</div>

<style>
  .switcher {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
  }

  .chevron {
    all: unset;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.1rem;
    height: 1.1rem;
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-muted-ink);
    border-radius: var(--radius-control);
  }

  .chevron:hover {
    color: var(--color-ink);
  }

  .chevron:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  .name {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--color-ink);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .name.solo {
    padding-left: 0.25rem;
  }

  .manage {
    all: unset;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.1rem;
    height: 1.1rem;
    font-size: 0.7rem;
    color: var(--color-muted-ink);
    border-radius: var(--radius-control);
  }

  .manage:hover {
    color: var(--color-ink);
  }

  .manage:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }
</style>
