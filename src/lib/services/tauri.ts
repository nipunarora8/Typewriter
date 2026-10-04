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
import type { DayInfo, Profile, TodoDocument } from '../types'

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
  // Rust unit-variant errors serialize as `{ category }` only.
  message?: string
}

const CATEGORY_MESSAGES: Record<string, string> = {
  'no-file-selected': 'No file is selected yet.',
  'not-markdown': "That file isn't a Markdown (.md) file.",
  'is-directory': 'That path is a directory, not a file.',
  'file-missing': 'This note could not be found. It may have been moved or deleted.',
  'permission-denied':
    "Typewriter isn't allowed to open that file. If it is in Documents, allow it in System Settings > Privacy & Security > Files and Folders, or remove this list in the gear menu and set up again.",
  'invalid-utf8': "The file contains invalid UTF-8 text and can't be read safely.",
  'symlink-rejected': "Linked files (symlinks) aren't supported for the selected note.",
  'unsupported-file-type': "That isn't a regular file.",
  'stale-revision': 'The note changed; refreshed the list — please try again.',
  'stale-session': 'That list changed or was closed; please try again.',
  'invalid-task-text': "Task text can't be empty or longer than 2000 characters.",
  'multiline-rejected': "Task text can't contain line breaks or control characters.",
  'no-safe-insertion-point':
    "Couldn't find a safe place to add the task without disturbing the note.",
  'recovery-snapshot-failed': "Couldn't save a safety copy before writing, so nothing was changed.",
  'write-conflict': 'The note changed on disk right before saving; nothing was overwritten.',
  'write-outcome-uncertain':
    "The save finished, but the app couldn't confirm the result. Reload before trying again.",
  'profile-not-found': 'That saved list no longer exists.',
  'invalid-profile-name':
    "List names can't be empty, longer than 80 characters, start with a dot, or contain / \\ : or control characters.",
  'not-directory': "That path isn't a folder.",
  'invalid-date': "That isn't a valid date.",
  'no-such-day': 'There is no note for that day.',
  'not-daily-list': "This list isn't a daily folder list.",
  internal: 'Something unexpected went wrong.',
}

export function errorMessageFor(payload: AppErrorPayload): string {
  return (
    payload.message ?? CATEGORY_MESSAGES[payload.category] ?? 'Something unexpected went wrong.'
  )
}

export class TauriCommandError extends Error {
  category: string
  constructor(payload: AppErrorPayload) {
    super(errorMessageFor(payload))
    this.category = payload.category
  }
}

export interface AppStateSnapshot {
  selectedPath: string | null
  themeId: string | null
  profiles: Profile[]
  activeProfileId: string | null
}

export interface LeftoverInfo {
  fromDate: string | null
  tasks: string[]
}

export interface SwitchResult {
  document: TodoDocument | null
  error: AppErrorPayload | null
  day: DayInfo
}

export interface UpdateInfo {
  version: string
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
  addProfile(args: { displayName: string }): Promise<TodoDocument>
  renameProfile(args: { profileId: string; displayName: string }): Promise<void>
  relinkProfile(args: { profileId: string }): Promise<TodoDocument | null>
  removeProfile(args: { profileId: string }): Promise<TodoDocument | null>
  switchProfile(args: { profileId: string }): Promise<SwitchResult>
  addDailyProfile(args: { displayName: string; date: string }): Promise<SwitchResult>
  createTodayNote(args: { date: string }): Promise<SwitchResult>
  stepDay(args: { delta: number }): Promise<SwitchResult>
  getDayInfo(): Promise<DayInfo>
  getLeftovers(): Promise<LeftoverInfo>
  bringOverLeftovers(args: { revision: string; sourceSession: string }): Promise<TodoDocument>
  checkForUpdate(): Promise<UpdateInfo | null>
  installUpdate(): Promise<void>
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
    if (err && typeof err === 'object' && 'category' in err) {
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

export async function addProfile(args: { displayName: string }): Promise<TodoDocument> {
  const adapter = testAdapter()
  if (adapter) return adapter.addProfile(args)
  return invoke<TodoDocument>('add_profile', args)
}

export async function renameProfile(args: {
  profileId: string
  displayName: string
}): Promise<void> {
  const adapter = testAdapter()
  if (adapter) return adapter.renameProfile(args)
  return invoke<void>('rename_profile', args)
}

export async function relinkProfile(args: { profileId: string }): Promise<TodoDocument | null> {
  const adapter = testAdapter()
  if (adapter) return adapter.relinkProfile(args)
  return invoke<TodoDocument | null>('relink_profile', args)
}

export async function removeProfile(args: { profileId: string }): Promise<TodoDocument | null> {
  const adapter = testAdapter()
  if (adapter) return adapter.removeProfile(args)
  return invoke<TodoDocument | null>('remove_profile', args)
}

export async function switchProfile(args: { profileId: string }): Promise<SwitchResult> {
  const adapter = testAdapter()
  if (adapter) return adapter.switchProfile(args)
  return invoke<SwitchResult>('switch_profile', args)
}

export async function addDailyProfile(args: {
  displayName: string
  date: string
}): Promise<SwitchResult> {
  const adapter = testAdapter()
  if (adapter) return adapter.addDailyProfile(args)
  return invoke<SwitchResult>('add_daily_profile', args)
}

export async function createTodayNote(args: { date: string }): Promise<SwitchResult> {
  const adapter = testAdapter()
  if (adapter) return adapter.createTodayNote(args)
  return invoke<SwitchResult>('create_today_note', args)
}

export async function stepDay(args: { delta: number }): Promise<SwitchResult> {
  const adapter = testAdapter()
  if (adapter) return adapter.stepDay(args)
  return invoke<SwitchResult>('step_day', args)
}

export async function getDayInfo(): Promise<DayInfo> {
  const adapter = testAdapter()
  if (adapter) return adapter.getDayInfo()
  return invoke<DayInfo>('get_day_info')
}

export async function getLeftovers(): Promise<LeftoverInfo> {
  const adapter = testAdapter()
  if (adapter) return adapter.getLeftovers()
  return invoke<LeftoverInfo>('get_leftovers')
}

export async function bringOverLeftovers(args: {
  revision: string
  sourceSession: string
}): Promise<TodoDocument> {
  const adapter = testAdapter()
  if (adapter) return adapter.bringOverLeftovers(args)
  return invoke<TodoDocument>('bring_over_leftovers', args)
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

// The update found by the last check; installing downloads exactly that one.
let pendingUpdate: { downloadAndInstall: () => Promise<void> } | null = null

/** Ask GitHub Releases whether a newer signed version exists. Only runs when the user asks. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const adapter = testAdapter()
  if (adapter) return adapter.checkForUpdate()
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()
  pendingUpdate = update
  return update ? { version: update.version } : null
}

export async function installUpdate(): Promise<void> {
  const adapter = testAdapter()
  if (adapter) return adapter.installUpdate()
  if (!pendingUpdate) return
  await pendingUpdate.downloadAndInstall()
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

/**
 * Check once shortly after launch and install a newer signed release.
 * Does nothing in dev builds, browser tests, or when offline.
 */
export async function autoUpdateOnLaunch(): Promise<void> {
  if (testAdapter() || !hasTauriRuntime() || import.meta.env.DEV) return
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return
    await update.downloadAndInstall()
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch {
    // Offline or GitHub unreachable: try again at the next launch.
  }
}
