/**
 * Thin native-resize boundary. Real Tauri calls go through here so the
 * component layer never touches `@tauri-apps/api` directly, and so
 * Playwright ui/visual tests (which run against the plain Vite dev
 * server, with no Tauri runtime) get a safe no-op instead of a thrown
 * error when `window.__TAURI_INTERNALS__` isn't present.
 */

export interface LogicalSize {
  width: number
  height: number
}

export const COLLAPSED_SIZE: LogicalSize = { width: 340, height: 190 }
export const EXPANDED_SIZE: LogicalSize = { width: 380, height: 560 }

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Resize the native window and resolve once the resize (and the
 * webview's resulting layout pass) has actually happened — never
 * resolve immediately and let the caller animate against a stale
 * size. In the browser fallback, resolves on the next animation
 * frame so callers have a consistent "layout settled" signal.
 */
export async function requestNativeSize(size: LogicalSize): Promise<void> {
  if (!hasTauriRuntime()) {
    await nextFrame()
    return
  }
  const { getCurrentWindow, LogicalSize: TauriLogicalSize } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  const target = new TauriLogicalSize(size.width, size.height)
  // Pin min/max to the exact target so the window stays fixed at one
  // of our two known sizes — resizable:true (required for setSize to
  // work at all) would otherwise let the user drag a resize handle to
  // an arbitrary size.
  await win.setMinSize(target)
  await win.setMaxSize(target)
  await win.setSize(target)
  await nextFrame()
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
