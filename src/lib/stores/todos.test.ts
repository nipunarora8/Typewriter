import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type { TodoDocument } from '../types'

const mocks = vi.hoisted(() => ({
  onTodosUpdated: vi.fn(),
  onFileStatus: vi.fn(),
  onTodosError: vi.fn(),
  getAppState: vi.fn(),
  loadTodos: vi.fn(),
  chooseTodoFile: vi.fn(),
  toggleTodo: vi.fn(),
  addTodo: vi.fn(),
}))

vi.mock('../services/tauri', async () => {
  const actual = await vi.importActual<typeof import('../services/tauri')>('../services/tauri')
  return {
    ...actual,
    onTodosUpdated: mocks.onTodosUpdated,
    onFileStatus: mocks.onFileStatus,
    onTodosError: mocks.onTodosError,
    getAppState: mocks.getAppState,
    loadTodos: mocks.loadTodos,
    chooseTodoFile: mocks.chooseTodoFile,
    toggleTodo: mocks.toggleTodo,
    addTodo: mocks.addTodo,
  }
})

function doc(overrides: Partial<TodoDocument> = {}): TodoDocument {
  return {
    path: '/tmp/note.md',
    sourceSession: 'session-a',
    revision: 'rev-1',
    sequence: 0,
    tasks: [],
    ...overrides,
  }
}

describe('todosState reducer ordering', () => {
  let todosModule: typeof import('./todos')
  let todosUpdatedHandler: (event: { document: TodoDocument; source: string }) => void

  beforeEach(async () => {
    vi.resetModules()
    mocks.onTodosUpdated.mockImplementation(async (handler) => {
      todosUpdatedHandler = handler
      return () => {}
    })
    mocks.onFileStatus.mockResolvedValue(() => {})
    mocks.onTodosError.mockResolvedValue(() => {})
    mocks.getAppState.mockResolvedValue({ selectedPath: null, themeId: null })
    todosModule = await import('./todos')
    await todosModule.initialize()
  })

  afterEach(async () => {
    await todosModule.teardown()
    vi.clearAllMocks()
  })

  it('applies the first document it sees', () => {
    todosUpdatedHandler({
      document: doc({ sequence: 0, tasks: [] }),
      source: 'startup',
    })
    expect(get(todosModule.todosState).document?.sequence).toBe(0)
  })

  it('applies a higher sequence within the same session', () => {
    todosUpdatedHandler({ document: doc({ sequence: 0 }), source: 'startup' })
    todosUpdatedHandler({ document: doc({ sequence: 1 }), source: 'user-write' })
    expect(get(todosModule.todosState).document?.sequence).toBe(1)
  })

  it('ignores a lower or equal sequence within the same session', () => {
    todosUpdatedHandler({ document: doc({ sequence: 5 }), source: 'user-write' })
    todosUpdatedHandler({ document: doc({ sequence: 3 }), source: 'external-change' })
    expect(get(todosModule.todosState).document?.sequence).toBe(5)

    todosUpdatedHandler({
      document: doc({ sequence: 5, revision: 'rev-dup' }),
      source: 'external-change',
    })
    expect(get(todosModule.todosState).document?.revision).toBe('rev-1')
  })

  it('always accepts a document from a newer source session regardless of sequence', () => {
    todosUpdatedHandler({
      document: doc({ sourceSession: 'session-a', sequence: 99 }),
      source: 'user-write',
    })
    todosUpdatedHandler({
      document: doc({ sourceSession: 'session-b', sequence: 0 }),
      source: 'startup',
    })
    const current = get(todosModule.todosState).document
    expect(current?.sourceSession).toBe('session-b')
    expect(current?.sequence).toBe(0)
  })

  it('does not let an old session resurrect state after a file reselect', () => {
    todosUpdatedHandler({
      document: doc({ sourceSession: 'session-a', sequence: 0 }),
      source: 'startup',
    })
    todosUpdatedHandler({
      document: doc({ sourceSession: 'session-b', sequence: 0 }),
      source: 'user-write',
    })
    // A stale event from the disposed session-a watcher arrives late.
    todosUpdatedHandler({
      document: doc({ sourceSession: 'session-a', sequence: 100 }),
      source: 'external-change',
    })
    expect(get(todosModule.todosState).document?.sourceSession).toBe('session-b')
  })
})

describe('toggleTask optimistic rollback', () => {
  let todosModule: typeof import('./todos')
  let todosUpdatedHandler: (event: { document: TodoDocument; source: string }) => void

  beforeEach(async () => {
    vi.resetModules()
    mocks.onTodosUpdated.mockImplementation(async (handler) => {
      todosUpdatedHandler = handler
      return () => {}
    })
    mocks.onFileStatus.mockResolvedValue(() => {})
    mocks.onTodosError.mockResolvedValue(() => {})
    mocks.getAppState.mockResolvedValue({ selectedPath: null, themeId: null })
    todosModule = await import('./todos')
    await todosModule.initialize()

    todosUpdatedHandler({
      document: doc({
        sequence: 0,
        tasks: [{ lineId: 'a', lineIndex: 0, text: 'one', completed: false, indent: '' }],
      }),
      source: 'startup',
    })
  })

  afterEach(async () => {
    await todosModule.teardown()
    vi.clearAllMocks()
  })

  it('rolls back the optimistic flip when the write fails and nothing newer has arrived', async () => {
    mocks.toggleTodo.mockRejectedValue(new Error('conflict'))
    const task = get(todosModule.todosState).document!.tasks[0]

    const promise = todosModule.toggleTask(task)
    // Optimistic update applied synchronously before the awaited call settles.
    expect(get(todosModule.todosState).document?.tasks[0].completed).toBe(true)

    await promise
    expect(get(todosModule.todosState).document?.tasks[0].completed).toBe(false)
    expect(get(todosModule.todosState).errorMessage).toBeTruthy()
  })

  it('does not roll back over a newer document that arrived while the write was in flight', async () => {
    let resolveToggle: (value: TodoDocument) => void
    mocks.toggleTodo.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveToggle = resolve as (value: TodoDocument) => void
        }),
    )
    const task = get(todosModule.todosState).document!.tasks[0]
    const promise = todosModule.toggleTask(task)

    // An external change lands before our toggle call resolves.
    todosUpdatedHandler({
      document: doc({
        sequence: 1,
        tasks: [
          {
            lineId: 'a',
            lineIndex: 0,
            text: 'one changed externally',
            completed: false,
            indent: '',
          },
        ],
      }),
      source: 'external-change',
    })

    // Now the original toggle call fails.
    mocks.toggleTodo.mockRejectedValueOnce(new Error('conflict'))
    resolveToggle!(doc({ sequence: 1 }))
    await promise.catch(() => {})

    // The external document must survive; rollback must not clobber it.
    expect(get(todosModule.todosState).document?.tasks[0].text).toBe('one changed externally')
  })
})
