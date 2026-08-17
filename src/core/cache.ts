/**
 * Local result cache — UI thread only (SPEC §5 storage keys).
 */
import type { CacheEntry } from '../types';

const CACHE_KEY = 'dh:v1:cache';

function readMap(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
}

export function getFresh(domain: string, ttlMs: number): CacheEntry | null {
  const entry = readMap()[domain];
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) return null;
  return entry;
}

export function put(domain: string, entry: CacheEntry): void {
  try {
    const map = readMap();
    map[domain] = entry;
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // quota exceeded or storage unavailable — non-fatal
  }
}

export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
