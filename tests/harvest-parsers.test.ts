import { describe, it, expect, vi } from 'vitest';
import { normalizeWebhost1Observed, normalizeSprinthostAnnual, normalizeSprinthost, fetchTimeweb, normalizeTimeweb, fetchHostiman, normalizeHostiman, fetchRegru, normalizeRegru, normalizeBeget, normalizeDynadotHtml, normalizeSpaceship } from '../scripts/harvest-prices.mjs';

import webhost1Observations from './fixtures/webhost1-public-observations.json';
import sprinthostAnnualHtml from './fixtures/sprinthost-annual-sanitized.html?raw';
import sprinthostHtml from './fixtures/sprinthost-sanitized.html?raw';
import timewebHtml from './fixtures/timeweb-sanitized.html?raw';
import hostimanHtml from './fixtures/hostiman-sanitized.html?raw';
import regruHtml from './fixtures/regru.html?raw';
import regruSanitizedHtml from './fixtures/regru-sanitized.html?raw';
import begetHtml from './fixtures/beget.html?raw';
import dynadotHtml from './fixtures/dynadot.html?raw';
import spaceshipHtml from './fixtures/spaceship.html?raw';

describe('normalizeWebhost1Observed', () => {
  it('converts two reviewed annual quotes while retaining original rubles', () => {
    const result = normalizeWebhost1Observed(webhost1Observations, 80.572954);
    expect(Object.keys(result.tlds).sort()).toEqual(['ru', 'рф']);
    for (const tld of ['ru', 'рф']) {
      expect(result.tlds[tld]?.webhost1).toEqual({ reg: 235, renew: 495, transfer: null });
      expect(result.sourceRub?.webhost1?.[tld]).toEqual([18900, 39900]);
    }
  });

  it('rejects incomplete, duplicated, mis-sourced or nonannual observations', () => {
    const first = webhost1Observations[0]!;
    const second = webhost1Observations[1]!;
    for (const rows of [[], [first], [first, first], [first, { ...second, source: first.source }],
      [first, { ...second, registrationYears: 2 }], [first, { ...second, renewalYears: 2 }],
      [first, { ...second, renewalRub: -1 }], [first, { ...second, registrationRub: 189.001 }]]) {
      expect(() => normalizeWebhost1Observed(rows, 80.572954)).toThrow();
    }
    expect(() => normalizeWebhost1Observed(webhost1Observations, 0)).toThrow();
  });
});

describe('normalizeRegru', () => {
  it('parses TLDs from __NUXT_DATA__ with RUB→USD conversion', () => {
    const result = normalizeRegru(regruHtml);
    expect(Object.keys(result.tlds).length).toBeGreaterThanOrEqual(20);
    expect(result.coupons).toEqual({});
  });

  it('converts .ru registration but does not mistake oldPrice for renewal', () => {
    const result = normalizeRegru(regruHtml);
    const ru = result.tlds['ru']?.regru;
    expect(ru).toBeDefined();
    expect(ru?.reg).toBe(Math.round((169 / 90) * 100));
    expect(ru?.renew).toBeNull();
    expect(ru?.transfer).toBeNull();
  });

  it('converts .рф prices correctly (same as .ru)', () => {
    const result = normalizeRegru(regruHtml);
    const rf = result.tlds['рф']?.regru;
    expect(rf).toBeDefined();
    expect(rf?.reg).toBe(Math.round((169 / 90) * 100));
    expect(rf?.renew).toBeNull();
  });

  it('includes .com with RUB→USD conversion', () => {
    const result = normalizeRegru(regruHtml);
    const com = result.tlds['com']?.regru;
    expect(com).toBeDefined();
    expect(com?.reg).toBe(Math.round((1792 / 90) * 100));
  });

  it('never assigns a renewal price from oldPrice', () => {
    const result = normalizeRegru(regruHtml);
    for (const entries of Object.values(result.tlds)) expect(entries.regru?.renew).toBeNull();
  });

  it('parses the sanitized public REG.RU page data without treating discounted old prices as renewals', () => {
    const result = normalizeRegru(regruSanitizedHtml);
    expect(result.tlds.ru?.regru).toEqual({ reg: Math.round((169 / 90) * 100), renew: null, transfer: null });
    expect(result.tlds.site?.regru).toEqual({ reg: Math.round((199 / 90) * 100), renew: null, transfer: null });
    expect(result.tlds.com?.regru).toEqual({ reg: Math.round((1792 / 90) * 100), renew: null, transfer: null });
    expect(Object.keys(result.tlds)).toHaveLength(26);
  });

  it('fetches the observed public page and normalizes its data', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(regruSanitizedHtml));
    const result = await fetchRegru(fetcher);
    expect(fetcher).toHaveBeenCalledWith('https://www.reg.ru/domain/new/', expect.any(Object), { retries: 1 });
    expect(result.tlds.ru?.regru?.reg).toBe(Math.round((169 / 90) * 100));
  });

  it('reports an HTTP failure rather than inventing prices', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    await expect(fetchRegru(fetcher)).rejects.toThrow('regru 403');
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

// Synthetic markup based on the public table's labels, not a capture of live HTML.
describe('normalizeHostiman', () => {
  const row = (zone: string, register: string, renew: string) =>
    `<tr><td>${zone}</td><td>${register}</td><td>${renew}</td><td>200.00</td><td>бесплатно</td></tr>`;
  const header = '<tr><th>Зона</th><th>Регистрация (1 год)</th><th>Продление (1 год)</th><th>Трансфер (единоразово)</th><th>Скрытие данных (1 год)</th></tr>';
  const table = `<table>${header}${row('ru', '200.00', '400.00')}${row('рф', '200.00', '400.00')}${row('com', '2700.00', '2700.00')}${row('net', '2300.00', '2300.00')}${row('org', '2300.00', '2300.00')}${row('h1n.ru', 'бесплатно', 'бесплатно')}</table>`;

  it('parses the sanitized public HostiMan table provided by the user', () => {
    const result = normalizeHostiman(hostimanHtml, 80.572954);
    expect(Object.keys(result.tlds)).toHaveLength(11);
    expect(result.tlds.ru?.hostiman).toEqual({ reg: 248, renew: 496, transfer: null });
    expect(result.tlds['рф']?.hostiman?.renew).toBe(496);
    expect(result.tlds.com?.hostiman?.reg).toBe(3351);
    expect(result.tlds.pro?.hostiman?.renew).toBe(5709);
    expect(result.tlds['h1n.ru']).toBeUndefined();
    expect(result.sourceRub?.hostiman?.ru).toEqual([20000, 40000]);
    expect(result.sourceRub?.hostiman?.com).toEqual([270000, 270000]);
  });
  it('rejects invalid exchange rates', () => {
    expect(() => normalizeHostiman(hostimanHtml, 0)).toThrow(/rate/);
    expect(() => normalizeHostiman(hostimanHtml, NaN)).toThrow(/rate/);
  });
  it('requires the annual registration and renewal headers and converts RUB', () => {
    const result = normalizeHostiman(table);
    expect(result.tlds.ru?.hostiman).toEqual({ reg: 222, renew: 444, transfer: null });
    expect(result.tlds.com?.hostiman).toEqual({ reg: 3000, renew: 3000, transfer: null });
    expect(result.tlds['h1n.ru']).toBeUndefined();
  });
  it('rejects wrong, incomplete, ambiguous and duplicate tables', () => {
    expect(() => normalizeHostiman('<html>blocked</html>')).toThrow(/price table/);
    expect(() => normalizeHostiman(table.replace('Продление (1 год)', 'Перенос (1 год)'))).toThrow(/price table/);
    expect(() => normalizeHostiman(table.replace('200.00</td>', '<del>300</del>200</td>'))).toThrow(/invalid price/);
    expect(() => normalizeHostiman(table.replace('2300.00</td>', 'уточняйте</td>'))).toThrow(/invalid price/);
    expect(() => normalizeHostiman(table + table)).toThrow(/price table/);
    expect(() => normalizeHostiman(table.replace('</table>', `${row('ru', '200', '400')}</table>`))).toThrow(/duplicate/);
    expect(() => normalizeHostiman(`<table>${header}${row('ru', '200', '400')}</table>`)).toThrow(/incomplete/);
  });
  it('uses only the designated page and fails closed on HTTP errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(hostimanHtml));
    expect((await fetchHostiman(fetcher)).tlds.ru?.hostiman?.renew).toBe(444);
    expect(fetcher).toHaveBeenCalledWith('https://my.hostiman.ru/domain/register', expect.any(Object), { retries: 1 });
    await expect(fetchHostiman(vi.fn().mockResolvedValue(new Response('', { status: 403 })))).rejects.toThrow('hostiman 403');
  });
});


describe('normalizeTimeweb', () => {
  it('imports only zones with a confirmed annual period from the sanitized real Flight record', () => {
    const result = normalizeTimeweb(timewebHtml, 80.572954);
    expect(Object.keys(result.tlds).sort()).toEqual(['ru', 'рф'].sort());
    expect(result.tlds.ru?.timeweb).toEqual({ reg: 248, renew: null, transfer: null });
    expect(result.timewebRenewalFromRub?.['рф']).toBe(399);
    expect(result.sourceRub?.timeweb?.ru).toEqual([20000, null]);
    expect(result.tlds.ai).toBeUndefined();
    expect(result.tlds.site).toBeUndefined(); // no premium per-name prices or unverified term
  });
  it('rejects missing, incomplete, malformed, ambiguous and duplicate data', () => {
    expect(() => normalizeTimeweb('<html></html>')).toThrow(/zone list/);
    expect(() => normalizeTimeweb(timewebHtml + timewebHtml)).toThrow(/zone list/);
    expect(() => normalizeTimeweb(timewebHtml.replace('\\"prolong\\":399', '\\"prolong\\":null'))).toThrow(/invalid price/);
    expect(() => normalizeTimeweb(timewebHtml, 0)).toThrow(/rate/);
  });
  it('uses only the public page and refuses HTTP failures', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(timewebHtml));
    expect((await fetchTimeweb(fetcher)).timewebRenewalFromRub?.ru).toBe(399);
    expect(fetcher).toHaveBeenCalledWith('https://timeweb.com/ru/services/domains/', expect.objectContaining({ redirect: 'error' }), { retries: 1 });
    await expect(fetchTimeweb(vi.fn().mockResolvedValue(new Response('', { status: 403 })))).rejects.toThrow('timeweb 403');
  });
});


describe('normalizeSprinthost', () => {
  it('parses all 12 sanitized public cards and retains native RUB', () => {
    const result = normalizeSprinthost(sprinthostHtml, 80.572954);
    expect(Object.keys(result.tlds)).toHaveLength(12);
    expect(result.sourceRub?.sprinthost?.ru).toEqual([17900, 33900]);
    expect(result.sourceRub?.sprinthost?.['рф']).toEqual([17900, 33900]);
    expect(result.sourceRub?.sprinthost?.com).toEqual([154800, 154800]);
    expect(result.tlds.ru?.sprinthost).toEqual({ reg: 222, renew: 421, transfer: null });
    expect(result.tlds.com?.sprinthost).toEqual({ reg: 1921, renew: 1921, transfer: null });
  });
  it('rejects invalid exchange rates and missing or incomplete grids', () => {
    expect(() => normalizeSprinthost(sprinthostHtml, 0)).toThrow(/rate/);
    expect(() => normalizeSprinthost(sprinthostHtml, NaN)).toThrow(/rate/);
    expect(() => normalizeSprinthost('<html>blocked</html>')).toThrow(/price grid/);
    expect(() => normalizeSprinthost(sprinthostHtml.replace('class="card card--bg-blue"', 'class="removed"'))).toThrow(/incomplete/);
  });
  it('rejects duplicate zones, changed labels and ambiguous prices', () => {
    expect(() => normalizeSprinthost(sprinthostHtml.replace('.РФ</div>', '.RU</div>'))).toThrow(/duplicate/);
    expect(() => normalizeSprinthost(sprinthostHtml.replace('Регистрация</div>', 'Продление</div>'))).toThrow(/invalid price/);
    expect(() => normalizeSprinthost(sprinthostHtml.replace('>179<span>', '>179<del>999</del><span>'))).toThrow(/invalid price/);
    expect(() => normalizeSprinthost(sprinthostHtml.replace('>179<span>', '>0<span>'))).toThrow(/invalid price/);
    expect(() => normalizeSprinthost(sprinthostHtml.replace('<div class="card__title">.RU', '<div>Promo only</div><div class="card__title">.RU'))).toThrow(/invalid zone title/);
    expect(() => normalizeSprinthost(sprinthostHtml.replace('<div class="card card--bg-blue">', '<div class="card card--bg-blue"><div>Promotion terms</div>'))).toThrow(/unexpected card content/);
  });
  it('does not execute scripts or extract unrelated offer values', () => {
    const result = normalizeSprinthost(sprinthostHtml + '<script>throw new Error("executed")</script><div>RU 1 999</div>');
    expect(result.sourceRub?.sprinthost?.ru).toEqual([17900, 33900]);
  });
});


describe('normalizeSprinthostAnnual', () => {
  it('cross-checks the 88 public table rows against embedded data and keeps native rubles', () => {
    const result = normalizeSprinthostAnnual(sprinthostAnnualHtml, 80.572954);
    expect(Object.keys(result.tlds)).toHaveLength(88);
    expect(result.sourceRub?.sprinthost?.ru).toEqual([17900, 33900]);
    expect(result.sourceRub?.sprinthost?.['рф']).toEqual([17900, 33900]);
    expect(result.sourceRub?.sprinthost?.xyz).toEqual([150000, 170000]);
    expect(result.sourceRub?.sprinthost?.['com.ru']).toEqual([34800, 34800]);
    expect(result.sourceRub?.sprinthost?.['москва']).toEqual([130800, 130800]);
    expect(result.tlds.ru?.sprinthost).toEqual({ reg: 222, renew: 421, transfer: null });
    expect(result.tlds.xyz?.sprinthost).toEqual({ reg: Math.round(150000 / 80.572954), renew: Math.round(170000 / 80.572954), transfer: null });
    const cards = normalizeSprinthost(sprinthostHtml, 80.572954);
    for (const [zone, value] of Object.entries(cards.sourceRub!.sprinthost!)) expect(result.sourceRub!.sprinthost![zone]).toEqual(value);
  });
  it('rejects missing data, ambiguous or truncated coverage, and invalid rates', () => {
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml, 0)).toThrow(/rate/);
    expect(() => normalizeSprinthostAnnual('<html>blocked</html>')).toThrow(/data block and table/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('prices-table-data', 'removed'))).toThrow(/data block and table/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace(/<tr class="table-row">[\s\S]*?<\/tr>/, ''))).toThrow(/incomplete annual table/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('Регистрация на год', 'Регистрация на 2 года'))).toThrow(/annual column labels/);
  });
  it('rejects price mismatches, promotions, altered markup, and duplicate zones', () => {
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('"price_reg":179', '"price_reg":178'))).toThrow(/mismatch/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('"price_before":0', '"price_before":300'))).toThrow(/promotional/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('>179<span class="ruble">', '>179<del>300</del><span class="ruble">'))).toThrow(/mismatch/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('"tld":"COM"', '"tld":"RU"'))).toThrow(/duplicate/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('<div class="tld">.COM</div>', '<div class="tld">.RU</div>'))).toThrow(/duplicate/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('class="table-row"', 'class="other-row"'))).toThrow(/unexpected annual row/);
    expect(() => normalizeSprinthostAnnual(sprinthostAnnualHtml.replace('<td class="column-gap"></td>', '<td class="column-gap"></td><span>promotion</span>'))).toThrow(/unexpected annual cells/);
  });
  it('reads inert data and never executes script tags', () => {
    const result = normalizeSprinthostAnnual(sprinthostAnnualHtml + '<script>throw new Error("executed")</script>');
    expect(Object.keys(result.tlds)).toHaveLength(88);
  });
});
