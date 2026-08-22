<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import { exportRows, results, pricing } from '../store';
  import { t } from '../../i18n';
  import { popover } from '../popover';
  import { trapFocus } from '../focustrap';
  import { copyText } from '../clipboard';
  import { toCsv, toMarkdown, toTsv, resultsToJson } from '../csv';
  import IconDots from './icons/IconDots.svelte';
  import IconCheck from './icons/IconCheck.svelte';
  import IconCopy from './icons/IconCopy.svelte';

  // Export menu popover state (CSV / Markdown / TSV / JSON copy to clipboard).
  let exportMenuOpen = $state(false);
  let exportMenuTriggerEl: HTMLButtonElement | null = $state(null);
  let exportCopiedKey = $state<'csv' | 'md' | 'tsv' | 'json' | null>(null);
  let exportCopiedTimer: ReturnType<typeof setTimeout> | undefined;

  function exportHeaders(): string[] {
    return [
      t('csv.domain'),
      t('csv.status'),
      t('results.col.price'),
      t('price.renewal'),
      t('price.tco'),
    ];
  }

  function flashExportCopied(key: 'csv' | 'md' | 'tsv' | 'json'): void {
    exportCopiedKey = key;
    if (exportCopiedTimer != null) clearTimeout(exportCopiedTimer);
    exportCopiedTimer = setTimeout(() => {
      exportCopiedKey = null;
    }, 1500);
  }

  async function copyAsCsv(): Promise<void> {
    const ok = await copyText(toCsv(get(exportRows), exportHeaders()));
    if (ok) flashExportCopied('csv');
  }

  async function copyAsMd(): Promise<void> {
    const ok = await copyText(toMarkdown(get(exportRows), exportHeaders()));
    if (ok) flashExportCopied('md');
  }

  async function copyAsTsv(): Promise<void> {
    const ok = await copyText(toTsv(get(exportRows), exportHeaders()));
    if (ok) flashExportCopied('tsv');
  }

  async function copyAsJson(): Promise<void> {
    const table = get(pricing)?.table ?? null;
    const json = resultsToJson(get(results), table);
    const ok = await copyText(json);
    if (ok) flashExportCopied('json');
  }

  onDestroy(() => {
    if (exportCopiedTimer != null) clearTimeout(exportCopiedTimer);
  });

  interface Props {
    disabled: boolean;
  }
  let { disabled }: Props = $props();
</script>

<div
  class="export-menu-wrap"
  use:popover={{ open: exportMenuOpen, onClose: () => (exportMenuOpen = false), triggerEl: exportMenuTriggerEl }}
>
  <button
    class="action icon-only"
    onclick={() => (exportMenuOpen = !exportMenuOpen)}
    type="button"
    {disabled}
    bind:this={exportMenuTriggerEl}
    aria-haspopup="menu"
    aria-expanded={exportMenuOpen}
    aria-label={t('export.menu.aria')}
    title={t('export.menu.aria')}
    data-testid="check-button-export-menu"
  >
    <IconDots />
  </button>
  {#if exportMenuOpen}
    <div class="export-menu" role="menu" use:trapFocus>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { void copyAsCsv(); }}
        data-testid="check-export-copy-csv"
      >
        {#if exportCopiedKey === 'csv'}
          <IconCheck />
        {:else}
          <IconCopy />
        {/if}
        {t('export.copyCsv')}
      </button>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { void copyAsMd(); }}
        data-testid="check-export-copy-md"
      >
        {#if exportCopiedKey === 'md'}
          <IconCheck />
        {:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h2v8H2zM6 4h2l2 4 2-4h2v8h-2V7l-2 4-2-4v5H6z" fill="currentColor" /></svg>
        {/if}
        {t('export.copyMd')}
      </button>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { void copyAsTsv(); }}
        data-testid="check-export-copy-tsv"
      >
        {#if exportCopiedKey === 'tsv'}
          <IconCheck />
        {:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12M6 4v8M10 4v8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        {/if}
        {t('export.copyTsv')}
      </button>
      <button
        class="menu-item"
        role="menuitem"
        type="button"
        onclick={() => { void copyAsJson(); }}
        data-testid="check-export-copy-json"
      >
        {#if exportCopiedKey === 'json'}
          <IconCheck />
        {:else}
          <IconCopy />
        {/if}
        {t('export.copyJson')}
      </button>
    </div>
  {/if}
</div>

<style>
  .action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    min-height: 36px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--dur) var(--ease);
  }
  .action:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text);
    background: var(--bg-sunken);
  }
  .action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .action :global(svg) {
    width: 14px;
    height: 14px;
  }
  .action.icon-only {
    padding: 0;
    width: 36px;
    justify-content: center;
  }
  .export-menu-wrap {
    position: relative;
    display: inline-flex;
  }
  .export-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-1);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-pop);
    z-index: 60;
    min-width: 180px;
  }
  /* Shared .menu-item lives in src/ui/chrome.css. */
</style>
