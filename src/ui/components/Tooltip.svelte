<script lang="ts">
  import type { Snippet } from 'svelte';

  let { text, children }: { text: string; children: Snippet } = $props();
  let visible = $state(false);
  const tipId = `tip-${Math.random().toString(36).slice(2, 9)}`;

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
    <span class="tip" role="tooltip" id={tipId}>
      {text}
      <span class="tip-arrow" aria-hidden="true"></span>
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
    max-width: 280px;
    z-index: 100;
    pointer-events: none;
    line-height: 1.4;
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
