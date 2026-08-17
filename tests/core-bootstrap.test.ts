import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBootstrap, mergeWithCurated, parseBootstrapServices } from '../src/core/bootstrap';
import { clearCache, getFresh, put } from '../src/core/cache';
import type { TldRegistry } from '../src/types';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

const ianaSample = {
  version: '1.0',
  publicationDate: '2026-07-23T00:00:00Z',
  services: [
    [['org'], ['https://rdap.pir.org/']],
    [
      ['shop', 'store2'],
      ['https://rdap.centralnic.com/shop/domain/', 'https://backup.centralnic.com/shop/domain/'],
    ],
    [['uk'], ['https://rdap.nominet.uk/uk/domain/']],
    'garbage',
    [['broken']],
  ],
};

describe('parseBootstrapServices', () => {
  it('extracts tld/url pairs and skips garbage', () => {
    const entries = parseBootstrapServices(ianaSample);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ tlds: ['org'], urls: ['https://rdap.pir.org/'] });
    expect(entries[1]?.urls).toHaveLength(2);
  });

  it('handles null/unknown input', () => {
    expect(parseBootstrapServices(null)).toEqual([]);
    expect(parseBootstrapServices({ foo: 1 })).toEqual([]);
    expect(parseBootstrapServices('x')).toEqual([]);
  });
});

describe('mergeWithCurated', () => {
  const curated: TldRegistry = {
    infras: {
      verisign: {
        id: 'verisign',
        rdapBase: 'https://rdap.verisign.com/{tld}/v1/domain/',
        minPauseMs: 120,
        maxParallel: 6,
        trust: 'high',
      },
    },
    tlds: [{ tld: 'org', infra: 'verisign' }],
    hackTlds: ['io'],
  };

  it('curated zones win on conflict', () => {
    const merged = mergeWithCurated(curated, ianaSample);
    const org = merged.tlds.find((t) => t.tld === 'org');
    expect(org?.infra).toBe('verisign');
  });

  it('adds bootstrap zones grouped by base url with polite defaults', () => {
    const merged = mergeWithCurated(curated, ianaSample);
    const shop = merged.tlds.find((t) => t.tld === 'shop');
    expect(shop).toBeDefined();
    const infra = shop ? merged.infras[shop.infra] : undefined;
    expect(infra?.minPauseMs).toBe(400);
    expect(infra?.maxParallel).toBe(2);
    expect(infra?.rdapBase).toBe('https://rdap.centralnic.com/shop/domain/');
  });

  it('marks 2-letter zones low trust, longer zones high trust', () => {
    const merged = mergeWithCurated(curated, ianaSample);
    expect(merged.tlds.find((t) => t.tld === 'uk')?.trust).toBe('low');
    expect(merged.tlds.find((t) => t.tld === 'shop')?.trust).toBe('high');
  });

  it('preserves curated infras and hackTlds', () => {
    const merged = mergeWithCurated(curated, ianaSample);
    expect(merged.infras['verisign']).toBeDefined();
    expect(merged.hackTlds).toEqual(['io']);
  });
});

describe('cache', () => {
  it('stores and returns fresh entries', () => {
    put('a.com', { status: 'taken', source: 'rdap', ts: Date.now(), tld: 'com' });
    expect(getFresh('a.com', 1000)?.status).toBe('taken');
  });

  it('expires entries beyond ttl', () => {
    put('b.com', { status: 'taken', source: 'rdap', ts: Date.now() - 5000, tld: 'com' });
    expect(getFresh('b.com', 1000)).toBeNull();
  });

  it('clears everything', () => {
    put('c.com', { status: 'taken', source: 'rdap', ts: Date.now(), tld: 'com' });
    clearCache();
    expect(getFresh('c.com', 1000)).toBeNull();
  });
});

describe('fetchBootstrap', () => {
  it('caches the bootstrap json for 24h', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify(ianaSample), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchBootstrap(fetchImpl);
    await fetchBootstrap(fetchImpl);
    expect(calls).toBe(1);
  });

  it('returns null on network failure', async () => {
    const fetchImpl = (async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch;
    expect(await fetchBootstrap(fetchImpl)).toBeNull();
  });
});
