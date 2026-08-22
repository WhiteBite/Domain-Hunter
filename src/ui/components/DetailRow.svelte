<script lang="ts">
  import type { CheckResult, PriceEntry, Settings } from '../../types';
  import { formatPrice } from '../../pricing/pricing';
  import { settings } from '../store';
  import { t } from '../../i18n';
  import Tooltip from './Tooltip.svelte';
  import type { DigDetail } from '../dig';

  export interface RowData {
    result: CheckResult;
    best: { registrarId: string; entry: PriceEntry } | null;
    tco: number | null;
    firstYear: number | null;
    standardFirstYear: number | null;
    renewal: number | null;
  }

  export interface RegistrarQuote {
    id: string;
    name: string;
    reg: number;
    renew: number | null;
    url: string;
    hasDeepLink: boolean;
  }

  interface Props {
    sid: string;
    row: RowData;
    isAvail: boolean;
    isErr: boolean;
    detail: DigDetail | undefined;
    quotes: RegistrarQuote[];
    premiumOverride: number | null;
  }
  let { sid, row, isAvail, isErr, detail, quotes, premiumOverride }: Props = $props();

  const s: Settings = $derived($settings);
</script>

<tr
  class="detail-row"
  class:is-available={isAvail}
  class:is-error={isErr}
  data-testid={`results-row-expanded-${sid}`}
>
  <td colspan="6">
    <div class="detail-band">
      <!-- Column 1: renewal metric stack (+ status note when present). -->
      <div class="detail-col">
        <div class="detail-cell">
          <span class="detail-label">{t('price.renewal')}</span>
          <span class="detail-value nums">{formatPrice(row.renewal, s)}</span>
        </div>
        {#if row.result.note}
          <div class="detail-note">{row.result.note}</div>
        {/if}
      </div>
      <!-- Column 2: TCO metric stack (+ premium chip once confirmed). -->
      <div class="detail-col">
        <div class="detail-cell">
          <span class="detail-label">{t('price.tco')}</span>
          <span class="detail-value nums">{formatPrice(row.tco, s)}</span>
        </div>
        {#if detail && !detail.loading && !detail.failed && (detail.premium || detail.likely)}
          <span class="chip-tag premium">
            {t('results.detail.premium', {
              price:
                premiumOverride != null
                  ? formatPrice(premiumOverride, s)
                  : '—',
            })}
          </span>
        {/if}
      </div>
      <!-- Column 3: registrar comparison (1fr) with a shimmer placeholder
           while the on-demand detail loads — no floating text. -->
      <div class="detail-col detail-registrars-col">
        {#if !detail || detail.loading}
          <div class="detail-shimmer" aria-hidden="true">
            <span class="shimmer-bar"></span>
            <span class="shimmer-bar"></span>
            <span class="shimmer-bar"></span>
          </div>
        {:else}
          {#if quotes.length >= 2}
            <div class="detail-registrars" data-testid={`results-row-registrars-${sid}`}>
              <Tooltip text={t('tooltip.registrars')}>
                <span class="detail-label">{t('results.detail.registrars')}</span>
              </Tooltip>
              <span class="detail-reg-list nums">
                {#each quotes.slice(0, 4) as quote, i}
                  <a
                    class="detail-reg-item"
                    class:cheapest={i === 0}
                    class:no-deeplink={!quote.hasDeepLink}
                    href={quote.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={quote.hasDeepLink ? undefined : t('registrar.noDeeplink', { registrar: quote.name })}
                    data-testid={`results-row-registrar-${sid}-${quote.id}`}
                  >
                    <span class="detail-reg-dot" aria-hidden="true"></span>
                    {quote.name} — {formatPrice(quote.reg, s)} / {formatPrice(quote.renew, s)}
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
          {#if detail.failed}
            <span class="detail-muted">{t('results.detail.failed')}</span>
          {:else}
            <div class="detail-extra">
              {#if detail.registrar}
                <span class="detail-cheap">
                  {t('results.detail.cheapest', {
                    registrar: detail.registrar,
                    price:
                      detail.regPrice != null
                        ? formatPrice(Math.round(detail.regPrice * 100), s)
                        : '—',
                  })}
                </span>
              {/if}
              {#if detail.url}
                <a class="detail-buy" href={detail.url} target="_blank" rel="noopener noreferrer" data-testid={`results-row-detail-buy-${sid}`}>
                  {t('results.detail.buy')}
                </a>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </td>
</tr>

<style>
  /* Full-bleed band: the td contributes no padding/background of its own —
     the inner panel spans the whole colspan-6 cell, aligns to the table
     edges, and inherits the parent row's tint. */
  .detail-row td {
    padding: 0;
    background: transparent;
  }

  .detail-band {
    display: grid;
    grid-template-columns: max-content max-content minmax(0, 1fr);
    align-items: start;
    gap: var(--space-2) var(--space-6);
    font-size: var(--text-xs);
    padding: var(--space-3) var(--space-4);
    background: var(--bg-sunken);
    box-shadow: inset 2px 0 0 var(--border-strong);
  }
  .detail-row.is-available .detail-band {
    background: var(--row-tint-available);
    box-shadow: inset 2px 0 0 var(--green-solid);
  }
  .detail-row.is-error .detail-band {
    background: var(--row-tint-error);
    box-shadow: inset 2px 0 0 var(--red);
  }

  .detail-col {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    min-width: 0;
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
    max-width: 260px;
    white-space: normal;
  }

  .detail-muted {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .detail-cheap {
    color: var(--text-secondary);
  }

  .detail-registrars {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
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
    gap: var(--space-1);
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
  .detail-reg-item.no-deeplink {
    opacity: 0.8;
    text-decoration: underline dotted;
  }
  /* Unified entries: every quote carries a dot; the cheapest fills it. */
  .detail-reg-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: transparent;
    flex: none;
  }
  .detail-reg-item.cheapest .detail-reg-dot {
    background: var(--green-solid);
    border-color: var(--green-solid);
  }
  .detail-reg-more {
    color: var(--text-tertiary);
  }

  .detail-extra {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }

  .detail-buy {
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
  /* Shared .chip-tag (+ .premium variant) lives in src/ui/chrome.css. */

  /* Loading shimmer sized to the registrar-list area. */
  .detail-shimmer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    max-width: 420px;
    padding: 2px 0;
  }
  .shimmer-bar {
    height: 12px;
    border-radius: var(--radius-sm);
    background: linear-gradient(
      90deg,
      var(--border) 25%,
      var(--border-strong) 50%,
      var(--border) 75%
    );
    background-size: 200% 100%;
    animation: dh-shimmer 1.2s linear infinite;
  }
  .shimmer-bar:nth-child(1) {
    width: 90%;
  }
  .shimmer-bar:nth-child(2) {
    width: 70%;
  }
  .shimmer-bar:nth-child(3) {
    width: 45%;
  }
  @keyframes dh-shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @media (max-width: 700px) {
    tr.detail-row {
      display: block;
      margin: 0 0 var(--space-2);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--radius-md) var(--radius-md);
    }
    tr.detail-row td {
      display: block;
      padding: 0;
      background: transparent;
      box-shadow: none;
    }
    .detail-band {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }
    .detail-shimmer {
      max-width: none;
    }
    .detail-buy {
      width: 100%;
      justify-content: center;
    }
  }
</style>
