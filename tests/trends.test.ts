import { describe, it, expect } from 'vitest';
import {
  summarizeTrendPoints,
  sparkValues,
  computeTrends,
} from '../scripts/build-price-history.mjs';

describe('summarizeTrendPoints', () => {
  it('returns up when latest reg is more than 2% above oldest', () => {
    const points = [
      { m: '2026-01', reg: 100, renew: 100 },
      { m: '2026-02', reg: 105, renew: 105 },
      { m: '2026-03', reg: 110, renew: 110 },
    ];
    expect(summarizeTrendPoints(points)).toEqual({ pct: 10, dir: 'up' });
  });

  it('returns down when latest reg is more than 2% below oldest', () => {
    const points = [
      { m: '2026-01', reg: 100, renew: 100 },
      { m: '2026-02', reg: 95, renew: 95 },
      { m: '2026-03', reg: 90, renew: 90 },
    ];
    expect(summarizeTrendPoints(points)).toEqual({ pct: -10, dir: 'down' });
  });

  it('returns flat when |pct| < 2', () => {
    const points = [
      { m: '2026-01', reg: 100, renew: 100 },
      { m: '2026-02', reg: 100, renew: 100 },
      { m: '2026-03', reg: 101, renew: 101 },
    ];
    expect(summarizeTrendPoints(points)).toEqual({ pct: 1, dir: 'flat' });
  });

  it('returns null when there is only a single point', () => {
    expect(summarizeTrendPoints([{ m: '2026-01', reg: 100, renew: 100 }])).toEqual({
      pct: null,
      dir: null,
    });
  });

  it('returns null when the gap between points exceeds the window', () => {
    const points = [
      { m: '2026-01', reg: 100, renew: 100 },
      { m: '2026-08', reg: 110, renew: 110 },
    ];
    expect(summarizeTrendPoints(points, 6)).toEqual({ pct: null, dir: null });
  });

  it('skips points with null reg and uses the next non-null point as oldest', () => {
    const points = [
      { m: '2026-01', reg: null, renew: 100 },
      { m: '2026-02', reg: 100, renew: 100 },
      { m: '2026-03', reg: 110, renew: 110 },
    ];
    expect(summarizeTrendPoints(points)).toEqual({ pct: 10, dir: 'up' });
  });

  it('returns null when oldest reg is <= 0', () => {
    const points = [
      { m: '2026-01', reg: 0, renew: 0 },
      { m: '2026-03', reg: 110, renew: 110 },
    ];
    expect(summarizeTrendPoints(points)).toEqual({ pct: null, dir: null });
  });
});

describe('sparkValues', () => {
  it('returns null for empty input', () => {
    expect(sparkValues([])).toBeNull();
  });

  it('returns null for a single point', () => {
    expect(sparkValues([['2026-08', 1046, 1046]])).toBeNull();
  });

  it('returns null when fewer than 2 rows have a non-null reg', () => {
    const rows: Array<[string, number | null, number | null]> = [
      ['2026-06', null, 900],
      ['2026-07', 1000, 900],
      ['2026-08', null, 950],
    ];
    expect(sparkValues(rows)).toBeNull();
  });

  it('skips rows with null reg', () => {
    const rows: Array<[string, number | null, number | null]> = [
      ['2026-06', 900, 900],
      ['2026-07', null, 950],
      ['2026-08', 1100, 950],
    ];
    expect(sparkValues(rows)).toEqual([900, 1100]);
  });

  it('sorts rows chronologically regardless of input order', () => {
    const rows: Array<[string, number | null, number | null]> = [
      ['2026-08', 1100, 1100],
      ['2026-06', 900, 900],
      ['2026-07', 1000, 1000],
    ];
    expect(sparkValues(rows)).toEqual([900, 1000, 1100]);
  });

  it('sorts chronologically across year boundaries', () => {
    const rows: Array<[string, number | null, number | null]> = [
      ['2026-01', 1100, 1100],
      ['2025-12', 1000, 1000],
    ];
    expect(sparkValues(rows)).toEqual([1000, 1100]);
  });

  it('passes values through unchanged', () => {
    const rows: Array<[string, number | null, number | null]> = [
      ['2026-07', 500, 500],
      ['2026-08', 500, 500],
    ];
    expect(sparkValues(rows)).toEqual([500, 500]);
  });
});

describe('computeTrends', () => {
  it('produces pct/dir/spark per TLD from compact history rows', () => {
    const history: Record<string, Array<[string, number | null, number | null]>> = {
      com: [
        ['2026-01', 100, 100],
        ['2026-03', 110, 110],
      ],
    };
    expect(computeTrends(history)).toEqual({
      com: { pct: 10, dir: 'up', spark: [100, 110] },
    });
  });

  it('omits spark and nulls the summary for a single-point TLD', () => {
    const history: Record<string, Array<[string, number | null, number | null]>> = {
      dev: [['2026-03', 100, 100]],
    };
    expect(computeTrends(history)).toEqual({ dev: { pct: null, dir: null } });
  });

  it('returns an empty object for empty history', () => {
    expect(computeTrends({})).toEqual({});
  });
});
