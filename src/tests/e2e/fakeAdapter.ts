/**
 * Deterministic fake Tauri adapter injected into the browser before the
 * app loads, so Playwright can exercise real app code (stores,
 * components, interaction logic) without a native Tauri runtime. This
 * file is bundled as a string and run via `page.addInitScript` — it
 * must be self-contained (no imports) since it executes in the page
 * context before any app modules load.
 */
export function installFakeAdapterScript(): string {
  return `
    (function () {
      let sequence = 0;
      let tasks = [
        { lineId: 's:0:0', lineIndex: 0, text: 'Seed task one', completed: false, indent: '' },
        { lineId: 's:1:1', lineIndex: 1, text: 'Seed task two', completed: true, indent: '' },
      ];
      const sourceSession = 'fake-session';
      let todosHandler = null;

      function currentDocument() {
        return {
          path: '/fake/vault/Typewriter/todos.md',
          sourceSession,
          revision: 'rev-' + sequence,
          sequence,
          tasks,
        };
      }

      function publish(source) {
        if (todosHandler) todosHandler({ document: currentDocument(), source });
      }

      window.__TYPEWRITER_TEST_ADAPTER__ = {
        async getAppState() {
          return { selectedPath: '/fake/vault/Typewriter/todos.md', themeId: null };
        },
        async chooseTodoFile() {
          sequence += 1;
          return currentDocument();
        },
        async loadTodos() {
          return currentDocument();
        },
        async toggleTodo(args) {
          sequence += 1;
          tasks = tasks.map((t) =>
            t.lineId === args.lineId ? { ...t, completed: args.completed } : t,
          );
          return currentDocument();
        },
        async addTodo(args) {
          sequence += 1;
          tasks = [
            ...tasks,
            {
              lineId: 'fake:' + sequence,
              lineIndex: tasks.length,
              text: args.text,
              completed: false,
              indent: '',
            },
          ];
          return currentDocument();
        },
        async setPreferences() {},
        onTodosUpdated(handler) {
          todosHandler = handler;
          return () => {
            todosHandler = null;
          };
        },
        onFileStatus() {
          return () => {};
        },
        onTodosError() {
          return () => {};
        },
      };

      window.__TYPEWRITER_TEST__ = {
        publishExternalChange: function (overrides) {
          sequence += 1;
          tasks = (overrides && overrides.tasks) || tasks;
          publish('external-change');
        },
      };
    })();
  `
}
