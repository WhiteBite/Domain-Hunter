/**
 * New-zone tracker (SPEC §6 addendum): diff between the zones seen at the
 * last visit (dh:v1:zones-seen) and the current registry — surfaces the
 * "+N new zones" chip in TldPicker for IANA-bootstrap discoveries.
 */
import { writable } from 'svelte/store';
import { readJson, writeJson } from './settings';

const KEY = 'dh:v1:zones-seen';

export const newZones = writable<string[]>([]);

/** Pure: TLDs present in `current` but absent from `seen`. */
export function diffNewZones(seen: string[] | null, current: string[]): string[] {
  if (seen == null) return [];
  const have = new Set(seen);
  return current.filter((t) => !have.has(t));
}

/**
 * Record the visit baseline and announce the diff. First visit (no stored
 * baseline) initializes silently; a shrunk registry (offline boot, bootstrap
 * cache miss) never shrinks the stored baseline so nothing re-announces.
 */
export function initZonesTracker(current: string[]): void {
  const seen = readJson<string[]>(KEY);
  if (!Array.isArray(seen)) {
    writeJson(KEY, current);
    newZones.set([]);
    return;
  }
  const fresh = diffNewZones(seen, current);
  newZones.set(fresh);
  if (fresh.length > 0 && current.length >= seen.length) {
    writeJson(KEY, current);
  }
}
