/**
 * Shared Svelte action: trap keyboard focus inside a popover/menu panel.
 *
 * On mount, focuses the first focusable descendant (or the panel itself when
 * it has none, e.g. the status legend). Tab / Shift+Tab cycle within the
 * panel instead of escaping into the page behind it. Escape handling and
 * focus-return stay in each component (per DESIGN.md §6 popover spec).
 *
 * Applied to: TldPicker popover, App language menu, ResultsTable row ⋯ menu,
 * status legend panel, available-domains menu, CheckTab export menu,
 * GeneratorsTab tray menu.
 */
import type { Action } from 'svelte/action';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isFocusable(el: HTMLElement): boolean {
  // offsetParent is null for display:none (and position:fixed — panels here
  // are position:absolute, so that case does not apply).
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

export const trapFocus: Action<HTMLElement> = (node) => {
  function focusables(): HTMLElement[] {
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isFocusable);
  }

  // Initial focus: first focusable descendant, else the panel itself.
  const first = focusables()[0];
  if (first) {
    first.focus();
  } else {
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
    node.focus();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const els = focusables();
    if (els.length === 0) {
      // No focusable content (e.g. legend panel): keep focus on the panel.
      event.preventDefault();
      return;
    }
    const firstEl = els[0] as HTMLElement;
    const lastEl = els[els.length - 1] as HTMLElement;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === firstEl || !node.contains(active)) {
        event.preventDefault();
        lastEl.focus();
      }
    } else if (active === lastEl || !node.contains(active)) {
      event.preventDefault();
      firstEl.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
    },
  };
};
