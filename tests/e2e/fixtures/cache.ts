/**
 * localStorage cache seed entries for E2E mocks.
 *
 * Storage shape matches src/core/cache.ts: Record<domain, CacheEntry>
 * stored as JSON at key 'dh:v1:cache'. CacheEntry is from src/types.ts.
 */
import type { CacheEntry } from '../../../src/types';
import { TAKEN_GTLD, FREE_GTLD } from './domains';

/** Extract TLD from a full domain name (e.g. 'google.com' → 'com'). */
function tldOf(domain: string): string {
  return domain.slice(domain.lastIndexOf('.') + 1);
}

/**
 * Cache storage record ready for JSON.stringify → localStorage.setItem.
 * By default includes TAKEN_GTLD[0] (status 'taken') and FREE_GTLD[0]
 * (status 'available') with fresh timestamps. Extra domains (if provided)
 * are added with status 'unknown' so tests can pre-populate the cache.
 */
export function cacheEntries(domains?: string[]): Record<string, CacheEntry> {
  const now = Date.now();
  const taken = TAKEN_GTLD[0];
  const free = FREE_GTLD[0];
  const entries: Record<string, CacheEntry> = {
    [taken]: { status: 'taken', source: 'rdap', ts: now, tld: tldOf(taken) },
    [free]: { status: 'available', source: 'rdap', ts: now, tld: tldOf(free) },
  };
  if (domains) {
    for (const d of domains) {
      if (!(d in entries)) {
        entries[d] = { status: 'unknown', source: 'rdap', ts: now, tld: tldOf(d) };
      }
    }
  }
  return entries;
}
