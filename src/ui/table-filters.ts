/**
 * Pure results-table view filters — extracted from ResultsTable.svelte for
 * testability. The component delegates status/query/budget/promo-trap
 * filtering here; sorting and pagination stay in the component (they are
 * view-derivation, not filtering).
 *
 * All prices are USD cents (the internal unit). Budget conversion from the
 * display currency happens via displayToUsdCents() before calling
 * applyViewFilters — the helper compares cents against cents.
 */
import type { CheckResult, PriceEntry, Settings } from '../types';
import { isPromoTrap } from '../pricing/pricing';

export type FilterKey = 'all' | 'available' | 'taken' | 'problems' | 'favorites';

/** Minimal row shape applyViewFilters needs. ResultsTable.RowData satisfies it
 *  structurally (it carries these fields plus more). */
export interface FilterableRow {
  result: CheckResult;
  best: { registrarId: string; entry: PriceEntry } | null;
  firstYear: number | null;
}

export interface ViewFilters {
  filter: FilterKey;
  query: string;
  /** USD cents. 0 (or negative) = inactive. */
  budgetCents: number;
  hideTraps: boolean;
  /** Required by the 'favorites' filter. */
  favorites: Set<string>;
}

export interface FilterResult<R> {
  rows: R[];
  /** Rows excluded by the hideTraps toggle specifically (after all other
   *  filters applied). 0 when hideTraps is off. */
  trapsHidden: number;
}

/**
 * Apply status → query → budget → promo-trap filters in order.
 *
 * Status filter uses the three-state model (available includes
 * probably_available; problems = unknown + error). Query is a
 * case-insensitive domain substring. Budget requires a non-null firstYear
 * at or below budgetCents. hideTraps excludes rows whose best entry is a
 * promo trap (renewal ≥ 5× first year).
 */
export function applyViewFilters<R extends FilterableRow>(
  rows: R[],
  opts: ViewFilters,
): FilterResult<R> {
  let arr: R[];
  switch (opts.filter) {
    case 'available':
      arr = rows.filter(
        (r) =>
          r.result.status === 'available' ||
          r.result.status === 'probably_available',
      );
      break;
    case 'taken':
      arr = rows.filter((r) => r.result.status === 'taken');
      break;
    case 'problems':
      arr = rows.filter(
        (r) => r.result.status === 'unknown' || r.result.status === 'error',
      );
      break;
    case 'favorites':
      arr = rows.filter((r) => opts.favorites.has(r.result.domain));
      break;
    default:
      arr = rows;
  }

  const q = opts.query.trim().toLowerCase();
  if (q) {
    arr = arr.filter((r) => r.result.domain.toLowerCase().includes(q));
  }

  if (opts.budgetCents > 0) {
    arr = arr.filter(
      (r) => r.firstYear != null && r.firstYear <= opts.budgetCents,
    );
  }

  let trapsHidden = 0;
  if (opts.hideTraps) {
    const before = arr.length;
    arr = arr.filter((r) => !(r.best != null && isPromoTrap(r.best.entry)));
    trapsHidden = before - arr.length;
  }

  return { rows: arr, trapsHidden };
}

/**
 * Convert a display-currency amount (what the user types) to USD cents
 * (the internal price unit). Inverse of formatPrice: USD passes through,
 * RUB/EUR divide by the stored rate (units per 1 USD) before ×100.
 * Returns 0 for non-positive or invalid input (budget filter inactive).
 */
export function displayToUsdCents(
  displayAmount: number,
  settings: Settings,
): number {
  if (!Number.isFinite(displayAmount) || displayAmount <= 0) return 0;
  let usd = displayAmount;
  if (settings.currency === 'RUB') {
    const rate = settings.rates.RUB;
    if (rate <= 0) return 0;
    usd = displayAmount / rate;
  } else if (settings.currency === 'EUR') {
    const rate = settings.rates.EUR;
    if (rate <= 0) return 0;
    usd = displayAmount / rate;
  }
  return Math.round(usd * 100);
}
