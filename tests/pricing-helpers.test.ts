import { describe, it, expect } from 'vitest';
import { tco3, bestCoupon, couponDiscountCents } from '../src/pricing/pricing';
import type { Coupon, PriceEntry, PricingTable } from '../src/types';

function table(
  tlds: Record<string, Record<string, PriceEntry>>,
  coupons: Record<string, Coupon[]> = {},
): PricingTable {
  return { generatedAt: '2026-01-01T00:00:00.000Z', sources: ['porkbun'], tlds, coupons };
}

function coupon(
  code: string,
  type: Coupon['type'],
  amount: number,
  firstYearOnly = false,
): Coupon {
  return { code, firstYearOnly, type, amount };
}

describe('tco3', () => {
  it('returns the true min over registrars, not the TCO at the reg-cheapest registrar', () => {
    // Given two registrars where the reg-cheapest (A) has a huge renewal, so
    // its 3-year TCO (10100) is far above B's (6000). The old bestEntry-based
    // impl returned 10100; SPEC §9 requires the true minimum, 6000.
    const tbl = table({
      org: {
        a: { reg: 100, renew: 5000, transfer: null },
        b: { reg: 2000, renew: 2000, transfer: null },
      },
    });
    expect(tco3(tbl, 'org')).toBe(6000);
  });

  it('matches the .org counterexample: cloudflare beats the reg-cheapest registrar', () => {
    // Mirrors the reported .org case: reg-cheapest porkbun (31.66) vs the true
    // min cloudflare (30.90). Cents: porkbun 3166 reg/3166 renew, cloudflare
    // 1090 reg/990 renew. porkbun TCO = 3166 + 2*3166 = 9498; cloudflare TCO =
    // 1090 + 2*990 = 3070. True min is cloudflare's 3070.
    const tbl = table({
      org: {
        porkbun: { reg: 3166, renew: 3166, transfer: null },
        cloudflare: { reg: 1090, renew: 990, transfer: null },
      },
    });
    expect(tco3(tbl, 'org')).toBe(3070);
  });

  it('returns null when only null-renew entries exist', () => {
    const tbl = table({
      ai: { porkbun: { reg: 8270, renew: null, transfer: null } },
    });
    expect(tco3(tbl, 'ai')).toBeNull();
  });

  it('returns null when only null-reg entries exist', () => {
    const tbl = table({
      ai: { porkbun: { reg: null, renew: 8270, transfer: null } },
    });
    expect(tco3(tbl, 'ai')).toBeNull();
  });

  it('skips registrars with a null price and picks the min among the rest', () => {
    const tbl = table({
      com: {
        a: { reg: 1000, renew: null, transfer: null },
        b: { reg: 1200, renew: 1200, transfer: null },
        c: { reg: 1500, renew: 100, transfer: null },
      },
    });
    // a excluded (null renew); b TCO = 1200 + 2400 = 3600; c TCO = 1500 + 200 = 1700.
    expect(tco3(tbl, 'com')).toBe(1700);
  });

  it('returns null for an unknown TLD', () => {
    expect(tco3(table({}), 'nope')).toBeNull();
  });

  it('handles a single qualifying registrar', () => {
    const tbl = table({
      dev: { porkbun: { reg: 875, renew: 1287, transfer: null } },
    });
    expect(tco3(tbl, 'dev')).toBe(875 + 2 * 1287);
  });
});

describe('couponDiscountCents', () => {
  it('returns the coupon face value for an amount coupon below reg', () => {
    expect(couponDiscountCents(coupon('X', 'amount', 200), 1000)).toBe(200);
  });

  it('caps an amount coupon at the reg price (never pays the user to register)', () => {
    // $5 coupon on a $3 registration → discount is 300, not 500.
    expect(couponDiscountCents(coupon('X', 'amount', 500), 300)).toBe(300);
  });

  it('computes a percentage coupon as whole percent of reg', () => {
    // 50% off $10 → 500 cents.
    expect(couponDiscountCents(coupon('X', 'percentage', 50), 1000)).toBe(500);
  });

  it('rounds a percentage discount to the nearest cent', () => {
    // 10% of $10.55 (1055 cents) = 105.5 → rounds to 106.
    expect(couponDiscountCents(coupon('X', 'percentage', 10), 1055)).toBe(106);
  });

  it('rounds a percentage discount down when below .5', () => {
    // 10% of $10.54 (1054 cents) = 105.4 → rounds to 105.
    expect(couponDiscountCents(coupon('X', 'percentage', 10), 1054)).toBe(105);
  });

  it('returns 0 for a zero-percent coupon', () => {
    expect(couponDiscountCents(coupon('X', 'percentage', 0), 1000)).toBe(0);
  });

  it('returns 0 for a zero-amount coupon', () => {
    expect(couponDiscountCents(coupon('X', 'amount', 0), 1000)).toBe(0);
  });
});

describe('bestCoupon', () => {
  it('picks the coupon with the largest first-year discount', () => {
    // reg = 1000 ($10). amount(200) → 200 off; percentage(50) → 500 off.
    // The percentage coupon is better, so it must win even though it is listed
    // second (the old impl returned coupons[0] unconditionally).
    const tbl = table(
      { com: { porkbun: { reg: 1000, renew: 1000, transfer: null } } },
      {
        com: [
          coupon('AMOUNT200', 'amount', 200),
          coupon('PCT50', 'percentage', 50),
        ],
      },
    );
    expect(bestCoupon(tbl, 'com')?.code).toBe('PCT50');
  });

  it('keeps the first encountered on a tie', () => {
    const tbl = table(
      { com: { porkbun: { reg: 1000, renew: 1000, transfer: null } } },
      {
        com: [
          coupon('FIRST', 'amount', 200),
          coupon('SECOND', 'amount', 200),
        ],
      },
    );
    expect(bestCoupon(tbl, 'com')?.code).toBe('FIRST');
  });

  it('falls back to coupons[0] when no reg price is known', () => {
    // No registrars → bestEntry returns null → reg unknown → cannot rank by
    // discount, so the first coupon is returned as a best-effort pick.
    const tbl = table(
      {},
      { com: [coupon('ONLY', 'percentage', 50)] },
    );
    expect(bestCoupon(tbl, 'com')?.code).toBe('ONLY');
  });

  it('falls back to coupons[0] when the only registrar has a null reg', () => {
    const tbl = table(
      { com: { porkbun: { reg: null, renew: 1000, transfer: null } } },
      { com: [coupon('A', 'amount', 100), coupon('B', 'percentage', 99)] },
    );
    expect(bestCoupon(tbl, 'com')?.code).toBe('A');
  });

  it('returns null when there are no coupons', () => {
    const tbl = table({ com: { porkbun: { reg: 1000, renew: 1000, transfer: null } } });
    expect(bestCoupon(tbl, 'com')).toBeNull();
  });

  it('returns null for an unknown TLD', () => {
    expect(bestCoupon(table({}), 'nope')).toBeNull();
  });

  it('picks the amount coupon when it beats the percentage one', () => {
    // reg = 1000 ($10). amount(800) → 800 off; percentage(50) → 500 off.
    const tbl = table(
      { com: { porkbun: { reg: 1000, renew: 1000, transfer: null } } },
      {
        com: [
          coupon('PCT50', 'percentage', 50),
          coupon('AMOUNT800', 'amount', 800),
        ],
      },
    );
    expect(bestCoupon(tbl, 'com')?.code).toBe('AMOUNT800');
  });

  it('uses the cheapest registrar reg to rank coupons', () => {
    // Two registrars: cheap reg 500, expensive reg 2000. A 100% percentage
    // coupon ranks against the cheapest (500), so it beats a 400 amount coupon
    // (400 < 500). A 50% coupon would be 250 < 400.
    const tbl = table(
      {
        com: {
          cheap: { reg: 500, renew: 500, transfer: null },
          pricey: { reg: 2000, renew: 2000, transfer: null },
        },
      },
      {
        com: [
          coupon('AMOUNT400', 'amount', 400),
          coupon('PCT100', 'percentage', 100),
        ],
      },
    );
    // 100% of 500 = 500 off > 400 off → PCT100 wins.
    expect(bestCoupon(tbl, 'com')?.code).toBe('PCT100');
  });
});
