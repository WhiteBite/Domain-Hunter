/**
 * Local result cache — UI thread only (SPEC §5 storage keys).
 * In-memory Map is the source of truth; localStorage writes are debounced
 * and capped (eviction by insertion order) to avoid O(n²) serialize thrash
 * and silent quota exhaustion.
 */
import type { CacheEntry } from '../types';

const CACHE_KEY = 'dh:v1:cache';
const MAX_ENTRIES = 4000;
const WRITE_DEBOUNCE_MS = 1500;

let memory: Map<string, CacheEntry> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Map<string, CacheEntry> {
  if (memory) return memory;
  memory = new Map();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value.ts === 'number' && typeof value.status === 'string') {
          memory.set(key, value);
        }
      }
    }
  } catch {
    // corrupted storage — start empty
  }
  return memory;
}

function scheduleWrite(): void {
  if (writeTimer != null) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const map = load();
    if (map.size > MAX_ENTRIES) {
      const excess = map.size - MAX_ENTRIES;
      const keys = [...map.keys()];
      for (let i = 0; i < excess; i++) {
        const k = keys[i];
        if (k != null) map.delete(k);
      }
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(map)));
    } catch {
      // quota exceeded — cache stays in memory for this session
    }
  }, WRITE_DEBOUNCE_MS);
}

export function getFresh(domain: string, ttlMs: number): CacheEntry | null {
  const entry = load().get(domain);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) return null;
  return entry;
}

export function put(domain: string, entry: CacheEntry): void {
  load().set(domain, entry);
  scheduleWrite();
}

export function clearCache(): void {
  load().clear();
  if (writeTimer != null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
