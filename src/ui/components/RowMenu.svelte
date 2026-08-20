<script lang="ts">
  import { t } from '../../i18n';
  import { popover } from '../popover';
  import { trapFocus } from '../focustrap';

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
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
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
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M3 11V3h8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
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
        <svg class:spin={rechecking} viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M8 7.4v3.2M8 5.2v.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
        {t('results.detail.label')}
      </button>
    </div>
  {/if}
</div>

<style>
  /* Shared chrome (.menu-wrap, .menu, .menu-item, .action-btn, .spin,
     @keyframes spin) lives in src/ui/chrome.css. */
</style>
