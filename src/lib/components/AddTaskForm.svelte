<script lang="ts">
  export let draft: string
  export let onSubmit: (text: string) => void
  export let disabled = false

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }
</script>

<form class="add-form" on:submit={handleSubmit}>
  <label class="sr-only" for="add-task-input">Add a task</label>
  <input
    id="add-task-input"
    type="text"
    bind:value={draft}
    placeholder="Add a task…"
    maxlength="2000"
    {disabled}
  />
  <button type="submit" {disabled}>Add</button>
</form>

<style>
  .add-form {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3);
    border-top: 1px solid var(--border-subtle);
  }

  input[type='text'] {
    flex: 1;
    min-height: 32px;
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--color-ink);
    background: var(--color-paper);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-control);
  }

  input[type='text']:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  button {
    min-width: 32px;
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

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
</style>
