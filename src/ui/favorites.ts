/**
 * Favorites shortlist (SPEC §5 storage keys): domains/names starred from the
 * results table, generator tray or dropped list. Persisted, survives reloads.
 */
import { writable } from 'svelte/store';

const FAVORITES_KEY = 'dh:v1:favorites';
const WRITE_DEBOUNCE_MS = 500;

/** Pure add/remove used by the store and the unit tests. */
export function toggleInList(list: string[], domain: string): string[] {
  return list.includes(domain) ? list.filter((d) => d !== domain) : [...list, domain];
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

export function toggleFavorite(domain: string): void {
  favorites.update((set) => {
    const next = new Set(set);
    if (next.has(domain)) next.delete(domain);
    else next.add(domain);
    return next;
  });
}
