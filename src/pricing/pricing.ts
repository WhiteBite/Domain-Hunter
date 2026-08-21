/**
 * Pricing module — live fetch (Porkbun + cfdomainpricing) with localStorage
 * TTL cache and bundled snapshot fallback (SPEC §9). Export signatures are
 * FROZEN — UI code already consumes them. The pure helpers normalizePorkbun
 * and normalizeCloudflare are exported for test and harvest-script parity.
 */
import snapshot from '../config/pricing.snapshot.json';
import wholesale from '../config/wholesale.json';
import type { Coupon, PriceEntry, PricingTable, Settings } from '../types';
import type { PricingState } from '../ui/store';

// The snapshot stores registrar prices as compact [reg, renew, transfer]
// arrays (~3× smaller on disk/bundle); expand back to PriceEntry objects here.
type CompactReg = [number | null, number | null, number | null];
interface CompactSnapshot {
  generatedAt: string;
  sources: string[];
  tlds: Record<string, Record<string, CompactReg>>;
  coupons: PricingTable['coupons'];
}
const rawSnap = snapshot as unknown as CompactSnapshot;
const SNAPSHOT: PricingTable = {
  generatedAt: rawSnap.generatedAt,
  sources: rawSnap.sources,
  coupons: rawSnap.coupons,
  tlds: Object.fromEntries(
    Object.entries(rawSnap.tlds).map(([tld, regs]) => [
      tld,
      Object.fromEntries(
        Object.entries(regs).map(([rid, [reg, renew, transfer]]) => [
          rid,
          { reg, renew, transfer } satisfies PriceEntry,
        ]),
      ),
    ]),
  ),
};
const FLOORS = (wholesale as { floors: Record<string, number> }).floors;

const PRICING_KEY = 'dh:v1:pricing';
const FRESH_MS = 12 * 60 * 60 * 1000; // 12h
// Porkbun's full pricing dump is slow (12-18s observed from some networks);
// loadPricing runs idle after first paint and is cache-first, so a longer
// window trades negligible readiness delay for not dropping the main source.
const FETCH_TIMEOUT_MS = 20_000;

// ---- Normalization (pure, exported for tests + harvest script parity) ----

interface NormalizedPricing {
  tlds: Record<string, Record<string, PriceEntry>>;
  coupons: Record<string, Coupon[]>;
}

/** Decimal string or number → integer USD cents. null/invalid → null. */
function toCents(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Normalize Porkbun pricing response (the inner `pricing` object:
 * tld → { registration, renewal, transfer, coupons? }).
 * Decimal strings → integer USD cents. Coupons: amount dollars→cents,
 * percentage kept as whole percent.
 */
export function normalizePorkbun(json: Record<string, unknown>): NormalizedPricing {
  const tlds: Record<string, Record<string, PriceEntry>> = {};
  const coupons: Record<string, Coupon[]> = {};

  for (const [tld, raw] of Object.entries(json)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const reg = toCents(entry.registration);
    const renew = toCents(entry.renewal);
    const transfer = toCents(entry.transfer);
    tlds[tld] = { porkbun: { reg, renew, transfer } };

    const rawCoupons = entry.coupons;
    if (Array.isArray(rawCoupons)) {
      const parsed: Coupon[] = [];
      for (const c of rawCoupons) {
        if (!c || typeof c !== 'object') continue;
        const cc = c as Record<string, unknown>;
        const code = typeof cc.code === 'string' ? cc.code : null;
        if (!code) continue;
        const firstYearOnly =
          cc.first_year_only === 'true' || cc.first_year_only === true;
        const type: Coupon['type'] = cc.type === 'percentage' ? 'percentage' : 'amount';
        const amount =
          type === 'amount'
            ? toCents(cc.amount) ?? 0
            : Math.round(Number(cc.amount) || 0);
        parsed.push({ code, firstYearOnly, type, amount });
      }
      if (parsed.length > 0) coupons[tld] = parsed;
    }
  }

  return { tlds, coupons };
}

/**
 * Normalize cfdomainpricing response (tld → { registration, renewal }).
 * Numbers → integer USD cents. No coupons from this source.
 */
export function normalizeCloudflare(json: Record<string, unknown>): NormalizedPricing {
  const tlds: Record<string, Record<string, PriceEntry>> = {};
  for (const [tld, raw] of Object.entries(json)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const reg = toCents(entry.registration);
    const renew = toCents(entry.renewal);
    tlds[tld] = { cloudflare: { reg, renew, transfer: null } };
  }
  return { tlds, coupons: {} };
}

function mergePricing(target: NormalizedPricing, src: NormalizedPricing): void {
  for (const [tld, registrars] of Object.entries(src.tlds)) {
    let bucket = target.tlds[tld];
    if (!bucket) {
      bucket = {};
      target.tlds[tld] = bucket;
    }
    Object.assign(bucket, registrars);
  }
  for (const [tld, coupons] of Object.entries(src.coupons)) {
    let bucket = target.coupons[tld];
    if (!bucket) {
      bucket = [];
      target.coupons[tld] = bucket;
    }
    bucket.push(...coupons);
  }
}

// ---- Cache (localStorage with try/catch — unavailable in some envs) ----

interface CachedPricing {
  table: PricingTable;
  fetchedAt: number;
}

function readCache(): CachedPricing | null {
  try {
    const raw = localStorage.getItem(PRICING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPricing>;
    if (!parsed?.table || typeof parsed.fetchedAt !== 'number') return null;
    return { table: parsed.table, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeCache(data: CachedPricing): void {
  try {
    localStorage.setItem(PRICING_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — non-fatal, live data still returned
  }
}

// ---- Live fetch ----

async function fetchPorkbun(
  fetchImpl: typeof fetch,
): Promise<NormalizedPricing> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl('https://api.porkbun.com/api/json/v3/pricing/get', {
      method: 'POST',
      // NOTE: no Content-Type header on purpose. A JSON content type triggers a
      // CORS preflight that Porkbun does not answer for null origins (file://).
      // As a simple request the POST goes through with Access-Control-Allow-Origin: *.
      body: '{}',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`porkbun ${res.status}`);
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== 'object') throw new Error('porkbun bad response');
    const pricing = (json as { pricing?: unknown }).pricing;
    if (!pricing || typeof pricing !== 'object') throw new Error('porkbun no pricing field');
    return normalizePorkbun(pricing as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCloudflare(
  fetchImpl: typeof fetch,
): Promise<NormalizedPricing> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl('https://cfdomainpricing.com/prices.json', {
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`cloudflare ${res.status}`);
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== 'object') throw new Error('cloudflare bad response');
    return normalizeCloudflare(json as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

// ---- Public API ----

/**
 * Load pricing: cache-first (12h TTL), then live fetch from Porkbun +
 * cfdomainpricing in parallel (Promise.allSettled, 10s timeouts). All
 * sources fail → bundled snapshot fallback (sources: ['snapshot']).
 * `force` bypasses cache; `fetchImpl` injects a fetch for testability.
 */
export async function loadPricing(
  opts: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<PricingState> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  // Cache-first (unless force)
  if (!opts.force) {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < FRESH_MS) {
      return { table: cached.table, fetchedAt: cached.fetchedAt, fromCache: true };
    }
  }

  // Live fetch — both sources in parallel, each may fail independently
  const [porkbunRes, cfRes] = await Promise.allSettled([
    fetchImpl ? fetchPorkbun(fetchImpl) : Promise.reject(new Error('no fetch')),
    fetchImpl ? fetchCloudflare(fetchImpl) : Promise.reject(new Error('no fetch')),
  ]);

  const sources: string[] = [];
  const merged: NormalizedPricing = { tlds: {}, coupons: {} };

  // Bundled snapshot as offline baseline; live sources overlay it so prices
  // are never empty even when a live source fails or is slow.
  mergePricing(merged, { tlds: SNAPSHOT.tlds, coupons: SNAPSHOT.coupons });

  if (porkbunRes.status === 'fulfilled') {
    sources.push('porkbun');
    mergePricing(merged, porkbunRes.value);
  }
  if (cfRes.status === 'fulfilled') {
    sources.push('cloudflare');
    mergePricing(merged, cfRes.value);
  }

  // All live sources failed → snapshot only.
  if (sources.length === 0) {
    sources.push('snapshot');
  }

  const table: PricingTable = {
    generatedAt: new Date().toISOString(),
    sources,
    tlds: merged.tlds,
    coupons: merged.coupons,
  };

  const fetchedAt = Date.now();
  // Snapshot-only fallback (all live sources failed): do NOT cache, so the
  // next load retries live sources instead of serving the snapshot for 12h.
  // Live-augmented tables (any live source succeeded) are cached normally.
  const isSnapshotOnly = sources.length === 1 && sources[0] === 'snapshot';
  if (!isSnapshotOnly) {
    writeCache({ table, fetchedAt });
  }

  return { table, fetchedAt, fromCache: false };
}

// ---- Pure helpers (unchanged — UI already consumes these) ----

/** Cheapest registrar entry for a TLD by registration price (renewal as tie-breaker). */
export function bestEntry(
  table: PricingTable,
  tld: string,
): { registrarId: string; entry: PriceEntry } | null {
  const entries = table.tlds[tld];
  if (!entries) return null;
  let best: { registrarId: string; entry: PriceEntry } | null = null;
  for (const [registrarId, entry] of Object.entries(entries)) {
    if (entry.reg == null) continue;
    if (
      !best ||
      entry.reg < (best.entry.reg ?? Infinity) ||
      (entry.reg === best.entry.reg &&
        (entry.renew ?? Infinity) < (best.entry.renew ?? Infinity))
    ) {
      best = { registrarId, entry };
    }
  }
  return best;
}

/** 3-year total cost of ownership, USD cents: min over registrars of (reg + 2×renew).
 *  Per SPEC §9 this is the true minimum across all registrars with both prices,
 *  not the TCO at the reg-cheapest registrar (which can be higher). */
export function tco3(table: PricingTable, tld: string): number | null {
  const entries = table.tlds[tld];
  if (!entries) return null;
  let min: number | null = null;
  for (const entry of Object.values(entries)) {
    if (entry.reg == null || entry.renew == null) continue;
    const tco = entry.reg + 2 * entry.renew;
    if (min == null || tco < min) min = tco;
  }
  return min;
}

export function priceTier(centsUsd: number): 'cheap' | 'mid' | 'high' {
  if (centsUsd <= 500) return 'cheap';
  if (centsUsd <= 1500) return 'mid';
  return 'high';
}

export function isBelowFloor(tld: string, centsUsd: number): boolean {
  const floor = FLOORS[tld];
  return floor != null && centsUsd < floor;
}

/** Renewal at least 5× the first-year price. */
export function isPromoTrap(entry: PriceEntry): boolean {
  return entry.reg != null && entry.reg > 0 && entry.renew != null && entry.renew >= 5 * entry.reg;
}

/** Discount (USD cents) a coupon applies against a first-year registration price.
 *  'amount': the coupon face value in cents, capped at the reg price so a coupon
 *  can never pay the user to register. 'percentage': whole percent of reg,
 *  rounded to the nearest cent. */
export function couponDiscountCents(coupon: Coupon, regCents: number): number {
  if (coupon.type === 'amount') return Math.min(coupon.amount, regCents);
  return Math.round((regCents * coupon.amount) / 100);
}

/** Best coupon for a TLD: the one that maximizes the first-year discount against
 *  the cheapest registrar's reg price. Falls back to coupons[0] when no reg
 *  price is known (cannot rank by discount). Ties keep the first encountered. */
export function bestCoupon(table: PricingTable, tld: string): Coupon | null {
  const coupons = table.coupons[tld];
  if (!coupons || coupons.length === 0) return null;
  const reg = bestEntry(table, tld)?.entry.reg;
  if (reg == null) return coupons[0] ?? null;
  let best: Coupon | null = null;
  let bestDiscount = -1;
  for (const c of coupons) {
    const discount = couponDiscountCents(c, reg);
    if (best == null || discount > bestDiscount) {
      best = c;
      bestDiscount = discount;
    }
  }
  return best;
}

/**
 * Registrar IDs present in the merged table, ordered by coverage (number of
 * zones with a non-null reg price) descending, capped at maxColumns.
 * Used by the Prices tab to pick which registrar columns to display.
 */
export function matrixColumns(table: PricingTable, maxColumns = 6): string[] {
  const coverage = new Map<string, number>();
  for (const regs of Object.values(table.tlds)) {
    for (const [rid, entry] of Object.entries(regs)) {
      if (entry.reg != null) {
        coverage.set(rid, (coverage.get(rid) ?? 0) + 1);
      }
    }
  }
  return [...coverage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColumns)
    .map(([rid]) => rid);
}

const CURRENCY_SYMBOL: Record<Settings['currency'], string> = {
  USD: '$',
  RUB: '₽',
  EUR: '€',
};

/** USD cents → display string in the user's currency. null → '—'.
 *  Finite values always render with two decimals ($0.50, $20.00, $82.70)
 *  and keep the locale thousands separator. */
export function formatPrice(centsUsd: number | null, settings: Settings, locale = 'en'): string {
  if (centsUsd == null) return '—';
  const usd = centsUsd / 100;
  let value = usd;
  if (settings.currency === 'RUB') value = usd * settings.rates.RUB;
  else if (settings.currency === 'EUR') value = usd * settings.rates.EUR;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${CURRENCY_SYMBOL[settings.currency]}${formatted}`;
}

export function freshnessLabel(
  state: PricingState,
  now = Date.now(),
): { key: string; params?: Record<string, string | number> } {
  if (state.table.sources.includes('snapshot') && state.table.sources.length === 1) {
    const date = new Date(state.table.generatedAt).toLocaleDateString();
    return { key: 'price.fresh.snapshot', params: { date } };
  }
  const ageHours = Math.floor((now - state.fetchedAt) / 3_600_000);
  if (ageHours < 1) return { key: 'price.fresh.now' };
  return { key: 'price.fresh.hours', params: { n: ageHours } };
}
