import type { PriceEntry, PricingTable } from '../src/types';
import { toAscii } from '../src/core/idn';
import { fetchJsonWithTimeout } from './data';

// Dynadot's documented legacy API. It is scheduled for retirement; the newer
// REST API has a different contract and must not be silently substituted here.
const DYNADOT_TLD_PRICE_URL = 'https://api.dynadot.com/api3.json?command=tld_price&currency=USD&key=';

type DynadotResponse = { Status?: unknown; ResponseCode?: unknown; Currency?: unknown; TldPrice?: unknown };

function response(json: unknown): DynadotResponse | null {
  if (!json || typeof json !== 'object') return null;
  const value = (json as { TldPriceResponse?: unknown }).TldPriceResponse;
  return value && typeof value === 'object' ? value as DynadotResponse : null;
}

function toCents(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const text = v.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text.replace(/,/g, ''));
  const cents = Math.round(n * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Only documented USD one-year entries; malformed and ambiguous prices are never guessed. */
export function normalizeDynadotTldPrice(json: unknown): Record<string, PriceEntry> {
  const root = response(json);
  if (!root || root.Status !== 'success' || root.Currency !== 'USD' ||
      (root.ResponseCode !== undefined && String(root.ResponseCode) !== '0') || !Array.isArray(root.TldPrice)) return {};
  const out: Record<string, PriceEntry> = {};
  const seen = new Set<string>();
  for (const item of root.TldPrice) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { Tld?: unknown; Price?: unknown; minDuration?: unknown };
    if (typeof rec.Tld !== 'string') continue;
    const tld = rec.Tld.trim().toLowerCase().replace(/^\./, '');
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(tld)) continue;
    if (seen.has(tld)) { delete out[tld]; continue; }
    seen.add(tld);
    if (!rec.Price || typeof rec.Price !== 'object') continue;
    const price = rec.Price as Record<string, unknown>;
    if (price.Unit !== '(Price/1 year)') continue;
    const min = rec.minDuration;
    // Do not present a per-year quote as a one-year registration if the
    // minimum duration is unknown or greater than one year.
    const reg = min === 1 || min === '1' ? toCents(price.Register) : null;
    const renew = toCents(price.Renew);
    const transfer = toCents(price.Transfer);
    if (reg != null || renew != null || transfer != null) out[tld] = { reg, renew, transfer };
  }
  return out;
}

/** Fetch one documented API response; HTTP and API errors never expose the key. */
export async function fetchDynadotTldPrices(
  apiKey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Record<string, PriceEntry>> {
  let json: unknown;
  try {
    json = await fetchJsonWithTimeout(DYNADOT_TLD_PRICE_URL + encodeURIComponent(apiKey), fetchImpl);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    throw new Error(/^HTTP \d{3}$/.test(message) ? message : 'dynadot request failed');
  }
  const root = response(json);
  if (!root || root.Status !== 'success' || (root.ResponseCode !== undefined && String(root.ResponseCode) !== '0')) {
    throw new Error('dynadot API returned an unsuccessful response');
  }
  if (root.Currency !== 'USD' || !Array.isArray(root.TldPrice)) throw new Error('dynadot API returned an invalid USD price list');
  return normalizeDynadotTldPrice(json);
}

/**
 * Layer dynadot entries over existing curated TLDs only (zones are data, not
 * code — unknown TLDs from the registrar feed are ignored). Immutable.
 */
export function mergePriceSourceIntoTable(
  table: PricingTable,
  prices: Record<string, PriceEntry>,
  sourceId: string,
): PricingTable {
  const tlds = { ...table.tlds };
  let merged = 0;
  for (const [tld, entry] of Object.entries(prices)) {
    const existing = tlds[tld];
    if (!existing) continue;
    tlds[tld] = { ...existing, [sourceId]: entry };
    merged += 1;
  }
  // Keep Unicode aliases in sync with their canonical ASCII zone.
  for (const zone of Object.keys(tlds)) {
    const canonical = toAscii(zone);
    if (canonical !== zone && prices[canonical] && tlds[canonical]) tlds[zone] = tlds[canonical]!;
  }
  const sources =
    merged > 0 && !table.sources.includes(sourceId)
      ? [...table.sources, sourceId]
      : table.sources;
  return { ...table, tlds, sources };
}

/** Backwards-compatible CLI helper. */
export function mergeDynadotIntoTable(table: PricingTable, prices: Record<string, PriceEntry>): PricingTable {
  return mergePriceSourceIntoTable(table, prices, 'dynadot');
}
