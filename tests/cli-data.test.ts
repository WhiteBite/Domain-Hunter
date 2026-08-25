import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { installStorage, resetStorage } from '../cli/shims/storage';
import { loadPricingTable, loadRegistry } from '../cli/data';

// Unique storage dir per test so the 24h TTL caches never cross-talk.
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dh-cli-data-'));
  tempDirs.push(dir);
  return dir;
}

const originalLocalStorage = (
  globalThis as { localStorage?: Storage }
).localStorage;

beforeEach(() => {
  resetStorage();
});

afterAll(() => {
  resetStorage();
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
  (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
});

// Minimal valid registry shape that passes isValidRegistryShape in cli/data.ts
// (requires `infras` to be an object and `tlds` to be an array).
const validRegistry = { infras: {}, tlds: [], hackTlds: [] };

// A compact pricing snapshot with one TLD / one registrar in the
// [reg, renew, transfer] array form. After expansion the entry should be
// { reg: 100, renew: 200, transfer: null }.
const compactSnapshot = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  sources: ['snapshot'],
  tlds: { com: { porkbun: [100, 200, null] } },
  coupons: {},
};

// fetchImpl that rejects every URL — simulates full offline. Used to verify
// that loadRegistry/loadPricingTable fall back to bundled data gracefully.
const offlineFetch = (() => {
  const fn = async (): Promise<Response> => {
    throw new TypeError('offline');
  };
  return fn as unknown as typeof fetch;
})();

describe('loadRegistry', () => {
  it('fetches a fresh registry from GitHub and reports source "fresh"', async () => {
    const dir = makeTempDir();
    installStorage(dir);

    const fetchImpl = (async (url: string) => {
      if (url.includes('raw.githubusercontent.com')) {
        return new Response(JSON.stringify(validRegistry), { status: 200 });
      }
      // IANA bootstrap — reject (non-fatal, bootstrapMerged stays false).
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const result = await loadRegistry({ fetchImpl });
    expect(result.source).toBe('fresh');
    expect(result.bootstrapMerged).toBe(false);
  });

  it('falls back to the bundled registry on fetch rejection', async () => {
    const dir = makeTempDir();
    installStorage(dir);

    const result = await loadRegistry({ fetchImpl: offlineFetch });
    expect(result.source).toBe('bundled');
    expect(result.bootstrapMerged).toBe(false);
  });

  it('falls back to bundled on non-200 status', async () => {
    const dir = makeTempDir();
    installStorage(dir);

    const fetchImpl = (() =>
      new Response('not found', { status: 404 })) as unknown as typeof fetch;

    const result = await loadRegistry({ fetchImpl });
    expect(result.source).toBe('bundled');
  });

  it('serves a cached registry within TTL without fetching GitHub', async () => {
    const dir = makeTempDir();
    installStorage(dir);

    // Pre-seed the 24h TTL cache with a valid registry.
    globalThis.localStorage.setItem(
      'dh:cli:tlds',
      JSON.stringify({ json: validRegistry, fetchedAt: Date.now() }),
    );

    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const result = await loadRegistry({ fetchImpl });
    expect(result.source).toBe('fresh');
    // The GitHub tlds URL must NOT be fetched (TTL cache hit). The IANA
    // bootstrap URL may still be fetched (it has its own cache).
    expect(
      urls.some((u) => u.includes('raw.githubusercontent.com')),
    ).toBe(false);
  });

  it('does not fetch anything when offline:true', async () => {
    const dir = makeTempDir();
    installStorage(dir);

    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const result = await loadRegistry({ fetchImpl, offline: true });
    expect(result.source).toBe('bundled');
    expect(urls).toHaveLength(0);
  });
});

describe('loadPricingTable', () => {
  it('expands compact [reg,renew,transfer] arrays into PriceEntry objects', async () => {
    const dir = makeTempDir();
    installStorage(dir);

    const fetchImpl = (async (url: string) => {
      if (
        url.includes('raw.githubusercontent.com') &&
        url.includes('pricing.snapshot.json')
      ) {
        return new Response(JSON.stringify(compactSnapshot), { status: 200 });
      }
      // Porkbun + Cloudflare live — reject so loadPricing uses the snapshot.
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const state = await loadPricingTable({
      fetchImpl,
      currency: 'USD',
      rates: { RUB: 97, EUR: 0.92 },
    });

    const entry = state.table.tlds.com?.porkbun;
    expect(entry).toEqual({ reg: 100, renew: 200, transfer: null });
  });

  it('serves a cached pricing snapshot within TTL without fetching GitHub', async () => {
    const dir = makeTempDir();
    installStorage(dir);

    // Pre-seed the 24h TTL cache.
    globalThis.localStorage.setItem(
      'dh:cli:pricing-snapshot',
      JSON.stringify({ json: compactSnapshot, fetchedAt: Date.now() }),
    );

    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const state = await loadPricingTable({
      fetchImpl,
      currency: 'USD',
      rates: { RUB: 97, EUR: 0.92 },
    });

    // The GitHub pricing-snapshot URL must NOT be fetched (TTL cache hit).
    // Live Porkbun/Cloudflare may still be attempted (and fail).
    expect(
      urls.some((u) => u.includes('raw.githubusercontent.com')),
    ).toBe(false);
    // The cached snapshot is still expanded and present in the table.
    expect(state.table.tlds.com?.porkbun).toEqual({
      reg: 100,
      renew: 200,
      transfer: null,
    });
  });

  it('falls back to the bundled snapshot when the GitHub fetch fails', async () => {
    const dir = makeTempDir();
    installStorage(dir);

    const state = await loadPricingTable({
      fetchImpl: offlineFetch,
      currency: 'USD',
      rates: { RUB: 97, EUR: 0.92 },
    });

    // Bundled snapshot is non-empty (has real TLDs like .com).
    expect(state.table.tlds.com).toBeDefined();
    // All live sources failed → sources is ['snapshot'].
    expect(state.table.sources).toContain('snapshot');
  });
});
