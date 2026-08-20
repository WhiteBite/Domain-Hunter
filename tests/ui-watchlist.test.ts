import { describe, expect, it } from 'vitest';
import {
  classifyChange,
  diffWatch,
  pruneOldChanges,
  type WatchChange,
  type WatchEntry,
} from '../src/ui/watchlist';
import type { CheckResult, CheckStatus } from '../src/types';

const ALL_STATUSES: CheckStatus[] = [
  'available',
  'taken',
  'probably_available',
  'unknown',
  'error',
];

function result(domain: string, status: CheckStatus): CheckResult {
  return {
    domain,
    tld: domain.split('.').pop() ?? 'com',
    status,
    source: 'rdap',
    checkedAt: Date.now(),
  };
}

// ---- classifyChange matrix ----

describe('classifyChange', () => {
  it('reports "freed" when to is available and from was taken/error/unknown', () => {
    // taken/error/unknown → available is always a freed flip.
    for (const from of ['taken', 'error', 'unknown'] as CheckStatus[]) {
      expect(classifyChange(from, 'available')).toBe('freed');
    }
    // taken/error → probably_available is also a freed flip.
    for (const from of ['taken', 'error'] as CheckStatus[]) {
      expect(classifyChange(from, 'probably_available')).toBe('freed');
    }
    // unknown → probably_available is NOT reported (uncertain→uncertain).
    expect(classifyChange('unknown', 'probably_available')).toBeNull();
  });

  it('reports "taken" when to is taken and from was available/probably_available', () => {
    expect(classifyChange('available', 'taken')).toBe('taken');
    expect(classifyChange('probably_available', 'taken')).toBe('taken');
  });

  it('returns null for all other transitions', () => {
    // Never report flips from unknown→probably etc.
    expect(classifyChange('unknown', 'probably_available')).toBeNull();
    expect(classifyChange('probably_available', 'available')).toBeNull();
    expect(classifyChange('available', 'probably_available')).toBeNull();
    expect(classifyChange('taken', 'error')).toBeNull();
    expect(classifyChange('error', 'unknown')).toBeNull();
    expect(classifyChange('taken', 'taken')).toBeNull();
    expect(classifyChange('available', 'available')).toBeNull();
    expect(classifyChange('available', 'error')).toBeNull();
    expect(classifyChange('available', 'unknown')).toBeNull();
  });

  it('exhaustive matrix: every (from, to) pair is covered', () => {
    // Ensure no pair throws and the result is always 'freed' | 'taken' | null.
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const r = classifyChange(from, to);
        expect(['freed', 'taken', null]).toContain(r);
      }
    }
  });
});

// ---- diffWatch ----

describe('diffWatch', () => {
  const favs = new Set(['a.com', 'b.com', 'c.com']);

  it('first run (prev=null) seeds the map and reports zero changes', () => {
    const fresh = [result('a.com', 'available'), result('b.com', 'taken')];
    const { changes, nextMap } = diffWatch(null, fresh, favs);
    expect(changes).toEqual([]);
    expect(Object.keys(nextMap).sort()).toEqual(['a.com', 'b.com']);
    expect(nextMap['a.com']?.status).toBe('available');
    expect(nextMap['b.com']?.status).toBe('taken');
  });

  it('first run ignores domains not in favorites', () => {
    const fresh = [result('a.com', 'available'), result('x.com', 'taken')];
    const { changes, nextMap } = diffWatch(null, fresh, favs);
    expect(changes).toEqual([]);
    expect(nextMap['x.com']).toBeUndefined();
  });

  it('detects a "freed" flip (taken→available)', () => {
    const prev: Record<string, WatchEntry> = {
      'a.com': { status: 'taken', ts: 1000 },
      'b.com': { status: 'available', ts: 1000 },
    };
    const fresh = [result('a.com', 'available'), result('b.com', 'available')];
    const { changes, nextMap } = diffWatch(prev, fresh, favs);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.domain).toBe('a.com');
    expect(changes[0]?.from).toBe('taken');
    expect(changes[0]?.to).toBe('available');
    expect(nextMap['a.com']?.status).toBe('available');
  });

  it('detects a "taken" flip (available→taken)', () => {
    const prev: Record<string, WatchEntry> = {
      'b.com': { status: 'available', ts: 1000 },
    };
    const fresh = [result('b.com', 'taken')];
    const { changes } = diffWatch(prev, fresh, favs);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.domain).toBe('b.com');
    expect(changes[0]?.from).toBe('available');
    expect(changes[0]?.to).toBe('taken');
  });

  it('drops domains no longer in favorites from the next map', () => {
    const prev: Record<string, WatchEntry> = {
      'a.com': { status: 'taken', ts: 1000 },
      'old.com': { status: 'available', ts: 1000 }, // not in favs
    };
    const fresh = [result('a.com', 'available')];
    const { nextMap } = diffWatch(prev, fresh, favs);
    expect(nextMap['old.com']).toBeUndefined();
    expect(nextMap['a.com']?.status).toBe('available');
  });

  it('preserves prev entries for domains not re-checked (still favorited)', () => {
    const prev: Record<string, WatchEntry> = {
      'a.com': { status: 'taken', ts: 1000 },
      'c.com': { status: 'unknown', ts: 1000 }, // not in fresh, still fav
    };
    const fresh = [result('a.com', 'available')];
    const { nextMap } = diffWatch(prev, fresh, favs);
    expect(nextMap['c.com']?.status).toBe('unknown');
    expect(nextMap['a.com']?.status).toBe('available');
  });

  it('does not report flips for unknown→probably etc.', () => {
    const prev: Record<string, WatchEntry> = {
      'a.com': { status: 'unknown', ts: 1000 },
    };
    const fresh = [result('a.com', 'probably_available')];
    const { changes } = diffWatch(prev, fresh, favs);
    expect(changes).toEqual([]);
  });
});

// ---- pruneOldChanges ----

describe('pruneOldChanges', () => {
  const NOW = 1_000_000;

  it('keeps entries within 7 days', () => {
    const changes: WatchChange[] = [
      { domain: 'a.com', from: 'taken', to: 'available', ts: NOW - 1000 },
      { domain: 'b.com', from: 'available', to: 'taken', ts: NOW - 6 * 24 * 60 * 60 * 1000 },
    ];
    expect(pruneOldChanges(changes, NOW)).toHaveLength(2);
  });

  it('prunes entries older than 7 days', () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const changes: WatchChange[] = [
      { domain: 'a.com', from: 'taken', to: 'available', ts: NOW - sevenDays - 1 },
      { domain: 'b.com', from: 'available', to: 'taken', ts: NOW - 1000 },
    ];
    const pruned = pruneOldChanges(changes, NOW);
    expect(pruned).toHaveLength(1);
    expect(pruned[0]?.domain).toBe('b.com');
  });

  it('handles empty input', () => {
    expect(pruneOldChanges([], NOW)).toEqual([]);
  });

  it('handles boundary: exactly 7 days ago is kept', () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const changes: WatchChange[] = [
      { domain: 'a.com', from: 'taken', to: 'available', ts: NOW - sevenDays },
    ];
    expect(pruneOldChanges(changes, NOW)).toHaveLength(1);
  });
});
