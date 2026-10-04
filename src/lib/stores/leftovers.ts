import { get, writable } from 'svelte/store'
import * as tauriService from '../services/tauri'
import { applyDocumentFromProfileSwitch, setLoadError, todosState } from './todos'

export interface Leftover {
  fromDate: string
  count: number
}

/** Unfinished tasks from the previous day that could be brought over, if any. */
export const leftovers = writable<Leftover | null>(null)

// Dismissals last for the app session and are keyed by list + day.
const dismissed = new Set<string>()
let request = 0

/**
 * Look for leftovers only when it makes sense: a daily list whose shown
 * note is still empty. `key` changes whenever a document is (re)loaded so
 * the lookup reruns; stale answers are dropped.
 */
export async function refreshLeftovers(
  key: string | null,
  eligible: boolean,
  dismissKey: string | null,
) {
  const mine = ++request
  if (!key || !eligible || !dismissKey || dismissed.has(dismissKey)) {
    leftovers.set(null)
    return
  }
  try {
    const info = await tauriService.getLeftovers()
    if (mine !== request) return
    leftovers.set(
      info.fromDate && info.tasks.length > 0
        ? { fromDate: info.fromDate, count: info.tasks.length }
        : null,
    )
  } catch {
    if (mine === request) leftovers.set(null)
  }
}

export function dismissLeftovers(dismissKey: string | null) {
  if (dismissKey) dismissed.add(dismissKey)
  request++
  leftovers.set(null)
}

export async function bringOverLeftovers() {
  const doc = get(todosState).document
  if (!doc) return
  try {
    const updated = await tauriService.bringOverLeftovers({
      revision: doc.revision,
      sourceSession: doc.sourceSession,
    })
    request++
    leftovers.set(null)
    applyDocumentFromProfileSwitch(updated)
  } catch (err) {
    setLoadError(err instanceof Error ? err.message : 'Something unexpected went wrong.')
  }
}
