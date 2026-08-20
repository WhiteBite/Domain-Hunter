<script lang="ts">
  import { t } from '../../i18n';
  import { popover } from '../popover';
  import { trapFocus } from '../focustrap';

  interface Props {
    availCopied: boolean;
    onCopy: () => void;
    onFav: () => void;
    onCsv: () => void;
  }
  let { availCopied, onCopy, onFav, onCsv }: Props = $props();

  let open = $state(false);
  let triggerEl: HTMLButtonElement | null = $state(null);
</script>

<div
  class="menu-wrap avail-menu-wrap"
  use:popover={{ open, onClose: () => (open = false), triggerEl }}
>
  <button
    class="action-btn avail-menu-toggle"
    type="button"
    bind:this={triggerEl}
    onclick={() => (open = !open)}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t('results.available.menu.aria')}
    title={t('results.available.menu.aria')}
    data-testid="results-available-menu"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
  </button>
  {#if open}
    <div class="menu" role="menu" use:trapFocus>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { onCopy(); }}
        data-testid="results-available-copy"
      >
        {#if availCopied}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M3 11V3h8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
        {/if}
        {t('results.available.copy')}
      </button>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { onFav(); open = false; }}
        data-testid="results-available-fav"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11.3l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>
        {t('results.available.fav')}
      </button>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { onCsv(); open = false; }}
        data-testid="results-available-csv"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {t('results.available.csv')}
      </button>
    </div>
  {/if}
</div>

<style>
  .menu-wrap {
    position: relative;
    display: inline-flex;
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-1);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 50;
    min-width: 140px;
  }
  .menu-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: transparent;
    color: var(--text);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    cursor: pointer;
    text-align: left;
    min-height: 32px;
    transition: background var(--dur) var(--ease);
  }
  .menu-item:hover {
    background: var(--bg-sunken);
  }
  .menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .menu-item svg {
    width: 14px;
    height: 14px;
    flex: none;
  }
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-decoration: none;
    transition: all var(--dur) var(--ease);
  }
  .action-btn:hover {
    border-color: var(--border-strong);
    color: var(--text);
    background: var(--bg-sunken);
  }
  .action-btn svg {
    width: 15px;
    height: 15px;
  }
</style>
