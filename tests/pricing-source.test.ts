import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { commonWords } from '../src/config/dictionaries/common-words';
import { priceSourceLabel } from '../src/ui/price-source';
import { loadPricing, freshnessLabel } from '../src/pricing/pricing';
import { locale } from '../src/i18n';
import type { PricingTable } from '../src/types';

const entry = { reg: 1000, renew: 1200, transfer: null };
const baseline: PricingTable = {
  generatedAt: '2024-01-01T00:00:00Z', sources: ['snapshot'], coupons: {},
  webhost1UpdatedAt: '2026-10-01T23:00:00Z', webhost1RenewalUpdatedAt: '2026-10-03T01:00:00Z',
  tlds: { com: { porkbun: entry }, net: { porkbun: entry }, ru: { webhost1: entry } },
};

describe('price provenance', () => {
  it('distinguishes partial API overlays and retains provenance across the cache', async () => {
    locale.set('en');
    let saved = '';
    vi.stubGlobal('localStorage', { getItem: () => saved || null, setItem: (_: string, value: string) => { saved = value; } });
    const fetchImpl = (async (url: string) => {
      if (!url.includes('porkbun')) throw new Error('offline');
      return { ok: true, json: async () => ({ pricing: { com: { registration: '9.50', renewal: '11.00' } } }) };
    }) as unknown as typeof fetch;
    try {
      const state = await loadPricing({ force: true, snapshotOverride: baseline, fetchImpl });
      expect(state.table.generatedAt).toBe(baseline.generatedAt);
      expect(state.table.priceProvenance?.liveTlds).toEqual({ porkbun: ['com'] });
      const day = state.table.priceProvenance!.observedAt.slice(0, 10);
      expect(priceSourceLabel(state.table, 'com', 'porkbun', 'reg')).toBe(`API: ${day}`);
      expect(priceSourceLabel(state.table, 'net', 'porkbun', 'reg')).toBe('Snapshot: date unknown');
      expect(priceSourceLabel(state.table, 'ru', 'webhost1', 'reg')).toBe('Snapshot: 2026-10-01');
      expect(priceSourceLabel(state.table, 'ru', 'webhost1', 'renew')).toBe('Snapshot: 2026-10-03');
      expect(priceSourceLabel(state.table, 'nope', 'webhost1', 'reg')).toBe('');
      expect(freshnessLabel(state).key).toBe('price.fresh.mixed');
      const cached = await loadPricing({ fetchImpl });
      expect(cached.fromCache).toBe(true);
      expect(priceSourceLabel(cached.table, 'com', 'porkbun', 'reg')).toBe(`API: ${day}`);
      expect(priceSourceLabel(cached.table, 'net', 'porkbun', 'reg')).toBe('Snapshot: date unknown');
    } finally { vi.unstubAllGlobals(); }
  });

  it('does not fabricate origins for legacy seller-level cached data', () => {
    locale.set('en');
    const old = { ...baseline, sources: ['porkbun'] };
    expect(priceSourceLabel(old, 'com', 'porkbun', 'reg')).toBe('Source and date unknown');
    expect(priceSourceLabel(old, 'ru', 'webhost1', 'reg')).toBe('Snapshot: 2026-10-01');
    expect(priceSourceLabel({ ...baseline, webhost1UpdatedAt: 'invalid' }, 'ru', 'webhost1', 'reg')).toBe('Snapshot: date unknown');
  });

  it('does not date fallback prices using the current load time', async () => {
    const state = await loadPricing({ force: true, snapshotOverride: baseline,
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch });
    expect(state.table.generatedAt).toBe(baseline.generatedAt);
    expect(state.table.priceProvenance?.liveTlds).toEqual({});
    expect(priceSourceLabel(state.table, 'net', 'porkbun', 'reg')).toBe('Snapshot: date unknown');
  });
});

it('compact common words preserve every word and its order', () => {
  expect(commonWords).toHaveLength(8765);
  expect(createHash('sha256').update(JSON.stringify(commonWords)).digest('hex')).toBe('d080a16f5ac2ed407d026499e143277bec4d515c402e572745601e384b6d8289');
});
