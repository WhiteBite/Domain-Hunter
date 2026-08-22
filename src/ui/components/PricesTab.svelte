<script lang="ts">
  import { t } from '../../i18n';
  import { pricing, registry, settings } from '../store';
  import { bestEntry, formatPrice, isPromoTrap, matrixColumns, tco3 } from '../../pricing/pricing';
  import { pointsFromCompact, sparkSeries, summarizeTrend } from '../../pricing/trends';
  import { downloadCsv } from '../csv';
  import { registrarMonogram } from '../registrar-badge';
  import { REGISTRAR_ICONS } from '../registrar-icons';
  import type { PriceEntry, PricingTable, RegistrarConfig, Settings } from '../../types';
  import registrarsJson from '../../config/registrars.json';
  import historyJson from '../../config/price-history.json';

  const registrars = registrarsJson as unknown as RegistrarConfig[];
  const registrarName = new Map<string, string>(registrars.map((r) => [r.id, r.name]));
  const history =
    historyJson as unknown as Record<string, Array<[string, number | null, number | null]>>;

  /** Cold start: no CI-harvested snapshots bundled yet → trends are impossible
      and the user gets a one-line explanation instead of empty trend cells. */
  const hasHistory = Object.keys(history).length > 0;

  type SortMode = 'reg' | 'renew' | 'alpha';

  let query = $state('');
  let sortMode = $state<SortMode>('reg');
  let visibleCount = $state(100);
  let hideUnpriced = $state(false);

  const table = $derived($pricing?.table ?? null);

  const allZones = $derived($registry.tlds.map((tc) => tc.tld));

  const columns = $derived((table ? matrixColumns(table, 6) : []) as string[]);

  const extraRegs = $derived(
    table ? Math.max(0, countRegistrars(table) - columns.length) : 0,
  );

  const filteredZones = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let zones = allZones;
    if (q) zones = zones.filter((tld) => tld.includes(q));
    if (hideUnpriced && table) {
      // Drop zones with no registration price anywhere in the visible column set.
      zones = zones.filter((tld) =>
        columns.some((rid) => table.tlds[tld]?.[rid]?.reg != null),
      );
    }
    return zones;
  });

  const sortedZones = $derived.by(() => {
    if (!table) return filteredZones;
    const sorted = [...filteredZones];
    if (sortMode === 'alpha') {
      sorted.sort((a, b) => a.localeCompare(b));
    } else if (sortMode === 'reg') {
      sorted.sort((a, b) => {
        const pa = bestEntry(table, a)?.entry.reg ?? Infinity;
        const pb = bestEntry(table, b)?.entry.reg ?? Infinity;
        return pa - pb;
      });
    } else {
      sorted.sort((a, b) => {
        const pa = bestEntry(table, a)?.entry.renew ?? Infinity;
        const pb = bestEntry(table, b)?.entry.renew ?? Infinity;
        return pa - pb;
      });
    }
    return sorted;
  });

  const visibleZones = $derived(sortedZones.slice(0, visibleCount));
  const remaining = $derived(Math.max(0, sortedZones.length - visibleCount));

  function countRegistrars(tbl: PricingTable): number {
    const ids = new Set<string>();
    for (const regs of Object.values(tbl.tlds)) {
      for (const rid of Object.keys(regs)) ids.add(rid);
    }
    return ids.size;
  }

  function entryFor(tld: string, registrarId: string): PriceEntry | null {
    return table?.tlds[tld]?.[registrarId] ?? null;
  }

  function promoTrapTitle(entry: PriceEntry, s: Settings): string {
    const first = formatPrice(entry.reg, s);
    const renew = formatPrice(entry.renew, s);
    const times =
      entry.reg != null && entry.reg > 0 && entry.renew != null
        ? Math.round(entry.renew / entry.reg)
        : 0;
    return t('tooltip.promoTrap', { first, renew, times });
  }

  function cellTitle(
    entry: PriceEntry | null,
    isMin: boolean,
    registrarId: string,
    s: Settings,
  ): string {
    if (entry && isPromoTrap(entry)) return promoTrapTitle(entry, s);
    if (isMin) return t('prices.min.title', { registrar: registrarName.get(registrarId) ?? registrarId });
    return '';
  }

  // Sparkline geometry: 64×14 viewBox, 1px padding, y inverted (SVG y grows
  // downward, prices grow upward). Values are raw USD cents from sparkSeries.
  const SPARK_W = 64;
  const SPARK_H = 14;
  const SPARK_PAD = 1;

  function sparkGeometry(values: number[]): { points: string; lastX: number; lastY: number } {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const innerW = SPARK_W - 2 * SPARK_PAD;
    const innerH = SPARK_H - 2 * SPARK_PAD;
    const step = values.length > 1 ? innerW / (values.length - 1) : 0;
    let lastX = SPARK_W / 2;
    let lastY = SPARK_H / 2;
    const parts: string[] = [];
    values.forEach((v, i) => {
      const x = SPARK_PAD + i * step;
      // Constant series (span 0) draws through the vertical middle.
      const y = span === 0 ? SPARK_H / 2 : SPARK_H - SPARK_PAD - ((v - min) / span) * innerH;
      lastX = Math.round(x * 100) / 100;
      lastY = Math.round(y * 100) / 100;
      parts.push(`${lastX},${lastY}`);
    });
    return { points: parts.join(' '), lastX, lastY };
  }

  function showMore(): void {
    visibleCount += 100;
  }

  function showLess(): void {
    visibleCount = 100;
  }

  function escapeCsv(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  }

  function exportCsv(): void {
    if (!table) return;
    const s = $settings;
    const headerLabels = [
      t('csv.tld'),
      t('csv.bestRegistrar'),
      t('csv.priceFirstYear'),
      t('csv.priceRenewal'),
      ...columns.map((rid) => registrarName.get(rid) ?? rid),
    ];
    const lines: string[] = [headerLabels.map(escapeCsv).join(',')];
    for (const tld of sortedZones) {
      const best = bestEntry(table, tld);
      const row = [
        tld,
        best ? (registrarName.get(best.registrarId) ?? best.registrarId) : '',
        best && best.entry.reg != null ? formatPrice(best.entry.reg, s) : '',
        best && best.entry.renew != null ? formatPrice(best.entry.renew, s) : '',
        ...columns.map((rid) => {
          const e = entryFor(tld, rid);
          return e?.reg != null ? formatPrice(e.reg, s) : '';
        }),
      ];
      lines.push(row.map(escapeCsv).join(','));
    }
    const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
    downloadCsv('domain-prices.csv', csv);
  }
</script>

<section class="prices">
  <h2>{t('prices.title')}</h2>
  <p class="desc">{t('prices.desc')}</p>

  <div class="controls">
    <input
      class="search"
      type="search"
      bind:value={query}
      placeholder={t('prices.search')}
      aria-label={t('prices.search')}
      data-testid="prices-search"
    />
    <select
      bind:value={sortMode}
      aria-label={t('prices.sort.reg')}
      data-testid="prices-sort"
    >
      <option value="reg">{t('prices.sort.reg')}</option>
      <option value="renew">{t('prices.sort.renew')}</option>
      <option value="alpha">{t('prices.sort.alpha')}</option>
    </select>
    <button
      class="btn"
      class:active={hideUnpriced}
      type="button"
      onclick={() => (hideUnpriced = !hideUnpriced)}
      aria-pressed={hideUnpriced}
      aria-label={t('prices.hideUnpriced.aria')}
      title={t('prices.hideUnpriced.aria')}
      data-testid="prices-toggle-unpriced"
    >
      {t('prices.hideUnpriced')}
    </button>
    <button
      class="btn primary"
      type="button"
      onclick={exportCsv}
      disabled={!table || sortedZones.length === 0}
      data-testid="prices-export-csv"
    >
      {t('prices.export')}
    </button>
  </div>

  {#if table && Object.keys(table.tlds).length > 0}
    <div class="legend">
      <span class="legend-item" title={t('prices.legend.band.tip')}>
        <span class="swatch swatch-band" aria-hidden="true"></span>
        {t('prices.legend.band')}
      </span>
      <span class="legend-item" title={t('prices.legend.dot.tip')}>
        <span class="swatch swatch-dot" aria-hidden="true"></span>
        {t('prices.legend.dot')}
      </span>
      <span class="legend-item" title={t('prices.legend.trap.tip')}>
        <span class="swatch swatch-trap" aria-hidden="true"></span>
        {t('prices.legend.trap')}
      </span>
    </div>
    {#if !hasHistory}
      <p class="muted coldstart">{t('prices.trends.coldstart')}</p>
    {/if}
  {/if}

  {#if !table || Object.keys(table.tlds).length === 0}
    <p class="muted empty">{t('prices.empty')}</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="zone-col">{t('csv.tld')}</th>
            {#each columns as rid (rid)}
              {@const icon = REGISTRAR_ICONS[rid]}
              {@const mono = registrarMonogram(rid)}
              {@const name = registrarName.get(rid) ?? rid}
              <th class="price-col">
                <span class="price-col-head">
                  {#if icon}
                    <img src={icon} alt="" class="reg-badge reg-img" title={name} aria-label={name} />
                  {:else}
                    <span class="reg-badge" style="--reg-hue: {mono.hue}" title={name} aria-label={name}
                      >{mono.short}</span>
                  {/if}
                  {name}
                </span>
              </th>
            {/each}
            <th class="price-col best-col">{t('prices.col.renewal')}</th>
            <th class="price-col best-col">{t('prices.col.tco')}</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleZones as tld (tld)}
            {@const best = bestEntry(table, tld)}
            {@const minRid = best?.registrarId ?? null}
            {@const trend = summarizeTrend(pointsFromCompact(history[tld] ?? []))}
            {@const spark = sparkSeries(history[tld] ?? [])}
            {@const sparkGeo = spark ? sparkGeometry(spark.values) : null}
            <tr data-testid={`prices-row-${tld}`}>
              <td class="zone-cell">{tld}</td>
              {#each columns as rid (rid)}
                {@const entry = entryFor(tld, rid)}
                {@const isMin = minRid === rid && entry != null && entry.reg != null}
                {@const isTrap = entry != null && isPromoTrap(entry)}
                <td
                  class="price-cell nums"
                  class:min={isMin}
                  class:trap={isTrap}
                  title={cellTitle(entry, isMin, rid, $settings)}
                >
                  {entry?.reg != null ? formatPrice(entry.reg, $settings) : '—'}
                </td>
              {/each}
              <td class="price-cell nums best-cell">
                {best?.entry.renew != null ? formatPrice(best.entry.renew, $settings) : '—'}
              </td>
              <td class="price-cell nums best-cell">
                {formatPrice(tco3(table, tld), $settings)}
                {#if sparkGeo}
                  <svg
                    class="spark trend-{trend.dir ?? 'flat'}"
                    width="64"
                    height="14"
                    viewBox="0 0 64 14"
                    aria-hidden="true"
                  >
                    <polyline
                      points={sparkGeo.points}
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <circle cx={sparkGeo.lastX} cy={sparkGeo.lastY} r="2" fill="currentColor" />
                  </svg>
                {/if}
                {#if trend.dir}
                  <span
                    class="trend trend-{trend.dir}"
                    title={t('tooltip.trend', { months: 6 })}
                  >
                    {#if trend.dir === 'up'}▲ +{trend.pct}%{:else if trend.dir === 'down'}▼
                      {trend.pct}%{:else}→{/if}
                  </span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if extraRegs > 0}
      <p class="muted more-regs">{t('prices.moreRegs', { n: extraRegs })}</p>
    {/if}
    {#if remaining > 0}
      <button class="btn more-btn" type="button" onclick={showMore} data-testid="prices-more">
        {t('prices.more', { n: remaining })}
      </button>
    {:else if visibleCount > 100}
      <button class="btn more-btn" type="button" onclick={showLess}>
        {t('prices.less')}
      </button>
    {/if}
  {/if}
</section>

<style>
  .prices {
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

  /* On-state: soft fill + accent border + outer ring so the pressed toggle is
     unmistakable in both themes (same family as the results filter chips). */
  .btn.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent-text);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  /* Cheapest-registrar columns (renewal / 3y TCO) are set off from the
     registrar matrix by a leading divider. */
  .best-col,
  .best-cell {
    border-left: 1px solid var(--border);
  }

  /* Compact encoding legend under the toolbar; each item carries a title
     tooltip with the long explanation (same pattern as cell tooltips). */
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    cursor: help;
  }

  .swatch {
    flex: none;
  }

  /* Mini column band: sunken fill + leading divider, mirroring how the
     cheapest columns are set off in the table (no full border, so it does
     not read as a checkbox). */
  .swatch-band {
    width: 10px;
    height: 12px;
    background: var(--bg-sunken);
    border-left: 2px solid var(--border-strong);
    border-radius: 0 2px 2px 0;
  }

  .swatch-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--green-solid);
    margin: 0 2px;
  }

  .swatch-trap {
    width: 14px;
    height: 10px;
    border-bottom: 1px dotted var(--amber);
  }

  .coldstart {
    margin-top: calc(-1 * var(--space-2));
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

  .price-col-head {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background var(--dur) var(--ease);
  }

  tbody tr:nth-child(even) {
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

  td {
    padding: var(--space-2) var(--space-3);
    vertical-align: middle;
  }

  .zone-cell {
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    color: var(--text);
    white-space: nowrap;
  }

  .price-cell {
    text-align: right;
    white-space: nowrap;
    color: var(--text);
  }

  .price-cell.min {
    background: var(--green-soft);
  }

  .price-cell.min::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green-solid);
    margin-right: var(--space-1);
    vertical-align: middle;
  }

  .price-cell.trap {
    text-decoration: underline dotted var(--amber);
    text-underline-offset: 2px;
    text-decoration-thickness: 1px;
  }

  .spark {
    vertical-align: middle;
    margin-inline-start: var(--space-1);
    opacity: 0.9;
  }

  .trend {
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    margin-inline-start: var(--space-1);
    white-space: nowrap;
  }

  .trend-up {
    color: var(--price-high);
  }

  .trend-down {
    color: var(--price-cheap);
  }

  .trend-flat {
    color: var(--text-tertiary);
  }

  .price-cell:empty::before,
  .price-cell:not(.min)::before {
    content: none;
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

  .more-regs {
    text-align: center;
  }

  .more-btn {
    align-self: center;
  }

  @media (max-width: 700px) {
    .zone-cell {
      position: sticky;
      left: 0;
      z-index: 2;
      background: var(--bg-elevated);
      box-shadow: 1px 0 0 var(--border);
    }

    tbody tr:nth-child(even) .zone-cell {
      background: color-mix(in srgb, var(--bg-sunken) 55%, var(--bg-elevated));
    }

    tbody tr:hover .zone-cell {
      background: var(--bg-sunken);
    }

    .price-cell.min {
      background: var(--green-soft);
    }
  }
</style>
