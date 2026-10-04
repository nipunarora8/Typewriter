<script lang="ts">
  import type { Profile } from '../types'

  export let profiles: Profile[]
  export let activeProfileId: string | null
  export let onNavigate: (delta: 1 | -1) => void
  export let doneCount = 0
  export let totalCount = 0

  $: activeIndex = profiles.findIndex((p) => p.id === activeProfileId)
  $: activeName = activeIndex >= 0 ? profiles[activeIndex].displayName : 'No list'
  $: canNavigate = profiles.length > 1
  $: countText = totalCount > 0 ? `${doneCount}/${totalCount}` : ''
  $: countLabel = totalCount > 0 ? `${doneCount} of ${totalCount} tasks done` : 'No tasks'
</script>

<div class="switcher" role="group" aria-label="Lists" data-tauri-drag-region>
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
  <span
    class="name"
    class:empty={activeIndex < 0}
    title={activeName}
    aria-live="polite"
    data-tauri-drag-region>{activeName}</span
  >
  {#if countText}
    <span class="count" title={countLabel} data-tauri-drag-region>
      <span aria-hidden="true" data-tauri-drag-region>{countText}</span>
      <span class="sr-only">{countLabel}</span>
    </span>
  {/if}
  {#if canNavigate}
    <button type="button" class="chevron" aria-label="Next list" on:click={() => onNavigate(1)}>
      &gt;
    </button>
  {/if}
</div>

<style>
  .switcher {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    min-width: 0;
  }

  .chevron {
    all: unset;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.7rem;
    height: 1.6rem;
    /* Larger hit target without growing the cream box. */
    margin: -0.35rem 0;
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1;
    color: var(--color-key-ink);
    border-radius: var(--radius-control);
  }

  .chevron:hover {
    background: color-mix(in srgb, var(--color-key-ink) 14%, transparent);
  }

  .chevron:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  .name {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-key-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name.empty {
    font-weight: 400;
    text-transform: none;
    opacity: 0.7;
  }

  .count {
    flex-shrink: 0;
    font-family: var(--font-body);
    font-size: 0.7rem;
    color: var(--color-key-ink);
    opacity: 0.75;
    white-space: nowrap;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
</style>
