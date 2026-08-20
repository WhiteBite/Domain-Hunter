<script lang="ts">
  import type { CheckResult, PriceEntry, Settings } from '../../types';
  import { formatPrice } from '../../pricing/pricing';
  import { settings } from '../store';
  import { t } from '../../i18n';
  import Tooltip from './Tooltip.svelte';

  export interface RowData {
    result: CheckResult;
    best: { registrarId: string; entry: PriceEntry } | null;
    tco: number | null;
    firstYear: number | null;
    standardFirstYear: number | null;
    renewal: number | null;
  }

  export interface DigDetail {
    loading?: boolean;
    failed?: boolean;
    premium?: boolean;
    likely?: boolean;
    price: number | null;
    registrar: string | null;
    regPrice: number | null;
    url: string | null;
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
  <td colspan="5">
    <div class="detail-grid">
      <div class="detail-cell">
        <span class="detail-label">{t('price.renewal')}</span>
        <span class="detail-value nums">{formatPrice(row.renewal, s)}</span>
      </div>
      <div class="detail-cell">
        <span class="detail-label">{t('price.tco')}</span>
        <span class="detail-value nums">{formatPrice(row.tco, s)}</span>
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
                class:no-deeplink={!quote.hasDeepLink}
                href={quote.url}
                target="_blank"
                rel="noopener noreferrer"
                title={quote.hasDeepLink ? undefined : t('registrar.noDeeplink', { registrar: quote.name })}
                data-testid={`results-row-registrar-${sid}-${quote.id}`}
              >
                {#if i === 0}<span class="detail-reg-dot" aria-hidden="true"></span>{/if}
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
      {#if !detail || detail.loading}
        <span class="detail-muted">{t('results.detail.loading')}</span>
      {:else if detail.failed}
        <span class="detail-muted">{t('results.detail.failed')}</span>
      {:else}
        {#if detail.premium || detail.likely}
          <div class="detail-cell">
            <span class="chip-tag premium">
              {t('results.detail.premium', {
                price:
                  premiumOverride != null
                    ? formatPrice(premiumOverride, s)
                    : '—',
              })}
            </span>
          </div>
        {/if}
        {#if detail.registrar}
          <div class="detail-cell">
            <span class="detail-cheap">
              {t('results.detail.cheapest', {
                registrar: detail.registrar,
                price:
                  detail.regPrice != null
                    ? formatPrice(Math.round(detail.regPrice * 100), s)
                    : '—',
              })}
            </span>
          </div>
        {/if}
        {#if detail.url}
          <a class="detail-buy" href={detail.url} target="_blank" rel="noopener noreferrer" data-testid={`results-row-detail-buy-${sid}`}>
            {t('results.detail.buy')}
          </a>
        {/if}
      {/if}
    </div>
  </td>
</tr>

<style>
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
    padding-left: calc(14px + 2 * var(--space-3));
    max-width: 1200px;
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
  .detail-reg-item.no-deeplink {
    opacity: 0.8;
    text-decoration: underline dotted;
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

  @media (max-width: 700px) {
    tr.detail-row {
      display: block;
      margin: 0 0 var(--space-2);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--radius-md) var(--radius-md);
      background: var(--bg-sunken);
    }
    tr.detail-row.is-available {
      background: color-mix(in srgb, var(--green-solid) 5%, var(--bg-sunken));
      box-shadow: inset 2px 0 0 var(--green-solid);
    }
    tr.detail-row.is-error {
      background: color-mix(in srgb, var(--red) 5%, var(--bg-sunken));
      box-shadow: inset 2px 0 0 var(--red);
    }
    tr.detail-row td {
      display: block;
      padding: var(--space-3);
      background: transparent;
      box-shadow: none;
    }
    tr.detail-row.is-available td,
    tr.detail-row.is-error td {
      background: transparent;
    }
    .detail-grid {
      flex-direction: column;
      align-items: stretch;
      padding-left: 0;
      max-width: none;
      gap: var(--space-2);
    }
    .detail-buy {
      width: 100%;
      justify-content: center;
    }
  }
</style>
