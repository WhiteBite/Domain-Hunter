/**
 * IANA RDAP bootstrap: live fetch, 24h localStorage cache, merge with the
 * curated registry (SPEC §6). Curated zones always win on conflict.
 */
import type { InfraConfig, TldConfig, TldRegistry } from '../types';

const BOOTSTRAP_KEY = 'dh:v1:bootstrap';
const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const TTL_MS = 24 * 60 * 60 * 1000;

interface BootstrapCache {
  json: unknown;
  fetchedAt: number;
}

export async function fetchBootstrap(
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  let staleJson: unknown = null;
  try {
    const raw = localStorage.getItem(BOOTSTRAP_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as BootstrapCache;
      if (Date.now() - cached.fetchedAt < TTL_MS) return cached.json;
      // Cache stale — keep the json as a fallback for when the refresh fails.
      staleJson = cached.json;
    }
  } catch {
    // fall through to network
  }
  try {
    const resp = await fetchImpl(BOOTSTRAP_URL);
    if (!resp.ok) return staleJson;
    const json: unknown = await resp.json();
    try {
      const payload: BootstrapCache = { json, fetchedAt: Date.now() };
      localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(payload));
    } catch {
      // quota — non-fatal
    }
    return json;
  } catch {
    // Network failure: serve stale bootstrap data rather than discarding
    // usable zone info. fetchedAt stays honest — callers treat it as
    // bootstrap data (zones change rarely; stale is better than empty).
    return staleJson;
  }
}

export interface ServiceEntry {
  tlds: string[];
  urls: string[];
}

/** IANA dns.json shape: { services: [ [ [tlds…], [urls…] ], … ] } — parsed defensively. */
export function parseBootstrapServices(json: unknown): ServiceEntry[] {
  let services: unknown = null;
  if (json && typeof json === 'object' && Array.isArray((json as { services?: unknown }).services)) {
    services = (json as { services: unknown }).services;
  } else if (Array.isArray(json)) {
    services = json;
  }
  if (!Array.isArray(services)) return [];

  const entries: ServiceEntry[] = [];
  for (const entry of services) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const tldList: unknown = entry[0];
    const urlList: unknown = entry[1];
    if (!Array.isArray(tldList) || !Array.isArray(urlList)) continue;
    const tlds = tldList.filter((x): x is string => typeof x === 'string' && x.length > 0);
    const urls = urlList.filter(
      (x): x is string => typeof x === 'string' && x.startsWith('https://'),
    );
    if (tlds.length > 0 && urls.length > 0) entries.push({ tlds, urls });
  }
  return entries;
}

export function mergeWithCurated(curated: TldRegistry, bootstrapJson: unknown): TldRegistry {
  const result: TldRegistry = {
    infras: { ...curated.infras },
    tlds: [...curated.tlds],
    hackTlds: [...curated.hackTlds],
  };
  const curatedTlds = new Set(curated.tlds.map((t) => t.tld));
  const byBase = new Map<string, string[]>();
  for (const service of parseBootstrapServices(bootstrapJson)) {
    const base = service.urls[0];
    if (!base) continue;
    for (const tld of service.tlds) {
      if (curatedTlds.has(tld)) continue;
      const list = byBase.get(base) ?? [];
      list.push(tld);
      byBase.set(base, list);
    }
  }
  let index = 0;
  for (const [rdapBase, tlds] of byBase) {
    const infraId = `bootstrap-${index++}`;
    const infra: InfraConfig = {
      id: infraId,
      rdapBase,
      minPauseMs: 400,
      maxParallel: 2,
      trust: 'high',
    };
    result.infras[infraId] = infra;
    for (const tld of tlds) {
      const config: TldConfig = {
        tld,
        infra: infraId,
        trust: tld.length === 2 ? 'low' : 'high',
      };
      result.tlds.push(config);
    }
  }
  return result;
}
