import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { installStorage, resetStorage } from '../cli/shims/storage';

// Per-test temp dirs so the file-backed shim never touches the user's
// ~/.domain-hunter. Cleaned up in afterAll.
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dh-cli-storage-'));
  tempDirs.push(dir);
  return dir;
}

// Capture the original global so we can restore it after the suite (Node 20
// has no native localStorage; Node 22+ might). Other test files stub their
// own localStorage via vi.stubGlobal, so leaking our shim could skew them.
const originalLocalStorage = (
  globalThis as { localStorage?: Storage }
).localStorage;

beforeEach(() => {
  // Reset the module-level singleton (store + filePath) and delete any
  // leftover storage file so each test starts from a clean slate.
  resetStorage();
});

afterAll(() => {
  resetStorage();
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true });
    } catch {
      // ignore — best-effort cleanup
    }
  }
  (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
});

describe('installStorage — file-backed localStorage shim', () => {
  it('round-trips setItem/getItem', () => {
    const dir = makeTempDir();
    installStorage(dir);
    const ls = globalThis.localStorage;
    ls.setItem('k', 'v');
    expect(ls.getItem('k')).toBe('v');
  });

  it('returns null for a missing key', () => {
    const dir = makeTempDir();
    installStorage(dir);
    expect(globalThis.localStorage.getItem('nope')).toBeNull();
  });

  it('removeItem deletes a key', () => {
    const dir = makeTempDir();
    installStorage(dir);
    const ls = globalThis.localStorage;
    ls.setItem('k', 'v');
    ls.removeItem('k');
    expect(ls.getItem('k')).toBeNull();
  });

  it('persists data across a second installStorage on the same dir', () => {
    // Re-installing on the same dir must not wipe existing data — the
    // in-memory store carries over and the file is already on disk.
    const dir = makeTempDir();
    installStorage(dir);
    globalThis.localStorage.setItem('persisted', 'yes');
    installStorage(dir);
    expect(globalThis.localStorage.getItem('persisted')).toBe('yes');
  });

  it('writes a JSON file to disk under <dir>/storage.json', () => {
    const dir = makeTempDir();
    installStorage(dir);
    globalThis.localStorage.setItem('onDisk', '1');
    const file = join(dir, 'storage.json');
    expect(existsSync(file)).toBe(true);
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<
      string,
      string
    >;
    expect(raw.onDisk).toBe('1');
  });

  it('does not throw on a corrupted storage.json (degrades to empty store)', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'storage.json'), '{not valid json');
    expect(() => installStorage(dir)).not.toThrow();
    expect(globalThis.localStorage.getItem('anything')).toBeNull();
  });

  it('does not throw on a non-object storage.json', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'storage.json'), '[]');
    expect(() => installStorage(dir)).not.toThrow();
    expect(globalThis.localStorage.getItem('x')).toBeNull();
  });

  it('does not throw on an empty storage.json', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'storage.json'), '');
    expect(() => installStorage(dir)).not.toThrow();
    expect(globalThis.localStorage.getItem('x')).toBeNull();
  });

  it('clear() empties the store and the file', () => {
    const dir = makeTempDir();
    installStorage(dir);
    const ls = globalThis.localStorage;
    ls.setItem('a', '1');
    ls.setItem('b', '2');
    ls.clear();
    expect(ls.getItem('a')).toBeNull();
    expect(ls.getItem('b')).toBeNull();
    // The file on disk should reflect the cleared state.
    const raw = JSON.parse(readFileSync(join(dir, 'storage.json'), 'utf8')) as Record<string, string>;
    expect(Object.keys(raw)).toHaveLength(0);
  });
});
