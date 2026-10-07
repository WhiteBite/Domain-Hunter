import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { availableDomainsOf, favAllAvailable } from '../src/ui/bulk-actions';
import { favorites } from '../src/ui/favorites';
import { results } from '../src/ui/store';
import type { CheckResult } from '../src/types';

function result(domain: string, status: CheckResult['status']): CheckResult {
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return { domain, tld, status, source: 'rdap', checkedAt: 0 };
}

beforeEach(() => {
  favorites.set(new Set());
});

describe('availableDomainsOf', () => {
  it('collects available and probably_available domains sorted A–Z', () => {
    const map = new Map<string, CheckResult>([
      ['beta.com', result('beta.com', 'available')],
      ['alpha.com', result('alpha.com', 'probably_available')],
      ['taken.com', result('taken.com', 'taken')],
      ['gone.com', result('gone.com', 'unknown')],
      ['err.com', result('err.com', 'error')],
    ]);
    expect(availableDomainsOf(map)).toEqual(['alpha.com', 'beta.com']);
  });

  it('returns [] for an empty results map', () => {
    expect(availableDomainsOf(new Map())).toEqual([]);
  });
});

describe('favAllAvailable', () => {
  it('stars every available domain once, keeping existing favorites', () => {
    favorites.set(new Set(['kept.com']));
    results.set(
      new Map<string, CheckResult>([
        ['a.com', result('a.com', 'available')],
        ['b.com', result('b.com', 'taken')],
        ['c.io', result('c.io', 'probably_available')],
      ]),
    );
    favAllAvailable();
    expect([...get(favorites)].sort()).toEqual(['a.com', 'c.io', 'kept.com']);
  });
});
