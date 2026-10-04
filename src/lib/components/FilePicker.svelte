<script lang="ts">
  export let onChooseFolder: (name: string) => void = () => {}
  export let busy = false

  let name = ''
</script>

<form
  class="onboarding"
  on:submit|preventDefault={() => name.trim() && onChooseFolder(name.trim())}
>
  <label for="first-list-name" class="message">Name your first list</label>
  <input
    id="first-list-name"
    aria-label="List name"
    placeholder="Personal"
    maxlength="80"
    bind:value={name}
    disabled={busy}
  />
  <button type="submit" disabled={busy || !name.trim()}>Choose where to keep it</button>
</form>

<style>
  .onboarding {
    box-sizing: border-box;
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

  input {
    font-family: var(--font-body);
    font-size: 0.9rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: #fff;
    color: var(--color-ink);
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
