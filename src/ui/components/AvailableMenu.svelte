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
  /* Shared chrome (.menu-wrap, .menu, .menu-item, .action-btn) lives in
     src/ui/chrome.css. */
</style>
