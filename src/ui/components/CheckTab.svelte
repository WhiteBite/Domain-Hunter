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
    type RunPhase,
  } from '../store';
  import { history, recordRun, clearHistory } from '../history';
  import type { HistoryEntry } from '../../types';
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
  let shareTimer: ReturnType<typeof setTimeout> | undefined;
  let showHint = $state(false);
  let collapsed = $state(false);
  let prevPhase: RunPhase | null = null;
  let unsubRunState: (() => void) | undefined;

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
    checkInput.set(e.query);
    selectedTlds.set([...e.tlds]);
    startRequest.update((n) => n + 1);
  }

  onDestroy(() => {
    clearTimeout(shareTimer);
    unsubRunState?.();
  });

  onMount(() => {
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
</script>

<section class="check-tab" aria-busy={$runState.phase === 'running'}>
  {#if $resumePrompt}
    <div class="resume-banner" role="alert">
      <div class="resume-text">
        <strong>{t('check.run.resume.title')}</strong>
        <span>{t('check.run.resume.body', { n: $resumePrompt.pending.length })}</span>
      </div>
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
    </div>
  </header>

  <div class="grid" class:collapsed>
    <div class="col-left">
      <button
        class="panel-toggle"
        type="button"
        data-testid="check-panel-toggle"
        aria-label={collapsed ? t('check.panel.expand') : t('check.panel.collapse')}
        title={collapsed ? t('check.panel.expand') : t('check.panel.collapse')}
        onclick={() => (collapsed = !collapsed)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" class={collapsed ? 'rot' : ''}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      {#if !collapsed}
        <DomainInput />
        <TldPicker />
        <RunControls />
        <section class="history-section">
          <div class="history-head">
            <h3 class="side-title">{t('check.history.title')}</h3>
            {#if $history.length > 0}
              <button class="hint-dismiss" type="button" data-testid="history-clear" onclick={clearHistory}>
                {t('check.history.clear')}
              </button>
            {/if}
          </div>
          {#if $history.length === 0}
            <p class="history-empty">{t('check.history.empty')}</p>
          {:else}
            <ul class="history-list">
              {#each $history as e, i}
                <li>
                  <button
                    class="history-entry"
                    type="button"
                    data-testid={`history-entry-${i}`}
                    title={t('check.history.restore')}
                    onclick={() => restore(e)}
                  >
                    <span class="h-time">{formatTime(e.ts)}</span>
                    <span class="h-query">{queryPreview(e.query)} · {t('check.history.meta', { names: nameCount(e.query), zones: e.tlds.length })}</span>
                    <span class="h-avail">{t('check.progress.available', { n: e.counts.available })}</span>
                  </button>
                </li>
              {/each}
            </ul>
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
    padding: var(--space-3) var(--space-4);
    border: 1px solid color-mix(in srgb, var(--amber) 30%, transparent);
    background: var(--amber-soft);
    border-radius: var(--radius-md);
  }

  .resume-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
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
  .grid.collapsed {
    grid-template-columns: auto 1fr;
  }
  .panel-toggle {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
  }
  .panel-toggle:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .panel-toggle svg {
    width: 14px;
    height: 14px;
    transition: transform var(--dur) var(--ease);
  }
  .panel-toggle svg.rot {
    transform: rotate(180deg);
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
</style>
