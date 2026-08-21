/**
 * Harvest live pricing from Porkbun + cfdomainpricing (API sources) and
 * best-effort HTML scrapers (reg.ru, beget, dynadot, spaceship) and write
 * the result to src/config/pricing.snapshot.json as the offline baseline.
 *
 * --api-only: run only API sources (porkbun, cloudflare); skip scrapers.
 * Without flag: runs API + scrapers.
 *
 * Normalization logic is reimplemented inline (no TS imports) to match
 * src/pricing/pricing.ts exactly. Exit 0 on partial failure; exit 1 only
 * if ALL sources fail.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchWithTimeout, UA, writeJson, readJson } from './lib/http.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, '..', 'src', 'config', 'pricing.snapshot.json');
// Porkbun's full pricing dump is slow (12-18s observed); the harvest runs in
// CI with no UX constraint, so give sources room instead of dropping coverage.
const FETCH_TIMEOUT_MS = 30_000;
const REGRU_RUB_TO_USD = 97; // fallback: 97 RUB = 1 USD
const BEGET_EUR_TO_USD = 1.08; // fallback: 1 EUR = 1.08 USD
let regruRubToUsd = REGRU_RUB_TO_USD;
let begetEurToUsd = BEGET_EUR_TO_USD;

const apiOnly = process.argv.includes('--api-only');

// ---- Normalization (mirrors src/pricing/pricing.ts) ----

export function toCents(value) {
  if (value == null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function normalizePorkbun(json) {
  const tlds = {};
  const coupons = {};
  for (const [tld, raw] of Object.entries(json)) {
    if (!raw || typeof raw !== 'object') continue;
    const reg = toCents(raw.registration);
    const renew = toCents(raw.renewal);
    const transfer = toCents(raw.transfer);
    tlds[tld] = { porkbun: { reg, renew, transfer } };
    if (Array.isArray(raw.coupons)) {
      const parsed = [];
      for (const c of raw.coupons) {
        if (!c || typeof c !== 'object') continue;
        const code = typeof c.code === 'string' ? c.code : null;
        if (!code) continue;
        const firstYearOnly = c.first_year_only === 'true' || c.first_year_only === true;
        const type = c.type === 'percentage' ? 'percentage' : 'amount';
        const amount = type === 'amount' ? (toCents(c.amount) ?? 0) : Math.round(Number(c.amount) || 0);
        parsed.push({ code, firstYearOnly, type, amount });
      }
      if (parsed.length > 0) coupons[tld] = parsed;
    }
  }
  return { tlds, coupons };
}

function normalizeCloudflare(json) {
  const tlds = {};
  for (const [tld, raw] of Object.entries(json)) {
    if (!raw || typeof raw !== 'object') continue;
    const reg = toCents(raw.registration);
    const renew = toCents(raw.renewal);
    tlds[tld] = { cloudflare: { reg, renew, transfer: null } };
  }
  return { tlds, coupons: {} };
}

export function mergePricing(target, src) {
  for (const [tld, registrars] of Object.entries(src.tlds)) {
    if (!target.tlds[tld]) target.tlds[tld] = {};
    Object.assign(target.tlds[tld], registrars);
  }
  for (const [tld, coupons] of Object.entries(src.coupons)) {
    if (!target.coupons[tld]) target.coupons[tld] = [];
    target.coupons[tld].push(...coupons);
  }
}

// ---- Snapshot carry-over (prevents flaky sources from erasing coverage) ----

/**
 * Expand the compact on-disk snapshot format
 * (tld -> registrarId -> [reg, renew, transfer]) back to the normalized
 * { tlds, coupons } shape with PriceEntry objects.
 * Mirrors src/pricing/pricing.ts:14-37 exactly.
 */
export function expandCompactSnapshot(raw) {
  const tlds = {};
  for (const [tld, regs] of Object.entries(raw?.tlds ?? {})) {
    if (!regs || typeof regs !== 'object') continue;
    const bucket = {};
    for (const [rid, arr] of Object.entries(regs)) {
      if (!Array.isArray(arr)) continue;
      const [reg, renew, transfer] = arr;
      bucket[rid] = { reg: reg ?? null, renew: renew ?? null, transfer: transfer ?? null };
    }
    if (Object.keys(bucket).length > 0) tlds[tld] = bucket;
  }
  const coupons = {};
  for (const [tld, list] of Object.entries(raw?.coupons ?? {})) {
    if (Array.isArray(list)) coupons[tld] = list;
  }
  return { tlds, coupons };
}

/**
 * Read and expand the previous snapshot file. Returns null on missing or
 * corrupt file so a flaky read never crashes the harvest.
 */
export async function readPrevious(path) {
  try {
    return expandCompactSnapshot(await readJson(path));
  } catch {
    return null;
  }
}

/**
 * Deduplicate coupon codes per TLD. When the same code appears in both
 * carried-over (previous) and fresh entries, the FRESH entry wins.
 * mergePricing pushes previous coupons first, then fresh ones later, so
 * iterating in array order and letting later entries overwrite earlier
 * ones in a Map gives fresh-wins semantics.
 */
export function dedupeCoupons(coupons) {
  const result = {};
  for (const [tld, list] of Object.entries(coupons)) {
    if (!Array.isArray(list)) continue;
    const byCode = new Map();
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const code = c.code;
      if (typeof code !== 'string') continue;
      byCode.set(code, c);
    }
    if (byCode.size > 0) result[tld] = [...byCode.values()];
  }
  return result;
}

// ---- FX rates ----

/**
 * Fetch live USD→RUB and USD→EUR rates from open.er-api.com (no key, 5s
 * timeout). On ANY failure, fall back to the hardcoded constants and warn.
 * Returns { regruRubToUsd, begetEurToUsd }.
 */
async function fetchFxRates() {
  try {
    const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', { timeoutMs: 5_000 });
    if (!res.ok) throw new Error(`er-api HTTP ${res.status}`);
    const json = await res.json();
    const rub = json?.rates?.RUB;
    const eur = json?.rates?.EUR;
    if (typeof rub !== 'number' || !Number.isFinite(rub) || rub <= 0) throw new Error('er-api: invalid RUB rate');
    if (typeof eur !== 'number' || !Number.isFinite(eur) || eur <= 0) throw new Error('er-api: invalid EUR rate');
    return { regruRubToUsd: rub, begetEurToUsd: 1 / eur };
  } catch (err) {
    console.warn(
      `FX rates: using fallback constants (${REGRU_RUB_TO_USD} RUB/USD, ${BEGET_EUR_TO_USD} USD/EUR) — ${err.message}`,
    );
    return { regruRubToUsd: REGRU_RUB_TO_USD, begetEurToUsd: BEGET_EUR_TO_USD };
  }
}

// ---- Fetch ----

async function fetchPorkbun() {
  const res = await fetchWithTimeout('https://api.porkbun.com/api/json/v3/pricing/get', {
    timeoutMs: FETCH_TIMEOUT_MS,
    method: 'POST',
    // NOTE: no Content-Type header on purpose — mirrors src/pricing/pricing.ts
    // (a JSON content type measurably slows Porkbun's response).
    body: '{}',
  });
  if (!res.ok) throw new Error(`porkbun ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== 'object' || !json.pricing) throw new Error('porkbun bad response');
  return normalizePorkbun(json.pricing);
}

async function fetchCloudflare() {
  const res = await fetchWithTimeout('https://cfdomainpricing.com/prices.json', { timeoutMs: FETCH_TIMEOUT_MS });
  if (!res.ok) throw new Error(`cloudflare ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== 'object') throw new Error('cloudflare bad response');
  return normalizeCloudflare(json);
}

// ---- Best-effort HTML scrapers ----

/**
 * reg.ru: parse __NUXT_DATA__ flat array, find popularTlds/discountTlds,
 * resolve tld/price/oldPrice references. Prices in RUB -> USD at fixed rate.
 */
export function normalizeRegru(html) {
  const m = html.match(/id="__NUXT_DATA__">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('regru: __NUXT_DATA__ not found');
  const arr = JSON.parse(m[1]);

  let tldData = null;
  for (const el of arr) {
    if (el && typeof el === 'object' && !Array.isArray(el) && ('popularTlds' in el || 'discountTlds' in el)) {
      tldData = el;
      break;
    }
  }
  if (!tldData) throw new Error('regru: tld data not found');

  const tlds = {};
  for (const key of ['popularTlds', 'discountTlds']) {
    const refs = tldData[key];
    if (typeof refs !== 'number') continue;
    const entryList = arr[refs];
    if (!Array.isArray(entryList)) continue;
    for (const idx of entryList) {
      const entry = arr[idx];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const tld = arr[entry.tld];
      const price = arr[entry.price];
      const oldPrice = arr[entry.oldPrice];
      if (typeof tld !== 'string' || typeof price !== 'number') continue;
      if (!tlds[tld]) {
        tlds[tld] = {
          regru: {
            reg: toCents(price / regruRubToUsd),
            renew: toCents(oldPrice / regruRubToUsd),
            transfer: null,
          },
        };
      }
    }
  }

  if (Object.keys(tlds).length < 20) throw new Error(`regru: only ${Object.keys(tlds).length} TLDs parsed`);
  return { tlds, coupons: {} };
}

/**
 * beget: parse data-row-uid entries with Register/Renewal prices in EUR.
 */
export function normalizeBeget(html) {
  const tlds = {};
  const parts = html.split('data-row-uid="');
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const tldM = part.match(/^([^"]+)"/);
    const regM = part.match(/Register<\/p>\s*<p[^>]*>(\d+)\s*€/);
    const renM = part.match(/Renewal<\/p>\s*<p[^>]*>(\d+)\s*€/);
    if (tldM && regM && renM) {
      const tld = tldM[1];
      const reg = parseInt(regM[1], 10);
      const renew = parseInt(renM[1], 10);
      if (!tlds[tld]) {
        tlds[tld] = {
          beget: {
            reg: toCents(reg * begetEurToUsd),
            renew: toCents(renew * begetEurToUsd),
            transfer: null,
          },
        };
      }
    }
  }
  if (Object.keys(tlds).length < 20) throw new Error(`beget: only ${Object.keys(tlds).length} TLDs parsed`);
  return { tlds, coupons: {} };
}

/**
 * dynadot: parse __NUXT_DATA__ flat array, find objects with reg_price/renew_price,
 * resolve name/reg_price/renew_price references. Prices already in USD ($X.XX).
 */
export function normalizeDynadotHtml(html) {
  const m = html.match(/id="__NUXT_DATA__">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('dynadot: __NUXT_DATA__ not found');
  const arr = JSON.parse(m[1]);

  const tlds = {};
  for (const el of arr) {
    if (el && typeof el === 'object' && !Array.isArray(el) && 'reg_price' in el && 'renew_price' in el) {
      const name = arr[el.name];
      const reg = arr[el.reg_price];
      const renew = arr[el.renew_price];
      if (typeof name !== 'string' || reg == null || renew == null) continue;
      const regNum = parseFloat(String(reg).replace(/[$,]/g, ''));
      const renewNum = parseFloat(String(renew).replace(/[$,]/g, ''));
      if (!Number.isFinite(regNum) || !Number.isFinite(renewNum)) continue;
      if (!tlds[name]) {
        tlds[name] = {
          dynadot: { reg: toCents(regNum), renew: toCents(renewNum), transfer: null },
        };
      }
    }
  }
  if (Object.keys(tlds).length < 20) throw new Error(`dynadot: only ${Object.keys(tlds).length} TLDs parsed`);
  return { tlds, coupons: {} };
}

/**
 * spaceship: parse dpp-pricing-tld-item entries from rendered HTML.
 * TLD in <a> tag, reg price in Register column, renew price in Renew column.
 * Prices already in USD ($X.XX). Page is a SPA — raw fetch may yield 0 entries.
 */
export function normalizeSpaceship(html) {
  const tlds = {};
  const re =
    /dpp-pricing-tld-item__tld[\s\S]*?<a[^>]*>(\.[^<]+)<\/a>[\s\S]*?column-title">Register[\s\S]*?product-price--none[^>]*>\$(\d+\.?\d*)[\s\S]*?column-title">Renew[\s\S]*?product-price--none[^>]*>\$(\d+\.?\d*)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tld = m[1].replace(/^\./, '');
    const reg = parseFloat(m[2]);
    const renew = parseFloat(m[3]);
    if (!tlds[tld]) {
      tlds[tld] = {
        spaceship: { reg: toCents(reg), renew: toCents(renew), transfer: null },
      };
    }
  }
  if (Object.keys(tlds).length < 20) throw new Error(`spaceship: only ${Object.keys(tlds).length} TLDs parsed`);
  return { tlds, coupons: {} };
}

// ---- Best-effort extra sources (multi-registrar coverage) ----

const KNOWN_REGS = ['spaceship', 'porkbun', 'cloudflare', 'valuedomain', 'dynadot'];

/** regctl.sh snapshot: tld -> { registrarId: number | {registration,renewal,...} } */
function normalizeRegctl(json) {
  const tlds = {};
  for (const [tld, raw] of Object.entries(json ?? {})) {
    if (!raw || typeof raw !== 'object') continue;
    const bucket = {};
    for (const [reg, val] of Object.entries(raw)) {
      if (!KNOWN_REGS.includes(reg)) continue;
      if (typeof val === 'number') {
        bucket[reg] = { reg: toCents(val), renew: toCents(val), transfer: null };
      } else if (val && typeof val === 'object') {
        bucket[reg] = {
          reg: toCents(val.registration ?? val.reg),
          renew: toCents(val.renewal ?? val.renew),
          transfer: toCents(val.transfer),
        };
      }
    }
    if (Object.keys(bucket).length > 0) tlds[tld] = bucket;
  }
  if (Object.keys(tlds).length === 0) throw new Error('regctl: nothing parsed');
  return { tlds, coupons: {} };
}

async function fetchRegru() {
  const res = await fetchWithTimeout('https://www.reg.ru/domain/new/prices/', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`regru ${res.status}`);
  return normalizeRegru(await res.text());
}

async function fetchBeget() {
  const res = await fetchWithTimeout('https://beget.com/en/domains/zone', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`beget ${res.status}`);
  return normalizeBeget(await res.text());
}

async function fetchDynadot() {
  const res = await fetchWithTimeout('https://www.dynadot.com/domain/prices', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`dynadot ${res.status}`);
  return normalizeDynadotHtml(await res.text());
}

async function fetchSpaceship() {
  const res = await fetchWithTimeout('https://www.spaceship.com/domains/', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`spaceship ${res.status}`);
  return normalizeSpaceship(await res.text());
}

async function fetchRegctl() {
  const res = await fetchWithTimeout('https://regctl.sh/prices.json', { timeoutMs: FETCH_TIMEOUT_MS });
  if (!res.ok) throw new Error(`regctl ${res.status}`);
  return normalizeRegctl(await res.json());
}

/** Porkbun's dump is slow (12-18s) and occasionally times out; one retry
 *  after a short pause markedly raises hourly-harvest success. */
async function fetchPorkbunWithRetry() {
  try {
    return await fetchPorkbun();
  } catch (err) {
    console.error(`porkbun first attempt failed: ${err?.message ?? err}; retrying once`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    return await fetchPorkbun();
  }
}

// ---- Main ----

async function main() {
  const fx = await fetchFxRates();
  regruRubToUsd = fx.regruRubToUsd;
  begetEurToUsd = fx.begetEurToUsd;

  const apiSources = [
    ['porkbun', fetchPorkbunWithRetry],
    ['cloudflare', fetchCloudflare],
  ];
  const scraperSources = [
    ['regru', fetchRegru],
    ['beget', fetchBeget],
    ['dynadot', fetchDynadot],
    ['spaceship', fetchSpaceship],
    ['regctl', fetchRegctl],
  ];
  const named = apiOnly ? apiSources : [...apiSources, ...scraperSources];

  // Carry-over: load the previous snapshot FIRST so a flaky source this run
  // does not erase TLD coverage from a prior successful harvest. Fresh
  // sources merge on top (Object.assign per registrar gives fresh-wins).
  const previous = await readPrevious(SNAPSHOT_PATH);
  const merged = previous ?? { tlds: {}, coupons: {} };
  const carriedTldCount = previous ? Object.keys(previous.tlds).length : 0;
  let carriedRegistrarCount = 0;
  if (previous) {
    for (const regs of Object.values(previous.tlds)) {
      carriedRegistrarCount += Object.keys(regs).length;
    }
  }

  const results = await Promise.allSettled(named.map(([, fn]) => fn()));
  const sources = [];

  results.forEach((result, i) => {
    const name = named[i][0];
    if (result.status === 'fulfilled') {
      sources.push(name);
      mergePricing(merged, result.value);
    } else {
      console.error(`${name} failed:`, result.reason?.message ?? result.reason);
    }
  });

  if (sources.length === 0) {
    console.error('ALL pricing sources failed');
    process.exit(1);
  }

  // Dedupe coupons: carried-over + fresh may have duplicate codes; fresh wins.
  merged.coupons = dedupeCoupons(merged.coupons);

  // Compact on-disk format: registrar prices as [reg, renew, transfer] arrays
  // (~3× smaller than objects); pricing.ts expands them back at load.
  const compactTlds = Object.fromEntries(
    Object.entries(merged.tlds).map(([tld, regs]) => [
      tld,
      Object.fromEntries(
        Object.entries(regs).map(([rid, e]) => [
          rid,
          [e.reg ?? null, e.renew ?? null, e.transfer ?? null],
        ]),
      ),
    ]),
  );

  // Snapshot file always carries sources: ['snapshot'] — it IS the baseline.
  const table = {
    generatedAt: new Date().toISOString(),
    sources: ['snapshot'],
    tlds: compactTlds,
    coupons: merged.coupons,
  };

  await writeJson(SNAPSHOT_PATH, table);

  const tldCount = Object.keys(merged.tlds).length;
  const couponCount = Object.keys(merged.coupons).length;
  const carryNote =
    carriedTldCount > 0
      ? ` (carried ${carriedTldCount} TLDs / ${carriedRegistrarCount} registrar entries from previous)`
      : '';
  console.log(
    `harvested ${tldCount} TLDs from ${sources.join(', ')}${carryNote}, ${couponCount} coupons -> ${SNAPSHOT_PATH}`,
  );
}

// Run main() only when executed directly, not when imported for testing.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error('harvest failed:', err);
    process.exit(1);
  });
}
