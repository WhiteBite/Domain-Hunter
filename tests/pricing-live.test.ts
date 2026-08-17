import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPricing, normalizePorkbun, normalizeCloudflare } from '../src/pricing/pricing';
import snapshot from '../src/config/pricing.snapshot.json';
import type { PricingTable } from '../src/types';

const SNAPSHOT = snapshot as unknown as PricingTable;

describe('normalizePorkbun', () => {
  it('converts decimal strings to integer cents', () => {
    const result = normalizePorkbun({
      com: { registration: '11.68', renewal: '11.68', transfer: '11.68' },
      dev: { registration: '8.75', renewal: '12.87', transfer: '12.87' },
    });
    expect(result.tlds.com?.porkbun).toEqual({ reg: 1168, renew: 1168, transfer: 1168 });
    expect(result.tlds.dev?.porkbun).toEqual({ reg: 875, renew: 1287, transfer: 1287 });
  });

  it('parses amount coupons (dollars -> cents)', () => {
    const result = normalizePorkbun({
      com: {
        registration: '11.68',
        renewal: '11.68',
        transfer: '11.68',
        coupons: [{ code: 'XYZ52', first_year_only: 'true', type: 'amount', amount: '0.95' }],
      },
    });
    expect(result.coupons.com).toHaveLength(1);
    expect(result.coupons.com?.[0]).toEqual({
      code: 'XYZ52',
      firstYearOnly: true,
      type: 'amount',
      amount: 95,
    });
  });

  it('parses percentage coupons (whole percent)', () => {
    const result = normalizePorkbun({
      xyz: {
        registration: '2.04',
        renewal: '12.98',
        transfer: '12.98',
        coupons: [{ code: 'PCT10', first_year_only: 'false', type: 'percentage', amount: '10' }],
      },
    });
    expect(result.coupons.xyz?.[0]).toEqual({
      code: 'PCT10',
      firstYearOnly: false,
      type: 'percentage',
      amount: 10,
    });
  });

  it('handles null transfer', () => {
    const result = normalizePorkbun({
      ai: { registration: '82.70', renewal: '82.70', transfer: null },
    });
    expect(result.tlds.ai?.porkbun).toEqual({ reg: 8270, renew: 8270, transfer: null });
  });

  it('skips coupons without a code', () => {
    const result = normalizePorkbun({
      com: {
        registration: '11.68',
        renewal: '11.68',
        transfer: '11.68',
        coupons: [{ first_year_only: 'true', type: 'amount', amount: '1' }],
      },
    });
    expect(result.coupons.com).toBeUndefined();
  });
});

describe('normalizeCloudflare', () => {
  it('converts numbers to integer cents', () => {
    const result = normalizeCloudflare({
      com: { registration: 10.44, renewal: 10.44 },
      dev: { registration: 10.44, renewal: 12.25 },
    });
    expect(result.tlds.com?.cloudflare).toEqual({ reg: 1044, renew: 1044, transfer: null });
    expect(result.tlds.dev?.cloudflare).toEqual({ reg: 1044, renew: 1225, transfer: null });
  });

  it('produces no coupons', () => {
    const result = normalizeCloudflare({ com: { registration: 10.44, renewal: 10.44 } });
    expect(result.coupons).toEqual({});
  });
});

describe('loadPricing', () => {
  beforeEach(() => {
    const data: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem(key: string) {
        return data[key] ?? null;
      },
      setItem(key: string, value: string) {
        data[key] = value;
      },
      removeItem(key: string) {
        delete data[key];
      },
      clear() {
        for (const k of Object.keys(data)) delete data[k];
      },
    });
  });

  it('returns cached pricing when fresh', async () => {
    const table: PricingTable = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      sources: ['porkbun'],
      tlds: { com: { porkbun: { reg: 999, renew: 999, transfer: 999 } } },
      coupons: {},
    };
    localStorage.setItem('dh:v1:pricing', JSON.stringify({ table, fetchedAt: Date.now() }));

    const state = await loadPricing();
    expect(state.fromCache).toBe(true);
    expect(state.table.tlds.com?.porkbun?.reg).toBe(999);
  });

  it('refetches when cache is stale and force is true', async () => {
    const staleTable: PricingTable = {
      generatedAt: '2020-01-01T00:00:00.000Z',
      sources: ['porkbun'],
      tlds: { com: { porkbun: { reg: 1, renew: 1, transfer: 1 } } },
      coupons: {},
    };
    localStorage.setItem(
      'dh:v1:pricing',
      JSON.stringify({ table: staleTable, fetchedAt: 0 }),
    );

    const mockFetch = (async (url: string) => {
      if (url.includes('porkbun')) {
        return {
          ok: true,
          json: async () => ({
            pricing: { com: { registration: '11.68', renewal: '11.68', transfer: '11.68' } },
          }),
        };
      }
      if (url.includes('cfdomainpricing')) {
        return { ok: true, json: async () => ({ com: { registration: 10.44, renewal: 10.44 } }) };
      }
      throw new Error('unknown url');
    }) as unknown as typeof fetch;

    const state = await loadPricing({ force: true, fetchImpl: mockFetch });
    expect(state.fromCache).toBe(false);
    expect(state.table.sources).toContain('porkbun');
    expect(state.table.sources).toContain('cloudflare');
    expect(state.table.tlds.com?.porkbun?.reg).toBe(1168);
    expect(state.table.tlds.com?.cloudflare?.reg).toBe(1044);
  });

  it('falls back to snapshot when all sources fail', async () => {
    const failFetch = vi.fn().mockRejectedValue(new Error('network down'));
    const state = await loadPricing({
      force: true,
      fetchImpl: failFetch as unknown as typeof fetch,
    });
    expect(state.table.sources).toEqual(SNAPSHOT.sources);
    expect(state.table.sources).toContain('snapshot');
    expect(state.fromCache).toBe(false);
  });

  it('persists fetched table to localStorage', async () => {
    const mockFetch = (async (url: string) => {
      if (url.includes('porkbun')) {
        return {
          ok: true,
          json: async () => ({
            pricing: { com: { registration: '11.68', renewal: '11.68', transfer: '11.68' } },
          }),
        };
      }
      throw new Error('cf fail');
    }) as unknown as typeof fetch;

    await loadPricing({ force: true, fetchImpl: mockFetch });
    const stored = localStorage.getItem('dh:v1:pricing');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as { table: PricingTable; fetchedAt: number };
    expect(parsed.table.sources).toContain('porkbun');
    expect(parsed.table.sources).not.toContain('cloudflare');
  });
});
