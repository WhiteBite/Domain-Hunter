<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy, onMount } from 'svelte';
  import {
    results,
    pricing,
    settings,
    checkInput,
    selectedTlds,
    runState,
    registry,
    pendingShareRun,
    resumePrompt,
    resumeAction,
    startRequest,
    exportRows,
    requestFavoritesView,
    type RunPhase,
  } from '../store';
  import { history, recordRun, clearHistory } from '../history';
  import { watchChanges } from '../watchlist';
  import type { HistoryEntry } from '../../types';
  import { loadPricing, freshnessLabel } from '../../pricing/pricing';
  import { resultsToCsvRows, buildCsv, downloadCsv, toCsv, toTsv, toMarkdown } from '../csv';
  import { encodeShare, parseShare, clearShare } from '../share';
  import { t } from '../../i18n';
  import { clickOutside } from '../clickoutside';
  import { trapFocus } from '../focustrap';
  import DomainInput from './DomainInput.svelte';
  import TldPicker from './TldPicker.svelte';
  import RunControls from './RunControls.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import ResultsTable from './ResultsTable.svelte';
  import EmptyState from './EmptyState.svelte';

  let shareCopied = $state(false);
  let shareTimer: ReturnType<typeof setTimeout> | undefined;
  let showHint = $state(false);
  let collapsed = $state(false);
  let historyOpen = $state(false);
  let prevPhase: RunPhase | null = null;
  let unsubRunState: (() => void) | undefined;
  let watchDismissed = $state(false);

  // Export menu popover (CSV / Markdown / TSV copy to clipboard).
  let exportMenuOpen = $state(false);
  let exportMenuTriggerEl: HTMLButtonElement | null = $state(null);
  let exportCopiedKey = $state<'csv' | 'md' | 'tsv' | null>(null);
  let exportCopiedTimer: ReturnType<typeof setTimeout> | undefined;

  function dismissHint(): void {
    showHint = false;
    try {
      localStorage.setItem('dh:v1:hint-dismissed', '1');
    } catch {
      // non-fatal
    }
  }

  function nameCount(query: string): number {
    return query.split('\n').filter((l) => l.trim().length > 0).length;
  }

  function queryPreview(query: string): string {
    const first = query.split('\n').find((l) => l.trim().length > 0) ?? '';
    const trimmed = first.trim();
    return trimmed.length > 48 ? trimmed.slice(0, 48) + '…' : trimmed;
  }

  function formatTime(ts: number): string {
    const locale = $settings.lang === 'ru' ? 'ru-RU' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ts);
  }

  function restore(e: HistoryEntry): void {
    if (e.input == null) return;
    checkInput.set(e.input);
    selectedTlds.set([...e.tlds]);
    startRequest.update((n) => n + 1);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && exportMenuOpen) {
      exportMenuOpen = false;
      exportMenuTriggerEl?.focus();
    }
  }

  onDestroy(() => {
    clearTimeout(shareTimer);
    if (exportCopiedTimer != null) clearTimeout(exportCopiedTimer);
    document.removeEventListener('keydown', onKeydown);
    unsubRunState?.();
  });

  onMount(() => {
    document.addEventListener('keydown', onKeydown);
    if (!get(pricing)) {
      loadPricing()
        .then((state) => pricing.set(state))
        .catch(() => {});
    }

    try {
      if (!localStorage.getItem('dh:v1:hint-dismissed')) showHint = true;
    } catch {
      showHint = true;
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
      if (shared.q || shared.run) pendingShareRun.set(true);
    }

    // Record completed runs into history (SPEC §5 dh:v1:history).
    unsubRunState = runState.subscribe((state) => {
      if (prevPhase === 'running' && state.phase === 'done') {
        const r = get(results);
        let available = 0;
        let taken = 0;
        let problems = 0;
        for (const cr of r.values()) {
          if (cr.status === 'available' || cr.status === 'probably_available') available++;
          else if (cr.status === 'taken') taken++;
          else problems++;
        }
        recordRun({
          ts: Date.now(),
          query: get(checkInput).trim().slice(0, 2000),
          tlds: [...get(selectedTlds)],
          counts: { total: r.size, available, taken, problems },
          input: get(checkInput),
        });
      }
      prevPhase = state.phase;
    });
  });

  const freshness = $derived.by(() => {
    const p = $pricing;
    if (!p) return null;
    return freshnessLabel(p);
  });

  const hasResults = $derived($results.size > 0);

  const watchCounts = $derived.by(() => {
    let freed = 0;
    let taken = 0;
    for (const c of $watchChanges) {
      if (c.to === 'available' || c.to === 'probably_available') freed++;
      else if (c.to === 'taken') taken++;
    }
    return { freed, taken };
  });

  const showWatchBanner = $derived($watchChanges.length > 0 && !watchDismissed);

  function handleExportCsv() {
    const table = $pricing?.table ?? null;
    const rows = resultsToCsvRows(get(results), table, get(settings));
    const headers = [
      t('csv.domain'),
      t('csv.status'),
      t('csv.tld'),
      t('csv.priceFirstYear'),
      t('csv.priceRenewal'),
      t('csv.bestRegistrar'),
      t('csv.checkedAt'),
    ];
    const csv = buildCsv(rows, headers);
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
        run: true,
      });
    const ok = await copyText(url);
    if (ok) {
      shareCopied = true;
      clearTimeout(shareTimer);
      shareTimer = setTimeout(() => (shareCopied = false), 1500);
    }
  }

  function exportHeaders(): string[] {
    return [
      t('csv.domain'),
      t('csv.status'),
      t('results.col.price'),
      t('price.renewal'),
      t('price.tco'),
    ];
  }

  function flashExportCopied(key: 'csv' | 'md' | 'tsv'): void {
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
</script>

<section class="check-tab" aria-busy={$runState.phase === 'running'}>
  {#if $resumePrompt}
    <div class="resume-banner" role="alert">
      <span class="resume-text">
        <strong>{t('check.run.resume.title')}</strong>
        <span>{t('check.run.resume.body', { n: $resumePrompt.pending.length })}</span>
      </span>
      <div class="resume-actions">
        <button class="btn primary" type="button" onclick={() => resumeAction.set('resume')} data-testid="check-button-resume">
          {t('check.run.resume.yes')}
        </button>
        <button class="btn ghost" type="button" onclick={() => resumeAction.set('discard')} data-testid="check-button-discard">
          {t('check.run.resume.no')}
        </button>
      </div>
    </div>
  {/if}

  {#if showWatchBanner}
    <div class="watch-banner" role="status" data-testid="check-watch-banner">
      <span class="watch-text">
        {t('watch.banner', { freed: watchCounts.freed, taken: watchCounts.taken })}
      </span>
      <div class="watch-actions">
        <button class="btn primary" type="button" onclick={() => requestFavoritesView.set(true)} data-testid="check-watch-show">
          {t('watch.showFavs')}
        </button>
        <button class="btn ghost" type="button" onclick={() => (watchDismissed = true)} aria-label={t('watch.banner.dismiss')} data-testid="check-watch-dismiss">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>
      </div>
    </div>
  {/if}

  {#if showHint}
    <div class="hint-strip" role="note" data-testid="check-hint-strip">
      <ol class="hint-steps">
        <li>{t('check.hint.1')}</li>
        <li>{t('check.hint.2')}</li>
        <li>{t('check.hint.3')}</li>
      </ol>
      <button class="hint-dismiss" type="button" onclick={dismissHint} data-testid="check-button-hint-dismiss">
        {t('check.hint.dismiss')}
      </button>
    </div>
  {/if}

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
      <span class="freshness" title={t('settings.currency')}>{$settings.currency}</span>
      <button
        class="action"
        onclick={() => void handleShare()}
        type="button"
        disabled={!hasResults}
        title={shareCopied ? t('results.share.copied') : `${t('results.share')} · ${t('check.share.run')}`}
        data-testid="check-button-share"
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
        data-testid="check-button-csv"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2v8M5 7l3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{t('results.csv')}</span>
      </button>
      <div
        class="export-menu-wrap"
        use:clickOutside={exportMenuOpen ? () => { exportMenuOpen = false; } : undefined}
      >
        <button
          class="action icon-only"
          onclick={() => (exportMenuOpen = !exportMenuOpen)}
          type="button"
          disabled={!hasResults}
          bind:this={exportMenuTriggerEl}
          aria-haspopup="menu"
          aria-expanded={exportMenuOpen}
          aria-label={t('export.menu.aria')}
          title={t('export.menu.aria')}
          data-testid="check-button-export-menu"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
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
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
              {:else}
                <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M3 11V3h8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
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
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
              {:else}
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12M6 4v8M10 4v8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              {/if}
              {t('export.copyTsv')}
            </button>
          </div>
        {/if}
      </div>
      <button
        class="action icon-only"
        type="button"
        onclick={() => (collapsed = !collapsed)}
        aria-label={collapsed ? t('check.panel.expand') : t('check.panel.collapse')}
        title={collapsed ? t('check.panel.expand') : t('check.panel.collapse')}
        data-testid="check-panel-toggle"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M6 3v10" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
    </div>
  </header>

  <div class="grid" class:collapsed>
    <div class="col-left">
      {#if !collapsed}
        <DomainInput />
        <TldPicker />
        <RunControls />
        <section class="history-section">
            <div class="history-head">
              <button
                class="history-toggle"
                type="button"
                onclick={() => (historyOpen = !historyOpen)}
                aria-expanded={historyOpen}
                data-testid="check-history-toggle"
                aria-label={t('check.history.toggle.aria')}
              >
                <svg class="h-chev" class:rot={historyOpen} viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <h3 class="side-title">{t('check.history.title')}</h3>
                {#if $history.length > 0}
                  <span class="history-count nums">{$history.length}</span>
                {/if}
              </button>
              {#if $history.length > 0}
                <button class="hint-dismiss" type="button" data-testid="history-clear" onclick={clearHistory}>
                  {t('check.history.clear')}
                </button>
              {/if}
            </div>
            {#if historyOpen}
              {#if $history.length === 0}
                <p class="history-empty">{t('check.history.empty')}</p>
              {:else}
                <ul class="history-list">
                  {#each $history as e, i}
                    <li>
                      {#if e.input != null}
                        <button
                          class="history-entry"
                          type="button"
                          data-testid={`history-entry-${i}`}
                          title={t('check.history.restore')}
                          aria-label={t('check.history.restore')}
                          onclick={() => restore(e)}
                        >
                          <span class="h-time">{formatTime(e.ts)}</span>
                          <span class="h-query">{queryPreview(e.query)} · {t('check.history.meta', { names: nameCount(e.query), zones: e.tlds.length })}</span>
                          <span class="h-avail">{t('check.progress.available', { n: e.counts.available })}</span>
                        </button>
                      {:else}
                        <div
                          class="history-entry static"
                          data-testid={`history-entry-${i}`}
                          aria-label={t('check.history.restore')}
                        >
                          <span class="h-time">{formatTime(e.ts)}</span>
                          <span class="h-query">{queryPreview(e.query)} · {t('check.history.meta', { names: nameCount(e.query), zones: e.tlds.length })}</span>
                          <span class="h-avail">{t('check.progress.available', { n: e.counts.available })}</span>
                        </div>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
          </section>
      {:else}
        <span class="panel-summary">{nameCount($checkInput)} × {$selectedTlds.length}</span>
      {/if}
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

  .hint-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .hint-steps {
    margin: 0;
    padding-left: 1.2em;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hint-dismiss {
    border: none;
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: var(--radius-full);
    padding: var(--space-1) var(--space-3);
    min-height: 32px;
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
  }

  .resume-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border: 1px solid color-mix(in srgb, var(--amber) 30%, transparent);
    background: var(--amber-soft);
    border-radius: var(--radius-md);
  }

  .resume-text {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }

  .resume-text strong {
    color: var(--amber);
    font-size: var(--text-sm);
  }

  .resume-text span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .resume-actions {
    display: flex;
    gap: var(--space-2);
  }

  .resume-actions .btn {
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .resume-actions .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .resume-actions .btn.ghost {
    background: transparent;
    color: var(--text-secondary);
  }

  .watch-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border: 1px solid color-mix(in srgb, var(--green) 30%, transparent);
    background: var(--green-soft);
    border-radius: var(--radius-md);
  }

  .watch-text {
    font-size: var(--text-sm);
    color: var(--text);
  }

  .watch-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .watch-actions .btn {
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .watch-actions .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .watch-actions .btn.ghost {
    background: transparent;
    color: var(--text-secondary);
    padding: 0 var(--space-2);
    min-width: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .watch-actions .btn.ghost svg {
    width: 14px;
    height: 14px;
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
  .menu-item svg {
    width: 14px;
    height: 14px;
    flex: none;
  }
  .grid {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
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
  .grid.collapsed {
    grid-template-columns: auto 1fr;
  }
  .panel-summary {
    writing-mode: vertical-rl;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  .history-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .history-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .history-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .history-toggle .h-chev {
    width: 14px;
    height: 14px;
    color: var(--text-tertiary);
    transition: transform var(--dur) var(--ease);
  }
  .history-toggle .h-chev.rot {
    transform: rotate(180deg);
  }
  .history-count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    background: var(--bg-sunken);
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-weight: 400;
  }
  .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 260px;
    overflow-y: auto;
  }
  .history-entry {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }
  .history-entry:hover {
    border-color: var(--border-strong);
    background: var(--bg-sunken);
  }
  .history-entry.static {
    cursor: default;
  }
  .history-entry.static:hover {
    border-color: var(--border);
    background: var(--bg-elevated);
  }
  .history-entry .h-time {
    color: var(--text-tertiary);
  }
  .history-entry .h-query {
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .history-entry .h-avail {
    color: var(--text-tertiary);
  }
  .history-empty {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    margin: 0;
  }
  .side-title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 600;
  }
  @media (max-width: 860px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 1100px) {
    .description {
      display: none;
    }
  }
</style>
