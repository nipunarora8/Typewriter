<script lang="ts">
  export let onChoose: () => void
  export let busy = false
</script>

<div class="onboarding">
  <p class="message">Choose a Markdown file to get started.</p>
  <button type="button" on:click={onChoose} disabled={busy}>Choose Markdown file</button>
</div>

<style>
  .onboarding {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    width: 100%;
    height: 100%;
    padding: var(--space-5);
    text-align: center;
  }

  .message {
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--color-muted-ink);
    margin: 0;
  }

  button {
    min-height: 32px;
    padding: var(--space-2) var(--space-4);
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-accent-ink);
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-control);
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
