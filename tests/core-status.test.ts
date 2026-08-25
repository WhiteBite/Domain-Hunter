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

  it('404 + trust high + DoH NXDOMAIN → available', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([() => jsonResponse(404), () => jsonResponse(200, { Status: 3 })]),
      sleep: noSleep,
    });
    expect(result.status).toBe('available');
    expect(result.source).toBe('rdap');
  });

  it('404 + trust low + DNS NXDOMAIN → probably_available', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([
        () => jsonResponse(404),
        () => jsonResponse(200, { Status: 3 }),
        () => jsonResponse(404),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('probably_available');
    expect(result.source).toBe('doh');
  });

  it('404 + trust low + DNS NOERROR → taken', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([
        () => jsonResponse(404),
        () => jsonResponse(200, { Status: 0 }),
        () => jsonResponse(404),
      ]),
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

  it('429 outcome carries parsed Retry-After ms (clamped, seconds form)', async () => {
    const calls: Array<{ kind: string; retryAfterMs?: number }> = [];
    await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        () => jsonResponse(429, {}, { 'retry-after': '2' }),
        () => jsonResponse(200),
      ]),
      sleep: noSleep,
      onOutcome: (kind, retryAfterMs) => calls.push({ kind, retryAfterMs }),
    });
    const fourTwoNine = calls.find((c) => c.kind === '429');
    expect(fourTwoNine).toBeDefined();
    expect(fourTwoNine?.retryAfterMs).toBe(2000);
  });

  it('429 outcome omits retryAfterMs when header absent', async () => {
    const calls: Array<{ kind: string; retryAfterMs?: number }> = [];
    await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        () => jsonResponse(429),
        () => jsonResponse(200),
      ]),
      sleep: noSleep,
      onOutcome: (kind, retryAfterMs) => calls.push({ kind, retryAfterMs }),
    });
    const fourTwoNine = calls.find((c) => c.kind === '429');
    expect(fourTwoNine).toBeDefined();
    expect(fourTwoNine?.retryAfterMs).toBeUndefined();
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

  it('network failure + proxy 404 + trust high + DoH NXDOMAIN → available', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        throwFetch,
        throwFetch,
        throwFetch,
        () => jsonResponse(200, { status: 404, free: true }),
        () => jsonResponse(200, { Status: 3 }),
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
        () => jsonResponse(404),
        () => jsonResponse(200, { Status: 3 }),
        () => jsonResponse(404),
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
        throwFetch,
        () => jsonResponse(200, { Status: 3 }),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('probably_available');
    expect(result.source).toBe('doh');
  });

  it('resets networkFails after a successful HTTP response — [netfail, netfail, 429, netfail, 200] stays on the direct path', async () => {
    // Bug: networkFails was never reset after a successful fetch, so a
    // sequence netfail×2 → 429 → netfail would exhaust the 2-retry budget
    // and fall to networkFailurePath prematurely. After the fix, the 429
    // resets the counter and the third netfail is still within budget.
    const outcomes: string[] = [];
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        throwFetch,
        throwFetch,
        () => jsonResponse(429, {}, { 'retry-after': '1' }),
        throwFetch,
        () => jsonResponse(200),
      ]),
      sleep: noSleep,
      onOutcome: (k) => outcomes.push(k),
    });
    // Direct 200 → source 'rdap'. If networkFailurePath had been entered,
    // the 200 would have been consumed by the Cloudflare aggregator and
    // source would be 'cloudflare'.
    expect(result.status).toBe('taken');
    expect(result.source).toBe('rdap');
    expect(result.note).toBeUndefined();
    expect(outcomes).toEqual(['429', 'ok']);
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

describe('Cloudflare aggregator fallback + cross-check', () => {
  // (a) transport fallback: direct fetch throws → aggregator 404 + high trust + DoH NXDOMAIN → available
  it('network failure + aggregator 404 + trust high + DoH NXDOMAIN → available (via cloudflare rdap)', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        throwFetch,
        throwFetch,
        throwFetch,
        () => jsonResponse(404),
        () => jsonResponse(200, { Status: 3 }),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('available');
    expect(result.source).toBe('rdap');
    expect(result.note).toBe('via cloudflare rdap');
  });

  // (b) low-trust cross-check: direct 404 + aggregator 200 + DoH NXDOMAIN → taken (contradiction wins)
  it('404 + trust low + aggregator 200 + DoH NXDOMAIN → taken (contradiction)', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([
        () => jsonResponse(404),
        () => jsonResponse(200, { Status: 3 }),
        () => jsonResponse(200),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('taken');
    expect(result.source).toBe('cloudflare');
    expect(result.note).toBe('registry 404 contradicted by cloudflare rdap');
  });

  // (c) low-trust cross-check: direct 404 + aggregator 404 + DoH NXDOMAIN → probably_available (unchanged)
  it('404 + trust low + aggregator 404 + DoH NXDOMAIN → probably_available (unchanged)', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([
        () => jsonResponse(404),
        () => jsonResponse(200, { Status: 3 }),
        () => jsonResponse(404),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('probably_available');
    expect(result.source).toBe('doh');
  });

  // (d) aggregator unreachable → legacy DoH behavior unchanged (normal 404 path)
  it('404 + trust low + aggregator unreachable + DoH NXDOMAIN → probably_available (legacy)', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([
        () => jsonResponse(404),
        () => jsonResponse(200, { Status: 3 }),
        throwFetch,
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('probably_available');
    expect(result.source).toBe('doh');
  });

  // (d) aggregator unreachable → legacy DoH behavior unchanged (transport fallback path)
  it('network failure + aggregator unreachable + trust high + DoH NXDOMAIN → probably_available (legacy)', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        throwFetch,
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

  // transport fallback: aggregator 200 → taken (source cloudflare)
  it('network failure + aggregator 200 → taken (via cloudflare rdap)', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([
        throwFetch,
        throwFetch,
        throwFetch,
        () => jsonResponse(200),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('taken');
    expect(result.source).toBe('cloudflare');
    expect(result.note).toBe('via cloudflare rdap');
  });
});

describe('DoH veto on high-trust 404', () => {
  // (a) high-trust 404 + DoH NXDOMAIN → available/rdap (RDAP authoritative, DNS corroborates)
  it('404 + trust high + DoH NXDOMAIN → available (rdap)', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([() => jsonResponse(404), () => jsonResponse(200, { Status: 3 })]),
      sleep: noSleep,
    });
    expect(result.status).toBe('available');
    expect(result.source).toBe('rdap');
    expect(result.note).toBeUndefined();
  });

  // (b) high-trust 404 + DoH NOERROR → taken/doh + contradiction note
  it('404 + trust high + DoH NOERROR → taken (doh veto)', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([() => jsonResponse(404), () => jsonResponse(200, { Status: 0 })]),
      sleep: noSleep,
    });
    expect(result.status).toBe('taken');
    expect(result.source).toBe('doh');
    expect(result.note).toBe('RDAP 404 contradicted by live NS delegation');
  });

  // (c) high-trust 404 + DoH error → available/rdap (trusted RDAP stands when DoH is unreachable)
  it('404 + trust high + DoH error → available (rdap stands)', async () => {
    const result = await checkDomain('a.test', tldHigh, infraHigh, {
      fetchImpl: scriptFetch([() => jsonResponse(404), throwFetch, throwFetch]),
      sleep: noSleep,
    });
    expect(result.status).toBe('available');
    expect(result.source).toBe('rdap');
  });

  // (d) low-trust 404 behavior unchanged — guard against regression
  it('404 + trust low + DoH NXDOMAIN → probably_available (low-trust path unchanged)', async () => {
    const result = await checkDomain('a.test', tldLow, infraLow, {
      fetchImpl: scriptFetch([
        () => jsonResponse(404),
        () => jsonResponse(200, { Status: 3 }),
        () => jsonResponse(404),
      ]),
      sleep: noSleep,
    });
    expect(result.status).toBe('probably_available');
    expect(result.source).toBe('doh');
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
