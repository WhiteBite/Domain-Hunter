/**
 * Shared Svelte action: bundles clickOutside + Escape-close + focus-return
 * into one primitive so the 3-line popover pattern isn't repeated in every
 * menu component.
 *
 * Apply to the popover wrapper element (the same element that previously held
 * `use:clickOutside`). The `trapFocus` action stays separate on the inner
 * panel — this action only handles dismissal and focus return.
 *
 * Usage:
 *   <div use:popover={{ open: menuOpen, onClose: () => menuOpen = false, triggerEl }}>
 *     <button bind:this={triggerEl}>...</button>
 *     {#if menuOpen}<div use:trapFocus>...</div>{/if}
 *   </div>
 */
import type { Action } from 'svelte/action';

export interface PopoverOptions {
  /** Whether the popover is currently open. Dismissal handlers are no-ops when false. */
  open: boolean;
  /** Called to close the popover on outside click or Escape. */
  onClose: () => void;
  /** Element to return focus to on Escape close (typically the trigger button). */
  triggerEl?: HTMLElement | null;
}

export const popover: Action<HTMLElement, PopoverOptions> = (node, options) => {
  let current = options;

  function onPointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (current.open && target && !node.contains(target)) {
      current.onClose();
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && current.open) {
      current.onClose();
      current.triggerEl?.focus();
    }
  }

  // Capture phase for pointerdown so the handler runs before any click/stopPropagation
  // on the target (same rationale as clickOutside.ts).
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeydown);

  return {
    update(next: PopoverOptions) {
      current = next;
    },
    destroy() {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeydown);
    },
  };
};
