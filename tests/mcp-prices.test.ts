import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as core from '../cli/core';
import * as data from '../cli/data';
import * as cache from '../src/core/cache';
import { createMcpServer } from '../cli/mcp/tools';
import { createPriceSourceService } from '../cli/sources/service';
import type { PriceSourceAdapter } from '../cli/sources/types';
import { quoteOrigin } from '../cli/price-provenance';
import type { PricingTable } from '../src/types';

const fixture: PricingTable = {
  generatedAt: '2020-01-01T00:00:00Z', sources: ['porkbun', 'cloudflare'], coupons: {},
  priceProvenance: { observedAt: '2026-01-01T12:00:00Z', liveTlds: { porkbun: ['com'], cloudflare: ['com'] } },
  webhost1UpdatedAt: '2026-02-01T00:00:00Z', webhost1RenewalUpdatedAt: '2026-02-03T00:00:00Z',
  timewebUpdatedAt: '2026-03-01T00:00:00Z', timewebRenewalFromRub: { ru: 399 },
  sourceRub: { webhost1: { com: [12000, 13000] } },
  tlds: {
    com: {
      porkbun: { reg: 100, renew: 500, transfer: 300 },
      cloudflare: { reg: 250, renew: 250, transfer: null },
      webhost1: { reg: 120, renew: 130, transfer: null },
      dynadot: { reg: 350, renew: 450, transfer: null },
    },
    ru: { timeweb: { reg: 200, renew: null, transfer: null }, porkbun: { reg: 900, renew: 1000, transfer: 1100 } },
    'xn--p1ai': { dynadot: { reg: 1000, renew: 1200, transfer: null } },
    'рф': { dynadot: { reg: 1000, renew: 1200, transfer: null } },
  },
};

vi.mock('../cli/data', async (original) => ({
  ...await original<typeof import('../cli/data')>(),
  resolveCliRates: vi.fn().mockResolvedValue({ RUB: 90, EUR: 0.9 }),
  loadPricingTable: vi.fn().mockImplementation(async () => ({ table: fixture, fetchedAt: 123, fromCache: true })),
}));

let client: Client;
let server: ReturnType<typeof createMcpServer>;
beforeEach(async () => {
  client = new Client({ name: 'test', version: '1' });
  server = createMcpServer(core, 'test', { rateCoordinator: null });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});
afterEach(async () => {
  await client.close();
  await server.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function prices(args: Record<string, unknown>) {
  const result = await client.callTool({ name: 'get_prices', arguments: args });
  expect(result.isError).toBeFalsy();
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

describe('MCP pricing protocol', () => {
  it('discovers tools and describes uncertainties without claiming prices are quotes', async () => {
    const tools = (await client.listTools()).tools;
    const priceTool = tools.find((tool) => tool.name === 'get_prices')!;
    expect(priceTool.description).toContain('not individual/premium quotes');
    expect(priceTool.inputSchema.properties).not.toHaveProperty('sources');
    expect(priceTool.inputSchema.properties).not.toHaveProperty('key');
    expect(tools.find((tool) => tool.name === 'list_zones')?.description).not.toContain('authoritatively means free');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const list = await client.callTool({ name: 'list_price_sources', arguments: {} });
    const inventory = JSON.parse((list.content as Array<{ text: string }>)[0]!.text);
    expect(inventory.sources).toEqual([]);
    expect(inventory.baseline.map((item: { id: string }) => item.id)).toEqual(['snapshot', 'porkbun', 'cloudflare']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports field origins, same-seller TCO, independent renewal and pagination', async () => {
    const first = await prices({ limit: 1 });
    expect(first.total).toBe(4);
    expect(first.nextOffset).toBe(1);
    expect(first.fromCache).toBe(true);
    expect(first.quoteType).toBe('standard_tld');
    const row = first.rows[0];
    expect(row.tld).toBe('com');
    expect(row.best.registrarId).toBe('porkbun');
    expect(row.bestRenewal).toEqual({ registrarId: 'webhost1', renew: 130 });
    expect(row.bestTco).toEqual({ registrarId: 'webhost1', total: 380 });
    expect(row.quoteOrigins.porkbun.reg).toEqual({ kind: 'api', observedAt: null, batchObservedAt: '2026-01-01T12:00:00.000Z', sourceUrl: 'https://api.porkbun.com/api/json/v3/pricing/get' });
    expect(row.quoteOrigins.webhost1.reg.observedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(row.quoteOrigins.webhost1.renew.observedAt).toBe('2026-02-03T00:00:00.000Z');
    expect(row.quoteOrigins.webhost1.transfer).toBeNull();
    expect(row.originalRubKopecks.webhost1).toEqual([12000, 13000]);
    const second = await prices({ limit: 1, offset: 1 });
    expect(second.rows[0].tld).toBe('ru');
    expect(second.rows[0].renewalFromRub).toEqual({ timeweb: 399 });
    expect(second.rows[0].renewalFromOrigins.timeweb).toEqual({ kind: 'snapshot', observedAt: '2026-03-01T00:00:00.000Z', sourceUrl: null });
    expect(second.rows[0].quoteOrigins.porkbun.reg).toEqual({ kind: 'snapshot', observedAt: null, sourceUrl: null });
    expect(second.rows[0].quoteOrigins.timeweb.renew).toBeNull();
  });

  it('merges a second registered adapter without Dynadot-specific core logic', async () => {
    const source: PriceSourceAdapter = {
      descriptor: {
        id: 'example', name: 'Fixture', operation: 'standard_tld_prices', mode: 'explicit', auth: 'none',
        credentialTransport: 'none', sourceUrl: 'https://example.test/prices', documentationUrl: 'https://example.test/docs',
        completeness: 'complete', cacheTtlMs: 1000, minIntervalMs: 0, maxConcurrency: 1, limitations: ['Fixture only.'],
      },
      prepare: () => ({ cacheIdentity: 'public', run: async () => ({ com: { reg: 17, renew: 21, transfer: null } }) }),
    };
    const outcome = await core.runPricesCommand({ tlds: ['com'], sources: ['example'], sourceService: createPriceSourceService([source]) });
    expect(outcome.requestedSources?.[0]).toMatchObject({ source: 'example', status: 'ok', completeness: 'complete', appliedZones: 1 });
    expect(outcome.rows[0]?.entries.example?.reg).toBe(17);
    expect(outcome.rows[0]?.quoteOrigins?.example?.reg).toEqual({ kind: 'api', observedAt: outcome.requestedSources?.[0]?.observedAt, sourceUrl: 'https://example.test/prices' });
    expect(outcome.limitations).toContain('Fixture only.');
  });

  it('qualifies availability and budget prices through the actual MCP tools', async () => {
    vi.spyOn(data, 'loadRegistry').mockResolvedValue({ registry: { infras: {}, tlds: [], hackTlds: [] }, source: 'bundled', bootstrapMerged: false });
    vi.spyOn(cache, 'getFresh').mockReturnValue({ status: 'available', source: 'rdap', ts: Date.now(), tld: 'com' });
    async function call(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBeFalsy();
      return JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    }
    const checked = await call('check_availability', { domains: ['example.com'], withPrices: true });
    expect(checked.limitations[0]).toContain('not a registration guarantee');
    expect(checked.results[0].price.quoteType).toBe('standard_tld');
    expect(checked.results[0].price.origins.reg.kind).toBe('api');
    const found = await call('find_domains', { seedName: 'demo', tlds: ['com'], budget: 2, maxChecks: 1 });
    expect(found.limitations[0]).toContain('premium pricing');
    expect(found.available[0].price.quoteType).toBe('standard_tld');
    expect(found.available[0].withinBudget).toBe(true);
  });

  it('rejects credentials, keyed sources, excessive limit and negative offset at the protocol boundary', async () => {
    for (const args of [{ sources: ['dynadot'] }, { sources: ['namecheap'] }, { key: 'secret' }, { limit: 201 }, { offset: -1 }]) {
      const result = await client.callTool({ name: 'get_prices', arguments: args });
      expect(result.isError).toBe(true);
    }
  });
});

describe('legacy cache origins', () => {
  it('does not fabricate exact zone provenance or dates from a seller-level success', () => {
    const old = { ...fixture, priceProvenance: undefined, sources: ['porkbun'] };
    expect(quoteOrigin(old, 'com', 'porkbun', 'reg')).toEqual({ kind: 'unknown', observedAt: null, sourceUrl: null });
    expect(quoteOrigin(old, 'com', 'webhost1', 'renew')?.kind).toBe('snapshot');
    expect(quoteOrigin({ ...fixture, webhost1UpdatedAt: 'bad' }, 'com', 'webhost1', 'reg')?.observedAt).toBeNull();
  });
});


describe('MCP source service', () => {
  it('deduplicates concurrent requests, expires, and never reuses a different key', async () => {
    let now = 10_000;
    let identity = 'key-a';
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetch = vi.fn().mockResolvedValue({ com: { reg: 100, renew: null, transfer: null } });
    const adapter: PriceSourceAdapter = {
      descriptor: {
        id: 'test', name: 'Test', operation: 'standard_tld_prices', mode: 'explicit', auth: 'local_key',
        credentialTransport: 'header', sourceUrl: 'https://example.com/', documentationUrl: 'https://example.com/docs',
        completeness: 'unknown', cacheTtlMs: 1000, minIntervalMs: 0, maxConcurrency: 1, limitations: [],
      },
      prepare: () => ({ cacheIdentity: identity, run: fetch }),
    };
    const service = createPriceSourceService([adapter]);
    const [one, two] = await Promise.all([service.load('test'), service.load('test')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(one.observedAt).toBe(two.observedAt);
    expect((await service.load('test')).fromCache).toBe(true);
    identity = 'key-b';
    await service.load('test');
    expect(fetch).toHaveBeenCalledTimes(2);
    now += 1001;
    expect((await service.load('test')).fromCache).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
