import { get, writable } from 'svelte/store'
import { NOT_DAILY, type DayInfo, type Profile } from '../types'
import * as tauriService from '../services/tauri'
import {
  applyDocumentFromProfileSwitch,
  beginProfileSwitch,
  clearDocument,
  endProfileSwitch,
  setLoadError,
  supersedeSession,
} from './todos'

export interface ProfilesState {
  profiles: Profile[]
  activeProfileId: string | null
}

export const profilesState = writable<ProfilesState>({ profiles: [], activeProfileId: null })

/** Day row state for the active list (`isDaily: false` for plain lists). */
export const dayInfo = writable<DayInfo>(NOT_DAILY)

/** Today's local date as `YYYY-MM-DD`. */
export function todayString(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Draft text is scoped per profile so switching lists never leaks an
 * unsent draft into the newly active one, and never silently discards
 * it either — it's just not shown until that profile is active again.
 */
export const drafts = writable<Record<string, string>>({})

export function draftFor(profileId: string | null): string {
  if (!profileId) return ''
  return get(drafts)[profileId] ?? ''
}

export function setDraftFor(profileId: string | null, text: string) {
  if (!profileId) return
  drafts.update((d) => ({ ...d, [profileId]: text }))
}

export function activeProfile(state: ProfilesState): Profile | null {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? null
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'category' in err) {
    return tauriService.errorMessageFor(err as tauriService.AppErrorPayload)
  }
  return 'Something unexpected went wrong.'
}

function isCancelled(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && 'category' in err && err.category === 'no-file-selected'
  )
}

/**
 * Latest-wins switch controller, mirroring the widget mode controller's
 * generation-counter pattern: rapid left/right clicks must always
 * settle on the last-requested profile, never an earlier in-flight one
 * that happens to resolve later.
 */
class ProfileController {
  private generation = 0

  async hydrate() {
    try {
      const state = await tauriService.getAppState()
      profilesState.set({ profiles: state.profiles, activeProfileId: state.activeProfileId })
      await this.refreshDayInfo()
    } catch {
      // Leave profilesState at its default; the empty-state file picker
      // flow still works with zero profiles.
    }
  }

  /** Navigate by `delta` (+1/-1) through saved order, wrapping at ends. */
  async navigate(delta: 1 | -1) {
    const state = get(profilesState)
    if (state.profiles.length < 2) return
    const currentIndex = state.profiles.findIndex((p) => p.id === state.activeProfileId)
    const base = currentIndex === -1 ? 0 : currentIndex
    const nextIndex = (base + delta + state.profiles.length) % state.profiles.length
    await this.switchTo(state.profiles[nextIndex].id)
  }

  async refreshDayInfo() {
    try {
      dayInfo.set(await tauriService.getDayInfo())
    } catch {
      dayInfo.set(NOT_DAILY)
    }
  }

  async switchTo(profileId: string, { force = false }: { force?: boolean } = {}) {
    const state = get(profilesState)
    if (!force && profileId === state.activeProfileId) return
    profilesState.update((s) => ({ ...s, activeProfileId: profileId }))
    await this.runSwitch(() => tauriService.switchProfile({ profileId }))
  }

  /** Step the active daily list to an older (-1) or newer (+1) note. */
  async stepDay(delta: 1 | -1) {
    await this.runSwitch(() => tauriService.stepDay({ delta }))
  }

  /** Create (or open) today's note in the active daily list. */
  async createTodayNote() {
    await this.runSwitch(() => tauriService.createTodayNote({ date: todayString() }))
  }

  /**
   * Latest-wins execution of any command that replaces the active
   * document (list switch, day step, note creation): hide the old
   * document immediately, supersede its session, and ignore a result that
   * lost the race to a later request.
   */
  private async runSwitch(call: () => Promise<tauriService.SwitchResult>) {
    const myGeneration = ++this.generation
    beginProfileSwitch()

    try {
      const result = await call()
      if (myGeneration !== this.generation) {
        if (result.document) supersedeSession(result.document.sourceSession)
        return
      }
      dayInfo.set(result.day ?? NOT_DAILY)
      if (result.document) {
        applyDocumentFromProfileSwitch(result.document)
      } else if (result.error) {
        clearDocument()
        setLoadError(describe(result.error))
      }
    } catch (err) {
      if (myGeneration !== this.generation) return
      clearDocument()
      setLoadError(describe(err))
    } finally {
      if (myGeneration === this.generation) endProfileSwitch()
    }
  }

  /** Re-attempt loading the active list (used by the unavailable-note retry). */
  async retry() {
    const id = get(profilesState).activeProfileId
    if (id) await this.switchTo(id, { force: true })
  }

  async addProfile(displayName: string) {
    const myGeneration = ++this.generation
    try {
      const doc = await tauriService.addProfile({ displayName })
      if (myGeneration !== this.generation) {
        supersedeSession(doc.sourceSession)
        return
      }
      await this.hydrate()
      applyDocumentFromProfileSwitch(doc)
    } catch (err) {
      if (!isCancelled(err)) setLoadError(describe(err))
    }
  }

  /** Add a daily list: the backend asks for a folder through the native picker. */
  async addDailyProfile(displayName: string) {
    const myGeneration = ++this.generation
    try {
      const result = await tauriService.addDailyProfile({ displayName, date: todayString() })
      if (myGeneration !== this.generation) {
        if (result.document) supersedeSession(result.document.sourceSession)
        return
      }
      await this.hydrate()
      dayInfo.set(result.day ?? NOT_DAILY)
      if (result.document) {
        applyDocumentFromProfileSwitch(result.document)
      } else {
        clearDocument()
        if (result.error) setLoadError(describe(result.error))
      }
    } catch (err) {
      if (!isCancelled(err)) setLoadError(describe(err))
    }
  }

  async renameProfile(profileId: string, displayName: string) {
    try {
      await tauriService.renameProfile({ profileId, displayName })
      profilesState.update((s) => ({
        ...s,
        profiles: s.profiles.map((p) => (p.id === profileId ? { ...p, displayName } : p)),
      }))
    } catch (err) {
      setLoadError(describe(err))
    }
  }

  async relinkProfile(profileId: string) {
    // Only a relink of the active list produces a document that can
    // race with a switch; relinking another list must not orphan an
    // in-flight switch by bumping the generation.
    const affectsActive = get(profilesState).activeProfileId === profileId
    const myGeneration = affectsActive ? ++this.generation : this.generation
    try {
      const doc = await tauriService.relinkProfile({ profileId })
      if (affectsActive && myGeneration !== this.generation) {
        if (doc) supersedeSession(doc.sourceSession)
        return
      }
      await this.hydrate()
      if (doc) applyDocumentFromProfileSwitch(doc)
    } catch (err) {
      if (!isCancelled(err)) setLoadError(describe(err))
    }
  }

  async removeProfile(profileId: string) {
    const wasActive = get(profilesState).activeProfileId === profileId
    const myGeneration = wasActive ? ++this.generation : this.generation
    if (wasActive) beginProfileSwitch()
    try {
      const doc = await tauriService.removeProfile({ profileId })
      drafts.update((d) => {
        const { [profileId]: _removed, ...rest } = d
        return rest
      })
      if (wasActive && myGeneration !== this.generation) {
        if (doc) supersedeSession(doc.sourceSession)
        return
      }
      await this.hydrate()
      if (doc) {
        applyDocumentFromProfileSwitch(doc)
      } else if (wasActive) {
        clearDocument()
      }
    } catch (err) {
      setLoadError(describe(err))
    } finally {
      if (wasActive && myGeneration === this.generation) endProfileSwitch()
    }
  }

  currentGeneration() {
    return this.generation
  }
}

export const profileController = new ProfileController()
