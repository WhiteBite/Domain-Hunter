/**
 * Bulk actions over available results (SPEC §11): copy/favorite/CSV of the
 * available list, plus the copy-flash UI state. Store-based composable —
 * same pattern as watchlist.ts.
 */
import { get, writable } from 'svelte/store';
import type { CheckResult } from '../types';
import { pricing, results, settings } from './store';
import { favorites } from './favorites';
import { copyText } from './clipboard';
import { resultsToCsvRows, buildCsv, downloadCsv } from './csv';
import { t } from '../i18n';

/** Domain names of available/probably_available results, sorted A–Z. */
export function availableDomainsOf(resultsMap: Map<string, CheckResult>): string[] {
  const list: string[] = [];
  for (const r of resultsMap.values()) {
    if (r.status === 'available' || r.status === 'probably_available') list.push(r.domain);
  }
  list.sort((a, b) => a.localeCompare(b));
  return list;
}

/** Domains whose copy flash is active (RowMenu "copied" prop). */
export const copied = writable<Set<string>>(new Set());

export async function copyDomainFlash(domain: string): Promise<void> {
  const ok = await copyText(domain);
  if (!ok) return;
  copied.update((s) => new Set([...s, domain]));
  setTimeout(() => {
    copied.update((s) => {
      const next = new Set(s);
      next.delete(domain);
      return next;
    });
  }, 1500);
}

/** Available-menu copied-flash state. */
export const availCopied = writable(false);
let availCopiedTimer: ReturnType<typeof setTimeout> | undefined;

function flashAvailCopied(): void {
  availCopied.set(true);
  if (availCopiedTimer != null) clearTimeout(availCopiedTimer);
  availCopiedTimer = setTimeout(() => {
    availCopied.set(false);
  }, 1500);
}

export async function copyAvailableList(): Promise<void> {
  await copyText(availableDomainsOf(get(results)).join('\n'));
  flashAvailCopied();
}

export function favAllAvailable(): void {
  const next = new Set(get(favorites));
  for (const d of availableDomainsOf(get(results))) next.add(d);
  favorites.set(next);
}

export function downloadAvailableCsv(): void {
  const table = get(pricing)?.table ?? null;
  const filtered = new Map<string, CheckResult>();
  for (const [d, r] of get(results)) {
    if (r.status === 'available' || r.status === 'probably_available') filtered.set(d, r);
  }
  const rows = resultsToCsvRows(filtered, table, get(settings));
  const headers = [
    t('csv.domain'),
    t('csv.status'),
    t('csv.tld'),
    t('csv.priceFirstYear'),
    t('csv.priceRenewal'),
    t('csv.bestRegistrar'),
    t('csv.buyUrl'),
    t('csv.checkedAt'),
  ];
  const csv = buildCsv(rows, headers);
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`domain-hunter-available-${date}.csv`, csv);
}
