export const THEME_IDS = ['ivory', 'midnight', 'high-contrast'] as const
export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME: ThemeId = 'ivory'

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as readonly string[]).includes(value)
}

/** Unknown/missing saved theme IDs fall back to the default. */
export function resolveThemeId(value: string | null | undefined): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME
}

export function applyTheme(themeId: ThemeId) {
  if (themeId === DEFAULT_THEME) {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', themeId)
  }
}
