import { describe, it, expect } from 'vitest';
import {
  parseFxRates,
  isFxStale,
  ratesEqual,
  fetchFxRates,
  FX_TTL_MS,
} from '../src/pricing/fx';

const valid = {
  result: 'success',
  base_code: 'USD',
  rates: { USD: 1, RUB: 83.4918, EUR: 0.8888, GBP: 0.74 },
};

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('parseFxRates', () => {
  it('extracts RUB and EUR from a valid payload', () => {
    expect(parseFxRates(valid)).toEqual({ RUB: 83.4918, EUR: 0.8888 });
  });

  it('rejects payloads without a rates object', () => {
    expect(parseFxRates(null)).toBeNull();
    expect(parseFxRates('x')).toBeNull();
    expect(parseFxRates({})).toBeNull();
    expect(parseFxRates({ rates: 'nope' })).toBeNull();
  });

  it('rejects missing or non-numeric currencies', () => {
    expect(parseFxRates({ rates: { RUB: 83 } })).toBeNull();
    expect(parseFxRates({ rates: { RUB: '83', EUR: 0.9 } })).toBeNull();
  });

  it('rejects non-positive or non-finite rates', () => {
    expect(parseFxRates({ rates: { RUB: 0, EUR: 0.9 } })).toBeNull();
    expect(parseFxRates({ rates: { RUB: -1, EUR: 0.9 } })).toBeNull();
    expect(parseFxRates({ rates: { RUB: Number.NaN, EUR: 0.9 } })).toBeNull();
  });
});

describe('isFxStale', () => {
  const now = 1_800_000_000_000;

  it('null state is stale', () => {
    expect(isFxStale(null, now)).toBe(true);
  });

  it('fresh state is not stale', () => {
    expect(isFxStale({ rates: { RUB: 83, EUR: 0.9 }, fetchedAt: now - 1000 }, now)).toBe(false);
  });

  it('state older than the TTL is stale', () => {
    expect(isFxStale({ rates: { RUB: 83, EUR: 0.9 }, fetchedAt: now - FX_TTL_MS - 1 }, now)).toBe(
      true,
    );
  });

  it('non-finite fetchedAt is stale', () => {
    expect(isFxStale({ rates: { RUB: 83, EUR: 0.9 }, fetchedAt: Number.NaN }, now)).toBe(true);
  });
});

describe('ratesEqual', () => {
  it('compares both currencies', () => {
    expect(ratesEqual({ RUB: 1, EUR: 2 }, { RUB: 1, EUR: 2 })).toBe(true);
    expect(ratesEqual({ RUB: 1, EUR: 2 }, { RUB: 1, EUR: 3 })).toBe(false);
  });
});

describe('fetchFxRates', () => {
  it('returns rates on a successful valid response', async () => {
    expect(await fetchFxRates(fakeFetch(200, valid))).toEqual({ RUB: 83.4918, EUR: 0.8888 });
  });

  it('returns null on HTTP error', async () => {
    expect(await fetchFxRates(fakeFetch(500, valid))).toBeNull();
  });

  it('returns null on an invalid payload', async () => {
    expect(await fetchFxRates(fakeFetch(200, { result: 'error' }))).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const throwing = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await fetchFxRates(throwing)).toBeNull();
  });
});
