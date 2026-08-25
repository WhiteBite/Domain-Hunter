/**
 * Fresh-snapshot data layer for the CLI.
 *
 * The browser app ships `src/config/tlds.json` and `src/config/pricing.snapshot.json`
 * as bundled baselines. The CLI additionally fetches fresh copies of both from
 * the project's GitHub raw URL (24h TTL, cached in the shimmed localStorage),
 * falling back silently to the bundled copies on any failure. Live pricing
 * (Porkbun + cfdomainpricing) is then layered on top via `loadPricing`.
 *
 * Network destinations stay within the project allowlist plus the approved
 * raw.githubusercontent.com snapshot source.
 */
import tldsJson from '../src/config/tlds.json';
import { fetchBootstrap, mergeWithCurated } from '../src/core/bootstrap';
import { loadPricing } from '../src/pricing/pricing';
import type {
  Coupon,
  PriceEntry,
  PricingTable,
  TldRegistry,
} from '../src/types';
import type { CliCurrency, CliRates } from './contract';

const TLDS_URL =
  'https://raw.githubusercontent.com/WhiteBite/Domain-Hunter/main/src/config/tlds.json';
const PRICING_SNAPSHOT_URL =
  'https://raw.githubusercontent.com/WhiteBite/Domain-Hunter/main/src/config/pricing.snapshot.json';
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const TLDS_CACHE_KEY = 'dh:cli:tlds';
const PRICING_SNAPSHOT_CACHE_KEY = 'dh:cli:pricing-snapshot';

// ---- PricingState (local mirror of src/ui/store.PricingState) ----

export interface CliPricingState {
  table: PricingTable;
  fetchedAt: number;
  fromCache: boolean;
}

// ---- Raw TTL cache helpers (use the shimmed global localStorage) ----

interface RawCache {
  json: unknown;
  fetchedAt: number;
}

function readRawCache(key: string): RawCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RawCache>;
    if (parsed && typeof parsed.fetchedAt === 'number') {
      return { json: parsed.json, fetchedAt: parsed.fetchedAt };
    }
    return null;
  } catch {
    return null;
  }
}

function writeRawCache(key: string, json: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ json, fetchedAt: Date.now() }));
  } catch {
    // storage full or unavailable — non-fatal
  }
}

// ---- fetch with timeout ----

async function fetchJsonWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- Registry ----

function isValidRegistryShape(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const obj = json as Record<string, unknown>;
  return (
    'infras' in obj &&
    typeof obj.infras === 'object' &&
    obj.infras !== null &&
    'tlds' in obj &&
    Array.isArray(obj.tlds)
  );
}

/**
 * Load the TLD registry: fresh from GitHub raw (24h TTL cache) with silent
 * fallback to the bundled `src/config/tlds.json`. Then ALWAYS attempt the
 * IANA bootstrap merge (self-cached 24h in localStorage by bootstrap.ts);
 * bootstrap failure is non-fatal and reported via `bootstrapMerged`.
 */
export async function loadRegistry(opts: {
  fetchImpl?: typeof fetch;
  offline?: boolean;
}): Promise<{
  registry: TldRegistry;
  source: 'bundled' | 'fresh';
  bootstrapMerged: boolean;
}> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  let json: unknown = tldsJson;
  let source: 'bundled' | 'fresh' = 'bundled';

  if (!opts.offline && fetchImpl != null) {
    const cached = readRawCache(TLDS_CACHE_KEY);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      if (isValidRegistryShape(cached.json)) {
        json = cached.json;
        source = 'fresh';
      }
    } else {
      try {
        const fetched = await fetchJsonWithTimeout(TLDS_URL, fetchImpl);
        if (isValidRegistryShape(fetched)) {
          json = fetched;
          source = 'fresh';
          writeRawCache(TLDS_CACHE_KEY, fetched);
        }
      } catch {
        // fall back silently to bundled
      }
    }
  }

  const registry = json as unknown as TldRegistry;

  // Bootstrap merge — extends the curated registry with IANA-discovered gTLDs.
  let result: TldRegistry = registry;
  let bootstrapMerged = false;
  if (!opts.offline && fetchImpl != null) {
    try {
      const bootstrapJson = await fetchBootstrap(fetchImpl);
      if (bootstrapJson) {
        result = mergeWithCurated(registry, bootstrapJson);
        bootstrapMerged = true;
      }
    } catch {
      // non-fatal — curated registry is still usable
    }
  }

  return { registry: result, source, bootstrapMerged };
}

// ---- Pricing snapshot expansion ----

type CompactReg = [number | null, number | null, number | null];

interface CompactSnapshot {
  generatedAt: string;
  sources: string[];
  tlds: Record<string, Record<string, CompactReg>>;
  coupons: Record<string, Coupon[]>;
}

/**
 * Expand the compact [reg, renew, transfer] array form (used on disk/bundle
 * to save ~3× space) back into full PriceEntry objects — exactly like
 * src/pricing/pricing.ts does for the bundled snapshot.
 */
function expandCompactSnapshot(json: unknown): PricingTable | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as CompactSnapshot;
  if (
    typeof raw.generatedAt !== 'string' ||
    !Array.isArray(raw.sources) ||
    typeof raw.tlds !== 'object' ||
    raw.tlds === null
  ) {
    return null;
  }
  const tlds: Record<string, Record<string, PriceEntry>> = {};
  for (const [tld, regs] of Object.entries(raw.tlds)) {
    if (!regs || typeof regs !== 'object') continue;
    const bucket: Record<string, PriceEntry> = {};
    for (const [rid, compact] of Object.entries(regs)) {
      if (!Array.isArray(compact)) continue;
      const reg = compact[0] ?? null;
      const renew = compact[1] ?? null;
      const transfer = compact[2] ?? null;
      bucket[rid] = { reg, renew, transfer };
    }
    tlds[tld] = bucket;
  }
  return {
    generatedAt: raw.generatedAt,
    sources: raw.sources,
    coupons: raw.coupons ?? {},
    tlds,
  };
}

/**
 * Load the pricing table: fresh snapshot from GitHub raw (24h TTL cache),
 * expanded and passed as `snapshotOverride` into `loadPricing`, which then
 * layers live Porkbun + cfdomainpricing on top. Fresh-snapshot fetch failure
 * is silent — `loadPricing` falls back to its own bundled snapshot.
 */
export async function loadPricingTable(opts: {
  fetchImpl?: typeof fetch;
  force?: boolean;
  currency: CliCurrency;
  rates: CliRates;
}): Promise<CliPricingState> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  let snapshotOverride: PricingTable | undefined;

  if (fetchImpl != null) {
    const cached = readRawCache(PRICING_SNAPSHOT_CACHE_KEY);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      const expanded = expandCompactSnapshot(cached.json);
      if (expanded) snapshotOverride = expanded;
    } else {
      try {
        const fetched = await fetchJsonWithTimeout(PRICING_SNAPSHOT_URL, fetchImpl);
        const expanded = expandCompactSnapshot(fetched);
        if (expanded) {
          snapshotOverride = expanded;
          writeRawCache(PRICING_SNAPSHOT_CACHE_KEY, fetched);
        }
      } catch {
        // silent — bundled snapshot fallback inside loadPricing
      }
    }
  }

  return loadPricing({
    fetchImpl,
    force: opts.force,
    snapshotOverride,
  });
}
