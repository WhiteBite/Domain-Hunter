/**
 * Share links — `#s=` + base64url(JSON {q, tlds, run}).
 * Unicode-safe via TextEncoder/TextDecoder. On load with run:true the
 * app auto-starts the check (SPEC §12).
 */

/** View-state values allowed in share links. 'favorites' is deliberately
 *  excluded — it depends on the recipient's local favorites set. */
export type ShareFilter = 'all' | 'available' | 'taken' | 'problems';
export type ShareSortKey = 'name' | 'price' | 'renew' | 'tco';
export type ShareSortDir = 'asc' | 'desc';

const FILTERS: readonly ShareFilter[] = ['all', 'available', 'taken', 'problems'];
const SORT_KEYS: readonly ShareSortKey[] = ['name', 'price', 'renew', 'tco'];
const SORT_DIRS: readonly ShareSortDir[] = ['asc', 'desc'];

export interface ShareState {
  q: string;
  tlds: string[];
  run?: boolean;
  filter?: ShareFilter;
  sortKey?: ShareSortKey;
  sortDir?: ShareSortDir;
  /** Results-table search box value at share time. */
  query?: string;
}

export interface ParsedShare {
  q: string;
  tlds: string[];
  run: boolean;
  filter: ShareFilter | null;
  sortKey: ShareSortKey | null;
  sortDir: ShareSortDir | null;
  query: string;
}

/** Encode share state into a `#s=...` hash (base64url, unicode-safe). */
export function encodeShare(state: ShareState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);
  const url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return '#s=' + url;
}

/**
 * Parse a share hash. Accepts an explicit hash arg or reads location.hash.
 * Returns null on any parse/validation failure (never throws).
 */
export function parseShare(hash?: string): ParsedShare | null {
  let h: string;
  if (hash !== undefined) {
    h = hash;
  } else {
    try {
      h = location.hash;
    } catch {
      return null;
    }
  }
  if (!h || !h.startsWith('#s=')) return null;
  const url = h.slice(3);
  if (!url) return null;
  if (url.length > 100_000) return null; // DoS guard for huge share payloads

  try {
    const base64 = url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    const q = typeof obj.q === 'string' ? obj.q : '';
    const tlds = Array.isArray(obj.tlds)
      ? obj.tlds.filter((t): t is string => typeof t === 'string')
      : [];
    const run = obj.run === true;
    const filter = FILTERS.includes(obj.filter as ShareFilter)
      ? (obj.filter as ShareFilter)
      : null;
    const sortKey = SORT_KEYS.includes(obj.sortKey as ShareSortKey)
      ? (obj.sortKey as ShareSortKey)
      : null;
    const sortDir = SORT_DIRS.includes(obj.sortDir as ShareSortDir)
      ? (obj.sortDir as ShareSortDir)
      : null;
    const query = typeof obj.query === 'string' ? obj.query : '';
    return { q, tlds, run, filter, sortKey, sortDir, query };
  } catch {
    return null;
  }
}

/** Remove the share hash from the URL without triggering navigation. */
export function clearShare(): void {
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    // history or location unavailable — non-fatal
  }
}
