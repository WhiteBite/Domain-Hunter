import type { PriceEntry, PricingTable } from '../src/types';
import { fetchJsonWithTimeout } from './data';

const DYNADOT_TLD_PRICE_URL = 'https://api.dynadot.com/api3.json?tld_price&key=';

function toCents(v: unknown): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Defensive normalizer for the Dynadot `tld_price` API3 response
 * (`{Status:'success', TldPrice:[{Name, USD:{register, renew, transfer}}]}`,
 * prices as USD strings). Malformed items are skipped, unparseable prices
 * become null — never throws on shape violations.
 */
export function normalizeDynadotTldPrice(json: unknown): Record<string, PriceEntry> {
  if (json == null || typeof json !== 'object') return {};
  const root = json as { Status?: unknown; TldPrice?: unknown };
  if (root.Status !== 'success' || !Array.isArray(root.TldPrice)) return {};
  const out: Record<string, PriceEntry> = {};
  for (const item of root.TldPrice) {
    if (item == null || typeof item !== 'object') continue;
    const rec = item as { Name?: unknown; USD?: unknown };
    if (typeof rec.Name !== 'string' || rec.Name.trim() === '') continue;
    const usd = (rec.USD != null && typeof rec.USD === 'object' ? rec.USD : {}) as Record<
      string,
      unknown
    >;
    const tld = rec.Name.trim().toLowerCase().replace(/^\./, '');
    out[tld] = {
      reg: toCents(usd.register),
      renew: toCents(usd.renew),
      transfer: toCents(usd.transfer),
    };
  }
  return out;
}

/** Fetch + normalize; throws on HTTP errors or a non-success API status. */
export async function fetchDynadotTldPrices(
  apiKey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Record<string, PriceEntry>> {
  const json = await fetchJsonWithTimeout(
    DYNADOT_TLD_PRICE_URL + encodeURIComponent(apiKey),
    fetchImpl,
  );
  const status = (json as { Status?: unknown } | null)?.Status;
  if (status !== 'success') {
    throw new Error(`dynadot API returned Status=${String(status ?? 'n/a')}`);
  }
  return normalizeDynadotTldPrice(json);
}

/**
 * Layer dynadot entries over existing curated TLDs only (zones are data, not
 * code — unknown TLDs from the registrar feed are ignored). Immutable.
 */
export function mergeDynadotIntoTable(
  table: PricingTable,
  prices: Record<string, PriceEntry>,
): PricingTable {
  const tlds = { ...table.tlds };
  let merged = 0;
  for (const [tld, entry] of Object.entries(prices)) {
    const existing = tlds[tld];
    if (!existing) continue;
    tlds[tld] = { ...existing, dynadot: entry };
    merged += 1;
  }
  const sources =
    merged > 0 && !table.sources.includes('dynadot')
      ? [...table.sources, 'dynadot']
      : table.sources;
  return { ...table, tlds, sources };
}
