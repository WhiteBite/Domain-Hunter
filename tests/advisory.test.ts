import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { parseAdvisory, checkAdvisory, advisoryForExport } from '../src/ui/advisory';
import { results } from '../src/ui/store';

const time = Date.now();
describe('optional advisory sources', () => {
  afterEach(() => { vi.unstubAllGlobals(); results.set(new Map()); });
  it('treats DNS/estimated negatives as unknown, never available', () => {
    const body = { domain: 'sample.ru', status: 'available', source: 'dns', confidence: 'estimated' };
    expect(parseAdvisory('dotsweep', 'sample.ru', 200, body, time)?.verdict).toBe('unknown');
    expect(parseAdvisory('dotsweep', 'other.ru', 200, body, time)).toBeNull();
    expect(parseAdvisory('dotsweep', 'sample.ru', 429, body, time)).toBeNull();
    expect(parseAdvisory('dotsweep', 'sample.ru', 200, { ...body, source: 'rdap', confidence: 'certain' }, time)?.verdict).toBe('not_found');
  });
  it('only interprets russian RDAP in its supported suffixes and validates the name', () => {
    expect(parseAdvisory('cctld', 'google.com', 404, { errorCode: 404 }, time)).toBeNull();
    expect(parseAdvisory('cctld', 'sample.ru', 404, { errorCode: 404 }, time)?.verdict).toBe('not_found');
    expect(parseAdvisory('cctld', 'sample.ru', 200, { objectClassName: 'domain', ldhName: 'other.ru' }, time)).toBeNull();
    const result = parseAdvisory('cctld', 'sample.ru', 200, { objectClassName: 'domain', ldhName: 'SAMPLE.RU', ripn_state: ['registered'], events: [{ eventAction: 'expiration', eventDate: '2027-01-01' }, { eventAction: 'ripn_free_date', eventDate: '2027-02-01' }] }, time);
    expect(result?.verdict).toBe('registered');
    expect(result?.card?.freeDate).toBe(Date.parse('2027-02-01'));
    expect(result?.card?.expiresAt).toBe(Date.parse('2027-01-01'));
    expect(result?.card?.statuses).toEqual(['registered']);
  });
  it('checks Who Dat source, domain, and cache timestamp', () => {
    const body = { query: 'sample.ru', isRegistered: false, meta: { source: 'rdap', cached: true, fetchedAt: '2026-01-01T00:00:00Z' } };
    const result = parseAdvisory('whodat', 'sample.ru', 200, body, time);
    expect(result?.verdict).toBe('not_found');
    expect(result?.cached).toBe(true);
    expect(result?.dataAt).toBe(Date.parse(body.meta.fetchedAt));
    expect(parseAdvisory('whodat', 'sample.ru', 200, { ...body, meta: { source: 'dns' } }, time)?.verdict).toBe('unknown');
  });
  it('makes a single credential-free explicit request and downgrades contradictory candidate', async () => {
    const domain = 'conflict-test.ru';
    results.set(new Map([[domain, { domain, tld: 'ru', source: 'rdap', status: 'available', checkedAt: time - 1000 }]]));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ domain, status: 'taken', confidence: 'certain', source: 'dns' }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const answer = await checkAdvisory('dotsweep', domain);
    expect(answer?.verdict).toBe('registered');
    expect(get(results).get(domain)?.status).toBe('unknown');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(advisoryForExport(domain, time - 1000)?.provider).toBe('dotsweep');
    expect(advisoryForExport(domain, Date.now() + 1)).toBeNull();
    expect(await checkAdvisory('dotsweep', domain)).toBeNull();
  });
});
