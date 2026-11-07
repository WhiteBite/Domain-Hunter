import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import { isValidDomain } from '../../src/core/idn';
import { PUBLIC_ADAPTERS } from './adapters';
import type { PublicAdapter } from './adapters';
import type { ProviderRequest, RateCoordinator } from './coordination';
import type { PublicSignal, PublicSourceDescriptor, PublicSourceId, PublicSourceResult, SignalStatus } from './types';

const MAX_BODY_BYTES = 256 * 1024;
const CACHE_MS = 60_000;
const DAY_MS = 86_400_000;
const TIMEOUT_MS = 12_000;

/** Exact names only. No URLs, IPs, ports, paths or free-form labels are sent to providers. */
export function canonicalDomain(input: string): string | null {
  if (!input || input !== input.trim() || /[\s/@:?#\\]/.test(input)) return null;
  const ascii = domainToASCII(input).toLowerCase();
  if (!ascii || ascii.length > 253 || ascii.endsWith('.') || !ascii.includes('.') || isIP(ascii) !== 0 || !isValidDomain(ascii)) return null;
  return ascii;
}

async function boundedJson(res: Response): Promise<unknown> {
  const length = Number(res.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error('oversized');
  if (!res.body) throw new Error('empty');
  const reader = res.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('oversized'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function retryDelay(header: string | null): number {
  const seconds = header != null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : NaN;
  const date = header ? Date.parse(header) : NaN;
  const ms = header != null && /^\d+$/.test(header.trim()) ? (Number.isFinite(seconds) ? seconds * 1000 : Number.MAX_SAFE_INTEGER)
    : Number.isFinite(date) ? date - Date.now() : 60_000;
  return Math.min(Number.MAX_SAFE_INTEGER - Date.now(), Math.max(1000, ms));
}

interface State {
  tail: Promise<void>;
  pending: number;
  lastFinished: number | null;
  blockedUntil: number;
  requestTimes: number[];
  cache: Map<string, { signal: PublicSignal; expiresAt: number }>;
}

/** Independent read-only providers; all limits and caches are local to this server instance. */
export function createPublicSourceService(
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
  adapters: Record<PublicSourceId, PublicAdapter> = PUBLIC_ADAPTERS,
  coordinator?: RateCoordinator | null,
) {
  const states = new Map<PublicSourceId, State>();
  for (const id of Object.keys(adapters) as PublicSourceId[]) states.set(id, { tail: Promise.resolve(), pending: 0, lastFinished: null, blockedUntil: 0, requestTimes: [], cache: new Map() });

  function list(): PublicSourceDescriptor[] {
    return Object.values(adapters).map(({ descriptor }) => ({ ...descriptor, limitations: [...descriptor.limitations] }));
  }

  async function sourceCheck(id: PublicSourceId, domains: string[]): Promise<PublicSourceResult> {
    const adapter = adapters[id], state = states.get(id)!;
    if (state.pending >= 16) return { source: id, status: 'busy', signals: [], unresolved: domains, retryAfterSeconds: null };
    state.pending++;
    const task = state.tail.then(async (): Promise<PublicSourceResult> => {
      const signals: PublicSignal[] = [];
      let unresolved = [...domains];
      let error: PublicSourceResult['status'] = 'ok';
      let retryAfterSeconds: number | null = null;
      // Cache is checked inside the queue so concurrent callers share completed requests.
      for (const domain of domains) {
        const item = state.cache.get(domain);
        if (item && item.expiresAt > Date.now()) {
          signals.push({ ...item.signal, fromCache: true });
          unresolved = unresolved.filter((d) => d !== domain);
        } else if (item) state.cache.delete(domain);
      }
      while (unresolved.length) {
        const now = Date.now();
        if (state.blockedUntil > now) { error = 'rate_limited'; retryAfterSeconds = Math.ceil((state.blockedUntil - now) / 1000); break; }
        state.requestTimes = state.requestTimes.filter((time) => time > now - DAY_MS);
        if (adapter.descriptor.localDailyCap != null && state.requestTimes.length >= adapter.descriptor.localDailyCap) { error = 'quota_exhausted'; break; }
        const since = state.lastFinished == null ? Infinity : now - state.lastFinished;
        const wait = Math.max(0, adapter.descriptor.minIntervalMs - since);
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        const batch = unresolved.slice(0, adapter.descriptor.batchSize);
        const execute = async (): Promise<ProviderRequest> => {
          state.requestTimes.push(Date.now());
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
          try {
            const { url, init } = adapter.request(batch);
            const res = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
            if (res.status === 429) {
              let delay = retryDelay(res.headers.get('retry-after'));
              if (id === 'digmyname') {
                try {
                  const data = await boundedJson(res) as { error?: unknown; code?: unknown };
                  const detail = data?.error && typeof data.error === 'object' ? data.error as { code?: unknown } : null;
                  if (data?.error === 'daily_quota' || data?.code === 'daily_quota' || detail?.code === 'daily_quota') {
                    const date = new Date();
                    const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
                    delay = Math.max(delay, midnight - Date.now());
                  }
                } catch { /* A malformed error body must not bypass the cooldown. */ }
              }
              return { kind: 'rate_limited', delayMs: delay };
            }
            if (!res.ok) return { kind: 'failed' };
            return { kind: 'ok', signals: adapter.parse(await boundedJson(res), batch) };
          } catch { return { kind: 'failed' }; }
          finally { clearTimeout(timer); }
        };
        const result = coordinator ? await coordinator.run(id, adapter.descriptor, execute) : await execute();
        state.lastFinished = Date.now();
        if (result.kind === 'rate_limited') {
          state.blockedUntil = Date.now() + result.delayMs;
          retryAfterSeconds = Math.ceil(result.delayMs / 1000);
          error = 'rate_limited';
          break;
        }
        if (result.kind !== 'ok') { error = result.kind; break; }
        const fetchedAt = new Date().toISOString();
        const seen = new Set<string>();
        for (const item of result.signals) {
          if (!batch.includes(item.domain) || seen.has(item.domain)) continue;
          seen.add(item.domain);
          const signal: PublicSignal = { ...item, fetchedAt, observedAt: null, fromCache: false };
          signals.push(signal);
          state.cache.set(item.domain, { signal, expiresAt: Date.now() + CACHE_MS });
          if (state.cache.size > 500) state.cache.delete(state.cache.keys().next().value!);
          unresolved = unresolved.filter((d) => d !== item.domain);
        }
        // No blind retries on malformed or partial responses.
        if (seen.size !== batch.length) { error = 'partial'; break; }
      }
      return { source: id, status: error === 'failed' && signals.length ? 'partial' : error, signals, unresolved, retryAfterSeconds };
    });
    state.tail = task.then(() => undefined, () => undefined);
    try { return await task; } finally { state.pending--; }
  }

  async function compare(input: string[], sources: PublicSourceId[]) {
    const domains = input.map(canonicalDomain);
    if (domains.some((domain) => !domain)) throw new Error('Provide fully qualified domain names only; URLs, paths, IPs and invalid labels are not accepted.');
    const uniqueDomains = [...new Set(domains as string[])];
    const uniqueSources = [...new Set(sources)];
    const results = await Promise.all(uniqueSources.map((source) => sourceCheck(source, uniqueDomains)));
    const summary = uniqueDomains.map((domain) => {
      const evidence = results.flatMap((result) => result.signals.filter((item) => item.domain === domain).map((item) => ({ source: result.source, status: item.status })));
      const positive = evidence.some((item) => item.status === 'possibly_available');
      const negative = evidence.some((item) => item.status === 'unavailable');
      const conflict = positive && negative;
      const complete = evidence.length === uniqueSources.length && evidence.every((item) => item.status !== 'unknown');
      const status: SignalStatus = !complete || conflict ? 'unknown' : negative ? 'unavailable' : positive ? 'possibly_available' : 'unknown';
      return { domain, status, conflict, evidence };
    });
    return {
      command: 'compare_public_sources', summary, sources: results,
      limitations: [
        'Names are sent to the explicitly selected third parties. Do not send confidential search terms without permission.',
        'Signals are advisory, not proof of registrability; prices are standard TLD estimates and never premium quotes.',
        'fetchedAt is our receipt time, not the provider data observation time; providers may use caches.',
        'Rate limits and quotas are shared by IP; local coordination cannot account for other users, machines or applications.',
        'Provider data and external links are untrusted third-party content; responses may be wrong or unavailable.',
      ],
    };
  }
  return { list, compare };
}
