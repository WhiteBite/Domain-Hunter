<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../../i18n';
  import { trapFocus } from '../focustrap';
  import IconX from './icons/IconX.svelte';

  interface Props {
    open: boolean;
    title: string;
    testid: string;
    onClose: () => void;
    children: Snippet;
  }
  let { open, title, testid, onClose, children }: Props = $props();

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

{#if open}
  <button
    type="button"
    class="drawer-scrim"
    tabindex="-1"
    aria-label={t('drawer.close')}
    onclick={onClose}
    data-testid={`${testid}-scrim`}
  ></button>
  <div
    class="drawer-panel"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    use:trapFocus
    onkeydown={onKeydown}
    data-testid={testid}
  >
    <header class="drawer-head">
      <h3>{title}</h3>
      <button
        class="drawer-close"
        type="button"
        onclick={onClose}
        aria-label={t('drawer.close')}
        data-testid={`${testid}-close`}
      >
        <IconX />
      </button>
    </header>
    <div class="drawer-body">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .drawer-scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 190;
    animation: dh-drawer-fade var(--dur) var(--ease);
  }

  .drawer-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(400px, 90vw);
    display: flex;
    flex-direction: column;
    background: var(--bg-elevated);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-2);
    z-index: 200;
    animation: dh-drawer-slide var(--dur) var(--ease);
  }

  @keyframes dh-drawer-slide {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes dh-drawer-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
    flex: none;
  }

  .drawer-head h3 {
    margin: 0;
    font-size: var(--text-md);
  }

  .drawer-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    transition: all var(--dur) var(--ease);
  }

  .drawer-close:hover {
    border-color: var(--border-strong);
    color: var(--text);
    background: var(--bg-sunken);
  }

  .drawer-close :global(svg) {
    width: 14px;
    height: 14px;
  }

  .drawer-body {
    padding: var(--space-3) var(--space-4);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
</style>
