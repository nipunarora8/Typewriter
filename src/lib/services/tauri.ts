/**
 * The only module that talks to Tauri's `invoke`/`listen`. Everything
 * else in the frontend goes through this typed boundary so the rest of
 * the app can't accidentally depend on `@tauri-apps/api` shapes
 * directly, and so a browser/mock test adapter can stand in for it.
 *
 * Browser/Playwright tests run against the plain Vite dev server with
 * no Tauri runtime present. Such a test injects a `TestAdapter` onto
 * `window.__TYPEWRITER_TEST_ADAPTER__` *before* the app script loads
 * (e.g. via `page.addInitScript`); when present, every function below
 * routes through it instead of throwing "Tauri runtime unavailable".
 * This flag does not exist in production builds/typings — it is a
 * test-only seam, not a runtime feature.
 */
import type { TodoDocument } from '../types'

export type UpdateSource = 'startup' | 'user-write' | 'external-change'

export interface TodosUpdatedEvent {
  document: TodoDocument
  source: UpdateSource
}

export type WatchStatus = 'watching' | 'paused' | 'missing'

export interface FileStatusEvent {
  sourceSession: string
  sequence: number
  status: WatchStatus
}

export interface AppErrorPayload {
  category: string
  message: string
}

export class TauriCommandError extends Error {
  category: string
  constructor(payload: AppErrorPayload) {
    super(payload.message)
    this.category = payload.category
  }
}

export interface AppStateSnapshot {
  selectedPath: string | null
  themeId: string | null
}

export type Unlisten = () => void

export interface TestAdapter {
  getAppState(): Promise<AppStateSnapshot>
  chooseTodoFile(): Promise<TodoDocument | null>
  loadTodos(): Promise<TodoDocument>
  toggleTodo(args: {
    lineId: string
    completed: boolean
    revision: string
    sourceSession: string
  }): Promise<TodoDocument>
  addTodo(args: { text: string; revision: string; sourceSession: string }): Promise<TodoDocument>
  setPreferences(args: { themeId: string | null }): Promise<void>
  onTodosUpdated(handler: (event: TodosUpdatedEvent) => void): Unlisten
  onFileStatus(handler: (event: FileStatusEvent) => void): Unlisten
  onTodosError(handler: (event: AppErrorPayload) => void): Unlisten
}

declare global {
  interface Window {
    __TYPEWRITER_TEST_ADAPTER__?: TestAdapter
  }
}

function testAdapter(): TestAdapter | undefined {
  return typeof window !== 'undefined' ? window.__TYPEWRITER_TEST_ADAPTER__ : undefined
}

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasTauriRuntime()) {
    throw new Error(`Tauri runtime unavailable; cannot invoke "${cmd}" outside the native app.`)
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  try {
    return await tauriInvoke<T>(cmd, args)
  } catch (err) {
    if (err && typeof err === 'object' && 'category' in err && 'message' in err) {
      throw new TauriCommandError(err as AppErrorPayload)
    }
    throw err
  }
}

export async function getAppState(): Promise<AppStateSnapshot> {
  const adapter = testAdapter()
  if (adapter) return adapter.getAppState()
  return invoke<AppStateSnapshot>('get_app_state')
}

export async function chooseTodoFile(): Promise<TodoDocument | null> {
  const adapter = testAdapter()
  if (adapter) return adapter.chooseTodoFile()
  return invoke<TodoDocument | null>('choose_todo_file')
}

export async function loadTodos(): Promise<TodoDocument> {
  const adapter = testAdapter()
  if (adapter) return adapter.loadTodos()
  return invoke<TodoDocument>('load_todos')
}

export async function toggleTodo(args: {
  lineId: string
  completed: boolean
  revision: string
  sourceSession: string
}): Promise<TodoDocument> {
  const adapter = testAdapter()
  if (adapter) return adapter.toggleTodo(args)
  return invoke<TodoDocument>('toggle_todo', args)
}

export async function addTodo(args: {
  text: string
  revision: string
  sourceSession: string
}): Promise<TodoDocument> {
  const adapter = testAdapter()
  if (adapter) return adapter.addTodo(args)
  return invoke<TodoDocument>('add_todo', args)
}

export async function setPreferences(args: { themeId: string | null }): Promise<void> {
  const adapter = testAdapter()
  if (adapter) return adapter.setPreferences(args)
  return invoke<void>('set_preferences', args)
}

export async function onTodosUpdated(
  handler: (event: TodosUpdatedEvent) => void,
): Promise<Unlisten> {
  const adapter = testAdapter()
  if (adapter) return adapter.onTodosUpdated(handler)
  if (!hasTauriRuntime()) {
    return () => {}
  }
  const { listen } = await import('@tauri-apps/api/event')
  return listen<TodosUpdatedEvent>('todos:updated', (e) => handler(e.payload))
}

export async function onFileStatus(handler: (event: FileStatusEvent) => void): Promise<Unlisten> {
  const adapter = testAdapter()
  if (adapter) return adapter.onFileStatus(handler)
  if (!hasTauriRuntime()) {
    return () => {}
  }
  const { listen } = await import('@tauri-apps/api/event')
  return listen<FileStatusEvent>('file:status', (e) => handler(e.payload))
}

export async function onTodosError(handler: (event: AppErrorPayload) => void): Promise<Unlisten> {
  const adapter = testAdapter()
  if (adapter) return adapter.onTodosError(handler)
  if (!hasTauriRuntime()) {
    return () => {}
  }
  const { listen } = await import('@tauri-apps/api/event')
  return listen<AppErrorPayload>('todos:error', (e) => handler(e.payload))
}
