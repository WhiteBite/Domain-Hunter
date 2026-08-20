<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  import { results, settings, pricing, registry, runState, exportRows, requestFavoritesView } from '../store';
  import type { CheckResult, EngineOptions, PriceEntry, RegistrarConfig } from '../../types';
  import {
    bestEntry,
    formatPrice,
    priceTier,
    isBelowFloor,
    isPromoTrap,
    bestCoupon,
  } from '../../pricing/pricing';
  import { createEngine } from '../../core/engine';
  import type { EngineHandle } from '../../core/engine';
  import { put as putCache } from '../../core/cache';
  import { t } from '../../i18n';
  import { favorites, toggleFavorite } from '../favorites';
  import { watchChanges, watchRunning, refreshWatchlist, classifyChange } from '../watchlist';
  import { clickOutside } from '../clickoutside';
  import { trapFocus } from '../focustrap';
  import { resultsToCsvRows, buildCsv, downloadCsv } from '../csv';
  import StatusBadge from './StatusBadge.svelte';
  import Tooltip from './Tooltip.svelte';

  import registrarsJson from '../../config/registrars.json';

  const registrars = registrarsJson as unknown as RegistrarConfig[];

  type FilterKey = 'all' | 'available' | 'taken' | 'problems' | 'favorites';
  type SortKey = 'name' | 'price' | 'renew' | 'tco' | 'status';
  type SortDir = 'asc' | 'desc';

  let filter = $state<FilterKey>('all');
  let sortKey = $state<SortKey>('name');
  let sortDir = $state<SortDir>('asc');
  let visibleCount = $state(100);
  let copied = $state<Set<string>>(new Set());
  let rechecking = $state<Set<string>>(new Set());
  let query = $state('');
  let selected = $state<Set<string>>(new Set());

  // Row overflow menu: only one open at a time (keyed by domain).
  let menuFor = $state<string | null>(null);
  let menuTriggerEl: HTMLButtonElement | null = $state(null);

  // Status legend popover.
  let legendOpen = $state(false);
  let legendTriggerEl: HTMLButtonElement | null = $state(null);

  // Available-domains bulk actions popover (next to "Show available (N)").
  let availMenuOpen = $state(false);
  let availMenuTriggerEl: HTMLButtonElement | null = $state(null);
  let availCopied = $state(false);
  let availCopiedTimer: ReturnType<typeof setTimeout> | undefined;

  // Search input (focused by "/" shortcut).
  let searchEl: HTMLInputElement | null = $state(null);

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (availMenuOpen) {
        availMenuOpen = false;
        availMenuTriggerEl?.focus();
        return;
      }
      if (legendOpen) {
        legendOpen = false;
        legendTriggerEl?.focus();
        return;
      }
      if (menuFor !== null) {
        menuFor = null;
        menuTriggerEl?.focus();
      }
      return;
    }
    // "/" focuses the results search (unless typing in a form control).
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      searchEl?.focus();
      searchEl?.select();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', onKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', onKeydown);
  });

  function toggleMenu(domain: string, triggerEl: HTMLButtonElement): void {
    // Capture the clicked trigger: bind:this inside the {#each} would leave the
    // variable pointing at the last rendered row, breaking Escape focus-return.
    menuTriggerEl = triggerEl;
    menuFor = menuFor === domain ? null : domain;
  }

  interface LegendItem {
    status: CheckStatus;
    labelKey: string;
    descKey: string;
    variant: 'available' | 'probably' | 'taken' | 'unknown' | 'error';
  }

  const legendItems: LegendItem[] = [
    { status: 'available', labelKey: 'status.available', descKey: 'results.legend.available', variant: 'available' },
    { status: 'probably_available', labelKey: 'status.probably_available', descKey: 'results.legend.probably_available', variant: 'probably' },
    { status: 'taken', labelKey: 'status.taken', descKey: 'results.legend.taken', variant: 'taken' },
    { status: 'unknown', labelKey: 'status.unknown', descKey: 'results.legend.unknown', variant: 'unknown' },
    { status: 'error', labelKey: 'status.error', descKey: 'results.legend.error', variant: 'error' },
  ];

  function toggleLegend(): void {
    legendOpen = !legendOpen;
  }

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
        tco:
          best && best.entry.reg != null && best.entry.renew != null
            ? best.entry.reg + 2 * best.entry.renew
            : null,
        firstYear: best?.entry.reg ?? null,
        renewal: best?.entry.renew ?? null,
      });
    }
    return arr;
  });

  const filtered = $derived.by(() => {
    let arr: RowData[];
    switch (filter) {
      case 'available':
        arr = rows.filter(
          (r) =>
            r.result.status === 'available' ||
            r.result.status === 'probably_available',
        );
        break;
      case 'taken':
        arr = rows.filter((r) => r.result.status === 'taken');
        break;
      case 'problems':
        arr = rows.filter(
          (r) => r.result.status === 'unknown' || r.result.status === 'error',
        );
        break;
      case 'favorites':
        arr = rows.filter((r) => $favorites.has(r.result.domain));
        break;
      default:
        arr = rows;
    }
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter((r) => r.result.domain.toLowerCase().includes(q));
    }
    return arr;
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
    void query;
    visibleCount = 100;
  });

  $effect(() => {
    const resultsMap = $results;
    if (selected.size === 0) return;
    const next = new Set<string>();
    for (const d of selected) {
      if (resultsMap.has(d)) next.add(d);
    }
    if (next.size !== selected.size) {
      selected = next;
    }
  });

  let sentinelEl: HTMLElement | null = $state(null);
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
    if (availCopiedTimer != null) clearTimeout(availCopiedTimer);
  });

  // Publish the current filtered+sorted view to the exportRows store so the
  // Check-tab export menu (CSV/TSV/Markdown copy) can access it.
  $effect(() => {
    const s = $settings;
    const list = sorted.map((r) => ({
      domain: r.result.domain,
      status: r.result.status,
      priceFirstYear: r.firstYear != null ? formatPrice(r.firstYear, s) : '',
      priceRenewal: r.renewal != null ? formatPrice(r.renewal, s) : '',
      priceTco: r.tco != null ? formatPrice(r.tco, s) : '',
    }));
    exportRows.set(list);
  });

  // One-shot bridge: the watch banner's "Show favorites" button sets
  // requestFavoritesView=true; we consume it once (switch filter, reset).
  let consumedFavRequest = false;
  $effect(() => {
    const req = $requestFavoritesView;
    if (req && !consumedFavRequest) {
      consumedFavRequest = true;
      filter = 'favorites';
      requestFavoritesView.set(false);
      // Allow the next request to be consumed.
      setTimeout(() => {
        consumedFavRequest = false;
      }, 0);
    }
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
    const entries = table.tlds[tld];
    if (!entries) return { registrar: null, entry: null };
    let best: { registrar: RegistrarConfig; entry: PriceEntry } | null = null;
    for (const r of registrars) {
      const e = entries[r.id];
      if (!e || e.reg == null) continue;
      if (!best || e.reg < (best.entry.reg ?? Infinity)) best = { registrar: r, entry: e };
    }
    return best ?? { registrar: null, entry: null };
  }

  interface RegistrarQuote {
    id: string;
    name: string;
    reg: number;
    renew: number | null;
    url: string;
  }

  /** Known-registrar quotes for a zone from the pricing store, sorted by
   *  registration price asc (renewal as tie-breaker). Unknown ids skipped.
   *  Each quote carries a buy/search link (deep link when the registrar's
   *  template supports '{domain}', landing page otherwise). */
  function registrarQuotes(tld: string, domain: string): RegistrarQuote[] {
    const table = $pricing?.table ?? null;
    if (!table) return [];
    const entries = table.tlds[tld];
    if (!entries) return [];
    const list: RegistrarQuote[] = [];
    for (const r of registrars) {
      const e = entries[r.id];
      if (!e || e.reg == null) continue;
      list.push({
        id: r.id,
        name: r.name,
        reg: e.reg,
        renew: e.renew,
        url: r.searchUrl.includes('{domain}')
          ? r.searchUrl.replace('{domain}', encodeURIComponent(domain))
          : r.searchUrl,
      });
    }
    list.sort((a, b) => a.reg - b.reg || (a.renew ?? Infinity) - (b.renew ?? Infinity));
    return list;
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

  // ---- On-demand per-domain detail (DigMyName: premium + cheapest registrar) ----

  interface DigDetail {
    loading?: boolean;
    failed?: boolean;
    premium?: boolean;
    likely?: boolean;
    price: number | null;
    registrar: string | null;
    regPrice: number | null;
    url: string | null;
  }

  let detailFor = $state<string | null>(null);
  let details = $state<Record<string, DigDetail>>({});

  async function toggleDetail(domain: string): Promise<void> {
    if (detailFor === domain) {
      detailFor = null;
      return;
    }
    detailFor = domain;
    // Close any open row menu when expanding.
    menuFor = null;
    const cached = details[domain];
    if (cached && !cached.failed) return;
    details = {
      ...details,
      [domain]: { loading: true, price: null, registrar: null, regPrice: null, url: null },
    };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(
        `https://api.digmyname.com/functions/v1/public-api/check?domain=${encodeURIComponent(domain)}`,
        { signal: ctrl.signal },
      );
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { result?: Record<string, unknown> };
      const r = json.result;
      if (!r) throw new Error('no result');
      const cheapest = (r.cheapest_registrar ?? null) as Record<string, unknown> | null;
      details = {
        ...details,
        [domain]: {
          premium: r.premium === true,
          likely: r.likely_premium === true,
          price: typeof r.price_usd === 'number' ? r.price_usd : null,
          registrar: cheapest && typeof cheapest.name === 'string' ? cheapest.name : null,
          regPrice:
            cheapest && typeof cheapest.reg_price_usd === 'number' ? cheapest.reg_price_usd : null,
          url:
            typeof r.buy_url === 'string' && r.buy_url.startsWith('https://')
              ? r.buy_url
              : null,
        },
      };
    } catch {
      details = {
        ...details,
        [domain]: { failed: true, price: null, registrar: null, regPrice: null, url: null },
      };
    }
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
    const settingsVal = $settings;
    const options: EngineOptions = {
      registry: registryVal,
      proxyUrl: settingsVal.proxyUrl || undefined,
      fetchTimeoutMs: 10000,
      maxRetries: 3,
    };
    options.concurrency = 1;

    const applyResult = (r: CheckResult): void => {
      results.update((map) => {
        const next = new Map(map);
        next.set(r.domain, r);
        return next;
      });
      putCache(r.domain, {
        status: r.status,
        source: r.source,
        ts: r.checkedAt,
        tld: r.tld,
      });
    };
    const e: EngineHandle = createEngine((event) => {
      if (event.type === 'result' || event.type === 'batch') {
        if (event.type === 'result') applyResult(event.result);
        else for (const r of event.results) applyResult(r);
        const next2 = new Set(rechecking);
        next2.delete(domain);
        rechecking = next2;
      } else if (event.type === 'finished') {
        e.destroy();
        const next2 = new Set(rechecking);
        next2.delete(domain);
        rechecking = next2;
      }
    });
    e.start([domain], options);
  }

  const hasResults = $derived($results.size > 0);

  /** Map domain -> WatchChange for O(1) row chip lookup. */
  const watchByDomain = $derived.by(() => {
    const m = new Map<string, 'freed' | 'taken'>();
    for (const c of $watchChanges) m.set(c.domain, classifyChange(c.from, c.to));
    return m;
  });

  const availableTotal = $derived.by(() => {
    let n = 0;
    for (const r of $results.values()) {
      if (r.status === 'available' || r.status === 'probably_available') n += 1;
    }
    return n;
  });

  /** Domain names of available/probably_available results, sorted A–Z. */
  const availableDomains = $derived.by(() => {
    const list: string[] = [];
    for (const r of $results.values()) {
      if (r.status === 'available' || r.status === 'probably_available') list.push(r.domain);
    }
    list.sort((a, b) => a.localeCompare(b));
    return list;
  });

  function flashAvailCopied(): void {
    availCopied = true;
    if (availCopiedTimer != null) clearTimeout(availCopiedTimer);
    availCopiedTimer = setTimeout(() => {
      availCopied = false;
    }, 1500);
  }

  async function copyAvailableList(): Promise<void> {
    await copyText(availableDomains.join('\n'));
    flashAvailCopied();
  }

  function favAllAvailable(): void {
    const next = new Set($favorites);
    for (const d of availableDomains) next.add(d);
    favorites.set(next);
  }

  function downloadAvailableCsv(): void {
    const table = $pricing?.table ?? null;
    const filtered = new Map<string, CheckResult>();
    for (const [d, r] of $results) {
      if (r.status === 'available' || r.status === 'probably_available') filtered.set(d, r);
    }
    const rows = resultsToCsvRows(filtered, table, $settings);
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
    downloadCsv(`domain-hunter-available-${date}.csv`, csv);
  }

  function registrarName(id: string): string {
    return registrars.find((r) => r.id === id)?.name ?? id;
  }

  function sanitizeId(s: string): string {
    return s.replace(/[^a-zA-Z0-9]/g, '-');
  }
</script>

{#if !hasResults}
  <!-- EmptyState rendered by parent -->
{:else}
  <div class="results">
    <div class="toolbar">
      <div class="filters" role="group" aria-label={t('results.title')}>
        <button class="filter" class:active={filter === 'all'} onclick={() => (filter = 'all')} type="button" data-testid="results-filter-all">
          {t('results.filters.all')}
        </button>
        <button class="filter" class:active={filter === 'available'} onclick={() => (filter = 'available')} type="button" data-testid="results-filter-available">
          {t('results.filters.available')}
        </button>
        <button class="filter" class:active={filter === 'taken'} onclick={() => (filter = 'taken')} type="button" data-testid="results-filter-taken">
          {t('results.filters.taken')}
        </button>
        <button class="filter" class:active={filter === 'problems'} onclick={() => (filter = 'problems')} type="button" data-testid="results-filter-problems">
          {t('results.filters.problems')}
        </button>
        <button class="filter" class:active={filter === 'favorites'} onclick={() => (filter = 'favorites')} type="button" data-testid="results-filter-favorites">
          {t('results.filters.favorites')}{#if $favorites.size > 0} · <span class="nums">{$favorites.size}</span>{/if}
        </button>
        <Tooltip text={t('watch.refresh.aria')}>
          <button
            class="action-btn watch-refresh"
            type="button"
            onclick={() => void refreshWatchlist()}
            disabled={$watchRunning}
            aria-label={t('watch.refresh.aria')}
            title={t('watch.refresh.aria')}
            data-testid="results-watch-refresh"
          >
            <svg class:spin={$watchRunning} viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </Tooltip>
      </div>
      <div class="search-wrap">
        <input
          class="search"
          type="search"
          placeholder={t('results.search')}
          aria-label={t('results.search')}
          bind:value={query}
          bind:this={searchEl}
          data-testid="results-search"
        />
        <kbd class="search-kbd" aria-hidden="true">/</kbd>
      </div>
      <span class="count nums" aria-live="polite" data-testid="results-showing-count">
        {t('results.showing', { shown: visible.length, total: sorted.length })}
      </span>
      <div
        class="legend-wrap"
        use:clickOutside={legendOpen ? () => { legendOpen = false; } : undefined}
      >
        <button
          class="action-btn legend-toggle"
          type="button"
          bind:this={legendTriggerEl}
          onclick={toggleLegend}
          aria-haspopup="dialog"
          aria-expanded={legendOpen}
          aria-label={t('results.legend.aria')}
          title={t('results.legend.aria')}
          data-testid="results-legend-toggle"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M8 7.4v3.2M8 5.2v.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
        </button>
        {#if legendOpen}
          <div class="legend" role="dialog" aria-label={t('results.legend.aria')} use:trapFocus>
            {#each legendItems as item}
              <div class="legend-row">
                <span class="legend-dot {item.variant}" aria-hidden="true"></span>
                <span class="legend-name">{t(item.labelKey)}</span>
                <span class="legend-desc">{t(item.descKey)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if selected.size > 0}
        <button class="action-small" type="button" onclick={async () => { await copyText([...selected].sort().join('\n')); selected = new Set(); }} data-testid="results-copy-selected">
          {t('results.copy.selected', { n: selected.size })}
        </button>
      {/if}
      {#if filter === 'favorites' && $favorites.size > 0}
        <button class="action-small" type="button" onclick={() => copyText([...$favorites].sort().join('\n'))} data-testid="results-copy-favorites">
          {t('results.fav.copy', { n: $favorites.size })}
        </button>
      {/if}
      {#if $runState.phase === 'done' && filter === 'all' && availableTotal > 0}
        <button class="filter suggest" type="button" onclick={() => (filter = 'available')} data-testid="results-filter-suggest-available">
          {t('results.showAvailable', { n: availableTotal })}
        </button>
        <div
          class="menu-wrap avail-menu-wrap"
          use:clickOutside={availMenuOpen ? () => { availMenuOpen = false; } : undefined}
        >
          <button
            class="action-btn avail-menu-toggle"
            type="button"
            bind:this={availMenuTriggerEl}
            onclick={() => (availMenuOpen = !availMenuOpen)}
            aria-haspopup="menu"
            aria-expanded={availMenuOpen}
            aria-label={t('results.available.menu.aria')}
            title={t('results.available.menu.aria')}
            data-testid="results-available-menu"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
          </button>
          {#if availMenuOpen}
            <div class="menu" role="menu" use:trapFocus>
              <button
                class="menu-item"
                role="menuitem"
                type="button"
                onclick={() => { void copyAvailableList(); }}
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
                onclick={() => { favAllAvailable(); availMenuOpen = false; }}
                data-testid="results-available-fav"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11.3l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>
                {t('results.available.fav')}
              </button>
              <button
                class="menu-item"
                role="menuitem"
                type="button"
                onclick={() => { downloadAvailableCsv(); availMenuOpen = false; }}
                data-testid="results-available-csv"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                {t('results.available.csv')}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if filter === 'favorites' && $favorites.size === 0}
      <p class="fav-empty">{t('results.favorites.empty')}</p>
    {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="select-cell">
              <input
                type="checkbox"
                data-testid="results-select-all"
                aria-label={t('results.select.all')}
                checked={visible.length > 0 && visible.every((r) => selected.has(r.result.domain))}
                onchange={() => {
                  const next = new Set(selected);
                  if (visible.every((r) => next.has(r.result.domain))) {
                    for (const r of visible) next.delete(r.result.domain);
                  } else {
                    for (const r of visible) next.add(r.result.domain);
                  }
                  selected = next;
                }}
              />
            </th>
            <th aria-sort={ariaSort('name')}>
              <button class="sort-btn" onclick={() => toggleSort('name')} type="button" data-testid="results-sort-name">
                {t('results.sort.name')}
                <span class="sort-arrow" class:visible={sortKey === 'name'} class:desc={sortDir === 'desc'} aria-hidden="true">▲</span>
              </button>
            </th>
            <th aria-sort={ariaSort('status')}>
              <button class="sort-btn" onclick={() => toggleSort('status')} type="button" data-testid="results-sort-status">
                {t('results.col.status')}
                <span class="sort-arrow" class:visible={sortKey === 'status'} class:desc={sortDir === 'desc'} aria-hidden="true">▲</span>
              </button>
            </th>
            <th class="price-col" aria-sort={ariaSort('price')}>
              <button class="sort-btn" onclick={() => toggleSort('price')} type="button" data-testid="results-sort-price">
                {t('results.col.price')}
                <span class="sort-arrow" class:visible={sortKey === 'price'} class:desc={sortDir === 'desc'} aria-hidden="true">▲</span>
              </button>
            </th>
            <th class="actions-col">{t('results.col.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each visible as row (row.result.domain)}
            {@const isAvail = row.result.status === 'available' || row.result.status === 'probably_available'}
            {@const isErr = row.result.status === 'error'}
            {@const buy = buyUrl(row.result.domain, row.result.tld)}
            {@const coupon = couponFor(row.result.tld)}
            {@const trap = row.best ? isPromoTrap(row.best.entry) : false}
            {@const promo = row.firstYear != null && isBelowFloor(row.result.tld, row.firstYear)}
            {@const isFav = $favorites.has(row.result.domain)}
            {@const sid = sanitizeId(row.result.domain)}
            {@const isExpanded = detailFor === row.result.domain}
            {@const quotes = registrarQuotes(row.result.tld, row.result.domain)}
            <tr class="row-in" class:available={isAvail} class:error={isErr} data-testid={`results-row-${sid}`}>
              <td class="select-cell">
                <input
                  type="checkbox"
                  checked={selected.has(row.result.domain)}
                  data-testid={`results-row-select-${sid}`}
                  aria-label={t('results.select.row.aria', { domain: row.result.domain })}
                  onchange={() => {
                    const next = new Set(selected);
                    if (next.has(row.result.domain)) next.delete(row.result.domain);
                    else next.add(row.result.domain);
                    selected = next;
                  }}
                />
              </td>
              <td class="domain-cell">
                {#if buy}
                  <a
                    class="domain-link"
                    href={buy}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('results.domain.aria', { domain: row.result.domain, registrar: registrarFor(row.result.tld).registrar?.name ?? '' })}
                    data-testid={`results-row-link-${sid}`}
                  >
                    {row.result.domain}
                  </a>
                {:else}
                  <span class="domain-text">{row.result.domain}</span>
                {/if}
                {#if watchByDomain.has(row.result.domain)}
                  {@const wkind = watchByDomain.get(row.result.domain)}
                  {#if wkind === 'freed'}
                    <span class="chip-tag watch-freed" data-testid={`results-watch-${sid}`}>{t('watch.badge.freed')}</span>
                  {:else if wkind === 'taken'}
                    <span class="chip-tag watch-taken" data-testid={`results-watch-${sid}`}>{t('watch.badge.taken')}</span>
                  {/if}
                {/if}
              </td>
              <td class="status-cell">
                <StatusBadge status={row.result.status} size="sm" />
              </td>
              <td class="price-cell nums">
                <div class="price-stack">
                  <span class="price" style="color: {priceColor(row.firstYear)}">
                    {formatPrice(row.firstYear, $settings)}
                  </span>
                  {#if promo}
                    <Tooltip text={t('tooltip.promo')}>
                      <span class="chip-tag promo">{t('price.promo')}</span>
                    </Tooltip>
                  {/if}
                  {#if trap && row.best}
                    {@const reg = row.best.entry.reg ?? 0}
                    {@const renew = row.best.entry.renew ?? 0}
                    {@const first = formatPrice(reg, $settings)}
                    {@const renewal = formatPrice(renew, $settings)}
                    {@const times = reg > 0 ? Math.round(renew / reg) : 0}
                    <Tooltip text={t('tooltip.promoTrap', { first, renew: renewal, times })}>
                      <span class="chip-tag trap">{t('price.promoTrap')}</span>
                    </Tooltip>
                  {/if}
                  {#if coupon}
                    <span class="coupon">
                      {t('price.coupon', { price: formatPrice(coupon.amount, $settings), code: coupon.code })}
                    </span>
                  {/if}
                </div>
              </td>
              <td class="actions-cell">
                <div class="actions">
                  <button
                    class="action-btn"
                    class:active={isFav}
                    onclick={() => toggleFavorite(row.result.domain)}
                    type="button"
                    aria-label={isFav ? t('results.fav.remove') : t('results.fav.add')}
                    title={isFav ? t('results.fav.remove') : t('results.fav.add')}
                    data-testid={`results-row-fav-${sid}`}
                  >
                    {#if isFav}
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11.3l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z" fill="currentColor" /></svg>
                    {:else}
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11.3l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>
                    {/if}
                  </button>
                  {#if buy}
                    <a
                      class="action-btn buy-btn"
                      href={buy}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('results.buy.aria', { domain: row.result.domain })}
                      title={
                        row.best && row.best.entry.reg != null
                          ? t('results.buy.at', {
                              registrar: registrarName(row.best.registrarId),
                              price: formatPrice(row.best.entry.reg, $settings),
                            })
                          : t('results.buy')
                      }
                      data-testid={`results-row-buy-${sid}`}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M6 9L13 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                    </a>
                  {:else}
                    <!-- Invisible placeholder keeps the action-cluster geometry
                         identical on rows without a buy link (star x-position
                         must not shift between rows). -->
                    <span class="action-btn buy-placeholder" aria-hidden="true" tabindex="-1">
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M6 9L13 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                    </span>
                  {/if}
                  <div
                    class="menu-wrap"
                    use:clickOutside={menuFor === row.result.domain ? () => { menuFor = null; } : undefined}
                  >
                    <button
                      class="action-btn"
                      class:active={menuFor === row.result.domain}
                      onclick={(e) => toggleMenu(row.result.domain, e.currentTarget)}
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={menuFor === row.result.domain}
                      aria-label={t('results.row.menu.aria')}
                      title={t('results.row.menu.aria')}
                      data-testid={`results-row-menu-${sid}`}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
                    </button>
                    {#if menuFor === row.result.domain}
                      <div class="menu" role="menu" use:trapFocus>
                        <button
                          class="menu-item"
                          role="menuitem"
                          type="button"
                          onclick={() => { void handleCopy(row.result.domain); menuFor = null; }}
                          data-testid={`results-row-copy-${sid}`}
                        >
                          {#if copied.has(row.result.domain)}
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
                          onclick={() => { recheck(row.result.domain); menuFor = null; }}
                          disabled={rechecking.has(row.result.domain)}
                          data-testid={`results-row-recheck-${sid}`}
                        >
                          <svg class:spin={rechecking.has(row.result.domain)} viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                          {t('results.recheck')}
                        </button>
                        <button
                          class="menu-item"
                          role="menuitem"
                          type="button"
                          class:active={isExpanded}
                          onclick={() => { void toggleDetail(row.result.domain); }}
                          data-testid={`results-row-detail-${sid}`}
                        >
                          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M8 7.4v3.2M8 5.2v.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
                          {t('results.detail.label')}
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              </td>
            </tr>
            {#if isExpanded}
              {@const d = details[row.result.domain]}
              <tr
                class="detail-row"
                class:is-available={isAvail}
                class:is-error={isErr}
                data-testid={`results-row-expanded-${sid}`}
              >
                <td colspan="5">
                  <div class="detail-grid">
                    <div class="detail-cell">
                      <span class="detail-label">{t('price.renewal')}</span>
                      <span class="detail-value nums">{formatPrice(row.renewal, $settings)}</span>
                    </div>
                    <div class="detail-cell">
                      <span class="detail-label">{t('price.tco')}</span>
                      <span class="detail-value nums">{formatPrice(row.tco, $settings)}</span>
                    </div>
                    {#if row.result.note}
                      <div class="detail-cell detail-note">
                        {row.result.note}
                      </div>
                    {/if}
                    {#if quotes.length >= 2}
                      <div class="detail-cell detail-registrars" data-testid={`results-row-registrars-${sid}`}>
                        <Tooltip text={t('tooltip.registrars')}>
                          <span class="detail-label">{t('results.detail.registrars')}</span>
                        </Tooltip>
                        <span class="detail-reg-list nums">
                          {#each quotes.slice(0, 4) as quote, i}
                            <a
                              class="detail-reg-item"
                              class:cheapest={i === 0}
                              href={quote.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`results-row-registrar-${sid}-${quote.id}`}
                            >
                              {#if i === 0}<span class="detail-reg-dot" aria-hidden="true"></span>{/if}
                              {quote.name} — {formatPrice(quote.reg, $settings)} / {formatPrice(quote.renew, $settings)}
                            </a>
                          {/each}
                          {#if quotes.length > 4}
                            <span
                              class="detail-reg-more"
                              title={`${t('results.detail.registrars')}: ${quotes.length}`}
                            >
                              {t('results.detail.registrars.more', { n: quotes.length - 4 })}
                            </span>
                          {/if}
                        </span>
                      </div>
                    {/if}
                    {#if !d || d.loading}
                      <span class="detail-muted">{t('results.detail.loading')}</span>
                    {:else if d.failed}
                      <span class="detail-muted">{t('results.detail.failed')}</span>
                    {:else}
                      {#if d.premium || d.likely}
                        <div class="detail-cell">
                          <span class="chip-tag trap">
                            {t('results.detail.premium', {
                              price:
                                d.price != null
                                  ? formatPrice(Math.round(d.price * 100), $settings)
                                  : '—',
                            })}
                          </span>
                        </div>
                      {/if}
                      {#if d.registrar}
                        <div class="detail-cell">
                          <span class="detail-cheap">
                            {t('results.detail.cheapest', {
                              registrar: d.registrar,
                              price:
                                d.regPrice != null
                                  ? formatPrice(Math.round(d.regPrice * 100), $settings)
                                  : '—',
                            })}
                          </span>
                        </div>
                      {/if}
                      {#if d.url}
                        <a class="detail-buy" href={d.url} target="_blank" rel="noopener noreferrer" data-testid={`results-row-detail-buy-${sid}`}>
                          {t('results.detail.buy')}
                        </a>
                      {/if}
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
      <div bind:this={sentinelEl} class="sentinel" aria-hidden="true"></div>
    </div>
    {/if}
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
    gap: var(--space-2);
    position: sticky;
    top: 0;
    z-index: 6;
    background: var(--bg);
    padding: var(--space-2) 0;
    margin: calc(-1 * var(--space-2)) 0 0;
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
    max-height: 72vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  .table-wrap::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .table-wrap::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: var(--radius-full);
  }
  .table-wrap::-webkit-scrollbar-track {
    background: transparent;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    min-width: 480px;
  }
  thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .table-wrap thead th {
    position: sticky;
    top: 0;
    z-index: 4;
    background: var(--bg-elevated);
    box-shadow: 0 1px 0 var(--border);
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
  .price-col {
    text-align: right;
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
    animation: dh-row-in 160ms var(--ease);
  }
  tbody tr:nth-child(even):not(.available):not(.error):not(.detail-row) {
    background: color-mix(in srgb, var(--bg-sunken) 55%, transparent);
  }
  tbody tr:nth-child(even):hover {
    background: var(--bg-sunken);
  }
  tbody tr:last-child {
    border-bottom: none;
  }
  tbody tr:hover {
    background: var(--bg-sunken);
  }
  tr.available {
    background: var(--row-tint-available);
    box-shadow: inset 2px 0 0 var(--green-solid);
  }
  tr.available:hover {
    background: color-mix(in srgb, var(--row-tint-available) 60%, var(--bg-sunken));
  }
  tr.error {
    background: var(--row-tint-error);
    box-shadow: inset 2px 0 0 var(--red);
  }
  tr.error:hover {
    background: color-mix(in srgb, var(--row-tint-error) 60%, var(--bg-sunken));
  }
  @media (max-width: 700px) {
    .domain-cell {
      position: sticky;
      left: 0;
      z-index: 2;
      background: var(--bg-elevated);
      box-shadow: 1px 0 0 var(--border);
    }
    tr.available .domain-cell {
      background: var(--row-tint-available);
    }
    tr.error .domain-cell {
      background: var(--row-tint-error);
    }
    tbody tr:hover .domain-cell {
      background: var(--bg-sunken);
    }
  }
  td {
    padding: var(--space-2) var(--space-3);
    vertical-align: middle;
  }
  td:first-child {
    padding-left: var(--space-3);
  }
  .price-cell {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .price-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
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
  .price {
    font-weight: 500;
  }

  .action-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }

  .detail-row td {
    background: var(--bg-sunken);
    padding: var(--space-3) var(--space-3);
    box-shadow: inset 2px 0 0 var(--border-strong);
  }
  .detail-row.is-available td {
    background: var(--row-tint-available);
    box-shadow: inset 2px 0 0 var(--green-solid);
  }
  .detail-row.is-error td {
    background: var(--row-tint-error);
    box-shadow: inset 2px 0 0 var(--red);
  }

  .detail-grid {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
    font-size: var(--text-xs);
    /* Align under the Name column: skip the checkbox column
       (space-3 padding + 14px checkbox + space-3 padding). */
    padding-left: calc(14px + 2 * var(--space-3));
  }

  .detail-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detail-label {
    color: var(--text-tertiary);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .detail-value {
    color: var(--text);
    font-weight: 500;
  }

  .detail-note {
    color: var(--text-secondary);
    max-width: 300px;
  }

  .detail-muted {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .detail-cheap {
    color: var(--text-secondary);
  }

  .detail-registrars {
    flex-basis: 100%;
  }
  .detail-reg-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-3);
    color: var(--text-secondary);
  }
  .detail-reg-item {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    color: inherit;
    text-decoration: none;
    border-radius: 4px;
    transition: color var(--dur) var(--ease);
  }
  .detail-reg-item:hover {
    color: var(--accent-text);
    text-decoration: underline;
  }
  .detail-reg-item.cheapest {
    color: var(--text);
    font-weight: 500;
  }
  .detail-reg-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green-solid);
    margin-right: var(--space-1);
  }
  .detail-reg-more {
    color: var(--text-tertiary);
  }

  .detail-buy {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--accent-text);
    font-weight: 500;
    text-decoration: none;
    transition: all var(--dur) var(--ease);
  }
  .detail-buy:hover {
    background: var(--bg-overlay);
    text-decoration: none;
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
  .chip-tag.watch-freed {
    background: var(--green-soft);
    color: var(--green);
  }
  .chip-tag.watch-taken {
    background: var(--red-soft);
    color: var(--red);
  }
  .watch-refresh {
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-full);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--dur) var(--ease);
  }
  .watch-refresh:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text);
    background: var(--bg-sunken);
  }
  .watch-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .watch-refresh svg {
    width: 14px;
    height: 14px;
  }
  .watch-refresh .spin {
    animation-duration: 1.5s;
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
    align-items: center;
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
  .buy-placeholder {
    visibility: hidden;
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

  .filter.suggest {
    background: var(--green-soft);
    border-color: var(--green);
    color: var(--green);
  }
  .search {
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    min-height: 32px;
    background: var(--bg-elevated);
    width: 180px;
    color: var(--text);
  }
  .search:focus {
    outline: none;
    border-color: var(--accent);
  }
  .search-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .search-kbd {
    position: absolute;
    right: var(--space-2);
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--font-sans);
    font-size: 10px;
    line-height: 1;
    padding: 2px 5px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    color: var(--text-tertiary);
    pointer-events: none;
    user-select: none;
  }

  /* ---- Status legend popover ---- */
  .legend-wrap {
    position: relative;
    display: inline-flex;
  }
  .legend-toggle.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }
  .legend {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: 8px;
    box-shadow: var(--shadow-pop);
    z-index: 60;
    min-width: 280px;
    max-width: 340px;
  }
  .legend-row {
    display: grid;
    grid-template-columns: 12px 1fr;
    grid-template-areas:
      'dot name'
      'dot desc';
    column-gap: var(--space-2);
    row-gap: 1px;
    align-items: start;
  }
  .legend-dot {
    grid-area: dot;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 5px;
  }
  .legend-dot.available {
    background: var(--green-solid);
  }
  .legend-dot.probably {
    background: transparent;
    border: 1.5px solid var(--green);
  }
  .legend-dot.taken {
    background: var(--text-tertiary);
  }
  .legend-dot.unknown {
    background: var(--amber);
  }
  .legend-dot.error {
    background: var(--red);
  }
  .legend-name {
    grid-area: name;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text);
  }
  .legend-desc {
    grid-area: desc;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .action-small {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--on-accent);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    min-height: 32px;
    transition: all var(--dur) var(--ease);
  }
  .action-small:hover {
    opacity: 0.9;
  }
  .fav-empty {
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    padding: var(--space-4) var(--space-3);
    text-align: center;
  }
  input[type='checkbox'] {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }
  .select-cell {
    width: 28px;
    white-space: nowrap;
  }

  /* Row overflow menu */
  .menu-wrap {
    position: relative;
    display: inline-flex;
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-1);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 50;
    min-width: 140px;
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
  .menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .menu-item.active {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .menu-item svg {
    width: 14px;
    height: 14px;
    flex: none;
  }
</style>
