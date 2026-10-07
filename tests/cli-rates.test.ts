import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { installStorage, resetStorage } from '../cli/shims/storage';
import { loadLiveRates, resolveCliRates } from '../cli/data';
import { DEFAULT_SETTINGS } from '../src/types';
import { FX_TTL_MS } from '../src/pricing/fx';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dh-cli-rates-'));
  tempDirs.push(dir);
  return dir;
}

const LIVE = { RUB: 80, EUR: 0.85 };

function fxResponse(rates: Record<string, number>): Response {
  return new Response(JSON.stringify({ result: 'success', base_code: 'USD', rates }), {
    status: 200,
  });
}

function countingFetch(result: Response | null): { impl: typeof fetch; calls: () => number } {
  let n = 0;
  const impl = (async () => {
    n += 1;
    if (result === null) throw new TypeError('offline');
    return result.clone();
  }) as unknown as typeof fetch;
  return { impl, calls: () => n };
}

function seedStaleCache(): void {
  globalThis.localStorage.setItem(
    'dh:cli:fx',
    JSON.stringify({ rates: { RUB: 70, EUR: 0.75 }, fetchedAt: Date.now() - FX_TTL_MS - 1 }),
  );
}

const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

beforeEach(() => {
  resetStorage();
  installStorage(makeTempDir());
});

afterAll(() => {
  resetStorage();
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true });
    } catch {
      // best-effort cleanup
    }
  }
  (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
});

describe('resolveCliRates', () => {
  it('explicit flags win without touching the network', async () => {
    const f = countingFetch(fxResponse(LIVE));
    const rates = await resolveCliRates('RUB', { RUB: 90, EUR: 0.9 }, f.impl);
    expect(rates).toEqual({ RUB: 90, EUR: 0.9 });
    expect(f.calls()).toBe(0);
  });

  it('USD display never fetches', async () => {
    const f = countingFetch(fxResponse(LIVE));
    const rates = await resolveCliRates('USD', undefined, f.impl);
    expect(rates).toEqual(DEFAULT_SETTINGS.rates);
    expect(f.calls()).toBe(0);
  });

  it('fetches live rates for RUB display and caches them', async () => {
    const f1 = countingFetch(fxResponse(LIVE));
    const rates = await resolveCliRates('RUB', undefined, f1.impl);
    expect(rates).toEqual(LIVE);
    expect(f1.calls()).toBe(1);

    const f2 = countingFetch(null);
    const cached = await resolveCliRates('RUB', undefined, f2.impl);
    expect(cached).toEqual(LIVE);
    expect(f2.calls()).toBe(0);
  });

  it('fills a missing explicit side from live rates', async () => {
    const f = countingFetch(fxResponse(LIVE));
    const rates = await resolveCliRates('EUR', { RUB: 99 }, f.impl);
    expect(rates).toEqual({ RUB: 99, EUR: 0.85 });
    expect(f.calls()).toBe(1);
  });

  it('prefers a stale cache over static defaults when the network fails', async () => {
    seedStaleCache();
    const f = countingFetch(null);
    const rates = await resolveCliRates('RUB', undefined, f.impl);
    expect(rates.RUB).toBe(70);
    expect(f.calls()).toBe(1);
  });

  it('falls back to static defaults with no cache and no network', async () => {
    const f = countingFetch(null);
    const rates = await resolveCliRates('RUB', undefined, f.impl);
    expect(rates).toEqual(DEFAULT_SETTINGS.rates);
  });
});

describe('loadLiveRates', () => {
  it('refetches when the cache is stale', async () => {
    seedStaleCache();
    const f = countingFetch(fxResponse(LIVE));
    expect(await loadLiveRates(f.impl)).toEqual(LIVE);
    expect(f.calls()).toBe(1);
  });

  it('keeps the stale cache on a malformed payload', async () => {
    seedStaleCache();
    const f = countingFetch(new Response(JSON.stringify({ result: 'error' }), { status: 200 }));
    expect(await loadLiveRates(f.impl)).toEqual({ RUB: 70, EUR: 0.75 });
  });

  it('returns null with no cache and no network', async () => {
    const f = countingFetch(null);
    expect(await loadLiveRates(f.impl)).toBeNull();
  });
});
