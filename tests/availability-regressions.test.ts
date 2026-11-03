import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { bestEntry, formatSourcePrice, normalizePriceZones, pricingZoneFor } from '../src/pricing/pricing';
import { DEFAULT_SETTINGS, type PricingTable, type CheckResult } from '../src/types';
import { results, runState, pricing } from '../src/ui/store';
import { details, premiumOverrides, premiumChecking, runPremiumCheck } from '../src/ui/premium-check';
import { fetchPremiumDetail } from '../src/ui/dig';

const p = (reg: number, renew: number | null = null) => ({ reg, renew, transfer: null });
const table: PricingTable = { generatedAt: '2026-01-01', sources: ['snapshot'], coupons: {}, tlds: {
  'рф': { sprinthost: p(222, 421), timeweb: p(248) },
  'xn--p1ai': { adminvps: p(252, 1786) },
  ru: { timeweb: p(248) },
  'com.ru': { sprinthost: p(432) },
}, sourceRub: { sprinthost: { 'рф': [17900, 33900] } } };

describe('zone and offer correctness', () => {
  it('merges IDN aliases and preserves the original RUB price', () => {
    const normalized = normalizePriceZones(table);
    expect(Object.keys(normalized.tlds['xn--p1ai'] ?? {}).sort()).toEqual(['adminvps', 'sprinthost', 'timeweb']);
    expect(bestEntry(normalized, 'xn--p1ai')?.registrarId).toBe('sprinthost');
    expect(pricingZoneFor('example.xn--p1ai', normalized, 'xn--p1ai')).toBe('xn--p1ai');
    expect(formatSourcePrice(normalized, 'xn--p1ai', 'sprinthost', 'reg', 222, { ...DEFAULT_SETTINGS, currency: 'RUB' })).toContain('179.00');
  });
  it('uses the longest actual priced suffix, without confusing com.ru with ru', () => {
    expect(pricingZoneFor('example.com.ru', table, 'ru')).toBe('com.ru');
    expect(bestEntry(table, pricingZoneFor('example.com.ru', table, 'ru'))?.entry.reg).toBe(432);
    expect(pricingZoneFor('com.ru', table, 'ru')).toBe('ru');
  });
});

describe('third-party advisory checks', () => {
  beforeEach(() => {
    results.set(new Map()); details.set({}); premiumOverrides.set({}); premiumChecking.set(false);
    pricing.set({ table, fetchedAt: 0, fromCache: true });
    runState.set({ phase: 'done', done: 1, total: 1, available: 1, errors: 0, startedAt: 0, elapsedMs: 0 });
  });
  it('downgrades a conflicting RDAP result, not to taken, and never applies a premium price', async () => {
    const r: CheckResult = { domain: 'a.ru', tld: 'ru', status: 'available', source: 'rdap', checkedAt: Date.now() - 1 };
    results.set(new Map([[r.domain, r]]));
    await runPremiumCheck(async () => ({ price: 5, premium: true, availability: 'unavailable', registrar: null, regPrice: null, url: null }));
    expect(get(results).get('a.ru')?.status).toBe('unknown');
    expect(get(premiumOverrides)['a.ru']).toBeUndefined();
  });
  it('does not overwrite a recheck that happened while DigMyName was in flight', async () => {
    const r: CheckResult = { domain: 'a.ru', tld: 'ru', status: 'available', source: 'rdap', checkedAt: Date.now() - 1 };
    results.set(new Map([[r.domain, r]]));
    await runPremiumCheck(async () => {
      results.set(new Map([[r.domain, { ...r, checkedAt: Date.now() + 1 }]]));
      return { price: null, availability: 'unavailable', registrar: null, regPrice: null, url: null };
    });
    expect(get(results).get('a.ru')?.status).toBe('available');
  });
  it('does not interpret an uncertain provider response as available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result: { domain: 'a.ru', available: true, uncertain: true } }), { status: 200 })));
    try { expect((await fetchPremiumDetail('a.ru')).availability).toBe('unknown'); }
    finally { vi.unstubAllGlobals(); }
  });
});
