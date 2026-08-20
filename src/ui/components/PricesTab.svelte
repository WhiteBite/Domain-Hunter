<script lang="ts">
  import { t } from '../../i18n';
  import { pricing, registry, settings } from '../store';
  import { bestEntry, formatPrice, isPromoTrap, matrixColumns } from '../../pricing/pricing';
  import { downloadCsv } from '../csv';
  import { registrarMonogram } from '../registrar-badge';
  import { REGISTRAR_ICONS } from '../registrar-icons';
  import type { PriceEntry, PricingTable, RegistrarConfig, Settings } from '../../types';
  import registrarsJson from '../../config/registrars.json';

  const registrars = registrarsJson as unknown as RegistrarConfig[];
  const registrarName = new Map<string, string>(registrars.map((r) => [r.id, r.name]));

  type SortMode = 'reg' | 'renew' | 'alpha';

  let query = $state('');
  let sortMode = $state<SortMode>('reg');
  let visibleCount = $state(100);

  const table = $derived($pricing?.table ?? null);

  const allZones = $derived($registry.tlds.map((tc) => tc.tld));

  const columns = $derived((table ? matrixColumns(table, 6) : []) as string[]);

  const extraRegs = $derived(
    table ? Math.max(0, countRegistrars(table) - columns.length) : 0,
  );

  const filteredZones = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allZones;
    return allZones.filter((tld) => tld.includes(q));
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
      class="btn primary"
      type="button"
      onclick={exportCsv}
      disabled={!table || sortedZones.length === 0}
      data-testid="prices-export-csv"
    >
      {t('prices.export')}
    </button>
  </div>

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
          </tr>
        </thead>
        <tbody>
          {#each visibleZones as tld (tld)}
            {@const best = bestEntry(table, tld)}
            {@const minRid = best?.registrarId ?? null}
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
