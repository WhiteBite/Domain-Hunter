import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRdapCard } from '../src/core/rdap-card';
import { checkDomain } from '../src/core/rdap-client';
import { getFresh, put, clearCache } from '../src/core/cache';
import type { InfraConfig, TldConfig } from '../src/types';
import takenCom from './fixtures/rdap-card/taken-com.json';
import takenDev from './fixtures/rdap-card/taken-dev.json';
import takenIo from './fixtures/rdap-card/taken-io.json';
import takenUk from './fixtures/rdap-card/taken-uk.json';

const NOW = Date.parse('2026-10-07T00:00:00Z');

describe('parseRdapCard on live fixtures', () => {
  it('com (verisign): dates, registrar, statuses, nameservers', () => {
    const card = parseRdapCard(takenCom, NOW);
    expect(card).not.toBeNull();
    expect(card?.registeredAt).toBe(Date.parse('1997-09-15T04:00:00Z'));
    expect(card?.expiresAt).toBe(Date.parse('2028-09-14T04:00:00Z'));
    expect(card?.changedAt).toBe(Date.parse('2019-09-09T15:39:04Z'));
    expect(card?.registrar).toBe('MarkMonitor Inc.');
    expect(card?.statuses).toContain('client transfer prohibited');
    expect(card?.nameservers[0]).toBe('ns1.google.com');
  });

  it('com: ageDays is deterministic from the injected now', () => {
    const card = parseRdapCard(takenCom, NOW);
    const expected = Math.floor(
      (NOW - Date.parse('1997-09-15T04:00:00Z')) / 86_400_000,
    );
    expect(card?.ageDays).toBe(expected);
    expect(card?.ageDays).toBeGreaterThan(10_000);
  });

  it('dev (google registry): fractional-second ISO dates parse', () => {
    const card = parseRdapCard(takenDev, NOW);
    expect(card?.registeredAt).toBe(Date.parse('2018-06-13T22:30:20.594Z'));
    expect(card?.registrar).toBe('MarkMonitor Inc.');
    expect(card?.nameservers[0]).toBe('ns1.googledomains.com');
  });

  it('io (identity digital): registrar role wins over registrant entity', () => {
    const card = parseRdapCard(takenIo, NOW);
    expect(card?.registrar).toBe('MarkMonitor Inc.');
    expect(card?.registeredAt).toBe(Date.parse('2013-03-08T19:12:48Z'));
    expect(card?.nameservers).toContain('ns-692.awsdns-22.net');
  });

  it('uk (nominet): server-side statuses and trailing-dot NS cleanup', () => {
    const card = parseRdapCard(takenUk, NOW);
    expect(card?.statuses).toContain('server transfer prohibited');
    expect(card?.statuses.every((s) => s.startsWith('server'))).toBe(true);
    expect(card?.nameservers).toContain('ddns0.bbc.co.uk');
    expect(card?.nameservers.every((n) => !n.endsWith('.'))).toBe(true);
    expect(card?.registrar).toBe('British Broadcasting Corporation');
    expect(card?.registeredAt).toBe(Date.parse('1994-12-13T03:49:48Z'));
  });

  it('ignores non-card events like "last update of RDAP database"', () => {
    const card = parseRdapCard(takenCom, NOW);
    const dbUpdate = Date.parse('2026-10-07T06:34:33Z');
    expect(card?.changedAt).not.toBe(dbUpdate);
    expect(card?.expiresAt).not.toBe(dbUpdate);
  });
});

describe('parseRdapCard defensiveness', () => {
  it('returns null for non-object bodies', () => {
    expect(parseRdapCard(null)).toBeNull();
    expect(parseRdapCard(undefined)).toBeNull();
    expect(parseRdapCard('taken')).toBeNull();
    expect(parseRdapCard(42)).toBeNull();
    expect(parseRdapCard([])).toBeNull();
  });

  it('returns null for an object without any card fields', () => {
    expect(parseRdapCard({ objectClassName: 'domain', handle: 'x' })).toBeNull();
    expect(parseRdapCard({})).toBeNull();
  });

  it('degrades broken sub-structures to null/empty without throwing', () => {
    const card = parseRdapCard(
      {
        events: [
          null,
          'garbage',
          { eventAction: 'registration', eventDate: 'not-a-date' },
          { eventAction: 'expiration' },
          { eventDate: '2030-01-01T00:00:00Z' },
        ],
        status: [null, 42, '  ', 'ok', 'ok', 'client transfer prohibited'],
        nameservers: [null, 'x', {}, { ldhName: 5 }, { ldhName: '  ' }, { ldhName: 'A.EXAMPLE.' }],
        entities: [null, 'x', { roles: 'registrar' }, { roles: ['registrant'], vcardArray: 'nope' }],
      },
      NOW,
    );
    expect(card).not.toBeNull();
    expect(card?.registeredAt).toBeNull();
    expect(card?.expiresAt).toBeNull();
    expect(card?.statuses).toEqual(['ok', 'client transfer prohibited']);
    expect(card?.nameservers).toEqual(['a.example']);
    expect(card?.registrar).toBeNull();
  });

  it('caps statuses and nameservers', () => {
    const statuses = Array.from({ length: 40 }, (_, i) => `status-${i}`);
    const nameservers = Array.from({ length: 40 }, (_, i) => ({ ldhName: `ns${i}.example` }));
    const card = parseRdapCard({ status: statuses, nameservers }, NOW);
    expect(card?.statuses).toHaveLength(16);
    expect(card?.nameservers).toHaveLength(16);
  });

  it('ageDays is null without a registration date and never negative', () => {
    const noReg = parseRdapCard({ status: ['active'] }, NOW);
    expect(noReg?.ageDays).toBeNull();

    const future = parseRdapCard(
      { events: [{ eventAction: 'registration', eventDate: '2027-01-01T00:00:00Z' }] },
      NOW,
    );
    expect(future?.ageDays).toBe(0);
  });

  it('picks the first registrar entity with a usable fn', () => {
    const card = parseRdapCard(
      {
        entities: [
          { roles: ['registrar'], vcardArray: ['vcard', [['version', {}, 'text', '4.0']]] },
          { roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Second Registrar']]] },
        ],
      },
      NOW,
    );
    expect(card?.registrar).toBe('Second Registrar');
  });
});

// ---- checkDomain / cache integration ----

const TLD_COM: TldConfig = { tld: 'com', infra: 'verisign' };
const INFRA_VERISIGN: InfraConfig = {
  id: 'verisign',
  rdapBase: 'https://rdap.verisign.com/{tld}/v1/domain/',
  minPauseMs: 120,
  maxParallel: 6,
  trust: 'high',
};

function jsonResponse(status: number, body: unknown = {}, jsonThrows = false): Response {
  return {
    status,
    headers: { get: () => null },
    json: jsonThrows
      ? async () => {
          throw new Error('invalid JSON');
        }
      : async () => body,
  } as unknown as Response;
}

function scriptFetch(responses: Response[]): typeof fetch {
  let i = 0;
  return vi.fn().mockImplementation(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r;
  }) as unknown as typeof fetch;
}

const noSleep = async (): Promise<void> => {};

describe('checkDomain attaches cards', () => {
  it('HTTP 200 taken carries the parsed card', async () => {
    const r = await checkDomain('google.com', TLD_COM, INFRA_VERISIGN, {
      fetchImpl: scriptFetch([jsonResponse(200, takenCom)]),
      sleep: noSleep,
    });
    expect(r.status).toBe('taken');
    expect(r.source).toBe('rdap');
    expect(r.card?.registrar).toBe('MarkMonitor Inc.');
    expect(r.card?.registeredAt).toBe(Date.parse('1997-09-15T04:00:00Z'));
    expect(r.card?.nameservers[0]).toBe('ns1.google.com');
  });

  it('HTTP 200 with an unparseable body stays taken without a card', async () => {
    const r = await checkDomain('google.com', TLD_COM, INFRA_VERISIGN, {
      fetchImpl: scriptFetch([jsonResponse(200, {}, true)]),
      sleep: noSleep,
    });
    expect(r.status).toBe('taken');
    expect(r.card).toBeUndefined();
  });

  it('404 available paths carry no card', async () => {
    const r = await checkDomain('fresh-x9z7q.com', TLD_COM, INFRA_VERISIGN, {
      fetchImpl: scriptFetch([jsonResponse(404), jsonResponse(200, { Status: 3 })]),
      sleep: noSleep,
    });
    expect(r.status).toBe('available');
    expect(r.card).toBeUndefined();
  });
});

describe('cache card round-trip', () => {
  beforeEach(() => clearCache());

  it('preserves card through put/getFresh', () => {
    const card = parseRdapCard(takenDev, NOW);
    expect(card).not.toBeNull();
    put('google.dev', {
      status: 'taken',
      source: 'rdap',
      ts: Date.now(),
      tld: 'dev',
      card: card ?? undefined,
    });
    const entry = getFresh('google.dev', 60_000);
    expect(entry?.card?.registrar).toBe('MarkMonitor Inc.');
    expect(entry?.card?.registeredAt).toBe(Date.parse('2018-06-13T22:30:20.594Z'));
  });

  it('legacy entries without card still load', () => {
    put('plain.com', { status: 'taken', source: 'rdap', ts: Date.now(), tld: 'com' });
    const entry = getFresh('plain.com', 60_000);
    expect(entry?.status).toBe('taken');
    expect(entry?.card).toBeUndefined();
  });
});
