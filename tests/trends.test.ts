import { describe, it, expect } from 'vitest';
import { pointsFromCompact, summarizeTrend, type TrendPoint } from '../src/pricing/trends';

describe('summarizeTrend', () => {
  it('returns up when latest reg is more than 2% above oldest', () => {
    // Given a 3-month window where reg rose from 100 to 110 (10%)
    const points: TrendPoint[] = [
      { m: '2026-01', reg: 100, renew: 100 },
      { m: '2026-02', reg: 105, renew: 105 },
      { m: '2026-03', reg: 110, renew: 110 },
    ];
    // When summarizing with the default 6-month window
    const result = summarizeTrend(points);
    // Then pct is 10 and dir is up
    expect(result).toEqual({ pct: 10, dir: 'up' });
  });

  it('returns down when latest reg is more than 2% below oldest', () => {
    // Given a 3-month window where reg fell from 100 to 90 (-10%)
    const points: TrendPoint[] = [
      { m: '2026-01', reg: 100, renew: 100 },
      { m: '2026-02', reg: 95, renew: 95 },
      { m: '2026-03', reg: 90, renew: 90 },
    ];
    const result = summarizeTrend(points);
    expect(result).toEqual({ pct: -10, dir: 'down' });
  });

  it('returns flat when |pct| < 2', () => {
    // Given a 3-month window where reg changed from 100 to 101 (1%)
    const points: TrendPoint[] = [
      { m: '2026-01', reg: 100, renew: 100 },
      { m: '2026-02', reg: 100, renew: 100 },
      { m: '2026-03', reg: 101, renew: 101 },
    ];
    const result = summarizeTrend(points);
    expect(result).toEqual({ pct: 1, dir: 'flat' });
  });

  it('returns null when there is only a single point', () => {
    const points: TrendPoint[] = [{ m: '2026-01', reg: 100, renew: 100 }];
    const result = summarizeTrend(points);
    expect(result).toEqual({ pct: null, dir: null });
  });

  it('returns null when the gap between points exceeds the window', () => {
    // Given two points 7 months apart, window is 6
    const points: TrendPoint[] = [
      { m: '2026-01', reg: 100, renew: 100 },
      { m: '2026-08', reg: 110, renew: 110 },
    ];
    const result = summarizeTrend(points, 6);
    expect(result).toEqual({ pct: null, dir: null });
  });

  it('skips points with null reg and uses the next non-null point as oldest', () => {
    // Given a window where the oldest point has null reg
    const points: TrendPoint[] = [
      { m: '2026-01', reg: null, renew: 100 },
      { m: '2026-02', reg: 100, renew: 100 },
      { m: '2026-03', reg: 110, renew: 110 },
    ];
    const result = summarizeTrend(points);
    // oldest non-null reg is 100 at 2026-02, latest is 110 at 2026-03 → 10% up
    expect(result).toEqual({ pct: 10, dir: 'up' });
  });

  it('returns null when oldest reg is <= 0', () => {
    // Given oldest reg is 0 (free domain), division would be meaningless
    const points: TrendPoint[] = [
      { m: '2026-01', reg: 0, renew: 0 },
      { m: '2026-03', reg: 110, renew: 110 },
    ];
    const result = summarizeTrend(points);
    expect(result).toEqual({ pct: null, dir: null });
  });
});

describe('pointsFromCompact', () => {
  it('maps compact [m, reg, renew] tuples to TrendPoint objects', () => {
    // Given compact rows as stored in price-history.json
    const rows: Array<[string, number | null, number | null]> = [
      ['2026-01', 100, 150],
      ['2026-02', 110, 160],
    ];
    // When expanding to TrendPoint[]
    const points = pointsFromCompact(rows);
    // Then each tuple maps to an object with the same values
    expect(points).toEqual<TrendPoint[]>([
      { m: '2026-01', reg: 100, renew: 150 },
      { m: '2026-02', reg: 110, renew: 160 },
    ]);
  });

  it('preserves null reg and renew values', () => {
    // Given a row with null prices (missing data)
    const rows: Array<[string, number | null, number | null]> = [
      ['2026-01', null, null],
    ];
    // When expanding
    const points = pointsFromCompact(rows);
    // Then nulls are preserved, not coerced
    expect(points).toEqual<TrendPoint[]>([{ m: '2026-01', reg: null, renew: null }]);
  });

  it('returns an empty array for empty input', () => {
    // Given no rows
    // When expanding
    const points = pointsFromCompact([]);
    // Then no points are produced
    expect(points).toEqual<TrendPoint[]>([]);
  });

  it('produces points consumable by summarizeTrend', () => {
    // Given compact rows representing a 10% price rise
    const rows: Array<[string, number | null, number | null]> = [
      ['2026-01', 100, 100],
      ['2026-03', 110, 110],
    ];
    // When expanding and summarizing
    const result = summarizeTrend(pointsFromCompact(rows));
    // Then the round-trip yields the expected trend
    expect(result).toEqual({ pct: 10, dir: 'up' });
  });
});
