import { writable } from 'svelte/store'
import type { WidgetMode } from '../types'
import { COLLAPSED_SIZE, EXPANDED_SIZE, requestNativeSize } from '../services/nativeWindow'

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
    await requestNativeSize(EXPANDED_SIZE)
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
    await requestNativeSize(COLLAPSED_SIZE)
    if (myGeneration !== this.generation) return
    widgetMode.set('collapsed')
  }

  currentGeneration() {
    return this.generation
  }
}

export const widgetController = new WidgetController()
