import { describe, it, expect } from 'vitest';
import { normalizeRegru, normalizeBeget, normalizeDynadotHtml, normalizeSpaceship } from '../scripts/harvest-prices.mjs';

import regruHtml from './fixtures/regru.html?raw';
import begetHtml from './fixtures/beget.html?raw';
import dynadotHtml from './fixtures/dynadot.html?raw';
import spaceshipHtml from './fixtures/spaceship.html?raw';

describe('normalizeRegru', () => {
  it('parses TLDs from __NUXT_DATA__ with RUB→USD conversion', () => {
    const result = normalizeRegru(regruHtml);
    expect(Object.keys(result.tlds).length).toBeGreaterThanOrEqual(20);
    expect(result.coupons).toEqual({});
  });

  it('converts .ru prices correctly (169 RUB reg, 226 RUB renew at rate 90)', () => {
    const result = normalizeRegru(regruHtml);
    const ru = result.tlds['ru']?.regru;
    expect(ru).toBeDefined();
    expect(ru?.reg).toBe(Math.round((169 / 90) * 100));
    expect(ru?.renew).toBe(Math.round((226 / 90) * 100));
    expect(ru?.transfer).toBeNull();
  });

  it('converts .рф prices correctly (same as .ru)', () => {
    const result = normalizeRegru(regruHtml);
    const rf = result.tlds['рф']?.regru;
    expect(rf).toBeDefined();
    expect(rf?.reg).toBe(Math.round((169 / 90) * 100));
    expect(rf?.renew).toBe(Math.round((226 / 90) * 100));
  });

  it('includes .com with RUB→USD conversion', () => {
    const result = normalizeRegru(regruHtml);
    const com = result.tlds['com']?.regru;
    expect(com).toBeDefined();
    expect(com?.reg).toBe(Math.round((1792 / 90) * 100));
  });

  it('throws on broken HTML', () => {
    expect(() => normalizeRegru('<html>no data</html>')).toThrow(/__NUXT_DATA__/);
  });
});

describe('normalizeBeget', () => {
  it('parses TLDs from data-row-uid entries with EUR→USD conversion', () => {
    const result = normalizeBeget(begetHtml);
    expect(Object.keys(result.tlds).length).toBeGreaterThanOrEqual(20);
    expect(result.coupons).toEqual({});
  });

  it('converts first entry (aaa.pro: 245 EUR reg, 260 EUR renew at rate 1.10)', () => {
    const result = normalizeBeget(begetHtml);
    const entry = result.tlds['aaa.pro']?.beget;
    expect(entry).toBeDefined();
    expect(entry?.reg).toBe(Math.round(245 * 1.10 * 100));
    expect(entry?.renew).toBe(Math.round(260 * 1.10 * 100));
    expect(entry?.transfer).toBeNull();
  });

  it('converts academy (40 EUR reg, 56 EUR renew)', () => {
    const result = normalizeBeget(begetHtml);
    const entry = result.tlds['academy']?.beget;
    expect(entry).toBeDefined();
    expect(entry?.reg).toBe(Math.round(40 * 1.10 * 100));
    expect(entry?.renew).toBe(Math.round(56 * 1.10 * 100));
  });

  it('throws on broken HTML', () => {
    expect(() => normalizeBeget('<html>no data</html>')).toThrow(/only 0 TLDs/);
  });
});

describe('normalizeDynadotHtml', () => {
  it('parses TLDs from __NUXT_DATA__ with $ prices', () => {
    const result = normalizeDynadotHtml(dynadotHtml);
    expect(Object.keys(result.tlds).length).toBeGreaterThanOrEqual(20);
    expect(result.coupons).toEqual({});
  });

  it('parses .com ($10.88 reg, $10.88 renew)', () => {
    const result = normalizeDynadotHtml(dynadotHtml);
    const com = result.tlds['com']?.dynadot;
    expect(com).toBeDefined();
    expect(com?.reg).toBe(1088);
    expect(com?.renew).toBe(1088);
    expect(com?.transfer).toBeNull();
  });

  it('parses .xyz ($1.99 reg, $13.17 renew)', () => {
    const result = normalizeDynadotHtml(dynadotHtml);
    const xyz = result.tlds['xyz']?.dynadot;
    expect(xyz).toBeDefined();
    expect(xyz?.reg).toBe(199);
    expect(xyz?.renew).toBe(1317);
  });

  it('throws on broken HTML', () => {
    expect(() => normalizeDynadotHtml('<html>no data</html>')).toThrow(/__NUXT_DATA__/);
  });
});

describe('normalizeSpaceship', () => {
  it('parses TLDs from dpp-pricing-tld-item entries', () => {
    const result = normalizeSpaceship(spaceshipHtml);
    expect(Object.keys(result.tlds).length).toBeGreaterThanOrEqual(20);
    expect(result.coupons).toEqual({});
  });

  it('parses .com ($8.88 reg, $9.98 renew)', () => {
    const result = normalizeSpaceship(spaceshipHtml);
    const com = result.tlds['com']?.spaceship;
    expect(com).toBeDefined();
    expect(com?.reg).toBe(888);
    expect(com?.renew).toBe(998);
    expect(com?.transfer).toBeNull();
  });

  it('parses .org ($6.65 reg, $11.39 renew)', () => {
    const result = normalizeSpaceship(spaceshipHtml);
    const org = result.tlds['org']?.spaceship;
    expect(org).toBeDefined();
    expect(org?.reg).toBe(665);
    expect(org?.renew).toBe(1139);
  });

  it('parses .ai ($79.98 reg, $79.98 renew)', () => {
    const result = normalizeSpaceship(spaceshipHtml);
    const ai = result.tlds['ai']?.spaceship;
    expect(ai).toBeDefined();
    expect(ai?.reg).toBe(7998);
    expect(ai?.renew).toBe(7998);
  });

  it('throws on broken HTML', () => {
    expect(() => normalizeSpaceship('<html>no data</html>')).toThrow(/only 0 TLDs/);
  });
});
