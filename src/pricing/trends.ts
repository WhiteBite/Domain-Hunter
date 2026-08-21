/**
 * Price-trend summarization — pure module, no Svelte or browser APIs.
 * Consumed by the UI layer to render per-TLD price trends from the
 * compact history file (src/config/price-history.json).
 *
 * The history file stores points as [m, reg, renew] tuples; the UI
 * expands them to TrendPoint[] before calling summarizeTrend.
 */

export interface TrendPoint {
  /** Month key in YYYY-MM format (lexicographically sortable). */
  m: string;
  /** Min registration price in USD cents across registrars, or null. */
  reg: number | null;
  /** Min renewal price in USD cents across registrars, or null. */
  renew: number | null;
}

export interface TrendSummary {
  pct: number | null;
  dir: 'up' | 'down' | 'flat' | null;
}

/** Type guard: point has a non-null reg value. */
function hasReg(p: TrendPoint): p is TrendPoint & { reg: number } {
  return p.reg != null;
}

/** Convert YYYY-MM to a linear month index for arithmetic. */
function monthIndex(m: string): number {
  const parts = m.split('-');
  const y = Number(parts[0] ?? '0');
  const mo = Number(parts[1] ?? '0');
  return y * 12 + (mo - 1);
}

/**
 * Summarize the price trend over a sliding window of `windowMonths`
 * months ending at the latest point with a non-null reg.
 *
 * Algorithm:
 * 1. Sort points by month ascending (string comparison = chronological for YYYY-MM).
 * 2. Filter to points with non-null reg.
 * 3. If fewer than 2 such points, return {null, null}.
 * 4. Take the latest point with non-null reg.
 * 5. Find the oldest point with non-null reg whose month is within
 *    `windowMonths` of the latest point's month.
 * 6. If no such oldest point exists (gap exceeds window) or oldest === latest,
 *    return {null, null}.
 * 7. If oldest.reg <= 0, return {null, null} (division would be meaningless).
 * 8. pct = round((latest.reg - oldest.reg) / oldest.reg * 100).
 * 9. dir: |pct| < 2 → 'flat', else 'up' or 'down'.
 */
export function summarizeTrend(points: TrendPoint[], windowMonths = 6): TrendSummary {
  const sorted = [...points].sort((a, b) => (a.m < b.m ? -1 : a.m > b.m ? 1 : 0));
  const withReg = sorted.filter(hasReg);
  if (withReg.length < 2) return { pct: null, dir: null };

  const latest = withReg.at(-1);
  if (!latest) return { pct: null, dir: null };

  const latestIdx = monthIndex(latest.m);

  let oldest: (TrendPoint & { reg: number }) | null = null;
  for (const p of withReg) {
    const diff = latestIdx - monthIndex(p.m);
    if (diff <= windowMonths) {
      oldest = p;
      break;
    }
  }

  if (!oldest || oldest === latest) return { pct: null, dir: null };
  if (oldest.reg <= 0) return { pct: null, dir: null };

  const pct = Math.round(((latest.reg - oldest.reg) / oldest.reg) * 100);
  const dir = Math.abs(pct) < 2 ? 'flat' : pct > 0 ? 'up' : 'down';
  return { pct, dir };
}

/**
 * Expand compact [m, reg, renew] tuples into TrendPoint objects.
 * The history file stores points as tuples to minimize size; the UI
 * expands them before calling summarizeTrend.
 */
export function pointsFromCompact(
  rows: Array<[string, number | null, number | null]>,
): TrendPoint[] {
  return rows.map(([m, reg, renew]) => ({ m, reg, renew }));
}

/**
 * Extract the chronological series of non-null first-year (reg) prices
 * for sparkline rendering. Rows are sorted by month ascending (YYYY-MM
 * string comparison = chronological); rows with null reg are skipped.
 * Returns null when fewer than 2 usable points remain — a sparkline
 * needs at least one line segment. Values are raw USD cents, unmodified;
 * normalization to pixel coordinates happens at render time.
 */
export function sparkSeries(
  rows: Array<[string, number | null, number | null]>,
): { months: string[]; values: number[] } | null {
  const sorted = [...rows].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const months: string[] = [];
  const values: number[] = [];
  for (const [m, reg] of sorted) {
    if (reg == null) continue;
    months.push(m);
    values.push(reg);
  }
  if (values.length < 2) return null;
  return { months, values };
}
