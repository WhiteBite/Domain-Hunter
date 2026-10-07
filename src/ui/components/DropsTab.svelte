<script lang="ts">
  import { get } from 'svelte/store';
  import { t } from '../../i18n';
  import { activeTab, checkInput, pendingShareRun, pricing, settings } from '../store';
  import { favorites, toggleFavorite } from '../favorites';
  import { filterDrops, type DroppedDomain } from '../../core/dropped';
  import { bestEntry, formatPrice } from '../../pricing/pricing';
  import { readJson, writeJson } from '../settings';
  import {
    applyDropsFilters,
    sortDrops,
    domainScore,
    waybackAvailableUrl,
    waybackCalendarUrl,
    interpretWaybackAvailable,
    pruneWaybackCache,
    isWaybackFresh,
    WAYBACK_CACHE_KEY,
    type DropsFilters,
    type DropsSort,
    type WaybackVerdict,
    type WaybackCacheEntry,
  } from '../drops-tools';
  import { copyText } from '../clipboard';
  import { downloadCsv, toSimpleCsv } from '../csv';
  import { createToast, sanitizeId } from '../utils';
  import Toast from './Toast.svelte';
  import Tooltip from './Tooltip.svelte';
  import IconStar from './icons/IconStar.svelte';
  // Static snapshot shipped with the build (SPEC §17 — dropped-domains feed).
  import snapshot from '../../config/dropped.snapshot.json';

  interface Snapshot {
    generatedAt: string;
    source: string;
    /** Compact "label tld" strings (order-preserving, ~3× smaller than objects). */
    list: string[];
  }

  const data = snapshot as unknown as Snapshot;
  const allDomains: DroppedDomain[] = data.list.map((s) => {
    const i = s.lastIndexOf(' ');
    return { d: s.slice(0, i), tld: s.slice(i + 1) };
  });

  // ---- TLD filter options: top 20 by count + 'all' ----
  const tldCounts = new Map<string, number>();
  for (const dom of allDomains) {
    tldCounts.set(dom.tld, (tldCounts.get(dom.tld) ?? 0) + 1);
  }
  const tldOptions = [...tldCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tld, n]) => ({ tld, n }));

  // ---- UI state ----
  let query = $state('');
  let tldFilter = $state<string>(''); // '' = all
  let minLen = $state<string | number>('');
  let maxLen = $state<string | number>('');
  let noDigits = $state(false);
  let noHyphens = $state(false);
  let minScore = $state('');
  let sortMode = $state<DropsSort>('default');

  // bind:value on type=number yields numbers; typed input yields strings.
  function lenValue(v: string | number): number | null {
    const n = typeof v === 'number' ? v : v.trim() === '' ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  const dropsFilters = $derived<DropsFilters>({
    minLen: lenValue(minLen),
    maxLen: lenValue(maxLen),
    noDigits,
    noHyphens,
    minScore: minScore === '' ? null : Number(minScore),
  });

  const filtered = $derived(
    sortDrops(
      applyDropsFilters(filterDrops(allDomains, query, tldFilter || null), dropsFilters),
      sortMode,
    ),
  );
  const RENDER_CAP = 300;
  const visible = $derived(filtered.slice(0, RENDER_CAP));

  const priceByTld = $derived.by(() => {
    const state = $pricing;
    const map = new Map<string, string>();
    if (!state) return map;
    const s = $settings;
    for (const dom of visible) {
      if (map.has(dom.tld)) continue;
      const best = bestEntry(state.table, dom.tld);
      map.set(dom.tld, best ? formatPrice(best.entry.reg, s) : '');
    }
    return map;
  });

  // ---- Lazy Wayback history (on row expand only, cached 30d) ----
  let expandedRow = $state<string | null>(null);
  let waybackState = $state<
    Record<string, { loading: boolean; failed?: boolean; v?: WaybackVerdict }>
  >({});

  function toggleRow(fullName: string): void {
    if (expandedRow === fullName) {
      expandedRow = null;
      return;
    }
    expandedRow = fullName;
    void loadWayback(fullName);
  }

  async function loadWayback(domain: string): Promise<void> {
    const cached = readJson<Record<string, WaybackCacheEntry>>(WAYBACK_CACHE_KEY) ?? {};
    const entry = cached[domain];
    if (entry && isWaybackFresh(entry, Date.now())) {
      waybackState = { ...waybackState, [domain]: { loading: false, v: entry.v } };
      return;
    }
    waybackState = { ...waybackState, [domain]: { loading: true } };
    try {
      const resp = await fetch(waybackAvailableUrl(domain));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const v = interpretWaybackAvailable(await resp.json());
      writeJson(
        WAYBACK_CACHE_KEY,
        pruneWaybackCache({ ...cached, [domain]: { v, ts: Date.now() } }, Date.now()),
      );
      waybackState = { ...waybackState, [domain]: { loading: false, v } };
    } catch {
      waybackState = { ...waybackState, [domain]: { loading: false, failed: true } };
    }
  }

  const snapshotDate = $derived(
    data.generatedAt ? new Date(data.generatedAt).toISOString().slice(0, 10) : '',
  );

  let toast = $state('');
  const toastCtl = createToast((m) => (toast = m));

  function showToast(message: string): void {
    toastCtl.show(message);
  }

  function appendToCheck(domains: DroppedDomain[], cap: number): void {
    const lines = domains.slice(0, cap).map((d) => `${d.d}.${d.tld}`);
    if (lines.length === 0) return;
    const current = get(checkInput);
    const prefix = current && !current.endsWith('\n') ? current + '\n' : current;
    checkInput.set(prefix + lines.join('\n'));
  }

  function addOne(dom: DroppedDomain): void {
    appendToCheck([dom], 1);
    activeTab.set('check');
    // «To check» means check: auto-start the run like Generators' Check-now.
    pendingShareRun.set(true);
  }

  function addAll(): void {
    appendToCheck(filtered, 500);
    activeTab.set('check');
    pendingShareRun.set(true);
  }

  async function copyDomain(dom: DroppedDomain): Promise<void> {
    const text = `${dom.d}.${dom.tld}`;
    const ok = await copyText(text);
    if (ok) showToast(t('results.copied'));
  }

  function exportCsv(): void {
    if (filtered.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    const rows = filtered.map((d) => [`${d.d}.${d.tld}`, d.tld]);
    const csv = toSimpleCsv(rows, [t('csv.domain'), t('csv.tld')]);
    downloadCsv(`domain-hunter-drops-${date}.csv`, csv);
  }

  async function copyList(): Promise<void> {
    const text = filtered.map((d) => `${d.d}.${d.tld}`).join('\n');
    const ok = await copyText(text);
    if (ok) showToast(t('results.copied'));
  }

  // Avoid stale timer across tab unmounts.
  $effect(() => {
    return () => toastCtl.destroy();
  });
</script>

<section class="drops">
  <h2>{t('drops.title')}</h2>
  <p class="desc">{t('drops.desc')}</p>

  <div class="controls">
    <input
      class="search"
      type="search"
      bind:value={query}
      placeholder={t('drops.search')}
      aria-label={t('drops.search')}
      data-testid="drops-input-search"
    />
    <select bind:value={tldFilter} aria-label={t('drops.search')} data-testid="drops-select-tld">
      <option value="">{t('check.tlds.presets.all')}</option>
      {#each tldOptions as opt (opt.tld)}
        <option value={opt.tld}>.{opt.tld} ({opt.n})</option>
      {/each}
    </select>
    <span class="count nums" aria-live="polite">{t('drops.count', { n: filtered.length })}</span>
    <span class="snapshot">{t('drops.snapshot', { date: snapshotDate })}</span>
    <button
      class="btn primary"
      type="button"
      onclick={addAll}
      disabled={filtered.length === 0}
      data-testid="drops-button-add-all"
    >
      {t('drops.addAll')}
    </button>
    <button
      class="btn"
      type="button"
      onclick={exportCsv}
      disabled={filtered.length === 0}
      data-testid="drops-button-export-csv"
    >
      {t('drops.export.csv')}
    </button>
    <button
      class="btn"
      type="button"
      onclick={() => void copyList()}
      disabled={filtered.length === 0}
      data-testid="drops-button-copy-list"
    >
      {t('drops.export.copy')}
    </button>
  </div>

  <div class="filters">
    <label class="inline">
      {t('drops.filter.minLen')}
      <input
        class="len"
        type="number"
        min="1"
        max="63"
        bind:value={minLen}
        aria-label={t('drops.filter.minLen')}
        data-testid="drops-input-minlen"
      />
    </label>
    <label class="inline">
      {t('drops.filter.maxLen')}
      <input
        class="len"
        type="number"
        min="1"
        max="63"
        bind:value={maxLen}
        aria-label={t('drops.filter.maxLen')}
        data-testid="drops-input-maxlen"
      />
    </label>
    <button
      class="chip-toggle"
      type="button"
      class:active={noDigits}
      aria-pressed={noDigits}
      onclick={() => (noDigits = !noDigits)}
      data-testid="drops-toggle-nodigits"
    >
      {t('drops.filter.noDigits')}
    </button>
    <button
      class="chip-toggle"
      type="button"
      class:active={noHyphens}
      aria-pressed={noHyphens}
      onclick={() => (noHyphens = !noHyphens)}
      data-testid="drops-toggle-nohyphens"
    >
      {t('drops.filter.noHyphens')}
    </button>
    <label class="inline">
      {t('drops.filter.minScore')}
      <select
        bind:value={minScore}
        aria-label={t('drops.filter.minScore')}
        data-testid="drops-select-minscore"
      >
        <option value="">{t('drops.filter.scoreOff')}</option>
        <option value="-5">≥ −5.0</option>
        <option value="-4.5">≥ −4.5</option>
        <option value="-4">≥ −4.0</option>
        <option value="-3.5">≥ −3.5</option>
      </select>
    </label>
    <label class="inline">
      {t('drops.sort')}
      <select bind:value={sortMode} aria-label={t('drops.sort')} data-testid="drops-select-sort">
        <option value="default">{t('drops.sort.default')}</option>
        <option value="score">{t('drops.sort.score')}</option>
        <option value="length">{t('drops.sort.length')}</option>
        <option value="az">{t('drops.sort.az')}</option>
      </select>
    </label>
  </div>

  {#if visible.length === 0}
    <p class="muted empty">{t('drops.empty')}</p>
  {:else}
    <ul class="grid" role="list">
      {#each visible as dom (dom.d + '.' + dom.tld)}
        {@const fullName = dom.d + '.' + dom.tld}
        {@const sid = sanitizeId(fullName)}
        <li class="row" class:expanded={expandedRow === fullName}>
          <span class="domain" aria-label={fullName}>{dom.d}<span class="tld">.{dom.tld}</span></span>
          <span class="row-score nums" title={t('drops.col.score')}>{domainScore(dom.d).toFixed(1)}</span>
          <span class="row-price nums">{priceByTld.get(dom.tld) || '—'}</span>
          <span class="row-actions">
            <button
              class="icon-btn fav"
              class:active={$favorites.has(fullName)}
              type="button"
              onclick={() => { if (!toggleFavorite(fullName)) showToast(t('results.fav.full')); }}
              aria-label={$favorites.has(fullName) ? t('results.fav.remove') : t('results.fav.add')}
              title={$favorites.has(fullName) ? t('results.fav.remove') : t('results.fav.add')}
              data-testid={`drops-row-fav-${sid}`}
            >
              <IconStar filled={$favorites.has(fullName)} strokeWidth={1} />
            </button>
            <Tooltip text={t('drops.copy.aria', { domain: fullName })}>
              <button
                class="icon-btn"
                type="button"
                onclick={() => void copyDomain(dom)}
                aria-label={t('drops.copy.aria', { domain: fullName })}
                data-testid={`drops-row-copy-${sid}`}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M3 11V3h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              </button>
            </Tooltip>
            <Tooltip text={t('drops.add.aria', { domain: fullName })}>
              <button
                class="icon-btn primary"
                type="button"
                onclick={() => addOne(dom)}
                aria-label={t('drops.add.aria', { domain: fullName })}
                data-testid={`drops-row-add-${sid}`}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              </button>
            </Tooltip>
            <button
              class="icon-btn"
              type="button"
              onclick={() => toggleRow(fullName)}
              aria-expanded={expandedRow === fullName}
              aria-label={t('drops.expand.aria', { domain: fullName })}
              title={t('drops.expand.aria', { domain: fullName })}
              data-testid={`drops-row-expand-${sid}`}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </span>
          {#if expandedRow === fullName}
            {@const wb = waybackState[fullName]}
            <div class="row-history" data-testid={`drops-row-history-${sid}`}>
              {#if wb?.loading}
                <span class="muted">{t('drops.wayback.loading')}</span>
              {:else if wb?.failed}
                <span class="muted">{t('drops.wayback.failed')}</span>
              {:else if wb?.v?.hasHistory}
                <span>{t('drops.wayback.has')}</span>
                {#if wb.v.snapshotUrl}
                  <a
                    href={wb.v.snapshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`drops-row-snapshot-${sid}`}
                  >{t('drops.wayback.snapshot')}</a>
                {/if}
                <a
                  href={waybackCalendarUrl(fullName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`drops-row-calendar-${sid}`}
                >{t('drops.wayback.calendar')}</a>
              {:else if wb?.v}
                <span class="muted">{t('drops.wayback.none')}</span>
                <a
                  href={waybackCalendarUrl(fullName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`drops-row-calendar-${sid}`}
                >{t('drops.wayback.calendar')}</a>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if filtered.length > visible.length}
      <p class="muted more">
        {t('results.showing', { shown: visible.length, total: filtered.length })}
      </p>
    {/if}
  {/if}

  {#if toast}
    <Toast message={toast} />
  {/if}
</section>

<style>
  .drops {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .desc {
    margin: 0;
    color: var(--text-secondary);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .search {
    flex: 1;
    min-width: 200px;
    max-width: 320px;
  }

  .search,
  select {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-family: inherit;
    min-height: 40px;
  }

  .count {
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .snapshot {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    margin-left: auto;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background var(--dur) var(--ease);
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-sunken);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-1);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    min-width: 0;
    min-height: 40px;
  }

  .row:hover {
    background: var(--bg-sunken);
  }

  .domain {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    min-width: 0;
    word-break: break-all;
    overflow-wrap: anywhere;
    line-height: 1.3;
  }

  .tld {
    color: var(--text-tertiary);
  }

  .row-actions {
    display: flex;
    gap: var(--space-1);
    flex: none;
    align-items: center;
  }

  .filters {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .filters .inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .filters input.len {
    width: 72px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    font-family: inherit;
    min-height: 32px;
  }

  .chip-toggle {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-secondary);
    border-radius: 999px;
    padding: 4px var(--space-3);
    font-size: var(--text-xs);
    font-family: inherit;
    cursor: pointer;
    min-height: 32px;
    transition: all var(--dur) var(--ease);
  }

  .chip-toggle.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .row.expanded {
    flex-wrap: wrap;
  }

  .row-score,
  .row-price {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    flex: none;
    text-align: right;
  }

  .row-score {
    min-width: 4.5ch;
  }

  .row-price {
    min-width: 6ch;
  }

  .row-history {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    padding-top: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .row-history a {
    color: var(--accent-text);
  }

  .icon-btn {
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
    transition: all var(--dur) var(--ease);
    padding: 0;
  }

  .icon-btn:hover {
    border-color: var(--border-strong);
    color: var(--text);
    background: var(--bg-sunken);
  }

  .icon-btn.fav.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .icon-btn.primary {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
    background: var(--accent-soft);
  }

  .icon-btn.primary:hover {
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
  }

  .icon-btn :global(svg) {
    width: 15px;
    height: 15px;
  }

  .muted {
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    margin: 0;
  }

  .empty {
    padding: var(--space-5) 0;
    text-align: center;
  }

  .more {
    text-align: center;
    padding-top: var(--space-2);
  }

  /* Shared .toast lives in src/ui/chrome.css. */

  @media (max-width: 640px) {
    .snapshot {
      margin-left: 0;
      width: 100%;
    }
  }
</style>
