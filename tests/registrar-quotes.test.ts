import { describe, it, expect } from 'vitest';
import { buildRegistrarQuotes, pickRegistrar } from '../src/ui/registrar-quotes';
import type { PriceEntry, PricingTable, RegistrarConfig } from '../src/types';

function registrar(id: string, name: string, url: string): RegistrarConfig {
  return { id, name, searchUrl: url };
}

const REGISTRARS: RegistrarConfig[] = [
  registrar('deep1', 'Deep One', 'https://deep1.example/?q={domain}'),
  registrar('deep2', 'Deep Two', 'https://deep2.example/checkout/{domain}'),
  registrar('landing', 'Landing Co', 'https://landing.example/'),
];

function table(entries: Record<string, Record<string, PriceEntry>>): PricingTable {
  return { generatedAt: 'x', sources: ['snapshot'], tlds: entries, coupons: {} };
}

describe('pickRegistrar', () => {
  const T = table({
    com: {
      deep1: { reg: 1200, renew: 1400, transfer: 1200 },
      deep2: { reg: 1000, renew: 1500, transfer: 1000 },
      landing: { reg: 900, renew: 1600, transfer: 900 },
    },
  });

  it('prefers the cheapest deep-link registrar over a cheaper landing one', () => {
    const r = pickRegistrar(REGISTRARS, T, 'com');
    expect(r.registrar?.id).toBe('deep2');
    expect(r.entry?.reg).toBe(1000);
  });

  it('falls back to the landing-only registrar when no deep-link quotes exist', () => {
    const t = table({ com: { landing: { reg: 900, renew: 1600, transfer: 900 } } });
    const r = pickRegistrar(REGISTRARS, t, 'com');
    expect(r.registrar?.id).toBe('landing');
  });

  it('returns an always-present object with null fields when nothing matches', () => {
    const r = pickRegistrar(REGISTRARS, table({}), 'io');
    expect(r).toEqual({ registrar: null, entry: null });
    expect(pickRegistrar(REGISTRARS, null, 'com')).toEqual({ registrar: null, entry: null });
  });

  it('skips entries with a null reg price', () => {
    const t = table({ com: { deep1: { reg: null, renew: null, transfer: null } } });
    const r = pickRegistrar(REGISTRARS, t, 'com');
    expect(r.registrar).toBeNull();
  });
});

describe('buildRegistrarQuotes', () => {
  const T = table({
    com: {
      deep1: { reg: 1200, renew: 1400, transfer: 1200 },
      landing: { reg: 900, renew: 1600, transfer: 900 },
    },
  });

  it('sorts by reg price and builds deep/landing URLs', () => {
    const quotes = buildRegistrarQuotes(REGISTRARS, T, 'com', 'ex ample.com');
    expect(quotes).toHaveLength(2);
    expect(quotes[0]?.id).toBe('landing');
    expect(quotes[0]?.url).toBe('https://landing.example/');
    expect(quotes[0]?.hasDeepLink).toBe(false);
    expect(quotes[1]?.url).toBe('https://deep1.example/?q=ex%20ample.com');
    expect(quotes[1]?.hasDeepLink).toBe(true);
  });

  it('uses renewal as the tie-breaker', () => {
    const t = table({
      com: {
        deep1: { reg: 1000, renew: 2000, transfer: 1000 },
        deep2: { reg: 1000, renew: 1500, transfer: 1000 },
      },
    });
    const quotes = buildRegistrarQuotes(REGISTRARS, t, 'com', 'x.com');
    expect(quotes.map((q) => q.id)).toEqual(['deep2', 'deep1']);
  });

  it('returns [] for unknown zones or a missing table', () => {
    expect(buildRegistrarQuotes(REGISTRARS, table({}), 'io', 'a.io')).toEqual([]);
    expect(buildRegistrarQuotes(REGISTRARS, null, 'com', 'a.com')).toEqual([]);
  });
});
