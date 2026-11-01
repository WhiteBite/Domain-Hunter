import { describe, expect, it, vi } from 'vitest';
import { runPricesCommand } from '../cli/core';
import { formatOutcome } from '../cli/format';

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
