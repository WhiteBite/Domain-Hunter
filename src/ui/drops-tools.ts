/**
 * Drops toolkit pure layer (SPEC §17): local filters, sorts, pronounceability
 * score and the lazy Wayback history signal for the Drops tab.
 */
import type { DroppedDomain } from '../core/dropped';
import { scoreWord } from '../generators/pronounceability';

export interface DropsFilters {
  minLen: number | null;
  maxLen: number | null;
  noDigits: boolean;
  noHyphens: boolean;
  /** Pronounceability floor (scoreWord nats); null = off. */
  minScore: number | null;
}

export const EMPTY_DROPS_FILTERS: DropsFilters = {
  minLen: null,
  maxLen: null,
  noDigits: false,
  noHyphens: false,
  minScore: null,
};

export type DropsSort = 'default' | 'score' | 'length' | 'az';

const scoreCache = new Map<string, number>();

export function domainScore(label: string): number {
  let s = scoreCache.get(label);
  if (s == null) {
    s = scoreWord(label);
    scoreCache.set(label, s);
  }
  return s;
}

export function matchesDropsFilters(d: DroppedDomain, f: DropsFilters): boolean {
  const len = d.d.length;
  if (f.minLen != null && len < f.minLen) return false;
  if (f.maxLen != null && len > f.maxLen) return false;
  if (f.noDigits && /[0-9]/.test(d.d)) return false;
  if (f.noHyphens && d.d.includes('-')) return false;
  if (f.minScore != null && domainScore(d.d) < f.minScore) return false;
  return true;
}

export function applyDropsFilters(
  domains: DroppedDomain[],
  f: DropsFilters,
): DroppedDomain[] {
  return domains.filter((d) => matchesDropsFilters(d, f));
}

export function sortDrops(domains: DroppedDomain[], sort: DropsSort): DroppedDomain[] {
  if (sort === 'default') return domains;
  const list = [...domains];
  if (sort === 'az') {
    list.sort((a, b) => a.d.localeCompare(b.d) || a.tld.localeCompare(b.tld));
  } else if (sort === 'length') {
    list.sort((a, b) => a.d.length - b.d.length || a.d.localeCompare(b.d));
  } else {
    list.sort((a, b) => domainScore(b.d) - domainScore(a.d) || a.d.localeCompare(b.d));
  }
  return list;
}

// ---- Wayback history signal (lazy, on row expand only) ----

export function waybackAvailableUrl(domain: string): string {
  return `https://archive.org/wayback/available?url=${encodeURIComponent(domain)}`;
}

export function waybackCalendarUrl(domain: string): string {
  return `https://web.archive.org/web/*/${encodeURIComponent(domain)}`;
}

export interface WaybackVerdict {
  hasHistory: boolean;
  /** Closest snapshot URL from the available API; null when none. */
  snapshotUrl: string | null;
  /** Snapshot timestamp (YYYYMMDDHHMMSS) when present. */
  timestamp: string | null;
}

export const NO_WAYBACK: WaybackVerdict = {
  hasHistory: false,
  snapshotUrl: null,
  timestamp: null,
};

/** Defensive interpreter for archive.org/wayback/available responses. */
export function interpretWaybackAvailable(json: unknown): WaybackVerdict {
  if (json == null || typeof json !== 'object') return NO_WAYBACK;
  const snaps = (json as { archived_snapshots?: unknown }).archived_snapshots;
  if (snaps == null || typeof snaps !== 'object') return NO_WAYBACK;
  const closest = (snaps as { closest?: unknown }).closest;
  if (closest == null || typeof closest !== 'object') return NO_WAYBACK;
  const rec = closest as { available?: unknown; url?: unknown; timestamp?: unknown };
  if (rec.available !== true) return NO_WAYBACK;
  return {
    hasHistory: true,
    snapshotUrl: typeof rec.url === 'string' && rec.url !== '' ? rec.url : null,
    timestamp: typeof rec.timestamp === 'string' && rec.timestamp !== '' ? rec.timestamp : null,
  };
}

// ---- Wayback cache (dh:v1:wayback, cap 500, TTL 30d) ----

export const WAYBACK_CACHE_KEY = 'dh:v1:wayback';
export const WAYBACK_CACHE_CAP = 500;
export const WAYBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface WaybackCacheEntry {
  v: WaybackVerdict;
  ts: number;
}

/** Pure: drop stale entries, then keep the newest WAYBACK_CACHE_CAP by ts. */
export function pruneWaybackCache(
  map: Record<string, WaybackCacheEntry>,
  now: number,
  cap: number = WAYBACK_CACHE_CAP,
  ttlMs: number = WAYBACK_TTL_MS,
): Record<string, WaybackCacheEntry> {
  const entries = Object.entries(map).filter(([, e]) => now - e.ts <= ttlMs);
  if (entries.length <= cap) {
    const out: Record<string, WaybackCacheEntry> = {};
    for (const [k, e] of entries) out[k] = e;
    return out;
  }
  entries.sort((a, b) => b[1].ts - a[1].ts);
  const out: Record<string, WaybackCacheEntry> = {};
  for (const [k, e] of entries.slice(0, cap)) out[k] = e;
  return out;
}

export function isWaybackFresh(entry: WaybackCacheEntry, now: number): boolean {
  return now - entry.ts <= WAYBACK_TTL_MS;
}
