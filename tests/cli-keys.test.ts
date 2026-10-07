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
  Status: 'success',
  TldPrice: [
    { Name: 'com', USD: { register: '10.99', renew: '11.48', transfer: '10.99', restore: '80.00' } },
    { Name: '.DEV', USD: { register: '14.00', renew: '', transfer: '14.00' } },
    { Name: 'bad', USD: { register: 'abc', renew: '-3', transfer: null } },
    { USD: { register: '1.00' } },
    null,
    'garbage',
  ],
};

describe('normalizeDynadotTldPrice', () => {
  it('converts USD strings to cents and lowercases/strips dot from names', () => {
    const out = normalizeDynadotTldPrice(FIXTURE);
    expect(out.com).toEqual({ reg: 1099, renew: 1148, transfer: 1099 });
    expect(out.dev).toEqual({ reg: 1400, renew: null, transfer: 1400 });
  });

  it('maps unparseable or negative prices to null', () => {
    expect(normalizeDynadotTldPrice(FIXTURE).bad).toEqual({
      reg: null,
      renew: null,
      transfer: null,
    });
  });

  it('skips items without a usable Name', () => {
    const out = normalizeDynadotTldPrice(FIXTURE);
    expect(Object.keys(out).sort()).toEqual(['bad', 'com', 'dev']);
  });

  it('returns {} for non-success, non-object, or missing TldPrice', () => {
    expect(normalizeDynadotTldPrice({ Status: 'fail', TldPrice: [] })).toEqual({});
    expect(normalizeDynadotTldPrice(null)).toEqual({});
    expect(normalizeDynadotTldPrice('x')).toEqual({});
    expect(normalizeDynadotTldPrice({ Status: 'success' })).toEqual({});
    expect(normalizeDynadotTldPrice({ Status: 'success', TldPrice: 'nope' })).toEqual({});
  });
});

describe('fetchDynadotTldPrices', () => {
  function mockFetch(json: unknown, ok = true, status = 200): typeof fetch {
    return vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => json,
    }) as unknown as typeof fetch;
  }

  it('requests the tld_price endpoint with the encoded key', async () => {
    const f = mockFetch(FIXTURE);
    await fetchDynadotTldPrices('key with space&x', f);
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]?.[0] ?? '';
    expect(url).toContain('api.dynadot.com/api3.json?tld_price&key=');
    expect(url).toContain(encodeURIComponent('key with space&x'));
  });

  it('normalizes a success response', async () => {
    const out = await fetchDynadotTldPrices('k', mockFetch(FIXTURE));
    expect(out.com).toEqual({ reg: 1099, renew: 1148, transfer: 1099 });
  });

  it('throws on a non-success API status', async () => {
    await expect(
      fetchDynadotTldPrices('k', mockFetch({ Status: 'fail', Error: 'invalid key' })),
    ).rejects.toThrow(/Status=fail/);
  });

  it('throws on HTTP errors', async () => {
    await expect(fetchDynadotTldPrices('k', mockFetch({}, false, 500))).rejects.toThrow(
      /HTTP 500/,
    );
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
