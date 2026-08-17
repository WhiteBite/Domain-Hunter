import { describe, expect, it } from 'vitest';
import { checkDomain, resolveRdapUrl } from '../src/core/rdap-client';
import { queryNs } from '../src/core/doh';
import type { InfraConfig, TldConfig } from '../src/types';

const infraHigh: InfraConfig = {
  id: 'test',
  rdapBase: 'https://rdap.test/domain/',
  minPauseMs: 0,
  maxParallel: 1,
  trust: 'high',
};
const infraLow: InfraConfig = { ...infraHigh, trust: 'low' };
const tldHigh: TldConfig = { tld: 'test', infra: 'test' };
const tldLow: TldConfig = { tld: 'test', infra: 'test', trust: 'low' };

function jsonResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

type FetchScript = Array<() => Response | Promise<Response>>;

function scriptFetch(script: FetchScript): typeof fetch {
  let i = 0;
  return (async () => {
    const next = script[Math.min(i, script.length - 1)];
    i += 1;
    if (!next) throw new Error('fetch script exhausted');
    return next();
  }) as unknown as typeof fetch;
}

const noSleep = (): Promise<void> => Promise.resolve();
const throwFetch = (): Promise<Response> => Promise.reject(new TypeError('failed to fetch'));

describe('resolveRdapUrl', () => {
  it('substitutes {tld} placeholder', () => {
    const infra: InfraConfig = { ...infraHigh, rdapBase: 'https://rdap.test/{tld}/domain/' };
    expect(resolveRdapUrl(tldHigh, infra, 'a.test')).toBe('https://rdap.test/test/domain/a.test');
  });

  it('prefers tld-level rdapBase override', () => {
    const tld: TldConfig = { tld: 'test', infra: 'test', rdapBase: 'https://stealth.test/domain/' };
    expect(resolveRdapUrl(tld, infraHigh, 'a.test')).toBe('https://stealth.test/domain/a.test');
  });
});

describe('checkDomain status matrix', () => {
  it('200 → taken', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([() => jsonResponse(200)]),
      sleep: noSleep,
    });
    expect(result.status).toBe('taken');
    expect(result.source).toBe('rdap');
  });

  it('404 + trust high → available', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([() => jsonResponse(404)]),
      sleep: noSleep,
    });
    expect(result.status).toBe('available');
  });

  it('404 + trust low + DNS NXDOMAIN → probably_available', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([() => jsonResponse(404), () => jsonResponse(200, { Status: 3 })]),
      sleep: noSleep,
    });
    expect(result.status).toBe('probably_available');
    expect(result.source).toBe('doh');
  });

  it('404 + trust low + DNS NOERROR → taken', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([() => jsonResponse(404), () => jsonResponse(200, { Status: 0 })]),
      sleep: noSleep,
    });
    expect(result.status).toBe('taken');
  });

  it('404 + trust low + ambiguous DNS → unknown', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([() => jsonResponse(404), throwFetch, throwFetch]),
      sleep: noSleep,
    });
    expect(result.status).toBe('unknown');
  });

  it('429 retries then succeeds, reports 429 outcome', async () => {
    const outcomes: string[] = [];
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        () => jsonResponse(429, {}, { 'retry-after': '1' }),
        () => jsonResponse(200),
      ]),
      sleep: noSleep,
      onOutcome: (k) => outcomes.push(k),
    });
    expect(result.status).toBe('taken');
    expect(outcomes).toEqual(['429', 'ok']);
  });

  it('429 exhausted → error', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([() => jsonResponse(429)]),
      sleep: noSleep,
      maxRetries: 2,
    });
    expect(result.status).toBe('error');
    expect(result.note).toContain('429');
  });

  it('5xx retries then succeeds', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([() => jsonResponse(503), () => jsonResponse(404)]),
      sleep: noSleep,
    });
    expect(result.status).toBe('available');
  });

  it('network failure + trust high + no proxy → error', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([throwFetch]),
      sleep: noSleep,
    });
    expect(result.status).toBe('error');
  });

  it('network failure + proxy 404 + trust high → available', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        throwFetch,
        throwFetch,
        throwFetch,
        () => jsonResponse(200, { status: 404, free: true }),
      ]),
      proxyUrl: 'https://proxy.test/',
      sleep: noSleep,
    });
    expect(result.status).toBe('available');
  });

  it('network failure + trust low + DNS NXDOMAIN → probably_available', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([
        throwFetch,
        throwFetch,
        throwFetch,
        () => jsonResponse(200, { Status: 3 }),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('probably_available');
  });

  it('network failure + trust high + DoH NXDOMAIN → probably_available (corroboration)', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        throwFetch,
        throwFetch,
        throwFetch,
        () => jsonResponse(200, { Status: 3 }),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('probably_available');
    expect(result.source).toBe('doh');
  });

  it('timeout → error with note', async () => {
    // RDAP hangs until the internal timeout aborts; DoH resolvers are down.
    const hangingFetch = ((url: string, init?: RequestInit) => {
      if (String(url).includes('rdap.test')) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      }
      return Promise.reject(new TypeError('doh down'));
    }) as unknown as typeof fetch;
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: hangingFetch,
      fetchTimeoutMs: 5,
      sleep: noSleep,
    });
    expect(result.status).toBe('error');
    expect(result.note).toBe('timeout');
  });
});

describe('queryNs', () => {
  it('returns nxdomain on Status 3', async () => {
    const outcome = await queryNs('a.test', scriptFetch([() => jsonResponse(200, { Status: 3 })]));
    expect(outcome).toBe('nxdomain');
  });

  it('falls back to the second resolver when the first fails', async () => {
    const outcome = await queryNs(
      'a.test',
      scriptFetch([() => jsonResponse(500), () => jsonResponse(200, { Status: 0 })]),
    );
    expect(outcome).toBe('noerror');
  });

  it('returns error when all resolvers fail', async () => {
    const outcome = await queryNs('a.test', scriptFetch([throwFetch, throwFetch]));
    expect(outcome).toBe('error');
  });
});
