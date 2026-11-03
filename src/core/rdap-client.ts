/**
 * Single-domain RDAP check — SPEC §7 interpretation matrix.
 * fetch/sleep are injectable for tests.
 */
import type { CheckResult, InfraConfig, TldConfig } from '../types';
import { queryNs } from './doh';
import { parseRdapCard } from './rdap-card';

export type OutcomeKind = 'ok' | '429';

export interface RdapOptions {
  fetchImpl?: typeof fetch;
  fetchTimeoutMs?: number;
  maxRetries?: number;
  proxyUrl?: string;
  sleep?: (ms: number) => Promise<void>;
  /** Outcome callback. On a 429, the parsed Retry-After header (ms, clamped)
   *  is passed so callers can feed it to their AIMD limiter. */
  onOutcome?: (kind: OutcomeKind, retryAfterMs?: number) => void;
}

const BACKOFF_STEPS_MS = [1000, 2000, 4000];
const MAX_RETRY_AFTER_MS = 10_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function resolveRdapUrl(
  tldConfig: TldConfig,
  infra: InfraConfig,
  domain: string,
): string {
  const base = tldConfig.rdapBase ?? infra.rdapBase;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  const resolved = base.includes('{tld}') ? base.split('{tld}').join(tld) : base;
  return resolved + domain;
}

function trustOf(tldConfig: TldConfig, infra: InfraConfig): 'high' | 'low' {
  return tldConfig.trust ?? infra.trust;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, seconds * 1000);
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, Math.min(MAX_RETRY_AFTER_MS, dateMs - Date.now()));
  }
  return null;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json' },
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

interface ProxyResponse {
  status?: number;
  free?: boolean;
}

export async function checkDomain(
  domain: string,
  tldConfig: TldConfig,
  infra: InfraConfig,
  opts: RdapOptions = {},
  signal?: AbortSignal,
): Promise<CheckResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.fetchTimeoutMs ?? 10_000;
  const maxRetries = opts.maxRetries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;
  const trust = trustOf(tldConfig, infra);
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  const startedAt = Date.now();
  const base = { domain, tld, checkedAt: Date.now() };

  const aborted = (): CheckResult => ({
    ...base,
    status: 'error',
    source: 'rdap',
    note: 'aborted',
    latencyMs: Date.now() - startedAt,
  });

  async function conclude404(note?: string): Promise<CheckResult> {
    if (trust === 'high') {
      // A registry RDAP 404 is a preliminary signal, but a registered domain can
      // be absent from a registry's RDAP view (e.g. PIR .org 404 for a
      // delegated domain). A DoH NS probe can contradict that signal.
      const doh = await queryNs(domain, fetchImpl, signal);
      if (doh === 'noerror') {
        return {
          ...base,
          status: 'taken',
          source: 'doh',
          note: 'RDAP 404 contradicted by live NS delegation',
          latencyMs: Date.now() - startedAt,
        };
      }
      // RDAP not-found remains a candidate when DNS does not contradict it;
      // neither NXDOMAIN nor unreachable DNS guarantees registrability.
      return {
        ...base,
        status: 'available',
        source: 'rdap',
        note,
        latencyMs: Date.now() - startedAt,
      };
    }
    const doh = await queryNs(domain, fetchImpl, signal);
    if (doh === 'noerror') {
      return { ...base, status: 'taken', source: 'doh', note, latencyMs: Date.now() - startedAt };
    }
    return {
      ...base, status: 'unknown', source: 'doh',
      note: note ? `${note}; RDAP 404 is unverified` : 'RDAP 404 is unverified',
      latencyMs: Date.now() - startedAt,
    };
  }

  async function networkFailurePath(reason: string): Promise<CheckResult> {
    if (opts.proxyUrl) {
      try {
        const resp = await fetchImpl(opts.proxyUrl + domain);
        if (resp.ok) {
          const data = (await resp.json()) as ProxyResponse;
          if (data.status === 200) {
            return {
              ...base,
              status: 'unknown',
              source: 'rdap',
              note: 'proxy response is not verifiable',
              latencyMs: Date.now() - startedAt,
            };
          }
          if (data.status === 404 || data.free === true) {
            return { ...base, status: 'unknown', source: 'rdap', note: 'proxy response is not verifiable', latencyMs: Date.now() - startedAt };
          }
          return {
            ...base,
            status: 'unknown',
            source: 'rdap',
            note: `proxy HTTP ${data.status ?? '?'}`,
            latencyMs: Date.now() - startedAt,
          };
        }
      } catch {
        // proxy failed — fall through
      }
    }
    // DNS alone cannot establish whether a name is registrable.
    const doh = await queryNs(domain, fetchImpl, signal);
    if (doh === 'nxdomain') {
      return { ...base, status: 'unknown', source: 'doh', note: reason, latencyMs: Date.now() - startedAt };
    }
    if (doh === 'noerror') {
      return {
        ...base,
        status: 'taken',
        source: 'doh',
        note: reason,
        latencyMs: Date.now() - startedAt,
      };
    }
    return { ...base, status: 'error', source: 'rdap', note: reason, latencyMs: Date.now() - startedAt };
  }

  const url = resolveRdapUrl(tldConfig, infra, domain);
  let attempt = 0;
  let networkFails = 0;
  for (;;) {
    if (signal?.aborted) return aborted();

    let resp: Response;
    try {
      resp = await fetchWithTimeout(url, timeoutMs, fetchImpl, signal);
    } catch (err) {
      if (signal?.aborted) return aborted();
      const reason =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'timeout'
            : err.message
          : 'network error';
      // Transient transport failures (TLS resets, dropped sockets) get two
      // extra direct attempts before the proxy/DoH/error path.
      networkFails += 1;
      if (networkFails <= 2) {
        await sleep(400 * networkFails);
        continue;
      }
      return networkFailurePath(reason);
    }

    // Transport succeeded — reset the transient-fail counter so a later
    // network failure after a 429/5xx/200/404 doesn't exhaust the budget.
    networkFails = 0;

    if (resp.status === 200) {
      opts.onOutcome?.('ok');
      const body: unknown = await resp.json().catch(() => null);
      const object = body && typeof body === 'object' ? body as Record<string, unknown> : null;
      if (object?.objectClassName !== 'domain' || typeof object.ldhName !== 'string' ||
          object.ldhName.toLowerCase().replace(/\.$/, '') !== domain.toLowerCase().replace(/\.$/, '')) {
        return { ...base, status: 'unknown', source: 'rdap', note: 'invalid RDAP domain response', latencyMs: Date.now() - startedAt };
      }
      const card = parseRdapCard(body);
      return {
        ...base,
        status: 'taken',
        source: 'rdap',
        latencyMs: Date.now() - startedAt,
        ...(card != null && { card }),
      };
    }
    if (resp.status === 404) {
      opts.onOutcome?.('ok');
      const body: unknown = await resp.json().catch(() => null);
      if (!body || typeof body !== 'object' || (body as { errorCode?: unknown }).errorCode !== 404) {
        return { ...base, status: 'unknown', source: 'rdap', note: 'invalid RDAP 404 response', latencyMs: Date.now() - startedAt };
      }
      return conclude404();
    }
    if (resp.status === 429) {
      const retryAfterMs = parseRetryAfter(resp.headers.get('retry-after'));
      opts.onOutcome?.('429', retryAfterMs ?? undefined);
      attempt += 1;
      if (attempt > maxRetries) {
        return {
          ...base,
          status: 'error',
          source: 'rdap',
          note: 'rate limited (429)',
          latencyMs: Date.now() - startedAt,
        };
      }
      await sleep(retryAfterMs ?? BACKOFF_STEPS_MS[Math.min(attempt - 1, BACKOFF_STEPS_MS.length - 1)] ?? 4000);
      continue;
    }
    if (resp.status >= 500) {
      opts.onOutcome?.('ok');
      attempt += 1;
      if (attempt > maxRetries) {
        return {
          ...base,
          status: 'error',
          source: 'rdap',
          note: `server error (${resp.status})`,
          latencyMs: Date.now() - startedAt,
        };
      }
      await sleep(BACKOFF_STEPS_MS[Math.min(attempt - 1, BACKOFF_STEPS_MS.length - 1)] ?? 4000);
      continue;
    }
    opts.onOutcome?.('ok');
    return {
      ...base,
      status: 'unknown',
      source: 'rdap',
      note: `unexpected HTTP ${resp.status}`,
      latencyMs: Date.now() - startedAt,
    };
  }
}
