import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  expandCompactSnapshot,
  readPrevious,
  dedupeCoupons,
  mergePricing,
  replaceRegistrar,
  applySuccessfulSource,
  sourceUpdatedAt,
  mergeSourceRub,
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

describe('REG.RU snapshot migration', () => {
  it('discards unverified old renewal values while retaining other registrars', () => {
    const result = expandCompactSnapshot({ tlds: {
      ru: { regru: [200, 268, null], beget: [334, 557, null] },
    } });
    expect(result.tlds.ru?.regru).toEqual({ reg: 200, renew: null, transfer: null });
    expect(result.tlds.ru?.beget?.renew).toBe(557);
  });

  it('replaces REG.RU coverage without relabeling omitted prices as fresh', () => {
    const previous = expandCompactSnapshot({ tlds: {
      ru: { regru: [200, 268, null], beget: [334, 557, null] },
      com: { regru: [2000, 2200, null] },
    } });
    const fresh = { tlds: { ru: { regru: { reg: 210, renew: null, transfer: null } } }, coupons: {} };
    replaceRegistrar(previous, fresh, 'regru');
    expect(previous.tlds.ru?.regru?.reg).toBe(210);
    expect(previous.tlds.ru?.beget?.renew).toBe(557);
    expect(previous.tlds.com).toBeUndefined();
  });
});


describe('HostiMan snapshot carry-over', () => {
  it('replaces only HostiMan on success and drops its omitted zones', () => {
    const previous = expandCompactSnapshot({ tlds: {
      ru: { hostiman: [222, 444, null], regru: [200, null, null] },
      com: { hostiman: [3000, 3000, null], porkbun: [1100, 1100, null] },
    } });
    const fresh = { tlds: { ru: { hostiman: { reg: 250, renew: 500, transfer: null } } }, coupons: {} };
    applySuccessfulSource(previous, fresh, 'hostiman');
    expect(previous.tlds.ru?.hostiman?.renew).toBe(500);
    expect(previous.tlds.ru?.regru?.reg).toBe(200);
    expect(previous.tlds.com?.hostiman).toBeUndefined();
    expect(previous.tlds.com?.porkbun?.reg).toBe(1100);
  });
  it('dates success only and preserves date on failure and API-only harvests', () => {
    const old = '2026-10-01T00:00:00Z';
    const now = '2026-10-30T00:00:00Z';
    expect(sourceUpdatedAt(['hostiman'], old, 'hostiman', now)).toBe(now);
    expect(sourceUpdatedAt(['porkbun'], old, 'hostiman', now)).toBe(old);
    expect(sourceUpdatedAt([], null, 'hostiman', now)).toBeNull();
  });
});


describe('Timeweb snapshot carry-over', () => {
  it('replaces only Timeweb and retains other sellers', () => {
    const previous = expandCompactSnapshot({ tlds: {
      ru: { timeweb: [248, 495, null], hostiman: [248, 496, null] },
      com: { timeweb: [1000, 1200, null], porkbun: [1100, 1100, null] },
    } });
    const fresh = { tlds: { ru: { timeweb: { reg: 250, renew: 500, transfer: null } } }, coupons: {} };
    applySuccessfulSource(previous, fresh, 'timeweb');
    expect(previous.tlds.ru?.timeweb?.renew).toBe(500);
    expect(previous.tlds.ru?.hostiman?.renew).toBe(496);
    expect(previous.tlds.com?.timeweb).toBeUndefined();
    expect(previous.tlds.com?.porkbun?.reg).toBe(1100);
  });
  it('updates the date on success, otherwise carries it forward', () => {
    const old = '2026-10-01T00:00:00Z';
    const now = '2026-10-30T00:00:00Z';
    expect(sourceUpdatedAt(['timeweb'], old, 'timeweb', now)).toBe(now);
    expect(sourceUpdatedAt(['porkbun'], old, 'timeweb', now)).toBe(old);
    expect(sourceUpdatedAt([], null, 'timeweb', now)).toBeNull();
  });
});


describe('original RUB source data carry-over', () => {
  const previous = { hostiman: { ru: [20000, 40000] as [number, number], com: [270000, 270000] as [number, number] }, timeweb: { ru: [20000, null] as [number, null] } };
  it('preserves data when a source fails or only API sources run', () => {
    const api = { tlds: {}, coupons: {} };
    expect(mergeSourceRub(previous, { porkbun: api })).toEqual(previous);
  });
  it('replaces the whole refreshed source and leaves others untouched', () => {
    const fresh = { tlds: {}, coupons: {}, sourceRub: { hostiman: { ru: [21000, 41000] as [number, number] } } };
    expect(mergeSourceRub(previous, { hostiman: fresh })).toEqual({ hostiman: { ru: [21000, 41000] }, timeweb: { ru: [20000, null] } });
    expect(previous.hostiman.com).toEqual([270000, 270000]);
  });
  it('clears stale RUB metadata when a successful source does not return it', () => {
    expect(mergeSourceRub(previous, { hostiman: { tlds: {}, coupons: {} } })).toEqual({ hostiman: {}, timeweb: previous.timeweb });
  });
});


describe('Sprinthost refresh carry-over', () => {
  it('atomically replaces a successful source while preserving other registrars', () => {
    const old = { tlds: { ru: { sprinthost: { reg: 222, renew: 421, transfer: null } }, com: { sprinthost: { reg: 1921, renew: 1921, transfer: null }, porkbun: { reg: 1000, renew: 1200, transfer: null } } }, coupons: {} };
    const fresh = { tlds: { ru: { sprinthost: { reg: 230, renew: 430, transfer: null } } }, coupons: {}, sourceRub: { sprinthost: { ru: [18000, 34000] as [number, number] } } };
    applySuccessfulSource(old, fresh, 'sprinthost');
    expect(old.tlds.com.sprinthost).toBeUndefined();
    expect(old.tlds.com.porkbun.reg).toBe(1000);
    const previous = { sprinthost: { ru: [17900, 33900] as [number, number], com: [154800, 154800] as [number, number] } };
    expect(mergeSourceRub(previous, { sprinthost: fresh }).sprinthost).toEqual({ ru: [18000, 34000] });
    expect(mergeSourceRub(previous, {}).sprinthost).toEqual(previous.sprinthost);
    expect(mergeSourceRub(previous, { sprinthost: { tlds: {}, coupons: {} } }).sprinthost).toEqual({});
    expect(sourceUpdatedAt([], 'old', 'sprinthost', 'new')).toBe('old');
    expect(sourceUpdatedAt(['sprinthost'], 'old', 'sprinthost', 'new')).toBe('new');
  });
});


describe('WebHOST1 source carry-over', () => {
  it('retains failed imports and replaces refreshed source prices and rubles atomically', () => {
    const old = { tlds: { ru: { webhost1: { reg: 235, renew: 495, transfer: null } }, com: { webhost1: { reg: 100, renew: 200, transfer: null }, porkbun: { reg: 300, renew: 400, transfer: null } } }, coupons: {} };
    const fresh = { tlds: { ru: { webhost1: { reg: 250, renew: 500, transfer: null } } }, coupons: {}, sourceRub: { webhost1: { ru: [20000, 40000] as [number, number] } } };
    const previous = { webhost1: { ru: [18900, 39900] as [number, number] } };
    expect(mergeSourceRub(previous, {})).toEqual(previous);
    expect(sourceUpdatedAt([], 'old', 'webhost1', 'new')).toBe('old');
    applySuccessfulSource(old, fresh, 'webhost1');
    expect(old.tlds.com.webhost1).toBeUndefined();
    expect(old.tlds.com.porkbun.reg).toBe(300);
    expect(mergeSourceRub(previous, { webhost1: fresh }).webhost1).toEqual({ ru: [20000, 40000] });
    expect(sourceUpdatedAt(['webhost1'], 'old', 'webhost1', 'new')).toBe('new');
  });
});
