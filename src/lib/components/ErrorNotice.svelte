<script lang="ts">
  export let message: string
  export let onDismiss: (() => void) | undefined = undefined
</script>

<div class="notice" role="alert">
  <span class="icon" aria-hidden="true">⚠</span>
  <span class="message">{message}</span>
  {#if onDismiss}
    <button type="button" class="dismiss" on:click={onDismiss} aria-label="Dismiss notice">
      ×
    </button>
  {/if}
</div>

<style>
  .notice {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-paper);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-control);
    margin: var(--space-2) var(--space-3);
  }

  .icon {
    color: var(--color-danger);
    flex-shrink: 0;
  }

  .message {
    flex: 1;
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--color-ink);
  }

  .dismiss {
    all: unset;
    cursor: pointer;
    min-width: 24px;
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-muted-ink);
    border-radius: var(--radius-control);
  }

  .dismiss:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }
</style>
