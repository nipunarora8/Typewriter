import { writable } from 'svelte/store'
import { applyTheme, resolveThemeId, type ThemeId } from '../theme/theme'
import * as tauriService from '../services/tauri'

export const themeId = writable<ThemeId>(resolveThemeId(null))

export async function initializePreferences() {
  try {
    const state = await tauriService.getAppState()
    const resolved = resolveThemeId(state.themeId)
    themeId.set(resolved)
    applyTheme(resolved)
  } catch {
    applyTheme(resolveThemeId(null))
  }
}

export async function setTheme(id: ThemeId) {
  themeId.set(id)
  applyTheme(id)
  try {
    await tauriService.setPreferences({ themeId: id })
  } catch {
    // Presentation-only preference; a persistence failure here isn't
    // worth surfacing as a user-facing error.
  }
}
