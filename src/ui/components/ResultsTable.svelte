<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  import { results, settings, pricing, registry } from '../store';
  import type { CheckResult, EngineOptions, PriceEntry, RegistrarConfig } from '../../types';
  import {
    bestEntry,
    formatPrice,
    tco3,
    priceTier,
    isBelowFloor,
    isPromoTrap,
    bestCoupon,
  } from '../../pricing/pricing';
  import { createEngine } from '../../core/engine';
  import type { EngineHandle } from '../../core/engine';
  import { KEYS } from '../settings';
  import { put as putCache } from '../../core/cache';
  import { t } from '../../i18n';
  import StatusBadge from './StatusBadge.svelte';

  import registrarsJson from '../../config/registrars.json';

  const registrars = registrarsJson as unknown as RegistrarConfig[];

  type FilterKey = 'all' | 'available' | 'taken' | 'problems';
  type SortKey = 'name' | 'price' | 'renew' | 'tco' | 'status';
  type SortDir = 'asc' | 'desc';

  let filter = $state<FilterKey>('all');
  let sortKey = $state<SortKey>('name');
  let sortDir = $state<SortDir>('asc');
  let visibleCount = $state(100);
  let copied = $state<Set<string>>(new Set());
  let rechecking = $state<Set<string>>(new Set());

  interface RowData {
    result: CheckResult;
    best: { registrarId: string; entry: PriceEntry } | null;
    tco: number | null;
    firstYear: number | null;
    renewal: number | null;
  }

  const rows = $derived.by(() => {
    const table = $pricing?.table ?? null;
    const arr: RowData[] = [];
    for (const r of $results.values()) {
      const best = table ? bestEntry(table, r.tld) : null;
      arr.push({
        result: r,
        best,
        tco: table ? tco3(table, r.tld) : null,
        firstYear: best?.entry.reg ?? null,
        renewal: best?.entry.renew ?? null,
      });
    }
    return arr;
  });

  const filtered = $derived.by(() => {
    switch (filter) {
      case 'available':
        return rows.filter(
          (r) =>
            r.result.status === 'available' ||
            r.result.status === 'probably_available',
        );
      case 'taken':
        return rows.filter((r) => r.result.status === 'taken');
      case 'problems':
        return rows.filter(
          (r) => r.result.status === 'unknown' || r.result.status === 'error',
        );
      default:
        return rows;
    }
  });

  const sorted = $derived.by(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.result.domain.localeCompare(b.result.domain) * dir;
        case 'price':
          return ((a.firstYear ?? Infinity) - (b.firstYear ?? Infinity)) * dir;
        case 'renew':
          return ((a.renewal ?? Infinity) - (b.renewal ?? Infinity)) * dir;
        case 'tco':
          return ((a.tco ?? Infinity) - (b.tco ?? Infinity)) * dir;
        case 'status':
          return a.result.status.localeCompare(b.result.status) * dir;
        default:
          return 0;
      }
    });
    return arr;
  });

  const visible = $derived(sorted.slice(0, visibleCount));

  $effect(() => {
    void filter;
    void sortKey;
    void sortDir;
    visibleCount = 100;
  });

  let sentinelEl: HTMLElement | null = null;
  let observer: IntersectionObserver | null = null;
  let rafId: number | null = null;

  function maybeExtend() {
    if (rafId != null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      visibleCount = Math.min(visibleCount + 100, sorted.length);
    });
  }

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && visibleCount < sorted.length) {
          maybeExtend();
        }
      },
      { rootMargin: '200px' },
    );
    if (sentinelEl) observer.observe(sentinelEl);
  });

  onDestroy(() => {
    observer?.disconnect();
    if (rafId != null) cancelAnimationFrame(rafId);
  });

  $effect(() => {
    const len = sorted.length;
    if (len > visibleCount && sentinelEl && observer) {
      observer.unobserve(sentinelEl);
      observer.observe(sentinelEl);
    }
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  function registrarFor(tld: string): { registrar: RegistrarConfig | null; entry: PriceEntry | null } {
    const table = $pricing?.table ?? null;
    if (!table) return { registrar: null, entry: null };
    const best = bestEntry(table, tld);
    if (!best) return { registrar: null, entry: null };
    const registrar = registrars.find((r) => r.id === best.registrarId) ?? null;
    return { registrar, entry: best.entry };
  }

  function buyUrl(domain: string, tld: string): string | null {
    const { registrar } = registrarFor(tld);
    if (!registrar) return null;
    return registrar.searchUrl.replace('{domain}', encodeURIComponent(domain));
  }

  function priceColor(cents: number | null): string {
    if (cents == null) return 'var(--text-tertiary)';
    const tier = priceTier(cents);
    if (tier === 'cheap') return 'var(--price-cheap)';
    if (tier === 'mid') return 'var(--price-mid)';
    return 'var(--price-high)';
  }

  function couponFor(tld: string) {
    const table = $pricing?.table;
    if (!table) return null;
    return bestCoupon(table, tld);
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

  async function handleCopy(domain: string) {
    const ok = await copyText(domain);
    if (ok) {
      const next = new Set(copied);
      next.add(domain);
      copied = next;
      setTimeout(() => {
        const next2 = new Set(copied);
        next2.delete(domain);
        copied = next2;
      }, 1500);
    }
  }

  function recheck(domain: string) {
    const next = new Set(rechecking);
    next.add(domain);
    rechecking = next;

    const registryVal = get(registry);
    const settingsVal = get(settings);
    const options: EngineOptions = {
      registry: registryVal,
      proxyUrl: settingsVal.proxyUrl || undefined,
      fetchTimeoutMs: 10000,
      maxRetries: 3,
    };
    (options as EngineOptions & { concurrency?: number }).concurrency = 1;

    const e: EngineHandle = createEngine((event) => {
      if (event.type === 'result') {
        results.update((map) => {
          const next = new Map(map);
          next.set(event.result.domain, event.result);
          return next;
        });
        putCache(event.result.domain, {
          status: event.result.status,
          source: event.result.source,
          ts: event.result.checkedAt,
          tld: event.result.tld,
        });
        const next2 = new Set(rechecking);
        next2.delete(domain);
        rechecking = next2;
        e.destroy();
      } else if (event.type === 'finished') {
        e.destroy();
        const next2 = new Set(rechecking);
        next2.delete(domain);
        rechecking = next2;
      }
    });
    e.start([domain], options);
  }

  // Cache writes go through the shared core cache module (dh:v1:cache).

  const hasResults = $derived($results.size > 0);
</script>

{#if !hasResults}
  <!-- EmptyState rendered by parent -->
{:else}
  <div class="results">
    <div class="toolbar">
      <div class="filters" role="group" aria-label={t('results.title')}>
        <button class="filter" class:active={filter === 'all'} onclick={() => (filter = 'all')} type="button">
          {t('results.filters.all')}
        </button>
        <button class="filter" class:active={filter === 'available'} onclick={() => (filter = 'available')} type="button">
          {t('results.filters.available')}
        </button>
        <button class="filter" class:active={filter === 'taken'} onclick={() => (filter = 'taken')} type="button">
          {t('results.filters.taken')}
        </button>
        <button class="filter" class:active={filter === 'problems'} onclick={() => (filter = 'problems')} type="button">
          {t('results.filters.problems')}
        </button>
      </div>
      <span class="count" aria-live="polite">
        {t('results.showing', { shown: visible.length, total: sorted.length })}
      </span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>
              <button class="sort-btn" onclick={() => toggleSort('name')} type="button" aria-sort={ariaSort('name')}>
                {t('results.sort.name')}
                <span class="sort-arrow" class:visible={sortKey === 'name'} class:desc={sortDir === 'desc'} aria-hidden="true">▲</span>
              </button>
            </th>
            <th>
              <button class="sort-btn" onclick={() => toggleSort('status')} type="button" aria-sort={ariaSort('status')}>
                {t('results.col.status')}
                <span class="sort-arrow" class:visible={sortKey === 'status'} class:desc={sortDir === 'desc'} aria-hidden="true">▲</span>
              </button>
            </th>
            <th>
              <button class="sort-btn" onclick={() => toggleSort('price')} type="button" aria-sort={ariaSort('price')}>
                {t('results.col.price')}
                <span class="sort-arrow" class:visible={sortKey === 'price'} class:desc={sortDir === 'desc'} aria-hidden="true">▲</span>
              </button>
            </th>
            <th>
              <button class="sort-btn" onclick={() => toggleSort('renew')} type="button" aria-sort={ariaSort('renew')}>
                {t('results.col.renew')}
                <span class="sort-arrow" class:visible={sortKey === 'renew'} class:desc={sortDir === 'desc'} aria-hidden="true">▲</span>
              </button>
            </th>
            <th>
              <button class="sort-btn" onclick={() => toggleSort('tco')} type="button" aria-sort={ariaSort('tco')} title={t('tooltip.tco')}>
                {t('results.col.tco')}
                <span class="sort-arrow" class:visible={sortKey === 'tco'} class:desc={sortDir === 'desc'} aria-hidden="true">▲</span>
              </button>
            </th>
            <th class="actions-col">{t('results.col.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each visible as row (row.result.domain)}
            {@const isAvail = row.result.status === 'available' || row.result.status === 'probably_available'}
            {@const buy = buyUrl(row.result.domain, row.result.tld)}
            {@const coupon = couponFor(row.result.tld)}
            {@const trap = row.best ? isPromoTrap(row.best.entry) : false}
            {@const promo = row.firstYear != null && isBelowFloor(row.result.tld, row.firstYear)}
            <tr class:available={isAvail}>
              <td class="domain-cell">
                {#if buy}
                  <a
                    class="domain-link"
                    href={buy}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('results.domain.aria', { domain: row.result.domain, registrar: registrarFor(row.result.tld).registrar?.name ?? '' })}
                  >
                    {row.result.domain}
                  </a>
                {:else}
                  <span class="domain-text">{row.result.domain}</span>
                {/if}
              </td>
              <td class="status-cell">
                <StatusBadge status={row.result.status} size="sm" />
              </td>
              <td class="price-cell">
                <div class="price-stack">
                  <span class="price" style="color: {priceColor(row.firstYear)}">
                    {formatPrice(row.firstYear, get(settings))}
                  </span>
                  {#if promo}
                    <span class="chip-tag promo" title={t('tooltip.promoTrap')}>{t('price.promo')}</span>
                  {/if}
                  {#if trap}
                    <span class="chip-tag trap" title={t('tooltip.promoTrap')}>{t('price.promoTrap')}</span>
                  {/if}
                  {#if coupon}
                    <span class="coupon">
                      {t('price.coupon', { price: formatPrice(coupon.amount, get(settings)), code: coupon.code })}
                    </span>
                  {/if}
                </div>
              </td>
              <td class="price-cell">
                <span style="color: {priceColor(row.renewal)}">
                  {formatPrice(row.renewal, get(settings))}
                </span>
              </td>
              <td class="price-cell">
                <span style="color: {priceColor(row.tco)}">
                  {formatPrice(row.tco, get(settings))}
                </span>
              </td>
              <td class="actions-cell">
                <div class="actions">
                  <button
                    class="action-btn"
                    onclick={() => handleCopy(row.result.domain)}
                    type="button"
                    aria-label={t('results.copy.aria', { domain: row.result.domain })}
                    title={copied.has(row.result.domain) ? t('results.copied') : t('results.copy')}
                  >
                    {#if copied.has(row.result.domain)}
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                    {:else}
                      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M3 11V3h8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
                    {/if}
                  </button>
                  <button
                    class="action-btn"
                    onclick={() => recheck(row.result.domain)}
                    type="button"
                    disabled={rechecking.has(row.result.domain)}
                    aria-label={t('results.recheck.aria', { domain: row.result.domain })}
                    title={t('results.recheck')}
                  >
                    <svg class:spin={rechecking.has(row.result.domain)} viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </button>
                  {#if buy}
                    <a
                      class="action-btn buy-btn"
                      href={buy}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('results.buy.aria', { domain: row.result.domain })}
                      title={t('results.buy')}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M6 9L13 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                    </a>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div bind:this={sentinelEl} class="sentinel" aria-hidden="true"></div>
    </div>
  </div>
{/if}

<style>
  .results {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .filters {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
  }
  .filter {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    min-height: 32px;
    transition: all var(--dur) var(--ease);
  }
  .filter:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .filter.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-sm);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    min-width: 640px;
  }
  thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  th {
    background: var(--bg-sunken);
    border-bottom: 1px solid var(--border);
    padding: var(--space-2) var(--space-3);
    text-align: left;
    font-weight: 600;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  th:first-child {
    padding-left: var(--space-3);
  }
  .actions-col {
    text-align: right;
  }
  .sort-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    transition: color var(--dur) var(--ease);
  }
  .sort-btn:hover {
    color: var(--accent);
  }
  .sort-arrow {
    font-size: 9px;
    opacity: 0;
    transition: opacity var(--dur) var(--ease);
  }
  .sort-arrow.visible {
    opacity: 1;
  }
  .sort-arrow.desc {
    transform: rotate(180deg);
  }
  tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background var(--dur) var(--ease);
  }
  tbody tr:last-child {
    border-bottom: none;
  }
  tbody tr:hover {
    background: var(--bg-sunken);
  }
  tr.available {
    background: color-mix(in srgb, var(--green-soft) 50%, transparent);
  }
  tr.available:hover {
    background: color-mix(in srgb, var(--green-soft) 80%, transparent);
  }
  td {
    padding: var(--space-2) var(--space-3);
    vertical-align: middle;
  }
  td:first-child {
    padding-left: var(--space-3);
  }
  .domain-cell {
    white-space: nowrap;
  }
  .domain-link {
    color: var(--accent);
    font-weight: 500;
  }
  .domain-text {
    color: var(--text);
    font-weight: 500;
  }
  .status-cell {
    white-space: nowrap;
  }
  .price-cell {
    white-space: nowrap;
  }
  .price-stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .price {
    font-weight: 500;
  }
  .chip-tag {
    display: inline-block;
    font-size: 10px;
    padding: 0 4px;
    border-radius: var(--radius-full);
    line-height: 1.5;
    font-weight: 500;
    width: fit-content;
  }
  .chip-tag.promo {
    background: var(--green-soft);
    color: var(--green);
  }
  .chip-tag.trap {
    background: var(--red-soft);
    color: var(--red);
  }
  .coupon {
    font-size: 11px;
    color: var(--text-tertiary);
  }
  .actions-cell {
    text-align: right;
  }
  .actions {
    display: inline-flex;
    gap: var(--space-1);
    justify-content: flex-end;
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
  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .action-btn svg {
    width: 15px;
    height: 15px;
  }
  .buy-btn {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  background: var(--accent-soft);
  }
  .buy-btn:hover {
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
  }
  .spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .sentinel {
    height: 1px;
    width: 100%;
  }
</style>
