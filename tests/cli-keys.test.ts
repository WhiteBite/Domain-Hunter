import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installStorage, resetStorage } from '../cli/shims/storage';
import {
  isKeyRegistrar,
  loadRegistrarKeys,
  maskKey,
  removeRegistrarKey,
  saveRegistrarKey,
} from '../cli/keys';
import {
  fetchDynadotTldPrices,
  mergeDynadotIntoTable,
  normalizeDynadotTldPrice,
} from '../cli/registrar-sources';
import { runKeysCommand } from '../cli/core';
import type { PricingTable } from '../src/types';

const dir = mkdtempSync(join(tmpdir(), 'dh-keys-'));
beforeEach(() => {
  resetStorage();
  installStorage(dir);
});

const FIXTURE = {
  TldPriceResponse: {
    ResponseCode: 0, Status: 'success', Currency: 'USD',
    TldPrice: [
      { Tld: 'com', minDuration: 1, Price: { Unit: '(Price/1 year)', Register: '10.99', Renew: '11.48', Transfer: '10.99' } },
      { Tld: '.DEV', minDuration: 1, Price: { Unit: '(Price/1 year)', Register: '14.00', Renew: '', Transfer: '14.00' } },
      { Tld: 'car', minDuration: 1, Price: { Unit: '(Price/1 year)', Register: '2,060.25', Renew: '2.00junk', Transfer: '0.00' } },
      { Tld: 'ai', minDuration: 2, Price: { Unit: '(Price/1 year)', Register: '50.00', Renew: '60.00', Transfer: '60.00' } },
      { Tld: 'unknown', Price: { Unit: '(Price/1 year)', Register: '3.00', Renew: '4.00' } },
      { Tld: 'bad', minDuration: 1, Price: { Unit: '(Price/1 year)', Register: 'abc', Renew: '-3', Transfer: null } },
      { Tld: 'month', minDuration: 1, Price: { Unit: '(Price/1 month)', Register: '1.00' } },
      { Price: { Register: '1.00' } }, null, 'garbage',
    ],
  },
};

describe('normalizeDynadotTldPrice', () => {
  it('reads the documented nested USD response and preserves zero and grouped prices', () => {
    const out = normalizeDynadotTldPrice(FIXTURE);
    expect(out.com).toEqual({ reg: 1099, renew: 1148, transfer: 1099 });
    expect(out.dev).toEqual({ reg: 1400, renew: null, transfer: 1400 });
    expect(out.car).toEqual({ reg: 206025, renew: null, transfer: 0 });
  });

  it('does not imply a one-year registration where the minimum term is different or unknown', () => {
    const out = normalizeDynadotTldPrice(FIXTURE);
    expect(out.ai).toEqual({ reg: null, renew: 6000, transfer: 6000 });
    expect(out.unknown).toEqual({ reg: null, renew: 400, transfer: null });
    expect(out.bad).toBeUndefined();
    expect(out.month).toBeUndefined();
  });

  it('rejects ambiguous duplicate zones', () => {
    const entry = { Tld: 'com', minDuration: 1, Price: { Unit: '(Price/1 year)', Register: '1.00' } };
    expect(normalizeDynadotTldPrice({ TldPriceResponse: { Status: 'success', Currency: 'USD', TldPrice: [entry, entry, entry] } })).toEqual({});
  });

  it('rejects invalid structures, non-USD currency and failure codes', () => {
    expect(normalizeDynadotTldPrice(null)).toEqual({});
    expect(normalizeDynadotTldPrice({ Status: 'success', TldPrice: [] })).toEqual({});
    expect(normalizeDynadotTldPrice({ TldPriceResponse: { ...FIXTURE.TldPriceResponse, Currency: 'EUR' } })).toEqual({});
    expect(normalizeDynadotTldPrice({ TldPriceResponse: { ...FIXTURE.TldPriceResponse, ResponseCode: -1 } })).toEqual({});
  });
});

describe('fetchDynadotTldPrices', () => {
  function mockFetch(json: unknown, ok = true, status = 200): typeof fetch {
    return vi.fn().mockResolvedValue({ ok, status, json: async () => json }) as unknown as typeof fetch;
  }

  it('requests the documented command and USD currency with the encoded key', async () => {
    const f = mockFetch(FIXTURE);
    await fetchDynadotTldPrices('key with space&x', f);
    const url = new URL((f as unknown as { mock: { calls: string[][] } }).mock.calls[0]?.[0] ?? '');
    expect(url.searchParams.get('command')).toBe('tld_price');
    expect(url.searchParams.get('currency')).toBe('USD');
    expect(url.searchParams.get('key')).toBe('key with space&x');
  });

  it('normalizes a success response', async () => {
    const out = await fetchDynadotTldPrices('k', mockFetch(FIXTURE));
    expect(out.com).toEqual({ reg: 1099, renew: 1148, transfer: 1099 });
  });

  it('fails safely on API errors, wrong currency, malformed lists and HTTP errors', async () => {
    await expect(fetchDynadotTldPrices('k', mockFetch({ TldPriceResponse: { Status: 'error' } }))).rejects.toThrow(/unsuccessful/);
    await expect(fetchDynadotTldPrices('k', mockFetch({ TldPriceResponse: { ...FIXTURE.TldPriceResponse, Currency: 'EUR' } }))).rejects.toThrow(/invalid USD/);
    await expect(fetchDynadotTldPrices('k', mockFetch({ TldPriceResponse: { ...FIXTURE.TldPriceResponse, TldPrice: null } }))).rejects.toThrow(/invalid USD/);
    await expect(fetchDynadotTldPrices('k', mockFetch({}, false, 500))).rejects.toThrow(/HTTP 500/);
  });

  it('does not leak the key in transport error messages', async () => {
    const secret = 'private-key-123';
    const f = vi.fn().mockRejectedValue(new Error(`failed at ?key=${secret}`)) as unknown as typeof fetch;
    await expect(fetchDynadotTldPrices(secret, f)).rejects.toThrow('dynadot request failed');
  });
});

function baseTable(): PricingTable {
  return {
    generatedAt: 'x',
    sources: ['snapshot'],
    tlds: {
      com: { porkbun: { reg: 1026, renew: 1026, transfer: 1026 } },
      io: { porkbun: { reg: 3000, renew: 4000, transfer: 3000 } },
    },
    coupons: {},
  };
}

describe('mergeDynadotIntoTable', () => {
  it('layers dynadot entries over curated TLDs and extends sources', () => {
    const merged = mergeDynadotIntoTable(baseTable(), {
      com: { reg: 1099, renew: 1148, transfer: 1099 },
    });
    expect(merged.tlds.com?.dynadot).toEqual({ reg: 1099, renew: 1148, transfer: 1099 });
    expect(merged.tlds.com?.porkbun).toEqual({ reg: 1026, renew: 1026, transfer: 1026 });
    expect(merged.sources).toEqual(['snapshot', 'dynadot']);
  });

  it('ignores TLDs outside the curated table', () => {
    const merged = mergeDynadotIntoTable(baseTable(), {
      zzzunknown: { reg: 100, renew: 100, transfer: 100 },
    });
    expect(merged.tlds.zzzunknown).toBeUndefined();
    expect(merged.sources).toEqual(['snapshot']);
  });

  it('is immutable and idempotent on sources', () => {
    const t = baseTable();
    const once = mergeDynadotIntoTable(t, { com: { reg: 1, renew: 1, transfer: 1 } });
    const twice = mergeDynadotIntoTable(once, { com: { reg: 2, renew: 2, transfer: 2 } });
    expect(t.tlds.com?.dynadot).toBeUndefined();
    expect(twice.sources).toEqual(['snapshot', 'dynadot']);
    expect(twice.tlds.com?.dynadot?.reg).toBe(2);
  });
});

describe('registrar key storage', () => {
  it('round-trips set/list/remove through the file-backed shim', () => {
    expect(loadRegistrarKeys()).toEqual({});
    saveRegistrarKey('dynadot', 'secret-key-123');
    expect(loadRegistrarKeys()).toEqual({ dynadot: 'secret-key-123' });
    expect(removeRegistrarKey('dynadot')).toBe(true);
    expect(removeRegistrarKey('dynadot')).toBe(false);
    expect(loadRegistrarKeys()).toEqual({});
  });

  it('ignores unsupported registrars and non-string values on load', () => {
    localStorage.setItem(
      'dh:cli:registrar-keys',
      JSON.stringify({ dynadot: 'k', namecheap: 'x', bad: 42 }),
    );
    expect(loadRegistrarKeys()).toEqual({ dynadot: 'k' });
  });

  it('masks keys down to the last 4 characters', () => {
    expect(maskKey('abcdefgh')).toBe('****efgh');
    expect(maskKey('abc')).toBe('****');
  });

  it('isKeyRegistrar guards the supported set', () => {
    expect(isKeyRegistrar('dynadot')).toBe(true);
    expect(isKeyRegistrar('namecheap')).toBe(false);
    expect(isKeyRegistrar(undefined)).toBe(false);
  });
});

describe('runKeysCommand', () => {
  it('set stores the key and reports the registrar without echoing it', () => {
    const out = runKeysCommand('set', 'dynadot', 'topsecret');
    expect(out).toEqual({ command: 'keys', action: 'set', registrar: 'dynadot' });
    expect(JSON.stringify(out)).not.toContain('topsecret');
    expect(loadRegistrarKeys().dynadot).toBe('topsecret');
  });

  it('list returns masked entries only', () => {
    saveRegistrarKey('dynadot', 'topsecret');
    const out = runKeysCommand('list');
    expect(out.registrars).toEqual([{ registrarId: 'dynadot', masked: '****cret' }]);
  });

  it('remove reports whether a key was deleted', () => {
    saveRegistrarKey('dynadot', 'k');
    expect(runKeysCommand('remove', 'dynadot').removed).toBe(true);
    expect(runKeysCommand('remove', 'dynadot').removed).toBe(false);
  });

  it('rejects unsupported registrars and empty keys', () => {
    expect(() => runKeysCommand('set', 'namecheap', 'k')).toThrow(/unsupported registrar/);
    expect(() => runKeysCommand('set', 'dynadot', '')).toThrow(/empty/);
  });
});
