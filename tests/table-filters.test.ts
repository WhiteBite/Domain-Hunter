import { describe, it, expect } from 'vitest';
import {
  applyViewFilters,
  displayToUsdCents,
  type FilterableRow,
} from '../src/ui/table-filters';
import type { CheckResult, PriceEntry, Settings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';

const baseResult = (domain: string, status: CheckResult['status'], tld = 'com'): CheckResult => ({
  domain,
  tld,
  status,
  source: 'rdap',
  checkedAt: 0,
});

const row = (
  domain: string,
  status: CheckResult['status'],
  firstYear: number | null,
  entry?: Partial<PriceEntry>,
): FilterableRow => ({
  result: baseResult(domain, status),
  best: entry
    ? { registrarId: 'porkbun', entry: { reg: entry.reg ?? null, renew: entry.renew ?? null, transfer: entry.transfer ?? null } }
    : null,
  firstYear,
});

const settings: Settings = { ...DEFAULT_SETTINGS };

describe('applyViewFilters', () => {
  const allRows: FilterableRow[] = [
    row('alpha.com', 'available', 1168),
    row('beta.com', 'taken', 1168),
    row('gamma.com', 'unknown', null),
    row('delta.com', 'error', 875),
    row('epsilon.com', 'probably_available', 8270),
  ];

  it('filter=all returns every row, no traps hidden', () => {
    const res = applyViewFilters(allRows, {
      filter: 'all',
      query: '',
      budgetCents: 0,
      hideTraps: false,
      favorites: new Set(),
    });
    expect(res.rows).toHaveLength(5);
    expect(res.trapsHidden).toBe(0);
  });

  it('filter=available includes available + probably_available', () => {
    const res = applyViewFilters(allRows, {
      filter: 'available',
      query: '',
      budgetCents: 0,
      hideTraps: false,
      favorites: new Set(),
    });
    expect(res.rows.map((r) => r.result.domain)).toEqual([
      'alpha.com',
      'epsilon.com',
    ]);
  });

  it('filter=taken returns only taken', () => {
    const res = applyViewFilters(allRows, {
      filter: 'taken',
      query: '',
      budgetCents: 0,
      hideTraps: false,
      favorites: new Set(),
    });
    expect(res.rows.map((r) => r.result.domain)).toEqual(['beta.com']);
  });

  it('filter=problems returns unknown + error', () => {
    const res = applyViewFilters(allRows, {
      filter: 'problems',
      query: '',
      budgetCents: 0,
      hideTraps: false,
      favorites: new Set(),
    });
    expect(res.rows.map((r) => r.result.domain)).toEqual([
      'gamma.com',
      'delta.com',
    ]);
  });

  it('filter=favorites uses the favorites set', () => {
    const res = applyViewFilters(allRows, {
      filter: 'favorites',
      query: '',
      budgetCents: 0,
      hideTraps: false,
      favorites: new Set(['beta.com', 'delta.com']),
    });
    expect(res.rows.map((r) => r.result.domain)).toEqual([
      'beta.com',
      'delta.com',
    ]);
  });

  it('query filters by case-insensitive domain substring', () => {
    const res = applyViewFilters(allRows, {
      filter: 'all',
      query: 'ALP',
      budgetCents: 0,
      hideTraps: false,
      favorites: new Set(),
    });
    expect(res.rows.map((r) => r.result.domain)).toEqual(['alpha.com']);
  });

  it('budget>0 keeps only rows with firstYear <= budgetCents', () => {
    const res = applyViewFilters(allRows, {
      filter: 'all',
      query: '',
      budgetCents: 1200,
      hideTraps: false,
      favorites: new Set(),
    });
    // alpha (1168) and delta (875) pass; beta (1168) passes too;
    // gamma (null) and epsilon (8270) excluded.
    expect(res.rows.map((r) => r.result.domain).sort()).toEqual([
      'alpha.com',
      'beta.com',
      'delta.com',
    ]);
  });

  it('budget=0 is inactive (no filtering)', () => {
    const res = applyViewFilters(allRows, {
      filter: 'all',
      query: '',
      budgetCents: 0,
      hideTraps: false,
      favorites: new Set(),
    });
    expect(res.rows).toHaveLength(5);
  });

  it('hideTraps excludes promo-trap rows and reports the count', () => {
    const trapRows: FilterableRow[] = [
      row('cheap.com', 'available', 100, { reg: 100, renew: 600 }),
      row('fair.com', 'available', 1168, { reg: 1168, renew: 1168 }),
    ];
    // reg=100, renew=600 → 6× → isPromoTrap true
    const res = applyViewFilters(trapRows, {
      filter: 'all',
      query: '',
      budgetCents: 0,
      hideTraps: true,
      favorites: new Set(),
    });
    expect(res.rows.map((r) => r.result.domain)).toEqual(['fair.com']);
    expect(res.trapsHidden).toBe(1);
  });

  it('hideTraps off reports 0 hidden even when traps exist', () => {
    const trapRows: FilterableRow[] = [
      row('cheap.com', 'available', 100, { reg: 100, renew: 600 }),
    ];
    const res = applyViewFilters(trapRows, {
      filter: 'all',
      query: '',
      budgetCents: 0,
      hideTraps: false,
      favorites: new Set(),
    });
    expect(res.rows).toHaveLength(1);
    expect(res.trapsHidden).toBe(0);
  });

  it('hideTraps count is computed after budget filter', () => {
    // Both rows are traps; budget excludes one of them.
    const trapRows: FilterableRow[] = [
      row('cheap.com', 'available', 100, { reg: 100, renew: 600 }),
      row('pricy.com', 'available', 5000, { reg: 5000, renew: 30000 }),
    ];
    const res = applyViewFilters(trapRows, {
      filter: 'all',
      query: '',
      budgetCents: 200,
      hideTraps: true,
      favorites: new Set(),
    });
    // budget 200 cents keeps only cheap.com (firstYear=100).
    // hideTraps then removes it → 0 rows, 1 trap hidden.
    expect(res.rows).toHaveLength(0);
    expect(res.trapsHidden).toBe(1);
  });

  it('rows without a best entry are never trap-excluded', () => {
    const noBest: FilterableRow[] = [
      row('nobest.com', 'available', 1168),
    ];
    const res = applyViewFilters(noBest, {
      filter: 'all',
      query: '',
      budgetCents: 0,
      hideTraps: true,
      favorites: new Set(),
    });
    expect(res.rows).toHaveLength(1);
    expect(res.trapsHidden).toBe(0);
  });
});

describe('displayToUsdCents', () => {
  it('USD passes through (×100)', () => {
    expect(displayToUsdCents(20, settings)).toBe(2000);
  });

  it('USD: 0 or negative returns 0 (inactive)', () => {
    expect(displayToUsdCents(0, settings)).toBe(0);
    expect(displayToUsdCents(-5, settings)).toBe(0);
  });

  it('USD: NaN returns 0', () => {
    expect(displayToUsdCents(NaN, settings)).toBe(0);
  });

  it('RUB divides by rate then ×100', () => {
    const rubSettings: Settings = {
      ...DEFAULT_SETTINGS,
      currency: 'RUB',
      rates: { RUB: 100, EUR: 0.92 },
    };
    // 2000₽ at 100₽/$ → $20 → 2000 cents
    expect(displayToUsdCents(2000, rubSettings)).toBe(2000);
  });

  it('EUR divides by rate then ×100', () => {
    const eurSettings: Settings = {
      ...DEFAULT_SETTINGS,
      currency: 'EUR',
      rates: { RUB: 100, EUR: 0.92 },
    };
    // 20€ at 0.92€/$ → $21.7391... → 2174 cents
    expect(displayToUsdCents(20, eurSettings)).toBe(2174);
  });

  it('RUB with zero rate returns 0 (guard)', () => {
    const rubSettings: Settings = {
      ...DEFAULT_SETTINGS,
      currency: 'RUB',
      rates: { RUB: 0, EUR: 0.92 },
    };
    expect(displayToUsdCents(2000, rubSettings)).toBe(0);
  });
});
