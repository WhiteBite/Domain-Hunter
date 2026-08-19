/**
 * Shared Svelte action: call `callback` when a `pointerdown` fires outside
 * `node`. Used by TldPicker popover, ResultsTable row ⋯ menu, and Generators
 * tray ⋯ menu so they all close on outside click via one primitive.
 *
 * Uses the capture phase so the handler runs before any `click`/`stopPropagation`
 * on the target, and `node.contains(target)` so clicks inside the anchored
 * trigger (which lives in the same wrapper as the floating panel) are ignored.
 *
 * Escape handling stays in each component (per DESIGN.md §6 popover spec).
 */
import type { Action } from 'svelte/action';

export const clickOutside: Action<HTMLElement, (() => void) | undefined> = (
  node,
  callback,
) => {
  function onPointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (target && !node.contains(target)) {
      callback?.();
    }
  }

  document.addEventListener('pointerdown', onPointerDown, true);

  return {
    update(next: (() => void) | undefined) {
      callback = next;
    },
    destroy() {
      document.removeEventListener('pointerdown', onPointerDown, true);
    },
  };
};
