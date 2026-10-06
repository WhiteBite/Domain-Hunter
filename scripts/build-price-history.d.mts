/**
 * Type declarations for build-price-history.mjs — used by tests/trends.test.ts.
 */

interface TrendPointLike {
  m: string;
  reg: number | null;
  renew: number | null;
}

interface TrendSummaryLike {
  pct: number | null;
  dir: 'up' | 'down' | 'flat' | null;
}

interface TrendEntryLike extends TrendSummaryLike {
  spark?: number[];
}

export declare function summarizeTrendPoints(
  points: TrendPointLike[],
  windowMonths?: number,
): TrendSummaryLike;

export declare function sparkValues(
  rows: Array<[string, number | null, number | null]>,
): number[] | null;

export declare function computeTrends(
  history: Record<string, Array<[string, number | null, number | null]>>,
  allowedTlds?: Set<string> | null,
): Record<string, TrendEntryLike>;
