<script lang="ts">
  import type { Profile } from '../types'

  export let profiles: Profile[]
  export let activeProfileId: string | null
  export let onClose: () => void
  export let onAdd: (name: string) => void
  export let onRename: (profileId: string, name: string) => void
  export let onRelink: (profileId: string) => void
  export let onRemove: (profileId: string) => void

  let renamingId: string | null = null
  let renameDraft = ''
  let newName = ''
  let confirmingRemoveId: string | null = null

  function submitAdd() {
    const name = newName.trim()
    if (!name) return
    onAdd(name)
    newName = ''
  }

  function startRename(p: Profile) {
    renamingId = p.id
    renameDraft = p.displayName
  }

  function focusAndSelect(node: HTMLInputElement) {
    // Deferred: the clicked name button is removed in the same update and
    // would otherwise hand focus back to the page.
    setTimeout(() => {
      node.focus()
      node.select()
    }, 0)
  }

  function commitRename() {
    if (renamingId && renameDraft.trim()) {
      onRename(renamingId, renameDraft.trim())
    }
    renamingId = null
  }
</script>

<div class="overlay" role="dialog" aria-label="Manage lists">
  <div class="panel">
    <header class="panel-header">
      <span class="panel-title">LISTS</span>
      <button type="button" class="close" aria-label="Close" on:click={onClose}>×</button>
    </header>
    <ul class="list">
      {#each profiles as p (p.id)}
        <li class="row" class:active={p.id === activeProfileId}>
          {#if renamingId === p.id}
            <input
              class="rename-input"
              aria-label="List name"
              use:focusAndSelect
              bind:value={renameDraft}
              on:blur={commitRename}
              on:keydown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  e.preventDefault()
                  renamingId = null
                }
              }}
            />
          {:else}
            <button type="button" class="row-name" on:click={() => startRename(p)}>
              {p.displayName}
            </button>
          {/if}
          <button type="button" class="row-action" on:click={() => onRelink(p.id)}>relink</button>
          {#if confirmingRemoveId === p.id}
            <button
              type="button"
              class="row-action danger"
              on:click={() => {
                confirmingRemoveId = null
                onRemove(p.id)
              }}>confirm remove</button
            >
            <button type="button" class="row-action" on:click={() => (confirmingRemoveId = null)}
              >cancel</button
            >
          {:else}
            <button
              type="button"
              class="row-action danger"
              on:click={() => (confirmingRemoveId = p.id)}>remove</button
            >
          {/if}
        </li>
      {/each}
    </ul>
    <form class="add-form" on:submit|preventDefault={submitAdd}>
      <input
        class="rename-input"
        placeholder="New list name"
        aria-label="New list name"
        maxlength="80"
        bind:value={newName}
      />
      <button type="submit" class="add" disabled={!newName.trim()}>+ add list</button>
    </form>
  </div>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(42, 36, 32, 0.45);
    z-index: 10;
  }

  .panel {
    width: 86%;
    max-height: 80%;
    display: flex;
    flex-direction: column;
    background: var(--color-paper);
    border: 2px dashed var(--color-paper-edge);
    border-radius: var(--radius-paper);
    padding: var(--space-3);
    gap: var(--space-2);
    overflow-y: auto;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-title {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--color-ink);
  }

  .close {
    all: unset;
    cursor: pointer;
    color: var(--color-muted-ink);
    font-size: 1rem;
    line-height: 1;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-control);
  }

  .row.active {
    background: var(--border-subtle);
  }

  .row-name {
    all: unset;
    cursor: pointer;
    flex: 1;
    min-width: 0;
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--color-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rename-input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-body);
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: #fff;
    color: var(--color-ink);
  }

  .row-action {
    all: unset;
    cursor: pointer;
    flex-shrink: 0;
    font-family: var(--font-body);
    font-size: 0.7rem;
    color: var(--color-muted-ink);
  }

  .row-action:hover {
    color: var(--color-ink);
  }

  .row-action.danger:hover {
    color: var(--color-danger);
  }

  .add-form {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }

  .add:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .add {
    all: unset;
    flex-shrink: 0;
    cursor: pointer;
    text-align: center;
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-accent-ink);
    background: var(--color-accent);
    border-radius: var(--radius-control);
  }
</style>
