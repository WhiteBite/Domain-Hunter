<script lang="ts">
  import { priceSourceLabel } from '../price-source';
  import { resultNoteKey } from '../result-note';
  import type { CheckResult, PriceEntry, Settings } from '../../types';
  import type { RegistrarQuote } from '../registrar-quotes';
  import { trademarkLabel, usptoSearchUrl, tmviewSearchUrl } from '../trademark';
  import { bestTco, formatPrice, formatSourcePrice } from '../../pricing/pricing';
  import { settings, pricing } from '../store';
  import { t, locale } from '../../i18n';
  import StatusDetails from './StatusDetails.svelte';
  import type { DigDetail } from '../dig';
  import { checkDetail } from '../premium-check';
  import { displayUnicode, hasMixedLookalikeScripts, toAscii } from '../../core/idn';
  import { checkAdvisory, type Advisory, type AdvisoryProvider } from '../advisory';
  import { registry } from '../store';

  export interface RowData {
    result: CheckResult;
    best: { registrarId: string; entry: PriceEntry } | null;
    tco: number | null;
    firstYear: number | null;
    standardFirstYear: number | null;
    renewal: number | null;
    renewalRegistrarId: string | null;
    isPremiumOverride: boolean;
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

  let advisory = $state<Advisory | null>(null);
  let advisoryLoading = $state(false);
  let advisoryFailed = $state(false);
  const unicodeDomain = $derived(displayUnicode(row.result.domain));
  const noteKey = $derived(row.result.note ? resultNoteKey(row.result.note) : null);
  const isRu = $derived(/\.(ru|xn--p1ai)$/.test(toAscii(row.result.domain)));
  const policyRu = $derived(/\.(ru|xn--p1ai|su)$/.test(toAscii(row.result.domain)));
  const minimum = $derived($registry.tlds.find(x => toAscii(x.tld) === toAscii(row.result.tld))?.flags?.minYears ?? 0);
  async function lookup(provider: AdvisoryProvider): Promise<void> {
    advisoryLoading = true; advisoryFailed = false;
    advisory = await checkAdvisory(provider, row.result.domain);
    advisoryFailed = !advisory; advisoryLoading = false;
  }

  const conditionSellers = Array.of('regru', 'hostiman', 'timeweb', 'sprinthost', 'webhost1', 'adminvps');
  const s: Settings = $derived($settings);
  const tmLabel = $derived(trademarkLabel(row.result.domain));
  const tcoQuote = $derived($pricing?.table && row.tco != null && premiumOverride == null ? bestTco($pricing.table, row.result.tld) : null);

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
  id={`detail-${sid}`}
  data-testid={`results-row-expanded-${sid}`}
>
  <td colspan="6">
    <div class="detail-band">
      <div class="detail-summary">
        <div class="detail-cell">
          <span class="detail-label">{t('price.renewal')}</span>
          <strong class="detail-value nums">{formatSourcePrice($pricing?.table ?? null, row.result.tld, row.renewalRegistrarId, 'renew', row.renewal, s)}</strong>
          {#if row.renewalRegistrarId}<span class="detail-muted">{quotes.find(q => q.id === row.renewalRegistrarId)?.name ?? row.renewalRegistrarId} · {priceSourceLabel($pricing?.table ?? null, row.result.tld, row.renewalRegistrarId, 'renew')}</span>{/if}
        </div>
        <div class="detail-cell">
          <span class="detail-label">{t('price.tco')}</span>
          <strong class="detail-value nums">{formatPrice(row.tco, s)}</strong>
          {#if tcoQuote && $pricing?.table}
            <span class="detail-muted">{quotes.find(q => q.id === tcoQuote.registrarId)?.name ?? tcoQuote.registrarId} · {priceSourceLabel($pricing.table, row.result.tld, tcoQuote.registrarId, 'reg')}{#if priceSourceLabel($pricing.table, row.result.tld, tcoQuote.registrarId, 'reg') !== priceSourceLabel($pricing.table, row.result.tld, tcoQuote.registrarId, 'renew')} / {priceSourceLabel($pricing.table, row.result.tld, tcoQuote.registrarId, 'renew')}{/if}</span>
          {/if}
        </div>
        <div class="detail-cell detail-observation">
          <span class="detail-label">{t('csv.resultSource')}</span>
          <span>{row.result.source} · {new Date(row.result.checkedAt).toLocaleString($locale)}</span>
          {#if unicodeDomain !== row.result.domain}<span class="detail-muted">{t('idn.unicode', { domain: unicodeDomain })} · {t('idn.ascii', { domain: row.result.domain })}</span>{/if}
          {#if hasMixedLookalikeScripts(row.result.domain)}<span class="detail-note">{t('idn.mixed')}</span>{/if}
          {#if minimum > 1}<span class="detail-note">{t('price.minTerm', { n: minimum })}</span>{/if}
          {#if policyRu}<a href="https://cctld.ru/help/faq/" target="_blank" rel="noopener noreferrer" class="detail-buy">{t('policy.ru')}</a>{/if}
          {#if row.result.note}<span class="detail-note" data-testid={`results-row-reason-${sid}`}>{noteKey ? t(noteKey) : row.result.note}</span>{/if}
        </div>
      </div>
      <div class="detail-layout">
        <section class="detail-panel detail-registrars-col" aria-label={t('results.detail.registrars')}>
          <div class="panel-heading">
            <div><h3>{t('results.detail.registrars')}</h3><p>{t('tooltip.registrars')}</p></div>
          </div>
          {#if quotes.length >= 1}
            <div class="detail-registrars" data-testid={`results-row-registrars-${sid}`}>
              <div class="quote-head" aria-hidden="true"><span>{t('card.registrar')}</span><span>{t('results.col.price')}</span><span>{t('price.renewal')}</span><span></span></div>
              {#each quotes as quote (quote.id)}
                <div class="quote-row">
                  <div class="quote-name"><strong>{quote.name}</strong>{#if row.best?.registrarId === quote.id && quote.reg != null}<span class="quote-best">{t('prices.legend.dot')}</span>{/if}{#if $pricing?.table.sourcePromotions?.[quote.id]?.includes(row.result.tld)}<span class="chip-tag promo">{t('price.promo')}</span>{/if}</div>
                  <div class="quote-price nums"><span class="quote-price-label">{t('results.col.price')}</span><strong>{formatSourcePrice($pricing?.table ?? null, row.result.tld, quote.id, 'reg', quote.reg, s)}</strong>{#if quote.reg != null}<span>{priceSourceLabel($pricing?.table ?? null, row.result.tld, quote.id, 'reg')}</span>{/if}</div>
                  <div class="quote-price nums"><span class="quote-price-label">{t('price.renewal')}</span><strong>{formatSourcePrice($pricing?.table ?? null, row.result.tld, quote.id, 'renew', quote.renew, s)}</strong>{#if quote.renew != null}<span>{priceSourceLabel($pricing?.table ?? null, row.result.tld, quote.id, 'renew')}</span>{/if}{#if quote.id === 'timeweb' && $pricing?.table.timewebRenewalFromRub?.[row.result.tld] != null}<span>{t('prices.timeweb.renewFrom', { price: `${$pricing.table.timewebRenewalFromRub[row.result.tld]} ₽` })}</span>{/if}</div>
                  <a class="quote-open" href={quote.url} target="_blank" rel="noopener noreferrer" title={quote.hasDeepLink ? undefined : t('registrar.noDeeplink', { registrar: quote.name })} aria-label={quote.hasDeepLink ? t('results.domain.aria', { domain: row.result.domain, registrar: quote.name }) : t('registrar.noDeeplink', { registrar: quote.name })} data-testid={`results-row-registrar-${sid}-${quote.id}`}>{t(quote.hasDeepLink ? 'detail.open' : 'detail.website')} <span aria-hidden="true">↗</span></a>
                  {#if conditionSellers.includes(quote.id)}<details class="quote-conditions"><summary>{t('detail.conditions')}</summary><span>{t(`prices.${quote.id}.caveat`)}</span></details>{/if}
                </div>
              {/each}
              {#if quotes.some(q => !q.hasDeepLink)}<p class="quote-notice">{t('detail.websiteHint')}</p>{/if}
            </div>
          {:else if detail?.premium || detail?.likely}
            <p class="detail-note">{t('price.disclaimer')}</p>
          {:else}
            <p class="detail-muted">{t('detail.noQuotes')}</p>
          {/if}
          {#if row.isPremiumOverride}<span class="chip-tag premium">{t('results.detail.premium', { price: '—' })}</span>{/if}
        </section>
        <section class="detail-panel detail-checks" aria-label={t('adv.heading')}>
          <div class="panel-heading"><div><h3>{t('adv.heading')}</h3><p>{t('adv.hint')}</p></div></div>
          <div class="detail-buttons">
            <button class="detail-check" type="button" disabled={advisoryLoading} onclick={() => void lookup('dotsweep')} data-testid={`results-row-dotsweep-${sid}`}>{t('adv.dotsweep')}</button>
            <button class="detail-check" type="button" disabled={advisoryLoading} onclick={() => void lookup('whodat')} data-testid={`results-row-whodat-${sid}`}>{t('adv.whodat')}</button>
            {#if isRu}<button class="detail-check" type="button" disabled={advisoryLoading} onclick={() => void lookup('cctld')} data-testid={`results-row-cctld-${sid}`}>{t('adv.cctld')}</button>{/if}
            <button class="detail-check" type="button" disabled={detail?.loading ?? false} onclick={() => void checkDetail(row.result.domain)} title={t('results.detail.dig.hint')} data-testid={`results-row-dig-check-${sid}`}>{t('results.detail.dig.check')}</button>
          </div>
        {#if advisoryLoading}<span class="detail-muted">{t('adv.loading')}</span>
        {:else if advisoryFailed}<span class="detail-muted" role="status">{t('adv.failed')}</span>
        {:else if advisory}
          <div class="detail-extra" role="status" data-testid={`results-row-advisory-${sid}`}>
            <span>{advisory.verdict === 'registered' ? t('adv.registered') : advisory.verdict === 'not_found' ? t('adv.notfound') : t('adv.unknown')}</span>
            <span>{t('adv.source', { source: `${advisory.provider} / ${advisory.source}${advisory.confidence ? ` / ${advisory.confidence}` : ''}` })}</span>
            <span>{t('adv.requested', { date: new Date(advisory.requestedAt).toLocaleString($locale) })}</span>
            <span>{advisory.dataAt ? t('adv.dataTime', { date: new Date(advisory.dataAt).toLocaleString($locale) }) : t('adv.dataUnknown')}</span>
            {#if advisory.cached}<span>{t('adv.cache')}</span>{/if}
            {#if advisory.card?.expiresAt}<span>{t('card.expires')}: {fmtDate(advisory.card.expiresAt)}</span>{/if}
            {#if advisory.card?.statuses.length}<StatusDetails statuses={advisory.card.statuses} />{/if}
            {#if advisory.card?.freeDate}<span>{t('card.freeDate')}: {fmtDate(advisory.card.freeDate)}</span>{/if}
            {#if advisory.card}<span>{t('card.dateHint')}</span><a href="https://www.icann.org/resources/pages/epp-status-codes-2014-06-16-en" target="_blank" rel="noopener noreferrer">{t('card.statusHelp')}</a>{/if}
          </div>
        {/if}
        {#if detail?.loading}
          <div class="detail-shimmer" aria-hidden="true"><span class="shimmer-bar"></span></div>
        {:else if detail?.failed}
            <span class="detail-muted">{t('results.detail.failed')}</span>
        {:else if detail}
            <div class="detail-extra">
              {#if detail.availability}
                <span class="detail-muted" data-testid={`results-row-dig-availability-${sid}`}>
                  {detail.availability === 'available' ? t('results.detail.dig.available') : detail.availability === 'unavailable' ? t('results.detail.dig.unavailable') : t('results.detail.dig.unknown')}
                </span>
              {/if}
              {#if detail.registrar && !detail.premium && !detail.likely}
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
              {#if detail.url && !detail.premium && !detail.likely}
                <a class="detail-buy" href={detail.url} target="_blank" rel="noopener noreferrer" data-testid={`results-row-detail-buy-${sid}`}>
                  {t('results.detail.buy')}
                </a>
              {/if}
            </div>
        {/if}
        <span class="detail-trademark">
          <a href={usptoSearchUrl(tmLabel)} target="_blank" rel="noopener noreferrer" title={t('results.detail.tm.hint')} data-testid={`results-row-tm-uspto-${sid}`}>{t('results.detail.tm.uspto')}</a>
          <a href={tmviewSearchUrl(tmLabel)} target="_blank" rel="noopener noreferrer" title={t('results.detail.tm.hint')} data-testid={`results-row-tm-tmview-${sid}`}>{t('results.detail.tm.tmview')}</a>
        </span>
        </section>
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
            {#if card.freeDate != null}
              <div class="detail-cell"><span class="card-k">{t('card.freeDate')}</span><span class="detail-value nums">{fmtDate(card.freeDate)}</span></div>
            {/if}
            {#if card.changedAt != null}
              <div class="detail-cell">
                <span class="card-k">{t('card.changed')}</span>
                <span class="detail-value nums">{fmtDate(card.changedAt)}</span>
              </div>
            {/if}
          </div>
          <span class="detail-muted">{t('card.dateHint')}</span>
          <a href="https://www.icann.org/resources/pages/epp-status-codes-2014-06-16-en" target="_blank" rel="noopener noreferrer" class="detail-buy">{t('card.statusHelp')}</a>
          {#if card.statuses.length > 0}
            <StatusDetails statuses={card.statuses} />
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
  .detail-row td { padding: 0; background: transparent; }
  .detail-band { padding: 18px; background: var(--bg-sunken); box-shadow: inset 3px 0 var(--border-strong); color: var(--text); font-size: 13px; }
  .detail-row.is-available .detail-band { box-shadow: inset 3px 0 var(--green-solid); }
  .detail-row.is-error .detail-band { box-shadow: inset 3px 0 var(--red); }
  .detail-summary { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(120px, 1fr) minmax(200px, 2fr); gap: 20px; padding: 0 2px 16px; }
  .detail-cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .detail-label, .card-k { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .04em; }
  .detail-value { color: var(--text); font-size: 17px; font-weight: 650; }
  .detail-muted, .detail-note { color: var(--text-secondary); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .detail-note { color: var(--amber); }
  .detail-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(240px, 1fr); align-items: start; gap: 14px; }
  .detail-panel, .detail-card { min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-elevated); }
  .panel-heading { margin-bottom: 14px; }
  .panel-heading h3 { margin: 0; font-size: 14px; line-height: 1.4; font-weight: 650; color: var(--text); }
  .panel-heading p { margin: 4px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.45; }
  .quote-head, .quote-row { display: grid; grid-template-columns: minmax(110px, 1.2fr) minmax(85px, 1fr) minmax(85px, 1fr) auto; gap: 8px; align-items: start; }
  .quote-head { padding: 0 0 8px; color: var(--text-secondary); font-size: 11px; font-weight: 600; }
  .quote-row { padding: 10px 0; border-top: 1px solid var(--border); }
  .quote-conditions { grid-column: 1 / -1; color: var(--text-secondary); font-size: 11px; line-height: 1.45; }
  .quote-conditions summary { color: var(--accent-text); cursor: pointer; }
  .quote-notice { color: var(--text-secondary); font-size: 11px; line-height: 1.4; margin: 8px 0 0; }
  .quote-name, .quote-price { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
  .quote-name strong, .quote-price strong { font-size: 13px; color: var(--text); }
  .quote-price span { color: var(--text-secondary); font-size: 11px; line-height: 1.35; }
  .quote-price .quote-price-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .quote-best { width: fit-content; padding: 2px 6px; border-radius: var(--radius-full); color: var(--green); background: var(--green-soft); font-size: 10px; font-weight: 600; }
  .quote-open, .detail-buy { color: var(--accent-text); font-weight: 600; text-decoration: none; }
  .quote-open { padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); white-space: nowrap; }
  .quote-open:hover, .detail-check:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--accent); }
  .quote-open:focus-visible, .detail-check:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .detail-checks { display: flex; flex-direction: column; gap: 12px; }
  .detail-checks .panel-heading { margin-bottom: 0; }
  .detail-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
  .detail-check { min-height: 40px; padding: 7px 10px; color: var(--text); background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font: inherit; font-weight: 500; cursor: pointer; }
  .detail-check:disabled { opacity: .6; cursor: wait; }
  .detail-extra { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 10px; background: var(--bg-sunken); border-radius: var(--radius-sm); overflow-wrap: anywhere; }
  .detail-cheap { color: var(--text-secondary); }
  .detail-trademark { display: flex; gap: 12px; padding-top: 4px; border-top: 1px solid var(--border); }
  .detail-trademark a { color: var(--accent-text); }
  .detail-card { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .card-grid .detail-value { font-size: 13px; }
  .card-ns { display: flex; flex-wrap: wrap; gap: 8px; color: var(--text-secondary); }
  .detail-shimmer { width: 100%; }
  .shimmer-bar { display: block; height: 12px; background: var(--border); border-radius: var(--radius-sm); }
  @media (max-width: 1000px) { .detail-layout { grid-template-columns: 1fr; } }
  @media (max-width: 700px) {
    tr.detail-row, tr.detail-row td { display: block; }
    .detail-band { padding: 14px; }
    .detail-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .detail-observation { grid-column: 1 / -1; }
    .quote-head { display: none; }
    .quote-row { grid-template-columns: minmax(0, 1fr) minmax(80px, 1fr); gap: 8px; }
    .quote-name { grid-column: 1; }
    .quote-open { grid-column: 2; grid-row: 1; justify-self: end; }
    .quote-price .quote-price-label { position: static; width: auto; height: auto; clip-path: none; }
  }
</style>
