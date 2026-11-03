/**
 * Explicit DigMyName advisory checks (SPEC §9): per-domain button and
 * the bulk premium-flag toolbar action. Store-based composable —
 * state survives ResultsTable remounts (tab switches) by design, mirroring
 * the watchlist module pattern.
 */
import { get, writable } from 'svelte/store';
import type { CheckResult, PricingTable } from '../types';
import { results, pricing, runState } from './store';
import { put as putCache } from '../core/cache';
import { bestEntry, pricingZoneFor } from '../pricing/pricing';
import { fetchPremiumDetail, type DigDetail } from './dig';

export const detailFor = writable<string | null>(null);
export const details = writable<Record<string, DigDetail>>({});
/** Legacy store retained for callers; DigMyName never supplies a price override. */
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
    if (r.status !== 'available') continue;
    if (overrides[r.domain] != null) continue;
    const d = detailsMap[r.domain];
    if (d && !d.failed && d.checkedAt && Date.now() - d.checkedAt < 300_000 && d.checkedAt >= r.checkedAt) continue;
    const best = table ? bestEntry(table, pricingZoneFor(r.domain, table, r.tld)) : null;
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
}

/** Explicit user action: sends only this domain to the existing DigMyName API. */
export async function checkDetail(domain: string): Promise<void> {
  if (get(details)[domain]?.loading) return;
  details.update((m) => ({
    ...m,
    [domain]: { price: null, registrar: null, regPrice: null, url: null, ...m[domain], loading: true },
  }));
  const requestedAt = Date.now();
  const detail = await fetchPremiumDetail(domain);
  applyDetail(domain, detail, requestedAt);
}

/** Store a fetched detail and downgrade a conflicting result. */
function applyDetail(domain: string, detail: DigDetail, requestedAt: number): void {
  // A conflicting third-party response is not proof of registration, but it
  // invalidates our free signal. Never overwrite a newer recheck.
  if (detail.availability === 'unavailable') {
    let downgraded = false;
    results.update((map) => {
      const current = map.get(domain);
      if (!current || current.status !== 'available' || current.checkedAt > requestedAt) return map;
      downgraded = true;
      const updated: CheckResult = { ...current, status: 'unknown', note: 'DigMyName conflicts with RDAP; verify at registrar' };
      putCache(domain, { status: updated.status, source: updated.source, ts: Date.now(), tld: updated.tld });
      const next = new Map(map);
      next.set(domain, updated);
      return next;
    });
    if (downgraded) runState.update((state) => state.phase === 'done' ? { ...state, available: Math.max(0, state.available - 1) } : state);
  }
  if ((get(results).get(domain)?.checkedAt ?? 0) <= requestedAt) {
    details.update((m) => {
      const previous = m[domain];
      // A failed retry is not evidence that a previously reported premium flag disappeared.
      const retained = detail.failed && previous && (previous.premium || previous.likely)
        ? { premium: previous.premium, likely: previous.likely, checkedAt: previous.checkedAt }
        : { checkedAt: Date.now() };
      return { ...m, [domain]: { ...detail, ...retained } };
    });
  }
}

/**
 * Bulk-fetch premium data for the cheapest eligible domains (capped).
 * Concurrency 2; the response is an advisory flag, not a price quote.
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
      const requestedAt = Date.now();
      let detail: DigDetail;
      try {
        detail = await fetcher(target.domain);
      } catch {
        detail = { failed: true, price: null, registrar: null, regPrice: null, url: null };
      }
      applyDetail(target.domain, detail, requestedAt);
      if (detail.premium || detail.likely) premiumFound.update((n) => n + 1);
      premiumDone.update((n) => n + 1);
    }
  };
  try {
    await Promise.all([worker(), worker()]);
  } finally {
    premiumChecking.set(false);
  }
}

/** Premium flags invalidate standard quotes in downloads too. */
export function premiumDomainsForExport(currentResults: Map<string, CheckResult>): Set<string> {
  const found = new Set<string>();
  const currentDetails = get(details);
  for (const [domain, result] of currentResults) {
    const detail = currentDetails[domain];
    if (detail && detail.checkedAt && detail.checkedAt >= result.checkedAt && Date.now() - detail.checkedAt < 300_000 &&
        (detail.premium || detail.likely)) found.add(domain);
  }
  return found;
}
