/**
 * Registrar quote helpers (SPEC §9): pure functions over the pricing table
 * and the registrar config — the buy-link layer of the results table and
 * detail rows. No store access, no side effects.
 */
import type { PriceEntry, PricingTable, RegistrarConfig } from '../types';
import { applyAffiliate } from './affiliate';

export interface RegistrarQuote {
  id: string;
  name: string;
  reg: number;
  renew: number | null;
  url: string;
  hasDeepLink: boolean;
}

/** Cheapest {domain}-deep-link registrar, landing-only fallback; returns an always-present object with nullable fields. */
export function pickRegistrar(
  registrars: RegistrarConfig[],
  table: PricingTable | null,
  tld: string,
): { registrar: RegistrarConfig | null; entry: PriceEntry | null } {
  if (!table) return { registrar: null, entry: null };
  const entries = table.tlds[tld];
  if (!entries) return { registrar: null, entry: null };
  let best: { registrar: RegistrarConfig; entry: PriceEntry } | null = null;
  let fallback: { registrar: RegistrarConfig; entry: PriceEntry } | null = null;
  for (const r of registrars) {
    const e = entries[r.id];
    if (!e || e.reg == null) continue;
    const hasDeepLink = r.searchUrl.includes('{domain}');
    const candidate = { registrar: r, entry: e };
    if (hasDeepLink) {
      if (!best || (e.reg ?? Infinity) < (best.entry.reg ?? Infinity)) best = candidate;
    } else {
      if (!fallback || (e.reg ?? Infinity) < (fallback.entry.reg ?? Infinity)) fallback = candidate;
    }
  }
  return best ?? fallback ?? { registrar: null, entry: null };
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
    if (!e || e.reg == null) continue;
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
  list.sort((a, b) => a.reg - b.reg || (a.renew ?? Infinity) - (b.renew ?? Infinity));
  return list;
}
