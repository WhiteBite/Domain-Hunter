import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as core from '../cli/core';
import { createMcpServer } from '../cli/mcp/tools';
import { PUBLIC_ADAPTERS } from '../cli/public-sources/adapters';
import { canonicalDomain, createPublicSourceService } from '../cli/public-sources/service';
import type { PublicAdapter } from '../cli/public-sources/adapters';
import type { PublicSourceId } from '../cli/public-sources/types';

function fastAdapters() {
  return Object.fromEntries(Object.entries(PUBLIC_ADAPTERS).map(([id, adapter]) => [id, {
    ...adapter, descriptor: { ...adapter.descriptor, minIntervalMs: 0 },
  }])) as Record<PublicSourceId, PublicAdapter>;
}
function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public source normalization', () => {
  it('accepts IDNs, rejects URLs, IP addresses, invalid labels and local hostnames', () => {
    expect(canonicalDomain('пример.рф')).toBe('xn--e1afmkfd.xn--p1ai');
    for (const value of ['https://example.com', '127.0.0.1', 'example.com/path', 'a..com', 'example', 'example.com.', ' example.com', 'bad_.com']) {
      expect(canonicalDomain(value)).toBeNull();
    }
  });

  it('does not treat DNS estimates or contradictory responses as confirmed', () => {
    const parsed = PUBLIC_ADAPTERS.dotsweep.parse({ results: [
      { domain: 'a.com', status: 'available', confidence: 'estimated', source: 'dns' },
      { domain: 'b.com', status: 'available', confidence: 'certain', source: 'rdap', unused: true },
      { domain: 'c.com', status: 'available', confidence: 'certain', source: 'rdap', policy: { closed: true }, price: { currency: 'USD', registration: 3 } },
      { domain: 'd.com', status: 'taken', confidence: 'certain', source: 'whois' },
      { domain: 'e.com', status: 'taken', confidence: 'certain', source: 'dns' },
      { domain: 'f.invalid', status: 'available', confidence: 'certain', source: 'rdap', unsold: true, price: { currency: 'USD', registration: 1 } },
      { domain: 'g.com', status: 'available', confidence: 'certain', source: 'cache' },
    ] }, ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.invalid', 'g.com']);
    expect(parsed.map((item) => item.status)).toEqual(['unknown', 'unknown', 'unavailable', 'unavailable', 'unknown', 'unknown', 'unknown']);
    expect(parsed[2]?.standardPrice).toBeNull();
    expect(parsed[5]?.standardPrice).toBeNull();
    expect(PUBLIC_ADAPTERS.dotsweep.parse({ results: [
      { domain: 'a.com', status: 'taken', confidence: 'certain', source: 'rdap' },
      { domain: 'a.com', status: 'available', confidence: 'certain', source: 'rdap' },
    ] }, ['a.com'])).toEqual([]);
  });

  it('never converts DigMyName premium or uncertain answers into premium prices', () => {
    const parse = (result: Record<string, unknown>) => PUBLIC_ADAPTERS.digmyname.parse({ result: { domain: 'a.com', ...result } }, ['a.com'])[0]!;
    const premium = parse({ available: true, uncertain: false, premium: true, price_usd: 100, buy_url: 'https://example.test/a' });
    expect(premium.status).toBe('possibly_available');
    expect(premium.standardPrice).toBeNull();
    const unclear = parse({ available: true, uncertain: true, premium: false, price_usd: 12.34 });
    expect(unclear.status).toBe('unknown');
    expect(unclear.standardPrice).toMatchObject({ kind: 'standard_tld', registrationCents: 1234 });
    expect(parse({ available: true, uncertain: false, price_usd: 12 }).standardPrice).toBeNull();
    expect(parse({ available: true, uncertain: false, premium: false, likely_premium: true, price_usd: 12 }).standardPrice).toBeNull();
    expect(parse({ available: true, uncertain: false, premium: false, price_usd: 12.345 }).standardPrice).toBeNull();
    expect(() => PUBLIC_ADAPTERS.digmyname.parse({ result: { domain: 'other.com' } }, ['a.com'])).toThrow();
  });

  it('retains vendor, USD currency, minimum term and first payment as standard prices', () => {
    const parsed = PUBLIC_ADAPTERS.dotsweep.parse({ results: [{ domain: 'a.ai', status: 'available', confidence: 'certain', source: 'rdap',
      price: { currency: 'USD', registration: 82.7, renewal: 83, first_payment: 165.4, min_term_years: 2, source: 'Porkbun' },
      buy: [{ url: 'https://dotsweep.com/go/porkbun/a.ai' }, { url: 'javascript:alert(1)' }],
      prices: [
        { vendor: 'porkbun', currency: 'USD', registration: 82.7, renewal: 83, transfer: 85, first_payment: 165.4 },
        { vendor: 'dynadot', currency: 'USD', registration: 70, renewal: 81 },
        { vendor: 'dupe', currency: 'USD', registration: 1 }, { vendor: 'dupe', currency: 'USD', registration: 2 },
        { vendor: 'wrong-currency', currency: 'EUR', registration: 1 },
      ],
    }] }, ['a.ai'])[0]!;
    expect(parsed.standardPrice).toEqual({ kind: 'standard_tld', currency: 'USD', registrationCents: 8270, renewalCents: 8300, firstPaymentCents: 16540, minimumTermYears: 2, registrar: 'Porkbun' });
    expect(parsed.links).toEqual(['https://dotsweep.com/go/porkbun/a.ai']);
    expect(parsed.standardPrices).toHaveLength(2);
    expect(parsed.standardPrices[0]).toMatchObject({ registrar: 'porkbun', registrationCents: 8270, transferCents: 8500, minimumTermYears: null });
    expect(parsed.standardPrices[1]).toMatchObject({ registrar: 'dynadot', renewalCents: 8100 });
  });

  it('Domainee only treats reported RDAP positives as possible and validates domain/zone', () => {
    const parse = (data: unknown) => PUBLIC_ADAPTERS.domainee.parse({ ok: true, data }, ['a.com']);
    expect(parse({ name: 'a', results: [{ tld: 'com', available: true }] })[0]?.status).toBe('unknown');
    expect(parse({ name: 'a', results: [{ tld: 'com', available: true, method: 'dns' }] })[0]?.status).toBe('unknown');
    expect(parse({ name: 'a', results: [{ tld: 'com', available: true, method: 'rdap' }] })[0]?.status).toBe('possibly_available');
    expect(PUBLIC_ADAPTERS.domainee.parse({ ok: false, error: { code: 'availability_check_failed', message: 'Invalid TLD(s): xn--p1ai. Use letters only' } }, ['xn--e1afmkfd.xn--p1ai'])[0]).toMatchObject({ status: 'unknown', providerStatus: 'unsupported' });
    expect(parse({ name: 'a', results: [{ tld: 'com', fqdn: 'a.com', available: false, method: 'rdap' }] })[0]).toMatchObject({ status: 'unavailable', method: 'rdap' });
    expect(parse({ name: 'a', results: [{ tld: 'com', fqdn: 'b.com', available: false }] })).toEqual([]);
    expect(parse({ name: 'a', results: [{ tld: 'net', available: false }] })).toEqual([]);
    expect(parse({ name: 'a', results: [{ tld: 'com', available: true }, { tld: 'com', available: false }] })).toEqual([]);
    expect(() => parse({ name: 'b', results: [] })).toThrow();
  });
});

describe('public source service', () => {
  it('calls only selected fixed endpoints, reports conflicts, caches without inventing dates', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.redirect).toBe('error');
      if (url === 'https://dotsweep.com/check') {
        expect(JSON.parse(String(init?.body))).toEqual({ domains: ['a.com'] });
        return response({ results: [{ domain: 'a.com', status: 'available', confidence: 'certain', source: 'rdap' }] });
      }
      if (url.startsWith('https://api.digmyname.com/')) return response({ result: { domain: 'a.com', available: false, uncertain: false, premium: false } });
      throw new Error('unexpected endpoint');
    }) as unknown as typeof globalThis.fetch;
    const service = createPublicSourceService(fetch, fastAdapters());
    const result = await service.compare(['a.com'], ['dotsweep', 'digmyname']);
    expect(result.summary[0]).toMatchObject({ domain: 'a.com', status: 'unknown', conflict: true });
    expect(result.sources.map((source) => source.status)).toEqual(['ok', 'ok']);
    expect(result.sources[0]?.signals[0]).toMatchObject({ observedAt: null, fromCache: false });
    expect(result.sources[1]?.signals[0]?.links).toContain('https://digmyname.com/');
    const cached = await service.compare(['a.com'], ['dotsweep', 'digmyname']);
    expect(cached.sources[0]?.signals[0]).toMatchObject({ observedAt: null, fromCache: true, fetchedAt: result.sources[0]?.signals[0]?.fetchedAt });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('normalizes representative sampled provider responses without merging their prices', async () => {
    const domain = 'domain-hunter-test-zzqv9478.com';
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://dotsweep.com/check') return response({ results: [{ domain, status: 'available', confidence: 'certain', source: 'rdap', price: { currency: 'USD', registration: 11.81, renewal: 11.81, first_payment: 11.81, source: 'Porkbun' }, prices: [{ vendor: 'cloudflare', currency: 'USD', registration: 10.46, renewal: 10.46, first_payment: 10.46 }, { vendor: 'porkbun', currency: 'USD', registration: 11.81, renewal: 11.81, transfer: 11.81, first_payment: 11.81 }] }] });
      if (url.startsWith('https://api.domainee.dev/')) return response({ ok: true, data: { name: 'domain-hunter-test-zzqv9478', results: [{ tld: 'com', fqdn: domain, available: true, method: 'rdap' }] } });
      if (url.startsWith('https://api.digmyname.com/')) return response({ result: { domain, available: true, uncertain: false, premium: false, likely_premium: false, price_usd: 4.18, cheapest_registrar: { name: 'Spaceship', reg_price_usd: 4.18 } } });
      throw new Error('unexpected');
    }) as unknown as typeof globalThis.fetch;
    const result = await createPublicSourceService(fetch, fastAdapters()).compare([domain], ['dotsweep', 'domainee', 'digmyname']);
    expect(result.summary[0]).toMatchObject({ status: 'possibly_available', conflict: false });
    expect(result.sources[0]?.signals[0]?.standardPrices).toHaveLength(2);
    expect(result.sources[0]?.signals[0]?.standardPrice?.registrationCents).toBe(1181);
    expect(result.sources[2]?.signals[0]?.standardPrice?.registrationCents).toBe(418);
    expect(result.sources.every((item) => item.signals[0]?.observedAt === null)).toBe(true);
  });

  it('does not infer availability when a selected source is unknown or fails', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).includes('dotsweep.com')
      ? response({ results: [{ domain: 'a.com', status: 'available', confidence: 'certain', source: 'rdap' }] })
      : response({ error: 'failed' }, 500)) as unknown as typeof globalThis.fetch;
    const outcome = await createPublicSourceService(fetch, fastAdapters()).compare(['a.com'], ['dotsweep', 'domainee']);
    expect(outcome.sources[1]).toMatchObject({ status: 'failed', unresolved: ['a.com'], signals: [] });
    expect(outcome.summary[0]?.status).toBe('unknown');
  });

  it('reports partial results without retrying or guessing missing domains', async () => {
    const fetch = vi.fn(async () => response({ results: [{ domain: 'a.com', status: 'taken', confidence: 'certain', source: 'rdap' }] })) as unknown as typeof globalThis.fetch;
    const outcome = await createPublicSourceService(fetch, fastAdapters()).compare(['a.com', 'b.com'], ['dotsweep']);
    expect(outcome.sources[0]).toMatchObject({ status: 'partial', unresolved: ['b.com'] });
    expect(outcome.summary.find((row) => row.domain === 'b.com')?.status).toBe('unknown');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors 429 Retry-After and avoids subsequent requests during cooldown', async () => {
    const fetch = vi.fn(async () => response({ error: 'rate_limited' }, 429, { 'retry-after': '120' })) as unknown as typeof globalThis.fetch;
    const service = createPublicSourceService(fetch, fastAdapters());
    expect((await service.compare(['a.com'], ['domainee'])).sources[0]).toMatchObject({ status: 'rate_limited', retryAfterSeconds: 120 });
    expect((await service.compare(['b.com'], ['domainee'])).sources[0]?.status).toBe('rate_limited');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors a DigMyName daily-quota response until the next UTC day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
    try {
      const fetch = vi.fn(async () => response({ error: { code: 'daily_quota' } }, 429, { 'retry-after': '120' })) as unknown as typeof globalThis.fetch;
      const service = createPublicSourceService(fetch, fastAdapters());
      const result = await service.compare(['a.com'], ['digmyname']);
      expect(result.sources[0]).toMatchObject({ status: 'rate_limited', retryAfterSeconds: 43200 });
      expect((await service.compare(['b.com'], ['digmyname'])).sources[0]?.retryAfterSeconds).toBe(43200);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('coalesces queued checks through the cache and caps pending calls', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetch = vi.fn(async () => { await gate; return response({ results: [{ domain: 'a.com', status: 'taken', confidence: 'certain', source: 'rdap' }] }); }) as unknown as typeof globalThis.fetch;
    const service = createPublicSourceService(fetch, fastAdapters());
    const pending = Array.from({ length: 16 }, () => service.compare(['a.com'], ['dotsweep']));
    const overflow = await service.compare(['a.com'], ['dotsweep']);
    expect(overflow.sources[0]?.status).toBe('busy');
    release();
    const results = await Promise.all(pending);
    expect(results.every((item) => item.summary[0]?.status === 'unavailable')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('enforces local quota and refuses oversized or malformed bodies', async () => {
    const adapters = fastAdapters();
    adapters.domainee.descriptor.localDailyCap = 1;
    const fetch = vi.fn(async () => response({ ok: true, data: { name: 'a', results: [{ tld: 'com', available: true }] } })) as unknown as typeof globalThis.fetch;
    const service = createPublicSourceService(fetch, adapters);
    const result = await service.compare(['a.com', 'b.com'], ['domainee']);
    expect(result.sources[0]).toMatchObject({ status: 'quota_exhausted', unresolved: ['b.com'] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const oversized = vi.fn(async () => new Response('x'.repeat(262145), { status: 200 })) as unknown as typeof globalThis.fetch;
    expect((await createPublicSourceService(oversized, fastAdapters()).compare(['a.com'], ['dotsweep'])).sources[0]?.status).toBe('failed');
  });
});

describe('public source MCP protocol', () => {
  it('lists keyless sources and checks only explicitly selected sources', async () => {
    const fetch = vi.fn(async () => response({ results: [{ domain: 'a.com', status: 'taken', confidence: 'certain', source: 'rdap' }] }));
    vi.stubGlobal('fetch', fetch);
    const server = createMcpServer(core, 'test', { rateCoordinator: null });
    const client = new Client({ name: 'test', version: '1' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    try {
      const listing = await client.callTool({ name: 'list_public_sources', arguments: {} });
      const descriptors = JSON.parse((listing.content as Array<{ text: string }>)[0]!.text).sources;
      expect(descriptors.map((item: { id: string }) => item.id)).toEqual(['dotsweep', 'domainee', 'digmyname']);
      expect(fetch).not.toHaveBeenCalled();
      const check = await client.callTool({ name: 'compare_public_sources', arguments: { domains: ['a.com'], sources: ['dotsweep'] } });
      expect(check.isError).toBeFalsy();
      const payload = JSON.parse((check.content as Array<{ text: string }>)[0]!.text);
      expect(payload.summary[0].status).toBe('unavailable');
      expect(fetch).toHaveBeenCalledTimes(1);
      for (const args of [{ domains: ['a.com'] }, { domains: ['https://x.com'], sources: ['dotsweep'] }, { domains: ['a.com'], sources: ['namecheap'] }, { domains: ['a.com'], sources: ['dotsweep'], token: 'bad' }]) {
        expect((await client.callTool({ name: 'compare_public_sources', arguments: args })).isError).toBe(true);
      }
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { await client.close(); await server.close(); }
  });
});
