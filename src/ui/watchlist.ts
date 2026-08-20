/**
 * Watchlist — silently re-checks favorited domains on app load and reports
 * status flips ("domain freed" / "domain got taken"). SPEC §5 (dh:v1:watch)
 * and §7 (status model).
 *
 * Concurrency is capped at 2 to stay polite to registries (this is a
 * background re-check, not a user-initiated bulk run).
 */
import { writable } from 'svelte/store';
import { get } from 'svelte/store';
import type { CheckResult, CheckStatus, EngineEvent, EngineOptions } from '../types';
import { createEngine } from '../core/engine';
import type { EngineHandle } from '../core/engine';
import { favorites } from './favorites';
import { results, runState, registry } from './store';
import { KEYS, readJson, writeJson } from './settings';

const WATCH_CHANGES_KEY = 'dh:v1:watch-changes';
const MAX_WATCH_DOMAINS = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface WatchEntry {
  status: CheckStatus;
  ts: number;
}

export interface WatchChange {
  domain: string;
  from: CheckStatus;
  to: CheckStatus;
  ts: number;
}

/**
 * Classify a status transition. PURE.
 * - 'freed' when `to` is available/probably_available AND `from` was taken/error/unknown.
 * - 'taken' when `to` is taken AND `from` was available/probably_available.
 * - null otherwise (never report flips like unknown->probably).
 */
export function classifyChange(
  from: CheckStatus,
  to: CheckStatus,
): 'freed' | 'taken' | null {
  const toAvail = to === 'available' || to === 'probably_available';
  const fromAvail = from === 'available' || from === 'probably_available';
  const fromUnavail = from === 'taken' || from === 'error' || from === 'unknown';

  if (toAvail && fromUnavail) {
    // Never report uncertain-to-uncertain flips (unknown->probably etc.).
    if (from === 'unknown' && to === 'probably_available') return null;
    return 'freed';
  }
  if (to === 'taken' && fromAvail) return 'taken';
  return null;
}

/**
 * Pure diff of previous watch map vs fresh results. Returns the changes to
 * report and the next map to persist.
 * - If prev is null (first run): seed the map with current statuses, zero changes.
 * - Otherwise: classify flips, merge new statuses into prev (drop domains no
 *   longer in favorites).
 */
export function diffWatch(
  prev: Record<string, WatchEntry> | null,
  fresh: CheckResult[],
  favs: Set<string>,
): { changes: WatchChange[]; nextMap: Record<string, WatchEntry> } {
  const now = Date.now();

  // First run: seed the map with current statuses, no changes.
  if (prev === null) {
    const nextMap: Record<string, WatchEntry> = {};
    for (const r of fresh) {
      if (!favs.has(r.domain)) continue;
      nextMap[r.domain] = { status: r.status, ts: now };
    }
    return { changes: [], nextMap };
  }

  // Subsequent runs: start from prev, drop unfavorited, update with fresh.
  const nextMap: Record<string, WatchEntry> = {};
  for (const [domain, entry] of Object.entries(prev)) {
    if (favs.has(domain)) nextMap[domain] = entry;
  }

  const changes: WatchChange[] = [];
  for (const r of fresh) {
    if (!favs.has(r.domain)) continue;
    const prevEntry = prev[r.domain];
    if (prevEntry) {
      const kind = classifyChange(prevEntry.status, r.status);
      if (kind) {
        changes.push({
          domain: r.domain,
          from: prevEntry.status,
          to: r.status,
          ts: now,
        });
      }
    }
    nextMap[r.domain] = { status: r.status, ts: now };
  }

  return { changes, nextMap };
}

/** Prune watchChanges entries older than 7 days. PURE. */
export function pruneOldChanges(
  changes: WatchChange[],
  now: number = Date.now(),
): WatchChange[] {
  return changes.filter((c) => now - c.ts <= MAX_AGE_MS);
}

// ---- Stores ----

export const watchChanges = writable<WatchChange[]>([]);
export const watchRunning = writable<boolean>(false);

// Module-scope watch engine handle + promise resolver so stopWatchlist() can
// tear down an in-flight watch (e.g. when the user starts a run) without
// leaving the refreshWatchlist promise dangling.
let watchEngine: EngineHandle | null = null;
let watchResolve: (() => void) | null = null;

/**
 * Stop any in-flight watchlist re-check: terminate the watch engine and
 * settle watchRunning to false. Safe to call when no watch is running.
 * Called at the top of a user-initiated run so the two never hit registries
 * concurrently (SPEC §5 watch + §8 politeness).
 */
export function stopWatchlist(): void {
  const e = watchEngine;
  watchEngine = null;
  if (e) {
    try {
      e.destroy();
    } catch {
      // worker termination must not throw
    }
  }
  watchResolve?.();
  watchResolve = null;
  watchRunning.set(false);
}

// ---- Load + prune on module init ----

function loadChanges(): WatchChange[] {
  const raw = readJson<WatchChange[]>(WATCH_CHANGES_KEY);
  if (!raw || !Array.isArray(raw)) return [];
  return pruneOldChanges(raw);
}

watchChanges.set(loadChanges());

let changesWriteTimer: ReturnType<typeof setTimeout> | null = null;
watchChanges.subscribe((value) => {
  if (changesWriteTimer != null) clearTimeout(changesWriteTimer);
  changesWriteTimer = setTimeout(() => {
    changesWriteTimer = null;
    writeJson(WATCH_CHANGES_KEY, value);
  }, 500);
});

// ---- refreshWatchlist ----

export async function refreshWatchlist(): Promise<void> {
  if (get(watchRunning)) return;
  if (get(runState).phase === 'running') return;

  // Targets = favorites containing '.' (full domains), capped at 200.
  const favs = get(favorites);
  const targets: string[] = [];
  for (const d of favs) {
    if (d.includes('.')) targets.push(d);
    if (targets.length >= MAX_WATCH_DOMAINS) break;
  }
  if (targets.length === 0) return;

  watchRunning.set(true);

  try {
    const prev = readJson<Record<string, WatchEntry>>(KEYS.watch);
    const fresh: CheckResult[] = [];

    const registryVal = get(registry);
    const options: EngineOptions = {
      registry: registryVal,
      fetchTimeoutMs: 10000,
      maxRetries: 2,
      concurrency: 2,
    };

    await new Promise<void>((resolve) => {
      watchResolve = resolve;
      watchEngine = createEngine((event: EngineEvent) => {
        switch (event.type) {
          case 'result':
            fresh.push(event.result);
            break;
          case 'batch':
            fresh.push(...event.results);
            break;
          case 'finished':
            watchEngine?.destroy();
            watchEngine = null;
            watchResolve = null;
            resolve();
            break;
          case 'log':
            if (event.level === 'warn') console.warn(event.message);
            break;
        }
      });
      watchEngine.start(targets, options);
    });

    // Diff and classify.
    const { changes, nextMap } = diffWatch(prev, fresh, favs);
    writeJson(KEYS.watch, nextMap);

    if (changes.length > 0) {
      watchChanges.update((list) => [...list, ...changes]);
    }

    // Merge fresh results into the results store so the Favorites view
    // shows fresh data (only when the main engine isn't running).
    if (get(runState).phase !== 'running') {
      results.update((map) => {
        const next = new Map(map);
        for (const r of fresh) next.set(r.domain, r);
        return next;
      });
    }
  } finally {
    watchRunning.set(false);
    watchEngine = null;
    watchResolve = null;
  }
}
