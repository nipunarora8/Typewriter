import { get, writable } from 'svelte/store'
import type { WidgetMode } from '../types'
import {
  COLLAPSED_SIZE,
  EXPANDED_SIZE,
  fitScaleForScreen,
  requestNativeSize,
} from '../services/nativeWindow'
import { baseScale, windowScale } from './preferences'

export const widgetMode = writable<WidgetMode>('collapsed')

/**
 * Explicit mode controller with one latest-requested destination.
 * Repeated clicks reverse/settle toward whatever was asked for last;
 * an in-flight native resize is never raced against a second one, and
 * a stale completion callback can never move the UI backward once a
 * newer request has superseded it.
 */
class WidgetController {
  private generation = 0

  async requestExpand() {
    const myGeneration = ++this.generation
    widgetMode.set('expanding')
    await requestNativeSize(EXPANDED_SIZE, get(windowScale), true)
    if (myGeneration !== this.generation) return
    widgetMode.set('expanded')
  }

  async requestCollapse() {
    const myGeneration = ++this.generation
    widgetMode.set('collapsing')
    // Paper/controls animate away first (handled by the component via
    // the 'collapsing' state); the native shrink happens after that
    // transition's own timeout elapses, driven by the component calling
    // `finishCollapse()` once its exit transition completes.
    void myGeneration
  }

  async finishCollapse(myGeneration: number) {
    if (myGeneration !== this.generation) return
    // Resizing is only offered while the todo list is open; collapsing
    // always returns the widget to its original, fixed size.
    windowScale.set(get(baseScale))
    await requestNativeSize(COLLAPSED_SIZE, get(baseScale), false)
    if (myGeneration !== this.generation) return
    widgetMode.set('collapsed')
  }

  /** Pick the default size for this screen and shrink the window to it. */
  async initScale() {
    const fit = await fitScaleForScreen()
    if (fit === 1 || get(widgetMode) !== 'collapsed') return
    baseScale.set(fit)
    windowScale.set(fit)
    await requestNativeSize(COLLAPSED_SIZE, fit, false)
  }

  currentGeneration() {
    return this.generation
  }
}

export const widgetController = new WidgetController()
