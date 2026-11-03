/**
 * DigMyName per-domain detail fetch + parse.
 *
 * Extracted from ResultsTable.toggleDetail so both the on-demand detail row
 * and the bulk "check premium prices" toolbar action share one code path.
 *
 * DigMyName is allowlisted (SPEC §7/§17): no auth, rate-limited client-side to on-demand clicks. Browser CORS
 * support depends on the third-party service. The 8s timeout matches the original
 * per-row fetch.
 */

/** Parsed DigMyName response for a single domain. */
export interface DigDetail {
  loading?: boolean;
  failed?: boolean;
  premium?: boolean;
  likely?: boolean;
  /** Third-party indication, not a registrar confirmation. */
  availability?: 'available' | 'unavailable' | 'unknown';
  checkedAt?: number;
  /** Standard-tier API price; not a premium offer and never a price override. */
  price: number | null;
  registrar: string | null;
  /** Cheapest registrar's registration price in USD (not cents). */
  regPrice: number | null;
  url: string | null;
}

const DIG_TIMEOUT_MS = 8000;
// Limit all on-demand requests, not just each individual bulk action.
const requestTimes: number[] = [];
const DIG_REQUEST_CAP = 50;
const DIG_WINDOW_MS = 60_000;
const DIG_ENDPOINT =
  'https://api.digmyname.com/functions/v1/public-api/check?domain=';

/**
 * Fetch and parse the DigMyName premium/registrar detail for a domain.
 * Never throws — returns `{ failed: true, ... }` on network/parse error so
 * callers can store it directly into a detail cache.
 */
export async function fetchPremiumDetail(domain: string): Promise<DigDetail> {
  try {
    const now = Date.now();
    while (requestTimes.length && (requestTimes[0] ?? now) <= now - DIG_WINDOW_MS) requestTimes.shift();
    if (requestTimes.length >= DIG_REQUEST_CAP) throw new Error('DigMyName rate limit');
    requestTimes.push(now);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DIG_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${DIG_ENDPOINT}${encodeURIComponent(domain)}`, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { result?: Record<string, unknown> };
    const r = json.result;
    if (!r || typeof r.domain !== 'string' || r.domain.toLowerCase().replace(/\.$/, '') !== domain.toLowerCase().replace(/\.$/, '')) throw new Error('invalid result');
    const cheapest = (r.cheapest_registrar ?? null) as Record<string, unknown> | null;
    const priceUsd = typeof r.price_usd === 'number' ? r.price_usd : null;
    return {
      availability: r.uncertain === false && typeof r.available === 'boolean' ? (r.available ? 'available' : 'unavailable') : 'unknown',
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
