/**
 * File-backed localStorage polyfill for Node.js.
 *
 * src/core/cache.ts and src/core/bootstrap.ts call the global `localStorage`
 * directly (getItem/setItem/removeItem). In a browser this is the Web Storage
 * API; in Node it does not exist. This shim installs a minimal Storage-like
 * object on `globalThis.localStorage` backed by a JSON file on disk.
 *
 * installStorage() MUST be called before any module that touches localStorage
 * executes a path that reads/writes it. The shim never throws — a corrupted or
 * unwritable storage file degrades to an empty/in-memory store, matching the
 * try/catch resilience the browser code already relies on.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let store: Map<string, string> | null = null;
let filePath: string | null = null;

/** Lazily load the JSON map from disk. Never throws. */
function load(): Map<string, string> {
  if (store) return store;
  store = new Map();
  if (filePath == null) return store;
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string') store.set(key, value);
        }
      }
    }
  } catch {
    // corrupted file — start with an empty store
  }
  return store;
}

/** Persist the map to disk via a temp file + rename (atomic-ish). Never throws. */
function persist(): void {
  if (filePath == null) return;
  const map = store;
  if (map == null) return;
  try {
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(map)));
    renameSync(tmp, filePath);
  } catch {
    // unwritable / disk full — data stays in memory for this session
  }
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/**
 * Install the file-backed localStorage polyfill on `globalThis`.
 * Safe to call once at process start. `dir` defaults to
 * `<homedir>/.domain-hunter`; the storage file is `storage.json` inside it.
 */
export function installStorage(dir?: string): void {
  const storageDir = dir ?? join(homedir(), '.domain-hunter');
  filePath = join(storageDir, 'storage.json');
  try {
    mkdirSync(storageDir, { recursive: true });
  } catch {
    // directory creation failed — shim still works in-memory
  }

  const impl: StorageLike = {
    getItem(key: string): string | null {
      const map = load();
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      const map = load();
      map.set(key, String(value));
      persist();
    },
    removeItem(key: string): void {
      const map = load();
      map.delete(key);
      persist();
    },
    clear(): void {
      const map = load();
      map.clear();
      persist();
    },
  };

  (globalThis as { localStorage: StorageLike }).localStorage = impl;
}

/** Test/inspection helper: drop the storage file entirely. Never throws. */
export function resetStorage(): void {
  store = null;
  if (filePath != null) {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
}
