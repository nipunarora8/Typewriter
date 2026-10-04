/**
 * Deterministic fake Tauri adapter injected into the browser before the
 * app loads, so Playwright can exercise real app code (stores,
 * components, interaction logic) without a native Tauri runtime. This
 * file is bundled as a string and run via `page.addInitScript` — it
 * must be self-contained (no imports) since it executes in the page
 * context before any app modules load.
 *
 * Models several saved profiles (named lists), each with its own tasks
 * and its own source session, mirroring the Rust side: switching always
 * mints a fresh session, and writes carrying a stale session are
 * rejected.
 */
export function installFakeAdapterScript(): string {
  return `
    (function () {
      let sequence = 0;
      let sessionCounter = 0;
      let todosHandler = null;
      let nextProfileNumber = 3;

      const profiles = [
        { id: 'p-personal', displayName: 'Personal', path: '/fake/vault/Typewriter/Personal.md' },
        { id: 'p-groceries', displayName: 'Groceries', path: '/fake/vault/Lists/Groceries.md' },
      ];
      const tasksByProfile = {
        'p-personal': [
          { lineId: 's:0:0', lineIndex: 0, text: 'Seed task one', completed: false, indent: '' },
          { lineId: 's:1:1', lineIndex: 1, text: 'Seed task two', completed: true, indent: '' },
        ],
        'p-groceries': [
          { lineId: 'g:0:0', lineIndex: 0, text: 'Seed task one', completed: false, indent: '' },
          { lineId: 'g:1:1', lineIndex: 1, text: 'Buy oat milk', completed: false, indent: '' },
        ],
      };
      const missing = {};
      let activeProfileId = 'p-personal';
      let sourceSession = 'fake-session-0';
      let switchDelayMs = 0;
      const writeLog = [];

      function activeTasks() {
        return tasksByProfile[activeProfileId] || [];
      }
      function activePath() {
        const p = profiles.find((x) => x.id === activeProfileId);
        return p ? p.path : null;
      }
      function currentDocument() {
        return {
          path: activePath(),
          sourceSession,
          revision: 'rev-' + sequence,
          sequence,
          tasks: activeTasks(),
        };
      }
      function publish(source) {
        if (todosHandler) todosHandler({ document: currentDocument(), source });
      }
      function newSession() {
        sessionCounter += 1;
        sequence = 0;
        sourceSession = 'fake-session-' + sessionCounter;
      }
      function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
      }
      function assertSession(args) {
        if (args.sourceSession !== sourceSession) {
          const err = { category: 'stale-session', message: 'That list changed; try again.' };
          throw err;
        }
      }

      window.__TYPEWRITER_TEST_ADAPTER__ = {
        async getAppState() {
          return {
            selectedPath: activePath(),
            themeId: null,
            profiles: profiles.map((p) => ({ ...p })),
            activeProfileId,
          };
        },
        async chooseTodoFile() {
          newSession();
          return currentDocument();
        },
        async loadTodos() {
          if (missing[activeProfileId]) {
            throw { category: 'file-missing', message: 'That file could not be found.' };
          }
          return currentDocument();
        },
        async toggleTodo(args) {
          assertSession(args);
          writeLog.push({ profileId: activeProfileId, op: 'toggle', lineId: args.lineId });
          sequence += 1;
          tasksByProfile[activeProfileId] = activeTasks().map((t) =>
            t.lineId === args.lineId ? { ...t, completed: args.completed } : t,
          );
          return currentDocument();
        },
        async addTodo(args) {
          assertSession(args);
          writeLog.push({ profileId: activeProfileId, op: 'add', text: args.text });
          sequence += 1;
          const tasks = activeTasks();
          tasksByProfile[activeProfileId] = [
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
        async addProfile(args) {
          const id = 'p-new-' + nextProfileNumber++;
          profiles.push({ id, displayName: args.displayName, path: '/fake/vault/New/' + id + '.md' });
          tasksByProfile[id] = [];
          activeProfileId = id;
          newSession();
          return currentDocument();
        },
        async renameProfile(args) {
          const p = profiles.find((x) => x.id === args.profileId);
          if (p) p.displayName = args.displayName;
        },
        async relinkProfile(args) {
          delete missing[args.profileId];
          if (args.profileId !== activeProfileId) return null;
          newSession();
          return currentDocument();
        },
        async removeProfile(args) {
          const index = profiles.findIndex((x) => x.id === args.profileId);
          if (index === -1) return null;
          profiles.splice(index, 1);
          if (activeProfileId !== args.profileId) return null;
          if (profiles.length === 0) {
            activeProfileId = null;
            return null;
          }
          activeProfileId = profiles[Math.min(index, profiles.length - 1)].id;
          newSession();
          return currentDocument();
        },
        async switchProfile(args) {
          if (switchDelayMs) await sleep(switchDelayMs);
          activeProfileId = args.profileId;
          newSession();
          if (missing[args.profileId]) {
            return {
              document: null,
              error: { category: 'file-missing', message: 'That file could not be found.' },
            };
          }
          return { document: currentDocument(), error: null };
        },
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
          if (overrides && overrides.tasks) tasksByProfile[activeProfileId] = overrides.tasks;
          publish('external-change');
        },
        publishEventFromSession: function (session, tasks) {
          if (todosHandler) {
            todosHandler({
              document: {
                path: '/stale.md',
                sourceSession: session,
                revision: 'stale',
                sequence: 999,
                tasks,
              },
              source: 'external-change',
            });
          }
        },
        currentSession: function () {
          return sourceSession;
        },
        setMissing: function (profileId, isMissing) {
          if (isMissing) missing[profileId] = true;
          else delete missing[profileId];
        },
        setSwitchDelay: function (ms) {
          switchDelayMs = ms;
        },
        writeLog: writeLog,
        tasksFor: function (profileId) {
          return tasksByProfile[profileId];
        },
      };
    })();
  `
}
