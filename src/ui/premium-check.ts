/**
 * On-demand DigMyName premium checks (SPEC §9): per-domain detail rows and
 * the bulk "check premium prices" toolbar action. Store-based composable —
 * state survives ResultsTable remounts (tab switches) by design, mirroring
 * the watchlist module pattern.
 */
import { get, writable } from 'svelte/store';
import type { CheckResult, PricingTable } from '../types';
import { results, pricing, runState } from './store';
import { bestEntry } from '../pricing/pricing';
import { fetchPremiumDetail, isPremiumPriced, premiumOverrideCents, type DigDetail } from './dig';

export const detailFor = writable<string | null>(null);
export const details = writable<Record<string, DigDetail>>({});
/** Per-domain premium price override (USD cents) from the on-demand check. */
export const premiumOverrides = writable<Record<string, number>>({});
export const premiumChecking = writable(false);
export const premiumDone = writable(0);
export const premiumTotal = writable(0);
export const premiumFound = writable(0);

/** DigMyName is on-demand and rate-limited client-side; 20 keeps it polite. */
export const PREMIUM_CHECK_CAP = 20;

/** Available rows not yet premium-checked, sorted by cheapest price asc. */
export function premiumCheckEligibleOf(
  resultsMap: Map<string, CheckResult>,
  table: PricingTable | null,
  detailsMap: Record<string, DigDetail>,
  overrides: Record<string, number>,
): { domain: string; firstYear: number | null }[] {
  const list: { domain: string; firstYear: number | null }[] = [];
  for (const r of resultsMap.values()) {
    if (r.status !== 'available' && r.status !== 'probably_available') continue;
    if (overrides[r.domain] != null) continue;
    const d = detailsMap[r.domain];
    if (d && !d.failed) continue;
    const best = table ? bestEntry(table, r.tld) : null;
    list.push({ domain: r.domain, firstYear: best?.entry.reg ?? null });
  }
  list.sort((a, b) => (a.firstYear ?? Infinity) - (b.firstYear ?? Infinity));
  return list;
}

export async function toggleDetail(
  domain: string,
  onExpand?: () => void,
): Promise<void> {
  if (get(detailFor) === domain) {
    detailFor.set(null);
    return;
  }
  detailFor.set(domain);
  onExpand?.();
  const cached = get(details)[domain];
  if (cached && !cached.failed) return;
  details.update((m) => ({
    ...m,
    [domain]: { loading: true, price: null, registrar: null, regPrice: null, url: null },
  }));
  const detail = await fetchPremiumDetail(domain);
  applyDetail(domain, detail);
}

/** Store a fetched detail; register its premium override when priced. */
function applyDetail(domain: string, detail: DigDetail): void {
  if (isPremiumPriced(detail)) {
    const override = premiumOverrideCents(detail);
    if (override != null) {
      premiumOverrides.update((m) => ({ ...m, [domain]: override }));
    }
  }
  details.update((m) => ({ ...m, [domain]: detail }));
}

/**
 * Bulk-fetch premium data for the cheapest eligible domains (capped).
 * Concurrency 2 — polite to DigMyName. Premium prices land in
 * premiumOverrides so price cells show the real price + strike + chip.
 */
export async function runPremiumCheck(
  fetcher: (domain: string) => Promise<DigDetail> = fetchPremiumDetail,
): Promise<void> {
  const eligible = premiumCheckEligibleOf(
    get(results),
    get(pricing)?.table ?? null,
    get(details),
    get(premiumOverrides),
  );
  if (get(runState).phase !== 'done' || get(premiumChecking) || eligible.length === 0) return;
  const targets = eligible.slice(0, PREMIUM_CHECK_CAP);
  premiumChecking.set(true);
  premiumDone.set(0);
  premiumTotal.set(targets.length);
  premiumFound.set(0);

  let idx = 0;
  const worker = async (): Promise<void> => {
    while (idx < targets.length) {
      const i = idx++;
      const target = targets[i];
      if (!target) break;
      const detail = await fetcher(target.domain);
      applyDetail(target.domain, detail);
      if (isPremiumPriced(detail)) {
        const override = premiumOverrideCents(detail);
        if (override != null) premiumFound.update((n) => n + 1);
      }
      premiumDone.update((n) => n + 1);
    }
  };
  await Promise.all([worker(), worker()]);

  premiumChecking.set(false);
}
