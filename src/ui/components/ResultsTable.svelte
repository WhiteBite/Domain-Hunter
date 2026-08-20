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
  import { copyText } from '../clipboard';
  import { sanitizeId } from '../utils';
  import { resultsToCsvRows, buildCsv, downloadCsv } from '../csv';
  import { registrarMonogram } from '../registrar-badge';
  import { REGISTRAR_ICONS } from '../registrar-icons';
  import StatusBadge from './StatusBadge.svelte';
  import Tooltip from './Tooltip.svelte';
  import RowMenu from './RowMenu.svelte';
  import AvailableMenu from './AvailableMenu.svelte';
  import LegendPopover from './LegendPopover.svelte';
  import DetailRow from './DetailRow.svelte';
  import IconRefresh from './icons/IconRefresh.svelte';
  import IconStar from './icons/IconStar.svelte';
  import IconExternal from './icons/IconExternal.svelte';
  import type { DigDetail, RegistrarQuote } from './DetailRow.svelte';

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
  // Active per-row recheck engine handles. Tracked so unmount mid-recheck
  // can terminate them (otherwise the workers leak until 'finished'). Capped
  // at MAX_RECHECKS concurrent rechecks to stay polite to registries.
  let recheckEngines = new Set<EngineHandle>();
  const MAX_RECHECKS = 3;
  let query = $state('');
  let selected = $state<Set<string>>(new Set());

  // Row overflow menu: only one open at a time (keyed by domain).
  let menuFor = $state<string | null>(null);

  // Available-domains bulk actions: copied-flash state (menu is in AvailableMenu).
  let availCopied = $state(false);
  let availCopiedTimer: ReturnType<typeof setTimeout> | undefined;

  // Search input (focused by "/" shortcut).
  let searchEl: HTMLInputElement | null = $state(null);

  function onKeydown(e: KeyboardEvent): void {
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

  function toggleMenu(domain: string): void {
    menuFor = menuFor === domain ? null : domain;
  }

  interface RowData {
    result: CheckResult;
    best: { registrarId: string; entry: PriceEntry } | null;
    tco: number | null;
    firstYear: number | null;
    /** Original standard first-year price (non-null only when a premium
     *  override is active, for struck-through display). */
    standardFirstYear: number | null;
    renewal: number | null;
  }

  const rows = $derived.by(() => {
    const table = $pricing?.table ?? null;
    const arr: RowData[] = [];
    for (const r of $results.values()) {
      const best = table ? bestEntry(table, r.tld) : null;
      const override = premiumOverrides[r.domain] ?? null;
      const stdFirstYear = best?.entry.reg ?? null;
      const stdTco =
        best && best.entry.reg != null && best.entry.renew != null
          ? best.entry.reg + 2 * best.entry.renew
          : null;
      arr.push({
        result: r,
        best,
        tco: override ?? stdTco,
        firstYear: override ?? stdFirstYear,
        standardFirstYear: override != null ? stdFirstYear : null,
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
    // Terminate any recheck engines still in flight so unmounting the table
    // (e.g. switching tabs) does not leak workers or keep hitting registries.
    for (const e of recheckEngines) e.destroy();
    recheckEngines.clear();
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
    // Prefer the cheapest registrar whose searchUrl supports a {domain}
    // deep link; only fall back to a landing-only registrar when no
    // deep-link registrar has a quote for the zone.
    let best: { registrar: RegistrarConfig; entry: PriceEntry } | null = null;
    let fallback: { registrar: RegistrarConfig; entry: PriceEntry } | null = null;
    for (const r of registrars) {
      const e = entries[r.id];
      if (!e || e.reg == null) continue;
      const hasDeepLink = r.searchUrl.includes('{domain}');
      const candidate = { registrar: r, entry: e };
      if (hasDeepLink) {
        if (!best || e.reg < (best.entry.reg ?? Infinity)) best = candidate;
      } else {
        if (!fallback || e.reg < (fallback.entry.reg ?? Infinity)) fallback = candidate;
      }
    }
    return best ?? fallback ?? { registrar: null, entry: null };
  }

  /** Known-registrar quotes for a zone from the pricing store, sorted by
   *  registration price asc (renewal as tie-breaker). Unknown ids skipped.
   *  Each quote carries a buy/search link (deep link when the registrar's
   *  template supports '{domain}', landing page otherwise) and a
   *  hasDeepLink flag for the no-deeplink tooltip. */
  function registrarQuotes(tld: string, domain: string): RegistrarQuote[] {
    const table = $pricing?.table ?? null;
    if (!table) return [];
    const entries = table.tlds[tld];
    if (!entries) return [];
    const list: RegistrarQuote[] = [];
    for (const r of registrars) {
      const e = entries[r.id];
      if (!e || e.reg == null) continue;
      const hasDeepLink = r.searchUrl.includes('{domain}');
      list.push({
        id: r.id,
        name: r.name,
        reg: e.reg,
        renew: e.renew,
        hasDeepLink,
        url: hasDeepLink
          ? r.searchUrl.replace('{domain}', encodeURIComponent(domain))
          : r.searchUrl,
      });
    }
    list.sort((a, b) => a.reg - b.reg || (a.renew ?? Infinity) - (b.renew ?? Infinity));
    return list;
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

  let detailFor = $state<string | null>(null);
  let details = $state<Record<string, DigDetail>>({});

  /** Per-domain premium price override (USD cents) from the on-demand
   *  DigMyName check. When present, the row price cell shows this instead
   *  of the standard first-year price, with the standard price struck
   *  through. Sorting by price/tco also uses this value. */
  let premiumOverrides = $state<Record<string, number>>({});

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
      const isPremium = r.premium === true || r.likely_premium === true;
      const priceUsd = typeof r.price_usd === 'number' ? r.price_usd : null;
      // Store a per-domain override so the row price cell and detail chip
      // both reflect the registry premium price (single source).
      if (isPremium && priceUsd != null) {
        premiumOverrides = {
          ...premiumOverrides,
          [domain]: Math.round(priceUsd * 100),
        };
      }
      details = {
        ...details,
        [domain]: {
          premium: r.premium === true,
          likely: r.likely_premium === true,
          price: priceUsd,
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
    // Cap concurrent rechecks: ignore clicks beyond the limit so a burst of
    // recheck clicks cannot spawn many parallel engines hammering registries.
    if (rechecking.size >= MAX_RECHECKS) return;
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
        recheckEngines.delete(e);
        const next2 = new Set(rechecking);
        next2.delete(domain);
        rechecking = next2;
      }
    });
    recheckEngines.add(e);
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

  /** Title for the registrar source badge: full name plus the price source.
   *  Live fetches list their registrar id in table.sources; every other
   *  entry comes from the bundled snapshot baseline. */
  function registrarBadgeTitle(id: string): string {
    const name = registrarName(id);
    const sources = $pricing?.table.sources ?? [];
    if (sources.length === 0) return name;
    return `${name} · ${sources.includes(id) ? 'live' : 'snapshot'}`;
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
            <IconRefresh class={$watchRunning ? 'spin' : ''} />
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
      <LegendPopover />
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
        <!-- Keep "Show available (N)" and its ⋯ menu on one line, right-aligned. -->
        <div class="nowrap-group">
        <button class="filter suggest" type="button" onclick={() => (filter = 'available')} data-testid="results-filter-suggest-available">
          {t('results.showAvailable', { n: availableTotal })}
        </button>
    <AvailableMenu

          availCopied={availCopied}
          onCopy={() => void copyAvailableList()}
          onFav={() => favAllAvailable()}
          onCsv={() => downloadAvailableCsv()}
        />
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
            {@const buyInfo = registrarFor(row.result.tld)}
            {@const buy = buyInfo.registrar
              ? buyInfo.registrar.searchUrl.includes('{domain}')
                ? buyInfo.registrar.searchUrl.replace('{domain}', encodeURIComponent(row.result.domain))
                : buyInfo.registrar.searchUrl
              : null}
            {@const buyHasDeepLink = buyInfo.registrar?.searchUrl.includes('{domain}') ?? false}
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
                    aria-label={t('results.domain.aria', { domain: row.result.domain, registrar: buyInfo.registrar?.name ?? '' })}
                    data-testid={`results-row-link-${sid}`}
                  >
                    {row.result.domain}
                  </a>
                {:else}
                  <span class="domain-text">{row.result.domain}</span>
                {/if}
              </td>
              <td class="status-cell">
                <StatusBadge status={row.result.status} size="sm" />
                {#if watchByDomain.has(row.result.domain)}
                  {@const wkind = watchByDomain.get(row.result.domain)}
                  {#if wkind === 'freed'}
                    <span class="chip-tag watch-freed" data-testid={`results-watch-${sid}`}>{t('watch.badge.freed')}</span>
                  {:else if wkind === 'taken'}
                    <span class="chip-tag watch-taken" data-testid={`results-watch-${sid}`}>{t('watch.badge.taken')}</span>
                  {/if}
                {/if}
              </td>
              <td class="price-cell nums">
                <div class="price-stack">
                  {#if row.standardFirstYear != null}
                    <span class="price-strike">{formatPrice(row.standardFirstYear, $settings)}</span>
                  {/if}
                  <span class="price-line">
                    <span
                      class="price"
                      style="color: {row.standardFirstYear != null ? 'var(--amber)' : priceColor(row.firstYear)}"
                    >
                      {formatPrice(row.firstYear, $settings)}
                    </span>
                    {#if row.standardFirstYear == null && row.best}
                      {@const rid = row.best.registrarId}
                      {@const icon = REGISTRAR_ICONS[rid]}
                      {@const mono = registrarMonogram(rid)}
                      {@const badgeTitle = registrarBadgeTitle(rid)}
                      {#if icon}
                        <img
                          src={icon}
                          alt=""
                          class="reg-badge reg-img"
                          title={badgeTitle}
                          aria-label={badgeTitle}
                        />
                      {:else}
                        <span
                          class="reg-badge"
                          style="--reg-hue: {mono.hue}"
                          title={badgeTitle}
                          aria-label={badgeTitle}
                        >{mono.short}</span>
                      {/if}
                    {/if}
                  </span>
                  {#if row.standardFirstYear != null}
                    <Tooltip text={t('results.detail.premium', { price: formatPrice(row.firstYear, $settings) })}>
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                      <span class="chip-tag premium" tabindex="0" data-testid={`results-chip-premium-${sid}`}>{t('price.premium')}</span>
                    </Tooltip>
                  {/if}
                  {#if promo}
                    <Tooltip text={t('tooltip.promo')}>
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                      <span class="chip-tag promo" tabindex="0" data-testid={`results-chip-promo-${sid}`}>{t('price.promo')}</span>
                    </Tooltip>
                  {/if}
                  {#if trap && row.best}
                    {@const reg = row.best.entry.reg ?? 0}
                    {@const renew = row.best.entry.renew ?? 0}
                    {@const first = formatPrice(reg, $settings)}
                    {@const renewal = formatPrice(renew, $settings)}
                    {@const times = reg > 0 ? Math.round(renew / reg) : 0}
                    <Tooltip text={t('tooltip.promoTrap', { first, renew: renewal, times })}>
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                      <span class="chip-tag trap" tabindex="0" data-testid={`results-chip-trap-${sid}`}>{t('price.promoTrap')}</span>
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
                      <IconStar filled={true} />
                    {:else}
                      <IconStar />
                    {/if}
                  </button>
                  {#if buy}
                    {#if buyHasDeepLink}
                      <a
                        class="action-btn buy-btn"
                        href={buy}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('results.buy.aria', { domain: row.result.domain })}
                        title={
                          buyInfo.entry?.reg != null
                            ? t('results.buy.at', {
                                registrar: buyInfo.registrar?.name ?? '',
                                price: formatPrice(buyInfo.entry.reg, $settings),
                              })
                            : t('results.buy')
                        }
                        data-testid={`results-row-buy-${sid}`}
                      >
                        <IconExternal />
                      </a>
                    {:else}
                      <Tooltip text={t('registrar.noDeeplink', { registrar: buyInfo.registrar?.name ?? '' })}>
                        <a
                          class="action-btn buy-btn"
                          href={buy}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t('results.buy.aria', { domain: row.result.domain })}
                          data-testid={`results-row-buy-${sid}`}
                        >
                          <IconExternal />
                        </a>
                      </Tooltip>
                    {/if}
                  {:else}
                    <!-- Invisible placeholder keeps the action-cluster geometry
                         identical on rows without a buy link (star x-position
                         must not shift between rows). -->
                    <span class="action-btn buy-placeholder" aria-hidden="true" tabindex="-1">
                      <IconExternal />
                    </span>
                  {/if}
                  <RowMenu
                    sid={sid}
                    isOpen={menuFor === row.result.domain}
                    copied={copied.has(row.result.domain)}
                    rechecking={rechecking.has(row.result.domain)}
                    recheckDisabled={rechecking.size >= MAX_RECHECKS}
                    isExpanded={isExpanded}
                    onTriggerClick={() => toggleMenu(row.result.domain)}
                    onClose={() => (menuFor = null)}
                    onCopy={() => void handleCopy(row.result.domain)}
                    onRecheck={() => recheck(row.result.domain)}
                    onDetail={() => { void toggleDetail(row.result.domain); }}
                  />
                </div>
              </td>
            </tr>
            {#if isExpanded}
              <DetailRow
                {sid}
                {row}
                {isAvail}
                {isErr}
                detail={details[row.result.domain]}
                {quotes}
                premiumOverride={premiumOverrides[row.result.domain] ?? null}
              />
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
  /* Keep the watch-refresh button on the filter-pill row: when the pills
     wrap, it right-aligns on their row instead of orphaning on its own. */
  .filters :global(.tip-wrap) {
    margin-left: auto;
  }
  /* "Show available (N)" + its ⋯ menu never split across lines. */
  .nowrap-group {
    display: inline-flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
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
  /* ---- Mobile: rows become stacked cards (no horizontal-scroll clipping).
     Card backgrounds are OPAQUE (row tint mixed over --bg-elevated via
     color-mix) so nothing bleeds through. ---- */
  @media (max-width: 700px) {
    thead {
      display: none;
    }
    table {
      display: block;
      min-width: 0;
    }
    tbody {
      display: block;
      padding: var(--space-2);
    }
    tbody tr.row-in {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) minmax(0, max-content);
      grid-template-areas:
        'select domain price'
        'select status price'
        'actions actions actions';
      column-gap: var(--space-2);
      row-gap: var(--space-1);
      padding: var(--space-2) var(--space-3);
      margin-bottom: var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-elevated);
      box-shadow: var(--shadow-sm);
    }
    tbody tr.row-in:last-child {
      border-bottom: 1px solid var(--border);
    }
    tbody tr.row-in:hover {
      background: color-mix(in srgb, var(--bg-sunken) 70%, var(--bg-elevated));
    }
    tbody tr.row-in:nth-child(even):not(.available):not(.error):not(.detail-row) {
      background: color-mix(in srgb, var(--bg-sunken) 55%, var(--bg-elevated));
    }
    tbody tr.row-in.available {
      background: color-mix(in srgb, var(--green-solid) 5%, var(--bg-elevated));
      box-shadow: var(--shadow-sm), inset 2px 0 0 var(--green-solid);
    }
    tbody tr.row-in.available:hover {
      background: color-mix(in srgb, var(--green-solid) 9%, var(--bg-elevated));
    }
    tbody tr.row-in.error {
      background: color-mix(in srgb, var(--red) 5%, var(--bg-elevated));
      box-shadow: var(--shadow-sm), inset 2px 0 0 var(--red);
    }
    tbody tr.row-in.error:hover {
      background: color-mix(in srgb, var(--red) 9%, var(--bg-elevated));
    }
    tbody tr.row-in > td {
      padding: 0;
      background: transparent;
    }
    td.select-cell {
      grid-area: select;
      align-self: start;
      padding-top: 2px;
    }
    td.domain-cell {
      grid-area: domain;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    /* Domain names scan faster in mono (DESIGN.md §3 mono rule). */
    .domain-link,
    .domain-text {
      font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    }
    td.status-cell {
      grid-area: status;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-1);
      white-space: normal;
    }
    td.price-cell {
      grid-area: price;
      align-self: start;
      white-space: normal;
    }
    td.actions-cell {
      grid-area: actions;
      display: flex;
      justify-content: flex-end;
      padding-top: var(--space-1);
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
  .price-line {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .price {
    font-weight: 500;
  }
  .price-strike {
    color: var(--text-tertiary);
    text-decoration: line-through;
    font-size: var(--text-xs);
    font-weight: 400;
  }

  /* Shared .action-btn (+ :hover, :disabled, .active, svg) and .chip-tag
     (+ variants) live in src/ui/chrome.css. */
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
  .watch-refresh :global(svg) {
    width: 14px;
    height: 14px;
  }
  .watch-refresh :global(.spin) {
    animation-duration: 1.5s;
  }
  .coupon {
    display: inline-block;
    font-size: 11px;
    color: var(--text-tertiary);
    /* Long coupon codes ellipsize instead of overflowing the cell at any width. */
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global([data-theme='dark']) .coupon {
    color: var(--text-secondary);
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
  /* Shared .action-btn lives in src/ui/chrome.css. */
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
  /* Shared .spin + @keyframes spin live in src/ui/chrome.css. */
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

</style>
