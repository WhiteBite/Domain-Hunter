/** Explicit, single-name auxiliary checks. Never runs during bulk searches. */
import { get } from 'svelte/store';
import { toAscii } from '../core/idn';
import { parseRdapCard } from '../core/rdap-card';
import type { RdapCard } from '../types';
import { results, runState } from './store';
import { put as putCache } from '../core/cache';

export type AdvisoryProvider = 'dotsweep' | 'whodat' | 'cctld';
export interface Advisory {
  provider: AdvisoryProvider;
  confidence: string | null;
  verdict: 'registered' | 'not_found' | 'unknown';
  source: string;
  /** Time of our request, not necessarily the time data was collected. */
  requestedAt: number;
  dataAt: number | null;
  cached: boolean | null;
  card: RdapCard | null;
}

// Shared per-provider pacing across all detail rows in this tab. No retry or batch.
const lastRequest = new Map<AdvisoryProvider, number>();
const INTERVAL = 3000;
const latest = new Map<string, Advisory>();
/** Only an in-session result newer than the main check is relevant. */
export function advisoryForExport(domain: string, checkedAt: number): Advisory | null {
  const result = latest.get(domain);
  return result && result.requestedAt >= checkedAt ? result : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function sameDomain(a: unknown, domain: string): boolean {
  return typeof a === 'string' && toAscii(a.replace(/\.$/, '')) === toAscii(domain.replace(/\.$/, ''));
}
function parseDate(v: unknown): number | null {
  const ts = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ts) && ts <= Date.now() ? ts : null;
}
export function parseAdvisory(provider: AdvisoryProvider, domain: string, status: number, body: unknown, requestedAt: number): Advisory | null {
  const r = record(body);
  if (!r) return null;
  const base: Advisory = { provider, confidence: null, verdict: 'unknown', source: provider, requestedAt, dataAt: null, cached: null, card: null };
  if (provider === 'cctld') {
    const ascii = toAscii(domain);
    if (!/\.(?:ru|xn--p1ai)$/.test(ascii)) return null;
    if (status === 200 && r.objectClassName === 'domain' && sameDomain(r.ldhName, domain)) {
      return { ...base, verdict: 'registered', source: 'rdap', card: parseRdapCard(r) };
    }
    if (status === 404 && r.errorCode === 404) return { ...base, verdict: 'not_found', source: 'rdap' };
    return null;
  }
  if (status !== 200 || !sameDomain(provider === 'whodat' ? r.query : r.domain, domain)) return null;
  if (provider === 'dotsweep') {
    const source = typeof r.source === 'string' ? r.source : 'unknown';
    // DNS negatives and estimated results never establish non-registration.
    const positive = r.status === 'taken' && (source === 'rdap' || source === 'whois' || source === 'dns');
    const negative = r.status === 'available' && r.confidence === 'certain' && ['rdap', 'whois'].includes(source);
    return { ...base, confidence: typeof r.confidence === 'string' ? r.confidence : null, verdict: positive ? 'registered' : negative ? 'not_found' : 'unknown', source };
  }
  const meta = record(r.meta);
  const source = typeof meta?.source === 'string' ? meta.source : 'unknown';
  const trustedSource = source === 'rdap' || source === 'whois';
  return { ...base, source, dataAt: parseDate(meta?.fetchedAt), cached: typeof meta?.cached === 'boolean' ? meta.cached : null,
    verdict: trustedSource && r.isRegistered === true ? 'registered' : trustedSource && r.isRegistered === false ? 'not_found' : 'unknown' };
}

export async function checkAdvisory(provider: AdvisoryProvider, domain: string): Promise<Advisory | null> {
  const now = Date.now();
  if (now - (lastRequest.get(provider) ?? 0) < INTERVAL) return null;
  const ascii = toAscii(domain);
  if (provider === 'cctld' && !/\.(?:ru|xn--p1ai)$/.test(ascii)) return null;
  lastRequest.set(provider, now);
  const prefix = provider === 'dotsweep' ? 'https://dotsweep.com/check/' : provider === 'whodat' ? 'https://who-dat.as93.net/v1/whois/' : 'https://cctld.ru/tci-ripn-rdap/domain/';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const response = await fetch(prefix + encodeURIComponent(ascii), { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    const body: unknown = await response.json();
    const data = parseAdvisory(provider, ascii, response.status, body, now);
    if (data?.verdict === 'registered') {
      let changed = false;
      results.update((map) => {
        const old = map.get(domain);
        if (!old || old.status !== 'available' || old.checkedAt > now) return map;
        changed = true;
        const next = new Map(map);
        const updated = { ...old, status: 'unknown' as const, note: 'External result conflicts with RDAP; verify at registrar' };
        next.set(domain, updated);
        putCache(domain, { status: updated.status, source: updated.source, ts: Date.now(), tld: updated.tld });
        return next;
      });
      if (changed) runState.update((s) => s.phase === 'done' ? { ...s, available: Math.max(0, s.available - 1) } : s);
    }
    // A result arriving after a recheck is stale, not a new verdict.
    if ((get(results).get(domain)?.checkedAt ?? 0) > now) return null;
    if (data) latest.set(domain, data);
    return data;
  } catch { return null; } finally { clearTimeout(timer); }
}
