<script lang="ts">
  import { t } from '../../i18n';
  import { popover } from '../popover';
  import { trapFocus } from '../focustrap';
  import IconDots from './icons/IconDots.svelte';
  import IconCheck from './icons/IconCheck.svelte';
  import IconCopy from './icons/IconCopy.svelte';
  import IconStar from './icons/IconStar.svelte';
  import IconDownload from './icons/IconDownload.svelte';

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
    <IconDots />
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
          <IconCheck />
        {:else}
          <IconCopy />
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
        <IconStar />
        {t('results.available.fav')}
      </button>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { onCsv(); open = false; }}
        data-testid="results-available-csv"
      >
        <IconDownload />
        {t('results.available.csv')}
      </button>
    </div>
  {/if}
</div>

<style>
  /* Shared chrome (.menu-wrap, .menu, .menu-item, .action-btn) lives in
     src/ui/chrome.css. */
</style>
