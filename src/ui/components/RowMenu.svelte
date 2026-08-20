<script lang="ts">
  import { t } from '../../i18n';
  import { popover } from '../popover';
  import { trapFocus } from '../focustrap';
  import IconDots from './icons/IconDots.svelte';
  import IconCheck from './icons/IconCheck.svelte';
  import IconCopy from './icons/IconCopy.svelte';
  import IconRefresh from './icons/IconRefresh.svelte';
  import IconInfo from './icons/IconInfo.svelte';

  interface Props {
    sid: string;
    isOpen: boolean;
    copied: boolean;
    rechecking: boolean;
    recheckDisabled: boolean;
    isExpanded: boolean;
    onTriggerClick: () => void;
    onClose: () => void;
    onCopy: () => void;
    onRecheck: () => void;
    onDetail: () => void;
  }
  let { sid, isOpen, copied, rechecking, recheckDisabled, isExpanded, onTriggerClick, onClose, onCopy, onRecheck, onDetail }: Props = $props();

  let triggerEl: HTMLButtonElement | null = $state(null);
</script>

<div
  class="menu-wrap"
  use:popover={{ open: isOpen, onClose, triggerEl }}
>
  <button
    class="action-btn"
    class:active={isOpen}
    onclick={onTriggerClick}
    type="button"
    bind:this={triggerEl}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    aria-label={t('results.row.menu.aria')}
    title={t('results.row.menu.aria')}
    data-testid={`results-row-menu-${sid}`}
  >
    <IconDots />
  </button>
  {#if isOpen}
    <div class="menu" role="menu" use:trapFocus>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { onCopy(); onClose(); }}
        data-testid={`results-row-copy-${sid}`}
      >
        {#if copied}
          <IconCheck />
        {:else}
          <IconCopy />
        {/if}
        {t('results.copy')}
      </button>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { onRecheck(); onClose(); }}
        disabled={rechecking || recheckDisabled}
        data-testid={`results-row-recheck-${sid}`}
      >
        <IconRefresh class={rechecking ? 'spin' : ''} />
        {t('results.recheck')}
      </button>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        class:active={isExpanded}
        onclick={onDetail}
        data-testid={`results-row-detail-${sid}`}
      >
        <IconInfo />
        {t('results.detail.label')}
      </button>
    </div>
  {/if}
</div>

<style>
  /* Shared chrome (.menu-wrap, .menu, .menu-item, .action-btn, .spin,
     @keyframes spin) lives in src/ui/chrome.css. */
</style>
