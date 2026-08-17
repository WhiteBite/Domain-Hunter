<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import {
    results,
    pricing,
    settings,
    checkInput,
    selectedTlds,
    runState,
    registry,
    pendingShareRun,
  } from '../store';
  import { loadPricing, freshnessLabel } from '../../pricing/pricing';
  import { resultsToCsvRows, buildCsv, downloadCsv } from '../csv';
  import { encodeShare, parseShare, clearShare } from '../share';
  import { t } from '../../i18n';
  import DomainInput from './DomainInput.svelte';
  import TldPicker from './TldPicker.svelte';
  import RunControls from './RunControls.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import ResultsTable from './ResultsTable.svelte';
  import EmptyState from './EmptyState.svelte';

  let shareCopied = $state(false);

  onMount(() => {
    if (!get(pricing)) {
      loadPricing()
        .then((state) => pricing.set(state))
        .catch(() => {});
    }

    // Share link support: pre-fill input/zones, optionally auto-run (SPEC §12).
    const shared = parseShare();
    if (shared && (shared.q || shared.tlds.length > 0)) {
      if (shared.q) checkInput.set(shared.q);
      if (shared.tlds.length > 0) {
        const known = new Set(get(registry).tlds.map((t) => t.tld));
        const valid = shared.tlds.filter((tld) => known.has(tld));
        if (valid.length > 0) selectedTlds.set(valid);
      }
      clearShare();
      if (shared.run) pendingShareRun.set(true);
    }
  });

  const freshness = $derived.by(() => {
    const p = $pricing;
    if (!p) return null;
    return freshnessLabel(p);
  });

  const hasResults = $derived($results.size > 0);

  function handleExportCsv() {
    const table = $pricing?.table ?? null;
    const rows = resultsToCsvRows(get(results), table, get(settings));
    const csv = buildCsv(rows);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`domain-hunter-${date}.csv`, csv);
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }
  }

  async function handleShare() {
    const base = location.href.split('#')[0];
    const url =
      base +
      encodeShare({
        q: get(checkInput),
        tlds: get(selectedTlds),
        run: false,
      });
    const ok = await copyText(url);
    if (ok) {
      shareCopied = true;
      setTimeout(() => (shareCopied = false), 1500);
    }
  }
</script>

<section class="check-tab" aria-busy={$runState.phase === 'running'}>
  <header class="tab-header">
    <div class="header-text">
      <h2 class="title">{t('check.title')}</h2>
      <p class="description">{t('check.description')}</p>
    </div>
    <div class="header-actions">
      {#if freshness}
        <span class="freshness" title={t('price.disclaimer')}>
          {t(freshness.key, freshness.params)}
        </span>
      {/if}
      <button
        class="action"
        onclick={handleShare}
        type="button"
        disabled={!hasResults}
        title={shareCopied ? t('results.share.copied') : t('results.share')}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="4" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="12" cy="3" r="2" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="12" cy="13" r="2" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M6 7l4-3M6 9l4 3" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
        <span>{shareCopied ? t('results.share.copied') : t('results.share')}</span>
      </button>
      <button
        class="action"
        onclick={handleExportCsv}
        type="button"
        disabled={!hasResults}
        title={t('results.csv')}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2v8M5 7l3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{t('results.csv')}</span>
      </button>
    </div>
  </header>

  <div class="grid">
    <div class="col-left">
      <DomainInput />
      <TldPicker />
      <RunControls />
    </div>
    <div class="col-right">
      <ProgressBar />
      {#if hasResults}
        <ResultsTable />
      {:else}
        <EmptyState />
      {/if}
    </div>
  </div>
</section>

<style>
  .check-tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .tab-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .header-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 240px;
  }
  .title {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  .description {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 560px;
  }
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .freshness {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background: var(--bg-elevated);
    white-space: nowrap;
    cursor: help;
  }
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
  .action svg {
    width: 14px;
    height: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) 2fr;
    gap: var(--space-5);
    align-items: start;
  }
  .col-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .col-right {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  @media (max-width: 860px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
