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
export function installFakeAdapterScript(options: { daily?: boolean | 'empty' } = {}): string {
  return `
    (function () {
      let sequence = 0;
      let sessionCounter = 0;
      let todosHandler = null;
      let nextProfileNumber = 3;
      const WITH_DAILY = ${options.daily ? 'true' : 'false'};
      const DAILY_EMPTY = ${options.daily === 'empty' ? 'true' : 'false'};

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
      // Daily lists: profileId -> { current: 'YYYY-MM-DD' | null, dates: { date: tasks[] } }
      const dailyNotes = {};
      if (WITH_DAILY) {
        profiles.push({
          id: 'p-work',
          displayName: 'Work',
          path: '/fake/vault/Work/2026-10-04.md',
          folder: '/fake/vault/Work',
        });
        dailyNotes['p-work'] = {
          current: '2026-10-04',
          dates: {
            '2026-10-03': [
              { lineId: 'w3:0:0', lineIndex: 0, text: 'Yesterday task', completed: false, indent: '' },
            ],
            '2026-10-04': [
              { lineId: 'w4:0:0', lineIndex: 0, text: 'Work task today', completed: false, indent: '' },
            ],
          },
        };
      }
      if (WITH_DAILY && DAILY_EMPTY) dailyNotes['p-work'] = { current: null, dates: {} };
      const missing = {};
      let activeProfileId = 'p-personal';
      let sourceSession = 'fake-session-0';
      let switchDelayMs = 0;
      const writeLog = [];
      const pickerCalls = [];

      function sortedDates(id) {
        return Object.keys(dailyNotes[id].dates).sort();
      }
      function dayInfoFor(id) {
        const d = id && dailyNotes[id];
        if (!d) return { isDaily: false, date: null, hasOlder: false, hasNewer: false };
        const dates = sortedDates(id);
        const i = d.current ? dates.indexOf(d.current) : -1;
        return {
          isDaily: true,
          date: i >= 0 ? d.current : null,
          hasOlder: i >= 0 ? i > 0 : dates.length > 0,
          hasNewer: i >= 0 && i < dates.length - 1,
        };
      }
      function activeTasks() {
        const d = dailyNotes[activeProfileId];
        if (d) return (d.current && d.dates[d.current]) || [];
        return tasksByProfile[activeProfileId] || [];
      }
      function setActiveTasks(tasks) {
        const d = dailyNotes[activeProfileId];
        if (d) d.dates[d.current] = tasks;
        else tasksByProfile[activeProfileId] = tasks;
      }
      function activePath() {
        const p = profiles.find((x) => x.id === activeProfileId);
        if (!p) return null;
        const d = dailyNotes[p.id];
        if (d) return p.folder + '/' + (d.current ? d.current + '.md' : '.typewriter-no-note.md');
        return p.path;
      }
      function activeDate() {
        const d = dailyNotes[activeProfileId];
        return d ? d.current : null;
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
          writeLog.push({
            profileId: activeProfileId,
            date: activeDate(),
            op: 'toggle',
            lineId: args.lineId,
          });
          sequence += 1;
          setActiveTasks(
            activeTasks().map((t) =>
              t.lineId === args.lineId ? { ...t, completed: args.completed } : t,
            ),
          );
          return currentDocument();
        },
        async addTodo(args) {
          assertSession(args);
          writeLog.push({
            profileId: activeProfileId,
            date: activeDate(),
            op: 'add',
            text: args.text,
          });
          sequence += 1;
          const tasks = activeTasks();
          setActiveTasks([
            ...tasks,
            {
              lineId: 'fake:' + sequence,
              lineIndex: tasks.length,
              text: args.text,
              completed: false,
              indent: '',
            },
          ]);
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
          const daily = dailyNotes[args.profileId];
          if (daily) {
            const dates = sortedDates(args.profileId);
            daily.current = dates.length ? dates[dates.length - 1] : null;
          }
          if (missing[args.profileId] || (daily && !daily.current)) {
            return {
              document: null,
              error: { category: 'file-missing', message: 'That file could not be found.' },
              day: dayInfoFor(args.profileId),
            };
          }
          return { document: currentDocument(), error: null, day: dayInfoFor(args.profileId) };
        },
        async addDailyProfile(args) {
          if (!/^[^./\\\\:][^/\\\\:]*$/.test(args.displayName)) throw { category: 'invalid-profile-name' };
          const id = 'p-new-' + nextProfileNumber++;
          // Same rule as the backend: next to the latest folder list, else a picked parent.
          const latest = profiles.filter((p) => p.folder).pop();
          const parent = latest ? latest.folder.replace(/\\/[^/]*$/, '') : '/fake/Typewriter';
          pickerCalls.push(latest ? 'none' : 'parent');
          profiles.push({
            id,
            displayName: args.displayName,
            path: parent + '/' + args.displayName + '/' + args.date + '.md',
            folder: parent + '/' + args.displayName,
          });
          dailyNotes[id] = { current: args.date, dates: {} };
          dailyNotes[id].dates[args.date] = [];
          writeLog.push({ profileId: id, op: 'create', date: args.date });
          activeProfileId = id;
          newSession();
          return { document: currentDocument(), error: null, day: dayInfoFor(id) };
        },
        async createTodayNote(args) {
          const d = dailyNotes[activeProfileId];
          if (!d) throw { category: 'not-daily-list' };
          if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(args.date)) throw { category: 'invalid-date' };
          writeLog.push({ profileId: activeProfileId, op: 'create', date: args.date });
          if (!d.dates[args.date]) d.dates[args.date] = [];
          d.current = args.date;
          newSession();
          return { document: currentDocument(), error: null, day: dayInfoFor(activeProfileId) };
        },
        async stepDay(args) {
          if (switchDelayMs) await sleep(switchDelayMs);
          const d = dailyNotes[activeProfileId];
          if (!d) throw { category: 'not-daily-list' };
          const dates = sortedDates(activeProfileId);
          const i = d.current ? dates.indexOf(d.current) : -1;
          const target = i >= 0 ? i + (args.delta < 0 ? -1 : 1) : args.delta < 0 ? dates.length - 1 : -1;
          if (target < 0 || target >= dates.length) throw { category: 'no-such-day' };
          d.current = dates[target];
          newSession();
          return { document: currentDocument(), error: null, day: dayInfoFor(activeProfileId) };
        },
        async getLeftovers() {
          const d = dailyNotes[activeProfileId];
          if (!d || !d.current) return { fromDate: null, tasks: [] };
          const dates = sortedDates(activeProfileId);
          const i = dates.indexOf(d.current);
          if (i <= 0) return { fromDate: null, tasks: [] };
          const from = dates[i - 1];
          return {
            fromDate: from,
            tasks: d.dates[from].filter((t) => !t.completed).map((t) => t.text),
          };
        },
        async bringOverLeftovers(args) {
          assertSession(args);
          const d = dailyNotes[activeProfileId];
          const dates = sortedDates(activeProfileId);
          const from = dates[dates.indexOf(d.current) - 1];
          const have = activeTasks().map((t) => t.text);
          let tasks = activeTasks();
          for (const t of d.dates[from].filter((x) => !x.completed)) {
            if (have.includes(t.text)) continue;
            tasks = [
              ...tasks,
              { lineId: 'carry:' + tasks.length, lineIndex: tasks.length, text: t.text, completed: false, indent: '' },
            ];
          }
          writeLog.push({ profileId: activeProfileId, date: d.current, op: 'bring-over', from });
          sequence += 1;
          setActiveTasks(tasks);
          return currentDocument();
        },
        async getDayInfo() {
          return dayInfoFor(activeProfileId);
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
        pickerCalls: pickerCalls,
        tasksFor: function (profileId) {
          const d = dailyNotes[profileId];
          return d ? d.dates : tasksByProfile[profileId];
        },
        setDailyDates: function (profileId, dates) {
          dailyNotes[profileId].dates = dates;
        },
      };
    })();
  `
}
