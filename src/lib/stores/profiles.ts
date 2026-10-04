import { get, writable } from 'svelte/store'
import type { Profile } from '../types'
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

  async switchTo(profileId: string, { force = false }: { force?: boolean } = {}) {
    const state = get(profilesState)
    if (!force && profileId === state.activeProfileId) return
    const myGeneration = ++this.generation

    profilesState.update((s) => ({ ...s, activeProfileId: profileId }))
    beginProfileSwitch()

    try {
      const result = await tauriService.switchProfile({ profileId })
      if (myGeneration !== this.generation) {
        if (result.document) supersedeSession(result.document.sourceSession)
        return
      }
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
