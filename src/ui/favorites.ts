/**
 * Favorites shortlist (SPEC §5 storage keys): domains/names starred from the
 * results table, generator tray or dropped list. Persisted, survives reloads.
 *
 * Capped at MAX_FAVORITES to bound localStorage usage; toggleFavorite returns
 * false when the cap blocks an add so callers can surface a toast/warn.
 */
import { writable } from 'svelte/store';

const FAVORITES_KEY = 'dh:v1:favorites';
const WRITE_DEBOUNCE_MS = 500;

/** Maximum number of favorites. Adds beyond this are rejected. */
export const MAX_FAVORITES = 2000;

/** Pure add/remove used by the store and the unit tests. */
export function toggleInList(list: string[], domain: string): string[] {
  return list.includes(domain) ? list.filter((d) => d !== domain) : [...list, domain];
}

/**
 * Pure toggle with a cap. Returns { next, added }:
 * - If domain is in the set: removes it, added=true.
 * - If domain is not in the set and size < cap: adds it, added=true.
 * - If domain is not in the set and size >= cap: unchanged, added=false.
 */
export function toggleFavoriteCapped(
  set: Set<string>,
  domain: string,
  cap: number = MAX_FAVORITES,
): { next: Set<string>; added: boolean } {
  const next = new Set(set);
  if (next.has(domain)) {
    next.delete(domain);
    return { next, added: true };
  }
  if (next.size >= cap) {
    return { next, added: false };
  }
  next.add(domain);
  return { next, added: true };
}

function load(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export const favorites = writable<Set<string>>(new Set(load()));

let writeTimer: ReturnType<typeof setTimeout> | null = null;
favorites.subscribe((value) => {
  if (writeTimer != null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...value]));
    } catch {
      // storage unavailable — non-fatal
    }
  }, WRITE_DEBOUNCE_MS);
});

/**
 * Toggle a domain in the favorites set. Returns true when the set changed
 * (added or removed), false when the add was blocked by the MAX_FAVORITES cap.
 */
export function toggleFavorite(domain: string): boolean {
  let added = false;
  favorites.update((set) => {
    const result = toggleFavoriteCapped(set, domain);
    added = result.added;
    return result.next;
  });
  return added;
}

