import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  expandCompactSnapshot,
  readPrevious,
  dedupeCoupons,
  mergePricing,
} from '../scripts/harvest-prices.mjs';

describe('expandCompactSnapshot', () => {
  it('expands [reg, renew, transfer] arrays to PriceEntry objects', () => {
    const result = expandCompactSnapshot({
      tlds: { com: { porkbun: [1026, 1091, null] } },
      coupons: {},
    });
    expect(result.tlds.com?.porkbun).toEqual({ reg: 1026, renew: 1091, transfer: null });
  });

  it('handles null values in all three positions', () => {
    const result = expandCompactSnapshot({
      tlds: { xyz: { cloudflare: [null, null, null] } },
      coupons: {},
    });
    expect(result.tlds.xyz?.cloudflare).toEqual({ reg: null, renew: null, transfer: null });
  });

  it('preserves coupons array', () => {
    const coupon = { code: 'SAVE10', firstYearOnly: true, type: 'amount', amount: 1000 };
    const result = expandCompactSnapshot({ tlds: {}, coupons: { com: [coupon] } });
    expect(result.coupons.com).toEqual([coupon]);
  });

  it('handles empty/missing tlds and coupons', () => {
    const result = expandCompactSnapshot({});
    expect(result.tlds).toEqual({});
    expect(result.coupons).toEqual({});
  });

  it('skips non-array registrar entries', () => {
    const result = expandCompactSnapshot({
      tlds: { com: { porkbun: 'bad', cloudflare: [100, 200, null] } },
      coupons: {},
    });
    expect(result.tlds.com?.porkbun).toBeUndefined();
    expect(result.tlds.com?.cloudflare).toEqual({ reg: 100, renew: 200, transfer: null });
  });

  it('skips tlds with no valid registrars', () => {
    const result = expandCompactSnapshot({
      tlds: { com: { porkbun: 'bad' } },
      coupons: {},
    });
    expect(result.tlds.com).toBeUndefined();
  });
});

describe('dedupeCoupons', () => {
  it('keeps fresh entry when code appears in both previous and fresh', () => {
    const prev = { code: 'SAVE10', firstYearOnly: true, type: 'amount', amount: 500 };
    const fresh = { code: 'SAVE10', firstYearOnly: true, type: 'amount', amount: 1000 };
    const result = dedupeCoupons({ com: [prev, fresh] });
    expect(result.com).toEqual([fresh]);
  });

  it('keeps distinct codes from both previous and fresh', () => {
    const a = { code: 'A', firstYearOnly: false, type: 'amount', amount: 100 };
    const b = { code: 'B', firstYearOnly: false, type: 'percentage', amount: 10 };
    const result = dedupeCoupons({ com: [a, b] });
    expect(result.com).toHaveLength(2);
    expect(result.com).toEqual([a, b]);
  });

  it('handles empty coupons', () => {
    const result = dedupeCoupons({});
    expect(result).toEqual({});
  });

  it('skips entries without a string code', () => {
    const result = dedupeCoupons({ com: [{ amount: 100 }, null, { code: 123 }] });
    expect(result.com).toBeUndefined();
  });

  it('drops empty coupon arrays after dedup', () => {
    const result = dedupeCoupons({ com: [{ amount: 100 }] });
    expect(result.com).toBeUndefined();
  });
});

describe('readPrevious', () => {
  it('returns null for missing file', async () => {
    const result = await readPrevious(join(tmpdir(), `nonexistent-${Date.now()}.json`));
    expect(result).toBeNull();
  });

  it('returns null for corrupt JSON', async () => {
    const dir = mkdirSync(join(tmpdir(), `dh-test-${Date.now()}`), { recursive: true });
    const path = join(dir, 'corrupt.json');
    writeFileSync(path, '{ broken json');
    try {
      const result = await readPrevious(path);
      expect(result).toBeNull();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('expands a valid compact snapshot', async () => {
    const dir = mkdirSync(join(tmpdir(), `dh-test-${Date.now()}`), { recursive: true });
    const path = join(dir, 'snapshot.json');
    writeFileSync(
      path,
      JSON.stringify({ tlds: { com: { porkbun: [1026, 1091, null] } }, coupons: {} }),
    );
    try {
      const result = await readPrevious(path);
      expect(result).not.toBeNull();
      expect(result?.tlds.com?.porkbun).toEqual({ reg: 1026, renew: 1091, transfer: null });
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe('carry-over merge', () => {
  it('keeps previous registrar when fresh run lacks it', () => {
    // Previous snapshot had porkbun; fresh run only has cloudflare.
    const previous = expandCompactSnapshot({
      tlds: { com: { porkbun: [1026, 1091, null] } },
      coupons: {},
    });
    const fresh = {
      tlds: { com: { cloudflare: { reg: 800, renew: 800, transfer: null } } },
      coupons: {},
    };
    mergePricing(previous, fresh);
    expect(previous.tlds.com?.porkbun).toEqual({ reg: 1026, renew: 1091, transfer: null });
    expect(previous.tlds.com?.cloudflare).toEqual({ reg: 800, renew: 800, transfer: null });
  });

  it('fresh wins on same registrar', () => {
    const previous = expandCompactSnapshot({
      tlds: { com: { porkbun: [1026, 1091, null] } },
      coupons: {},
    });
    const fresh = {
      tlds: { com: { porkbun: { reg: 999, renew: 999, transfer: null } } },
      coupons: {},
    };
    mergePricing(previous, fresh);
    expect(previous.tlds.com?.porkbun).toEqual({ reg: 999, renew: 999, transfer: null });
  });

  it('coupon dedupe fresh-wins after carry-over merge', () => {
    const prevCoupon = { code: 'SAVE10', firstYearOnly: true, type: 'amount', amount: 500 };
    const freshCoupon = { code: 'SAVE10', firstYearOnly: true, type: 'amount', amount: 1000 };
    const previous = expandCompactSnapshot({
      tlds: { com: { porkbun: [1026, 1091, null] } },
      coupons: { com: [prevCoupon] },
    });
    const fresh = {
      tlds: { com: { cloudflare: { reg: 800, renew: 800, transfer: null } } },
      coupons: { com: [freshCoupon] },
    };
    mergePricing(previous, fresh);
    previous.coupons = dedupeCoupons(previous.coupons);
    expect(previous.coupons.com).toEqual([freshCoupon]);
  });
});
