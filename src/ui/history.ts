/**
 * Check-run history (SPEC §5 storage keys): the most recent completed runs
 * with their inputs and outcome counters. Restoring an entry re-fills the
 * input/zones and re-runs — the local cache makes repeats nearly instant.
 */
import { writable } from 'svelte/store';
import type { HistoryEntry } from '../types';

const HISTORY_KEY = 'dh:v1:history';
export const MAX_HISTORY_ENTRIES = 20;
const WRITE_DEBOUNCE_MS = 500;

function entryKey(e: HistoryEntry): string {
  return e.query + '\u0000' + [...e.tlds].sort().join(',');
}

/** Pure insert: dedupe identical query+zones, newest first, capped. */
export function pushEntry(
  list: HistoryEntry[],
  entry: HistoryEntry,
  cap: number = MAX_HISTORY_ENTRIES,
): HistoryEntry[] {
  const rest = list.filter((e) => entryKey(e) !== entryKey(entry));
  return [entry, ...rest].slice(0, cap);
}

function isEntry(x: unknown): x is HistoryEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  const c = e.counts;
  if (typeof e.ts !== 'number' || typeof e.query !== 'string') return false;
  if (!Array.isArray(e.tlds) || !e.tlds.every((tld) => typeof tld === 'string')) return false;
  if (typeof c !== 'object' || c === null) return false;
  const counts = c as Record<string, unknown>;
  return (
    typeof counts.total === 'number' &&
    typeof counts.available === 'number' &&
    typeof counts.taken === 'number' &&
    typeof counts.problems === 'number'
  );
}

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

export const history = writable<HistoryEntry[]>(load());

let writeTimer: ReturnType<typeof setTimeout> | null = null;
history.subscribe((value) => {
  if (writeTimer != null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(value));
    } catch {
      // storage unavailable — non-fatal
    }
  }, WRITE_DEBOUNCE_MS);
});

export function recordRun(entry: HistoryEntry): void {
  history.update((list) => pushEntry(list, entry));
}

export function clearHistory(): void {
  history.set([]);
}