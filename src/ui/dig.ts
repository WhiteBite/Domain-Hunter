/**
 * DigMyName per-domain detail fetch + parse.
 *
 * Extracted from ResultsTable.toggleDetail so both the on-demand detail row
 * and the bulk "check premium prices" toolbar action share one code path.
 *
 * DigMyName is allowlisted (SPEC §7/§17): no auth, CORS `*`, rate-limited
 * client-side to on-demand clicks. The 8s timeout matches the original
 * per-row fetch.
 */

/** Parsed DigMyName response for a single domain. */
export interface DigDetail {
  loading?: boolean;
  failed?: boolean;
  premium?: boolean;
  likely?: boolean;
  /** Registry premium price in USD (not cents). null when not reported. */
  price: number | null;
  registrar: string | null;
  /** Cheapest registrar's registration price in USD (not cents). */
  regPrice: number | null;
  url: string | null;
}

const DIG_TIMEOUT_MS = 8000;
const DIG_ENDPOINT =
  'https://api.digmyname.com/functions/v1/public-api/check?domain=';

/**
 * Fetch and parse the DigMyName premium/registrar detail for a domain.
 * Never throws — returns `{ failed: true, ... }` on network/parse error so
 * callers can store it directly into a detail cache.
 */
export async function fetchPremiumDetail(domain: string): Promise<DigDetail> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DIG_TIMEOUT_MS);
    const res = await fetch(
      `${DIG_ENDPOINT}${encodeURIComponent(domain)}`,
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { result?: Record<string, unknown> };
    const r = json.result;
    if (!r) throw new Error('no result');
    const cheapest = (r.cheapest_registrar ?? null) as Record<string, unknown> | null;
    const priceUsd = typeof r.price_usd === 'number' ? r.price_usd : null;
    return {
      premium: r.premium === true,
      likely: r.likely_premium === true,
      price: priceUsd,
      registrar: cheapest && typeof cheapest.name === 'string' ? cheapest.name : null,
      regPrice:
        cheapest && typeof cheapest.reg_price_usd === 'number'
          ? cheapest.reg_price_usd
          : null,
      url:
        typeof r.buy_url === 'string' && r.buy_url.startsWith('https://')
          ? r.buy_url
          : null,
    };
  } catch {
    return { failed: true, price: null, registrar: null, regPrice: null, url: null };
  }
}

/** True when a parsed detail indicates a premium domain with a numeric price. */
export function isPremiumPriced(d: DigDetail): boolean {
  return (d.premium === true || d.likely === true) && typeof d.price === 'number';
}

/** Convert a DigDetail.price (USD) to the cents override used by the price cell. */
export function premiumOverrideCents(d: DigDetail): number | null {
  return typeof d.price === 'number' ? Math.round(d.price * 100) : null;
}
