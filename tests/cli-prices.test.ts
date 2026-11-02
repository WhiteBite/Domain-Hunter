import { describe, expect, it, vi } from 'vitest';
import { runPricesCommand } from '../cli/core';
import { formatOutcome } from '../cli/format';
import * as keys from '../cli/keys';

vi.mock('../cli/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli/data')>();
  return {
    ...actual,
    resolveCliRates: vi.fn().mockResolvedValue({ RUB: 90, EUR: 0.9 }),
    loadPricingTable: vi.fn().mockResolvedValue({
      fetchedAt: 1, fromCache: false,
      table: {
        generatedAt: '2026-11-01', sources: ['snapshot'], coupons: {},
        tlds: { ru: { adminvps: { reg: 252, renew: 1786, transfer: null }, other: { reg: 500, renew: 700, transfer: null } } },
        sourcePromotions: { adminvps: ['ru'] },
      },
    }),
  };
});

describe('CLI seller promotions', () => {
  it('reports seller-marked promotion separately from ratio-based promo trap', async () => {
    const outcome = await runPricesCommand({ tlds: ['ru'] });
    const row = outcome.rows[0]!;
    expect(row.best?.sellerPromotion).toBe(true);
    expect(row.entries.adminvps?.sellerPromotion).toBe(true);
    expect(row.entries.other?.sellerPromotion).toBeUndefined();
    expect(formatOutcome(outcome, 'csv')).toContain('seller_promo');
    expect(JSON.parse(formatOutcome(outcome, 'json')).rows[0].best.sellerPromotion).toBe(true);
  });
});


describe('CLI Dynadot source', () => {
  it('fetches documented prices and merges them into the output', async () => {
    const key = vi.spyOn(keys, 'loadRegistrarKeys').mockReturnValue({ dynadot: 'test-key' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      TldPriceResponse: { ResponseCode: 0, Status: 'success', Currency: 'USD', TldPrice: [
        { Tld: 'ru', minDuration: 1, Price: { Unit: '(Price/1 year)', Register: '1.99', Renew: '2.99', Transfer: '1.99' } },
      ] },
    }) }) as unknown as typeof fetch;
    try {
      const outcome = await runPricesCommand({ tlds: ['ru'], sources: ['dynadot'], fetchImpl });
      expect(outcome.rows[0]?.entries.dynadot).toEqual({ reg: 199, renew: 299, transfer: 199 });
      expect(outcome.rows[0]?.entries.adminvps?.reg).toBe(252);
      expect(outcome.sources).toContain('dynadot');
    } finally { key.mockRestore(); }
  });
});
