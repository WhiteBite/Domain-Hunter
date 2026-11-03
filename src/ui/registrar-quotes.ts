/**
 * Registrar quote helpers (SPEC §9): pure functions over the pricing table
 * and the registrar config — the buy-link layer of the results table and
 * detail rows. No store access, no side effects.
 */
import type { PriceEntry, PricingTable, RegistrarConfig } from '../types';
import { applyAffiliate } from './affiliate';
import { bestEntry } from '../pricing/pricing';

export interface RegistrarQuote {
  id: string;
  name: string;
  reg: number | null;
  renew: number | null;
  url: string;
  hasDeepLink: boolean;
}

/** Link to the same registrar as the displayed minimum, or no link if unavailable. */
export function pickRegistrar(
  registrars: RegistrarConfig[],
  table: PricingTable | null,
  tld: string,
): { registrar: RegistrarConfig | null; entry: PriceEntry | null } {
  if (!table) return { registrar: null, entry: null };
  const entries = table.tlds[tld];
  if (!entries) return { registrar: null, entry: null };
  const best = bestEntry(table, tld);
  if (!best) return { registrar: null, entry: null };
  const registrar = registrars.find((r) => r.id === best.registrarId) ?? null;
  return { registrar, entry: registrar ? best.entry : null };
}

/**
 * Known-registrar quotes for a zone, sorted by registration price asc
 * (renewal as tie-breaker). Each quote carries a buy/search link (deep link
 * when the template supports '{domain}', landing page otherwise) and a
 * hasDeepLink flag for the no-deeplink tooltip.
 */
export function buildRegistrarQuotes(
  registrars: RegistrarConfig[],
  table: PricingTable | null,
  tld: string,
  domain: string,
): RegistrarQuote[] {
  if (!table) return [];
  const entries = table.tlds[tld];
  if (!entries) return [];
  const list: RegistrarQuote[] = [];
  for (const r of registrars) {
    const e = entries[r.id];
    if (!e) continue;
    const hasDeepLink = r.searchUrl.includes('{domain}');
    list.push({
      id: r.id,
      name: r.name,
      reg: e.reg,
      renew: e.renew,
      hasDeepLink,
      url: applyAffiliate(
        r,
        hasDeepLink
          ? r.searchUrl.replace('{domain}', encodeURIComponent(domain))
          : r.searchUrl,
      ),
    });
  }
  list.sort((a, b) => (a.reg ?? Infinity) - (b.reg ?? Infinity) || (a.renew ?? Infinity) - (b.renew ?? Infinity));
  return list;
}
