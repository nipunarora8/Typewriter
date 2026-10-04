import { writable, get } from 'svelte/store'
import type { TodoDocument, TodoItem } from '../types'
import * as tauriService from '../services/tauri'
import type { Unlisten } from '../services/tauri'

export interface TodosState {
  document: TodoDocument | null
  loading: boolean
  errorMessage: string | null
  watchStatus: 'watching' | 'paused' | 'missing' | null
}

const initialState: TodosState = {
  document: null,
  loading: false,
  errorMessage: null,
  watchStatus: null,
}

export const todosState = writable<TodosState>(initialState)

/**
 * Tracks the highest (sourceSession, sequence) pair applied so far, plus
 * every session superseded by a later one. Reducer entry point for
 * every command result and every event: a session we've already moved
 * past is always rejected (even though session IDs are random UUIDs
 * and can't be compared for recency directly), and within the current
 * session only a strictly higher sequence is accepted. A content
 * hash/revision is never used for ordering — it's an identity, not a
 * timestamp.
 */
let appliedSession: string | null = null
let appliedSequence = -1
const supersededSessions = new Set<string>()

function isNewer(sourceSession: string, sequence: number): boolean {
  if (supersededSessions.has(sourceSession)) return false
  if (sourceSession !== appliedSession) return true
  return sequence > appliedSequence
}

function applyDocument(document: TodoDocument) {
  if (!isNewer(document.sourceSession, document.sequence)) return
  // Moving to a different session (a file reselect, or the first
  // document after startup) permanently supersedes whatever session
  // was applied before, so a late event from it can never resurface.
  if (appliedSession !== null && appliedSession !== document.sourceSession) {
    supersededSessions.add(appliedSession)
  }
  appliedSession = document.sourceSession
  appliedSequence = document.sequence
  todosState.update((s) => ({ ...s, document, errorMessage: null }))
}

let unlistenTodos: Unlisten | null = null
let unlistenStatus: Unlisten | null = null
let unlistenError: Unlisten | null = null

/**
 * Register event listeners, then request the initial snapshot. Doing
 * it in this order means an event that arrives while the initial
 * load is in flight is never silently dropped.
 */
export async function initialize() {
  await teardown()

  unlistenTodos = await tauriService.onTodosUpdated((event) => {
    applyDocument(event.document)
  })
  unlistenStatus = await tauriService.onFileStatus((event) => {
    if (event.sourceSession !== appliedSession && appliedSession !== null) return
    todosState.update((s) => ({ ...s, watchStatus: event.status }))
  })
  unlistenError = await tauriService.onTodosError((event) => {
    todosState.update((s) => ({ ...s, errorMessage: tauriService.errorMessageFor(event) }))
  })

  todosState.update((s) => ({ ...s, loading: true }))
  try {
    const appState = await tauriService.getAppState()
    if (appState.selectedPath) {
      const doc = await tauriService.loadTodos()
      applyDocument(doc)
    }
  } catch (err) {
    todosState.update((s) => ({ ...s, errorMessage: describeError(err) }))
  } finally {
    todosState.update((s) => ({ ...s, loading: false }))
  }
}

export async function teardown() {
  unlistenTodos?.()
  unlistenStatus?.()
  unlistenError?.()
  unlistenTodos = null
  unlistenStatus = null
  unlistenError = null
}

export async function chooseFile() {
  todosState.update((s) => ({ ...s, loading: true, errorMessage: null }))
  try {
    const doc = await tauriService.chooseTodoFile()
    if (doc) {
      applyDocument(doc)
    }
  } catch (err) {
    todosState.update((s) => ({ ...s, errorMessage: describeError(err) }))
  } finally {
    todosState.update((s) => ({ ...s, loading: false }))
  }
}

/**
 * Optimistically flips the task's visual state immediately, then
 * reconciles to the native result. On failure, the optimistic flip is
 * rolled back — but only if a newer document hasn't arrived in the
 * meantime (e.g. from the watcher), since that would incorrectly
 * regress a state the user hasn't even seen yet.
 */
export async function toggleTask(task: TodoItem) {
  const state = get(todosState)
  const doc = state.document
  if (!doc) return

  const optimisticTasks = doc.tasks.map((t) =>
    t.lineId === task.lineId ? { ...t, completed: !t.completed } : t,
  )
  const beforeSession = doc.sourceSession
  const beforeSequence = doc.sequence
  todosState.update((s) =>
    s.document ? { ...s, document: { ...s.document, tasks: optimisticTasks } } : s,
  )

  try {
    const updated = await tauriService.toggleTodo({
      lineId: task.lineId,
      completed: !task.completed,
      revision: doc.revision,
      sourceSession: doc.sourceSession,
    })
    applyDocument(updated)
  } catch (err) {
    todosState.update((s) => {
      if (!s.document) return s
      const stillShowingOptimisticBase =
        s.document.sourceSession === beforeSession && s.document.sequence === beforeSequence
      if (!stillShowingOptimisticBase) return s
      return { ...s, document: doc, errorMessage: describeError(err) }
    })
  }
}

export async function addTask(text: string) {
  const state = get(todosState)
  const doc = state.document
  if (!doc) return

  try {
    const updated = await tauriService.addTodo({
      text,
      revision: doc.revision,
      sourceSession: doc.sourceSession,
    })
    applyDocument(updated)
  } catch (err) {
    todosState.update((s) => ({ ...s, errorMessage: describeError(err) }))
  }
}

export function dismissError() {
  todosState.update((s) => ({ ...s, errorMessage: null }))
}

/**
 * Apply a document that arrived from switching the active profile.
 * Behaves like any other newer-session document (see `isNewer`), but
 * is exported for the profile store rather than being driven by a
 * `todos:updated` event — a profile switch resolves its own document
 * directly from the `switch_profile`/`add_profile`/`relink_profile`
 * command result, not through the watcher/event pipeline.
 */
export function applyDocumentFromProfileSwitch(document: TodoDocument) {
  applyDocument(document)
}

/**
 * Called synchronously the moment a switch is requested. Hides the old
 * list immediately (it must never show under the new list's name) and
 * permanently supersedes its session, so a late command result or
 * watcher event from the old list is rejected by `isNewer`.
 */
export function beginProfileSwitch() {
  if (appliedSession !== null) supersededSessions.add(appliedSession)
  todosState.update((s) => ({
    ...s,
    document: null,
    errorMessage: null,
    watchStatus: null,
    loading: true,
  }))
}

/** Permanently reject results/events from a session that lost a switch race. */
export function supersedeSession(session: string) {
  supersededSessions.add(session)
}

export function endProfileSwitch() {
  todosState.update((s) => ({ ...s, loading: false }))
}

/** Clear the visible document, e.g. when a profile's file is missing. */
export function clearDocument() {
  todosState.update((s) => ({ ...s, document: null }))
}

export function setLoadError(message: string) {
  todosState.update((s) => ({ ...s, errorMessage: message }))
}

function describeError(err: unknown): string {
  if (err instanceof tauriService.TauriCommandError) return err.message
  if (err instanceof Error) return err.message
  return 'Something unexpected went wrong.'
}
