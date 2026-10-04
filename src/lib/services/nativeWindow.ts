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

export const COLLAPSED_SIZE: LogicalSize = { width: 380, height: 252 }
export const EXPANDED_SIZE: LogicalSize = { width: 380, height: 636 }

export const MIN_SCALE = 0.7
export const MAX_SCALE = 1.6

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function scaled(size: LogicalSize, scale: number): LogicalSize {
  return { width: size.width * scale, height: size.height * scale }
}

/**
 * Resize the native window to `baseSize` scaled by `scale`, and resolve
 * once the resize (and the webview's resulting layout pass) has
 * actually happened — never resolve immediately and let the caller
 * animate against a stale size. In the browser fallback, resolves on
 * the next animation frame so callers have a consistent "layout
 * settled" signal.
 *
 * Tauri grows/shrinks a window from its top-left corner, which would
 * make the widget's *bottom* edge drift downward on expand. To get the
 * "slides up" feel from the reference design, the window's position is
 * adjusted by the height delta on every resize so the bottom edge
 * stays fixed and the window grows/shrinks upward.
 *
 * `setMinSize`/`setMaxSize` are set to a scale *range* around the
 * target when `allowResize` is true (not pinned to it) so the window
 * stays drag-resizable by the user between calls — the user's drag
 * becomes the new scale on the next read via `readCurrentScale`. When
 * `allowResize` is false, min and max are pinned to the exact target
 * so the window is a fixed size (used for the collapsed widget, where
 * drag-resize isn't offered).
 */
export async function requestNativeSize(
  baseSize: LogicalSize,
  scale: number,
  allowResize: boolean,
): Promise<void> {
  if (!hasTauriRuntime()) {
    await nextFrame()
    return
  }
  const {
    getCurrentWindow,
    LogicalSize: TauriLogicalSize,
    PhysicalPosition,
  } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  const target = scaled(baseSize, scale)
  const targetSize = new TauriLogicalSize(target.width, target.height)
  const minSize = allowResize
    ? new TauriLogicalSize(...toTuple(scaled(baseSize, MIN_SCALE)))
    : targetSize
  const maxSize = allowResize
    ? new TauriLogicalSize(...toTuple(scaled(baseSize, MAX_SCALE)))
    : targetSize

  // All position/size math below is done in physical pixels, since
  // that's what outerSize/outerPosition return and what setPosition
  // with a PhysicalPosition expects — mixing logical and physical
  // units here is a common source of subtle drift across displays
  // with different scale factors.
  const dpiScale = await win.scaleFactor()
  const currentSizePhysical = await win.outerSize()
  const currentPosPhysical = await win.outerPosition()
  const nextHeightPhysical = target.height * dpiScale
  const heightDeltaPhysical = nextHeightPhysical - currentSizePhysical.height
  const nextYPhysical = currentPosPhysical.y - heightDeltaPhysical

  await win.setMinSize(minSize)
  await win.setMaxSize(maxSize)
  await win.setSize(targetSize)
  await win.setPosition(new PhysicalPosition(currentPosPhysical.x, Math.round(nextYPhysical)))
  await nextFrame()
}

function toTuple(size: LogicalSize): [number, number] {
  return [size.width, size.height]
}

/**
 * Read the user's current scale relative to `baseSize`, from the
 * window's actual on-screen width (clamped to the allowed range). Used
 * after a user drag-resize to persist the new scale.
 */
export async function readCurrentScale(baseSize: LogicalSize): Promise<number | null> {
  if (!hasTauriRuntime()) return null
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  const dpiScale = await win.scaleFactor()
  const outer = await win.outerSize()
  const logicalWidth = outer.width / dpiScale
  const rawScale = logicalWidth / baseSize.width
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale))
}

export async function onNativeResize(handler: () => void): Promise<() => void> {
  if (!hasTauriRuntime()) return () => {}
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  return win.onResized(() => handler())
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
