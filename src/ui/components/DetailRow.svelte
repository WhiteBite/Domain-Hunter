<script lang="ts">
  import type { CheckResult, PriceEntry, Settings } from '../../types';
  import type { RegistrarQuote } from '../registrar-quotes';
  import { trademarkLabel, usptoSearchUrl, tmviewSearchUrl } from '../trademark';
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
  const tmLabel = $derived(trademarkLabel(row.result.domain));

  function fmtDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function ageLabel(registeredAt: number): string {
    const days = Math.max(0, Math.floor((Date.now() - registeredAt) / 86_400_000));
    return days < 365
      ? t('card.age.days', { n: days })
      : t('card.age.years', { n: (days / 365.25).toFixed(1) });
  }
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
        <span class="detail-trademark">
          <a
            href={usptoSearchUrl(tmLabel)}
            target="_blank"
            rel="noopener noreferrer"
            title={t('results.detail.tm.hint')}
            data-testid={`results-row-tm-uspto-${sid}`}
          >{t('results.detail.tm.uspto')}</a>
          <a
            href={tmviewSearchUrl(tmLabel)}
            target="_blank"
            rel="noopener noreferrer"
            title={t('results.detail.tm.hint')}
            data-testid={`results-row-tm-tmview-${sid}`}
          >{t('results.detail.tm.tmview')}</a>
        </span>
      </div>
      {#if row.result.card}
        {@const card = row.result.card}
        <div class="detail-col detail-card" data-testid={`results-row-card-${sid}`}>
          <span class="detail-label">{t('card.title')}</span>
          <div class="card-grid">
            {#if card.registrar}
              <div class="detail-cell">
                <span class="card-k">{t('card.registrar')}</span>
                <span class="detail-value">{card.registrar}</span>
              </div>
            {/if}
            {#if card.registeredAt != null}
              <div class="detail-cell">
                <span class="card-k">{t('card.registered')}</span>
                <span class="detail-value nums">{fmtDate(card.registeredAt)} · {ageLabel(card.registeredAt)}</span>
              </div>
            {/if}
            {#if card.expiresAt != null}
              <div class="detail-cell">
                <span class="card-k">{t('card.expires')}</span>
                <span class="detail-value nums">{fmtDate(card.expiresAt)}</span>
              </div>
            {/if}
            {#if card.changedAt != null}
              <div class="detail-cell">
                <span class="card-k">{t('card.changed')}</span>
                <span class="detail-value nums">{fmtDate(card.changedAt)}</span>
              </div>
            {/if}
          </div>
          {#if card.statuses.length > 0}
            <div class="card-statuses" role="list" aria-label={t('card.statuses.aria')}>
              {#each card.statuses as st (st)}
                <span class="chip-tag" role="listitem">{st}</span>
              {/each}
            </div>
          {/if}
          {#if card.nameservers.length > 0}
            <div class="card-ns">
              <span class="card-k">{t('card.ns')}</span>
              <span class="nums"
                >{card.nameservers.slice(0, 4).join(', ')}{card.nameservers.length > 4
                  ? ` +${card.nameservers.length - 4}`
                  : ''}</span
              >
            </div>
          {/if}
        </div>
      {/if}
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

  .detail-card {
    max-width: 340px;
  }

  .card-grid {
    display: grid;
    grid-template-columns: max-content max-content;
    gap: 2px var(--space-2);
    align-items: baseline;
  }

  .card-k {
    color: var(--text-tertiary);
  }

  .card-statuses {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .card-ns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    color: var(--text-secondary);
  }

  .detail-trademark {
    display: flex;
    gap: var(--space-3);
    font-size: var(--text-xs);
  }

  .detail-trademark a {
    color: var(--accent-text);
    text-decoration: none;
    border-bottom: 1px dotted var(--border-strong);
  }

  .detail-trademark a:hover {
    border-bottom-color: var(--accent);
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
