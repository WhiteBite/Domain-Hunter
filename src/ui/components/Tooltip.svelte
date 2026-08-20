<script lang="ts">
  import type { Snippet } from 'svelte';

  let { text, children }: { text: string; children: Snippet } = $props();
  let visible = $state(false);
  const tipId = `tip-${Math.random().toString(36).slice(2, 9)}`;

  let tipEl: HTMLElement | null = $state(null);
  let arrowEl: HTMLElement | null = $state(null);

  // Viewport-safe horizontal clamping: the bubble is centered on the trigger
  // via CSS (left: 50% + translateX(-50%)); after render we measure where it
  // landed and, if it crosses the viewport edge (8px margin), apply a
  // corrective translateX inline. The arrow is re-anchored toward the trigger
  // center by the same delta. Runs on hover AND keyboard focus (both set
  // `visible`), so no per-consumer handling is needed.
  const EDGE_MARGIN = 8;
  $effect(() => {
    const tip = tipEl;
    const arrow = arrowEl;
    if (!visible || !tip) return;
    const rect = tip.getBoundingClientRect();
    let dx = 0;
    if (rect.right > window.innerWidth - EDGE_MARGIN) {
      dx = window.innerWidth - EDGE_MARGIN - rect.right;
    } else if (rect.left < EDGE_MARGIN) {
      dx = EDGE_MARGIN - rect.left;
    }
    if (dx !== 0) {
      tip.style.transform = `translateX(calc(-50% + ${dx}px))`;
      if (arrow) arrow.style.left = `calc(50% - ${dx}px)`;
    } else {
      tip.style.transform = '';
      if (arrow) arrow.style.left = '';
    }
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') visible = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_tabindex -->
<span
  class="tip-wrap"
  onmouseenter={() => (visible = true)}
  onmouseleave={() => (visible = false)}
  onfocusin={() => (visible = true)}
  onfocusout={() => (visible = false)}
  onkeydown={onKeydown}
  data-testid="tooltip-trigger"
>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <span class="tip-trigger" tabindex="0" aria-describedby={visible ? tipId : undefined} data-testid="tooltip-trigger-inner">
    {@render children()}
  </span>
  {#if visible && text}
    <span class="tip" role="tooltip" id={tipId} bind:this={tipEl}>
      {text}
      <span class="tip-arrow" aria-hidden="true" bind:this={arrowEl}></span>
    </span>
  {/if}
</span>

<style>
  .tip-wrap {
    position: relative;
    display: inline-flex;
  }

  .tip-trigger {
    display: inline-flex;
  }

  .tip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    width: max-content;
    max-width: 320px;
    z-index: 100;
    pointer-events: none;
    line-height: 1.4;
    /* Long parametrized texts (e.g. promo-trap) must wrap, not spill in a
       single line past the bubble edge (table cells set white-space: nowrap,
       which the tooltip explicitly overrides). */
    white-space: normal;
    text-align: left;
  }

  .tip-arrow {
    position: absolute;
    top: 100%;
    left: 50%;
    width: 8px;
    height: 8px;
    margin-top: -4px;
    transform: translateX(-50%) rotate(45deg);
    background: var(--bg-elevated);
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
</style>
