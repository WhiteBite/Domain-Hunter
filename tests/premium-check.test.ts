import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  detailFor,
  details,
  premiumCheckEligibleOf,
  premiumFound,
  premiumOverrides,
  premiumChecking,
  runPremiumCheck,
  toggleDetail,
} from '../src/ui/premium-check';
import { results, runState, pricing } from '../src/ui/store';
import type { CheckResult, PricingTable } from '../src/types';
import type { DigDetail } from '../src/ui/dig';

function result(domain: string, status: CheckResult['status']): CheckResult {
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return { domain, tld, status, source: 'rdap', checkedAt: 0 };
}

function detail(partial: Partial<DigDetail>): DigDetail {
  return { loading: false, price: null, registrar: null, regPrice: null, url: null, ...partial };
}

const TABLE: PricingTable = {
  generatedAt: 'x',
  sources: ['snapshot'],
  tlds: { com: { porkbun: { reg: 1000, renew: 1100, transfer: 1000 } } },
  coupons: {},
};

beforeEach(() => {
  details.set({});
  premiumOverrides.set({});
  detailFor.set(null);
  premiumChecking.set(false);
  premiumFound.set(0);
  results.set(new Map());
  pricing.set({ table: TABLE, fetchedAt: 0, fromCache: true });
  runState.set({ phase: 'done', done: 0, total: 0, available: 0, errors: 0, startedAt: 0, elapsedMs: 0 });
});

describe('premiumCheckEligibleOf', () => {
  it('lists available rows sorted by cheapest price, skipping checked ones', () => {
    const map = new Map<string, CheckResult>([
      ['a.com', result('a.com', 'available')],
      ['b.com', result('b.com', 'available')],
      ['taken.com', result('taken.com', 'taken')],
      ['unknown.com', result('unknown.com', 'unknown')],
    ]);
    const eligible = premiumCheckEligibleOf(map, TABLE, {}, {});
    expect(eligible.map((e) => e.domain)).toEqual(['a.com', 'b.com']);
    expect(eligible.every((e) => e.firstYear === 1000)).toBe(true);
  });

  it('skips rows with a non-failed detail or an existing override', () => {
    const map = new Map<string, CheckResult>([
      ['a.com', result('a.com', 'available')],
      ['b.com', result('b.com', 'available')],
    ]);
    const eligible = premiumCheckEligibleOf(
      map,
      TABLE,
      { 'a.com': detail({ failed: false }) },
      { 'b.com': 50000 },
    );
    expect(eligible).toEqual([]);
  });

  it('keeps rows whose previous detail failed', () => {
    const map = new Map<string, CheckResult>([['a.com', result('a.com', 'available')]]);
    const eligible = premiumCheckEligibleOf(map, TABLE, { 'a.com': detail({ failed: true }) }, {});
    expect(eligible.map((e) => e.domain)).toEqual(['a.com']);
  });
});

describe('toggleDetail', () => {
  it('toggles the detailFor store and calls onExpand only when opening', () => {
    const onExpand = vi.fn();
    void toggleDetail('a.com', onExpand);
    expect(get(detailFor)).toBe('a.com');
    expect(onExpand).toHaveBeenCalledTimes(1);
    void toggleDetail('a.com', onExpand);
    expect(get(detailFor)).toBeNull();
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('seeds a loading entry and applies the fetched detail', async () => {
    vi.mock('../src/ui/dig', async (importOriginal) => {
      const orig = await importOriginal<typeof import('../src/ui/dig')>();
      return { ...orig, fetchPremiumDetail: async () => detail({ premium: true, price: 25 }) };
    });
    await toggleDetail('a.com');
    const d = get(details)['a.com'];
    expect(d?.premium).toBe(true);
    expect(get(premiumOverrides)['a.com']).toBe(2500);
  });
});

describe('runPremiumCheck', () => {
  it('bulk-checks eligible domains and counts premium findings', async () => {
    const map = new Map<string, CheckResult>([
      ['a.com', result('a.com', 'available')],
      ['b.com', result('b.com', 'available')],
    ]);
    results.set(map);
    const fetcher = vi.fn(async (domain: string) =>
      domain === 'a.com' ? detail({ premium: true, price: 25 }) : detail({ price: null }),
    );
    await runPremiumCheck(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(get(premiumOverrides)['a.com']).toBe(2500);
    expect(get(premiumFound)).toBe(1);
    expect(get(premiumChecking)).toBe(false);
    expect(Object.keys(get(details)).sort()).toEqual(['a.com', 'b.com']);
  });

  it('is a no-op unless the run finished and there are eligible rows', async () => {
    runState.set({ phase: 'running', done: 0, total: 1, available: 0, errors: 0, startedAt: 0, elapsedMs: 0 });
    results.set(new Map([['a.com', result('a.com', 'available')]]));
    const fetcher = vi.fn();
    await runPremiumCheck(fetcher);
    expect(fetcher).not.toHaveBeenCalled();

    runState.set({ phase: 'done', done: 1, total: 1, available: 1, errors: 0, startedAt: 0, elapsedMs: 0 });
    results.set(new Map());
    await runPremiumCheck(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
