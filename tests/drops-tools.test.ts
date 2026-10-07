import { describe, it, expect } from 'vitest';
import {
  applyDropsFilters,
  domainScore,
  EMPTY_DROPS_FILTERS,
  interpretWaybackAvailable,
  isWaybackFresh,
  matchesDropsFilters,
  NO_WAYBACK,
  pruneWaybackCache,
  sortDrops,
  waybackAvailableUrl,
  waybackCalendarUrl,
  WAYBACK_TTL_MS,
  type DropsFilters,
  type WaybackCacheEntry,
} from '../src/ui/drops-tools';
import type { DroppedDomain } from '../src/core/dropped';

const D = (d: string, tld: string): DroppedDomain => ({ d, tld });

const SAMPLE: DroppedDomain[] = [
  D('apple', 'com'),
  D('x9shop', 'net'),
  D('my-brand', 'io'),
  D('banana', 'dev'),
  D('xzqpf', 'com'),
];

describe('domainScore', () => {
  it('is consistent across calls and ranks real words above heaps', () => {
    expect(domainScore('apple')).toBe(domainScore('apple'));
    expect(domainScore('apple')).toBeGreaterThan(domainScore('xzqpf'));
  });
});

describe('matchesDropsFilters / applyDropsFilters', () => {
  it('empty filters keep everything', () => {
    expect(applyDropsFilters(SAMPLE, EMPTY_DROPS_FILTERS)).toEqual(SAMPLE);
  });

  it('minLen/maxLen bound the label length', () => {
    const f: DropsFilters = { ...EMPTY_DROPS_FILTERS, minLen: 6, maxLen: null };
    expect(applyDropsFilters(SAMPLE, f).map((x) => x.d).sort()).toEqual([
      'banana',
      'my-brand',
      'x9shop',
    ]);
    const g: DropsFilters = { ...EMPTY_DROPS_FILTERS, maxLen: 5 };
    expect(applyDropsFilters(SAMPLE, g).map((x) => x.d).sort()).toEqual(['apple', 'xzqpf']);
  });

  it('noDigits drops labels containing digits', () => {
    const f: DropsFilters = { ...EMPTY_DROPS_FILTERS, noDigits: true };
    expect(matchesDropsFilters(D('x9shop', 'net'), f)).toBe(false);
    expect(applyDropsFilters(SAMPLE, f)).toHaveLength(4);
  });

  it('noHyphens drops labels containing hyphens', () => {
    const f: DropsFilters = { ...EMPTY_DROPS_FILTERS, noHyphens: true };
    expect(matchesDropsFilters(D('my-brand', 'io'), f)).toBe(false);
    expect(applyDropsFilters(SAMPLE, f)).toHaveLength(4);
  });

  it('minScore keeps only pronounceable labels', () => {
    const apple = domainScore('apple');
    const heap = domainScore('xzqpf');
    const f: DropsFilters = { ...EMPTY_DROPS_FILTERS, minScore: (apple + heap) / 2 };
    const kept = applyDropsFilters(SAMPLE, f);
    expect(kept).toContainEqual(D('apple', 'com'));
    expect(kept).not.toContainEqual(D('xzqpf', 'com'));
  });

  it('filters compose (AND semantics)', () => {
    const f: DropsFilters = {
      ...EMPTY_DROPS_FILTERS,
      noDigits: true,
      noHyphens: true,
      minLen: 5,
    };
    expect(applyDropsFilters(SAMPLE, f).map((x) => x.d).sort()).toEqual(['apple', 'banana', 'xzqpf']);
  });
});

describe('sortDrops', () => {
  it('default preserves the incoming order and identity', () => {
    expect(sortDrops(SAMPLE, 'default')).toBe(SAMPLE);
  });

  it('az sorts by label then tld', () => {
    const out = sortDrops(SAMPLE, 'az').map((x) => x.d);
    expect(out).toEqual([...out].sort((a, b) => a.localeCompare(b)));
  });

  it('length sorts ascending by label length', () => {
    const lens = sortDrops(SAMPLE, 'length').map((x) => x.d.length);
    for (let i = 1; i < lens.length; i++) {
      expect(lens[i - 1] ?? 0).toBeLessThanOrEqual(lens[i] ?? 0);
    }
  });

  it('score sorts descending by pronounceability', () => {
    const out = sortDrops(SAMPLE, 'score');
    expect(['apple', 'banana']).toContain(out[0]?.d);
    expect(out[out.length - 1]?.d).toBe('xzqpf');
    const scores = out.map((x) => domainScore(x.d));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1] ?? 0).toBeGreaterThanOrEqual(scores[i] ?? 0);
    }
  });

  it('does not mutate the input for non-default sorts', () => {
    const copy = [...SAMPLE];
    sortDrops(SAMPLE, 'az');
    expect(SAMPLE).toEqual(copy);
  });
});

describe('wayback URLs', () => {
  it('builds the available-API URL with an encoded domain', () => {
    expect(waybackAvailableUrl('ex ample.com')).toBe(
      'https://archive.org/wayback/available?url=ex%20ample.com',
    );
  });

  it('builds the calendar link-out URL', () => {
    expect(waybackCalendarUrl('example.com')).toBe(
      'https://web.archive.org/web/*/example.com',
    );
  });
});

describe('interpretWaybackAvailable', () => {
  const AVAILABLE = {
    url: 'example.com',
    archived_snapshots: {
      closest: {
        status: '200',
        available: true,
        url: 'http://web.archive.org/web/20200101000000/https://example.com/',
        timestamp: '20200101000000',
      },
    },
  };

  it('recognizes an available closest snapshot', () => {
    const v = interpretWaybackAvailable(AVAILABLE);
    expect(v.hasHistory).toBe(true);
    expect(v.timestamp).toBe('20200101000000');
    expect(v.snapshotUrl).toContain('web.archive.org');
  });

  it('returns NO_WAYBACK when nothing is archived', () => {
    expect(interpretWaybackAvailable({ url: 'x.com', archived_snapshots: {} })).toEqual(NO_WAYBACK);
  });

  it('returns NO_WAYBACK for available:false and malformed bodies', () => {
    const notAvail = {
      archived_snapshots: { closest: { available: false, url: 'u', timestamp: 't' } },
    };
    expect(interpretWaybackAvailable(notAvail)).toEqual(NO_WAYBACK);
    expect(interpretWaybackAvailable(null)).toEqual(NO_WAYBACK);
    expect(interpretWaybackAvailable('x')).toEqual(NO_WAYBACK);
    expect(interpretWaybackAvailable({ archived_snapshots: 'nope' })).toEqual(NO_WAYBACK);
    expect(interpretWaybackAvailable({ archived_snapshots: { closest: 42 } })).toEqual(
      NO_WAYBACK,
    );
  });

  it('tolerates missing url/timestamp fields', () => {
    const v = interpretWaybackAvailable({ archived_snapshots: { closest: { available: true } } });
    expect(v).toEqual({ hasHistory: true, snapshotUrl: null, timestamp: null });
  });
});

describe('pruneWaybackCache / isWaybackFresh', () => {
  const NOW = 1_800_000_000_000;

  function entry(ageMs: number): WaybackCacheEntry {
    return { v: NO_WAYBACK, ts: NOW - ageMs };
  }

  it('drops entries older than the TTL', () => {
    const out = pruneWaybackCache(
      { fresh: entry(1000), stale: entry(WAYBACK_TTL_MS + 1) },
      NOW,
    );
    expect(Object.keys(out)).toEqual(['fresh']);
  });

  it('keeps the newest entries when over the cap', () => {
    const map: Record<string, WaybackCacheEntry> = {};
    for (let i = 0; i < 10; i++) map[`d${i}`] = entry(i * 1000);
    const out = pruneWaybackCache(map, NOW, 3);
    expect(Object.keys(out).sort()).toEqual(['d0', 'd1', 'd2']);
  });

  it('is a no-op under the cap', () => {
    const map = { a: entry(10), b: entry(20) };
    expect(pruneWaybackCache(map, NOW)).toEqual(map);
  });

  it('isWaybackFresh respects the TTL boundary', () => {
    expect(isWaybackFresh(entry(0), NOW)).toBe(true);
    expect(isWaybackFresh(entry(WAYBACK_TTL_MS), NOW)).toBe(true);
    expect(isWaybackFresh(entry(WAYBACK_TTL_MS + 1), NOW)).toBe(false);
  });
});
