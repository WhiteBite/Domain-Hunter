/**
 * Harvest live pricing from Porkbun + cfdomainpricing (API sources) and
 * best-effort HTML scrapers (reg.ru, hostiman, beget, dynadot, spaceship) and write
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
import { fetchWithTimeout, fetchWithRetry, UA, writeJson, readJson } from './lib/http.mjs';
import { cleanLegacyPorkbun } from './lib/porkbun-legacy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, '..', 'src', 'config', 'pricing.snapshot.json');
// Porkbun's full pricing dump is slow (12-18s observed); the harvest runs in
// CI with no UX constraint, so give sources room instead of dropping coverage.
const FETCH_TIMEOUT_MS = 30_000;
const REGRU_RUB_TO_USD = 90; // fallback: 90 RUB = 1 USD (asOf Aug 2026)
const BEGET_EUR_TO_USD = 1.10; // fallback: 1 EUR = 1.10 USD (asOf Aug 2026)
let regruRubToUsd = REGRU_RUB_TO_USD;
let begetEurToUsd = BEGET_EUR_TO_USD;

const apiOnly = process.argv.includes('--api-only');

// ---- Normalization (mirrors src/pricing/pricing.ts) ----

export function toCents(value) {
  if (typeof value === 'string') {
    value = value.trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) return null;
    value = value.replace(/,/g, '');
  }
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function normalizePorkbun(json) {
  const tlds = {};
  const coupons = {};
  for (const [tld, raw] of Object.entries(json)) {
    if (!raw || typeof raw !== 'object') continue;
    const reg = toCents(raw.registration);
    const renew = toCents(raw.renewal);
    const transfer = toCents(raw.transfer);
    const unpriced = (tld === 'web' || tld === 'dot') && reg === 0 && renew === 0 && transfer === 0;
    tlds[tld] = { porkbun: unpriced ? { reg: null, renew: null, transfer: null } : { reg, renew, transfer } };
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

/** Replace one registrar's coverage after a successful scrape. */
export function replaceRegistrar(target, fresh, registrarId) {
  for (const [tld, bucket] of Object.entries(target.tlds)) {
    delete bucket[registrarId];
    if (Object.keys(bucket).length === 0) delete target.tlds[tld];
  }
  mergePricing(target, fresh);
}

/** Apply an independently successful source without redating stale zone prices. */
export function applySuccessfulSource(target, fresh, name) {
  if (name === 'regru' || name === 'hostiman' || name === 'timeweb' || name === 'sprinthost' || name === 'webhost1' || name === 'adminvps') replaceRegistrar(target, fresh, name);
  else mergePricing(target, fresh);
}

/** Per-source freshness survives failed and api-only harvests. */
export function sourceUpdatedAt(sources, previous, name, now = new Date().toISOString()) {
  return sources.includes(name) ? now : (typeof previous === 'string' ? previous : null);
}

/** Keep native-currency data in lockstep with the source subset. */
export function mergeSourceRub(previous, successful) {
  const result = { ...(previous ?? {}) };
  for (const [name, pricing] of Object.entries(successful)) {
    if (name !== 'hostiman' && name !== 'timeweb' && name !== 'sprinthost' && name !== 'webhost1' && name !== 'adminvps') continue;
    // Missing metadata on a successful refresh must not preserve old values.
    result[name] = pricing.sourceRub?.[name] ?? {};
  }
  for (const name of Object.keys(result)) {
    result[name] = Object.fromEntries(Object.entries(result[name]).sort(([, a], [, b]) =>
      (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0)));
  }
  return result;
}

/** Preserve seller-supplied promotion markers unless that source refreshes. */
export function mergeSourcePromotions(previous, successful) {
  const result = { ...(previous ?? {}) };
  for (const [name, pricing] of Object.entries(successful)) {
    if (name !== 'adminvps' && name !== 'webhost1') continue;
    result[name] = pricing.sourcePromotions?.[name] ?? [];
  }
  return result;
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
      const [reg, renew, transfer] = rid === 'porkbun'
        ? cleanLegacyPorkbun(tld, arr, raw?.porkbunFormatVersion)
        : arr;
      // Older REG.RU snapshots used oldPrice as renewal; its meaning is unverified.
      bucket[rid] = { reg: reg ?? null, renew: rid === 'regru' ? null : (renew ?? null), transfer: transfer ?? null };
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
    console.log('::warning::FX rates unavailable; using fallback RUB=' + REGRU_RUB_TO_USD + ' EUR=' + BEGET_EUR_TO_USD);
    console.warn(
      `FX rates: using fallback constants (${REGRU_RUB_TO_USD} RUB/USD, ${BEGET_EUR_TO_USD} USD/EUR) — ${err.message}`,
    );
    return { regruRubToUsd: REGRU_RUB_TO_USD, begetEurToUsd: BEGET_EUR_TO_USD };
  }
}

// ---- Fetch ----

async function fetchPorkbun() {
  const res = await fetchWithRetry('https://api.porkbun.com/api/json/v3/pricing/get', {
    timeoutMs: FETCH_TIMEOUT_MS,
    method: 'POST',
    // NOTE: no Content-Type header on purpose — mirrors src/pricing/pricing.ts
    // (a JSON content type measurably slows Porkbun's response).
    body: '{}',
  }, { retries: 2 });
  if (!res.ok) throw new Error(`porkbun ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== 'object' || !json.pricing) throw new Error('porkbun bad response');
  return normalizePorkbun(json.pricing);
}

async function fetchCloudflare() {
  const res = await fetchWithRetry('https://cfdomainpricing.com/prices.json', { timeoutMs: FETCH_TIMEOUT_MS }, { retries: 2 });
  if (!res.ok) throw new Error(`cloudflare ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== 'object') throw new Error('cloudflare bad response');
  return normalizeCloudflare(json);
}

// ---- Best-effort HTML scrapers ----

/**
 * reg.ru: parse __NUXT_DATA__ flat array, find popularTlds/discountTlds,
 * resolve tld/price references. Prices in RUB -> USD using the harvest FX rate.
 * oldPrice is not documented as a renewal price, so it must not be used as one.
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
      if (typeof tld !== 'string' || typeof price !== 'number' || !Number.isFinite(price) || price < 0) continue;
      if (!tlds[tld]) {
        tlds[tld] = {
          regru: {
            reg: toCents(price / regruRubToUsd),
            renew: null,
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

/**
 * Read the public Next.js Flight zone list as inert JSON (never execute scripts).
 * The site gives no per-zone term in this list. Only ru/рф have an explicit
 * first-year and annual-renewal price in the page FAQ; others, including ai,
 * are excluded until their price term is verified.
 */
export function normalizeTimeweb(html, rubToUsd = regruRubToUsd) {
  if (!Number.isFinite(rubToUsd) || rubToUsd <= 0) throw new Error('timeweb: invalid RUB/USD rate');
  const candidates = [];
  for (const match of html.matchAll(/<script\b[^>]*>\s*self\.__next_f\.push\(([\s\S]*?)\)\s*<\/script>/gi)) {
    let payload;
    try { payload = JSON.parse(match[1]); } catch { continue; }
    if (!Array.isArray(payload) || payload[0] !== 1 || typeof payload[1] !== 'string') continue;
    for (const line of payload[1].split('\n')) {
      const separator = line.indexOf(':');
      if (separator < 0 || line[separator + 1] !== '[') continue;
      let record;
      try { record = JSON.parse(line.slice(separator + 1)); } catch { continue; }
      if (Array.isArray(record) && record[0] === '$' && Array.isArray(record[3]?.zones)) candidates.push(record[3].zones);
    }
  }
  if (candidates.length !== 1) throw new Error(`timeweb: expected one zone list, found ${candidates.length}`);
  const zones = candidates[0];
  if (zones.length < 100) throw new Error(`timeweb: incomplete zone list (${zones.length})`);
  const tlds = {};
  const timewebRenewalFromRub = {};
  const nativePrices = {};
  for (const zone of zones) {
    if (!zone || typeof zone.name !== 'string') throw new Error('timeweb: invalid zone');
    const tld = zone.name.toLowerCase();
    if (tld !== 'ru' && tld !== 'рф') continue;
    if (tlds[tld]) throw new Error(`timeweb: duplicate zone ${tld}`);
    const reg = zone.prices?.register;
    const renew = zone.prices?.prolong;
    if (typeof reg !== 'number' || !Number.isFinite(reg) || reg <= 0 ||
        typeof renew !== 'number' || !Number.isFinite(renew) || renew <= 0) {
      throw new Error(`timeweb: invalid price for ${tld}`);
    }
    // Timeweb says renewal is "from" this amount. Do not feed a lower bound
    // into exact renewal comparisons or three-year TCO calculations.
    tlds[tld] = { timeweb: { reg: toCents(reg / rubToUsd), renew: null, transfer: null } };
    timewebRenewalFromRub[tld] = renew;
    nativePrices[tld] = [toCents(reg), null];
  }
  if (!tlds.ru || !tlds['рф']) throw new Error('timeweb: missing verified zones');
  return { tlds, coupons: {}, timewebRenewalFromRub, sourceRub: { timeweb: nativePrices } };
}

/** Normalize manually transcribed public annual quotes, not HTML or a fetcher. */
export function normalizeWebhost1Observed(rows, rubToUsd = regruRubToUsd) {
  if (!Number.isFinite(rubToUsd) || rubToUsd <= 0) throw new Error('webhost1: invalid RUB/USD rate');
  if (!Array.isArray(rows) || rows.length !== 2) throw new Error('webhost1: expected two reviewed quotes');
  const paths = { ru: 'https://webhost1.ru/domains/ru', 'рф': 'https://webhost1.ru/domains/rf' };
  const nativePrices = {};
  const tlds = {};
  for (const row of rows) {
    if (!row || typeof row.tld !== 'string' || !Object.hasOwn(paths, row.tld) ||
        row.source !== paths[row.tld] || tlds[row.tld] || row.registrationYears !== 1 || row.renewalYears !== 1) {
      throw new Error('webhost1: invalid or duplicate annual quote');
    }
    const cents = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
      const result = Math.round(value * 100);
      return Number.isSafeInteger(result) && Math.abs(result / 100 - value) < 1e-8 ? result : null;
    };
    const reg = cents(row.registrationRub);
    const renew = cents(row.renewalRub);
    if (reg === null || renew === null) throw new Error(`webhost1: invalid price for ${row.tld}`);
    nativePrices[row.tld] = [reg, renew];
    tlds[row.tld] = { webhost1: { reg: Math.round(reg / rubToUsd), renew: Math.round(renew / rubToUsd), transfer: null } };
  }
  if (!tlds.ru || !tlds['рф']) throw new Error('webhost1: missing reviewed quotes');
  return { tlds, coupons: {}, sourceRub: { webhost1: nativePrices } };
}

// These normalizers accept sanitized transcriptions from saved pages, not raw
// HTML or fetch results. Column semantics and account context require review.
const annualZonePattern = /^[a-zа-яё0-9-]+(?:\.[a-zа-яё0-9-]+)*$/u;
function annualRubCents(value, source) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${source}: invalid RUB price`);
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error(`${source}: invalid RUB price`);
  return cents;
}
function annualZone(row, seen, source) {
  if (!row || typeof row.tld !== 'string' || !annualZonePattern.test(row.tld) || seen.has(row.tld)) {
    throw new Error(`${source}: invalid or duplicate zone`);
  }
  seen.add(row.tld);
  return row.tld;
}

/** Normalize a sanitized annual AdminVPS cart table, preserving promo flags. */
export function normalizeAdminvpsAnnual(data, rubToUsd = regruRubToUsd) {
  if (!Number.isFinite(rubToUsd) || rubToUsd <= 0) throw new Error('adminvps: invalid RUB/USD rate');
  if (!data || JSON.stringify(data.headers) !== JSON.stringify(['Домен', 'Регистрация', 'Продление']) ||
      !Array.isArray(data.rows) || data.rows.length < 700) throw new Error('adminvps: missing annual price table');
  const seen = new Set();
  const tlds = {};
  const nativePrices = {};
  const promotions = [];
  for (const row of data.rows) {
    const zone = annualZone(row, seen, 'adminvps');
    if (row.registrationYears !== 1 || row.renewalYears !== 1 || typeof row.promotion !== 'boolean') {
      throw new Error('adminvps: nonannual or ambiguous quote');
    }
    const reg = annualRubCents(row.registrationRub, 'adminvps');
    const renew = annualRubCents(row.renewalRub, 'adminvps');
    tlds[zone] = { adminvps: { reg: Math.round(reg / rubToUsd), renew: Math.round(renew / rubToUsd), transfer: null } };
    nativePrices[zone] = [reg, renew];
    if (row.promotion) promotions.push(zone);
  }
  if (!seen.has('ru') || !seen.has('рф') || !seen.has('com')) throw new Error('adminvps: missing required zones');
  return { tlds, coupons: {}, sourceRub: { adminvps: nativePrices }, sourcePromotions: { adminvps: promotions } };
}

/** Normalize the registration list; retain older ru/рф renewals only on a price match. */
export function normalizeWebhost1Annual(data, observations, rubToUsd = regruRubToUsd) {
  if (!Number.isFinite(rubToUsd) || rubToUsd <= 0) throw new Error('webhost1: invalid RUB/USD rate');
  if (!data || !Array.isArray(data.rows) || data.rows.length < 200 || !Array.isArray(data.conflicts)) {
    throw new Error('webhost1: incomplete annual registration list');
  }
  const conflicts = new Map();
  for (const c of data.conflicts) {
    if (!c || typeof c.tld !== 'string' || !annualZonePattern.test(c.tld) || conflicts.has(c.tld)) throw new Error('webhost1: invalid conflict');
    const listed = annualRubCents(c.listRub, 'webhost1');
    const modal = annualRubCents(c.modalRub, 'webhost1');
    if (listed === modal || typeof c.reason !== 'string' || !c.reason.trim()) throw new Error('webhost1: invalid conflict');
    conflicts.set(c.tld, listed);
  }
  // The saved .com list and modal disagree; do not silently clear the conflict.
  if (!conflicts.has('com')) throw new Error('webhost1: unresolved .com conflict');
  const old = normalizeWebhost1Observed(observations, rubToUsd);
  const seen = new Set();
  const tlds = {};
  const nativePrices = {};
  for (const row of data.rows) {
    const zone = annualZone(row, seen, 'webhost1');
    if (row.registrationYears !== 1) throw new Error('webhost1: nonannual registration');
    // A zero amount alone does not establish a purchasable offer.
    if (row.registrationRub === '0') continue;
    const reg = annualRubCents(row.registrationRub, 'webhost1');
    if (conflicts.has(zone)) {
      if (conflicts.get(zone) !== reg) throw new Error('webhost1: conflict does not match list');
      continue;
    }
    const prior = old.sourceRub.webhost1[zone];
    if (prior && prior[0] !== reg) throw new Error('webhost1: old renewal price requires review');
    const renew = prior?.[1] ?? null;
    tlds[zone] = { webhost1: { reg: Math.round(reg / rubToUsd), renew: renew === null ? null : Math.round(renew / rubToUsd), transfer: null } };
    nativePrices[zone] = [reg, renew];
  }
  if (!tlds.ru || !tlds['рф'] || [...conflicts.keys()].some((z) => !seen.has(z))) throw new Error('webhost1: missing verified zones');
  return { tlds, coupons: {}, sourceRub: { webhost1: nativePrices } };
}

/**
 * Parse the public landing-page cards without executing any page scripts.
 * Annual terms were corroborated against the separate public annual price list
 * for the initial manual import. This alone does not verify future terms, so
 * it must not be registered as an automatic source without that verification.
 */
export function normalizeSprinthost(html, rubToUsd = regruRubToUsd) {
  if (!Number.isFinite(rubToUsd) || rubToUsd <= 0) throw new Error('sprinthost: invalid RUB/USD rate');
  // Scan balanced DIVs only; class tokens, not attribute substrings, define scope.
  const blocks = (input, wanted) => {
    const stack = [];
    const result = [];
    for (const m of input.matchAll(/<\/?div\b[^>]*>/gi)) {
      if (/^<\//.test(m[0])) {
        const start = stack.pop();
        if (!start) continue;
        if (start.match) result.push(input.slice(start.end, m.index));
      } else {
        const klass = /\bclass\s*=\s*["']([^"']*)["']/i.exec(m[0]);
        stack.push({ end: m.index + m[0].length, match: !!klass && klass[1].split(/\s+/).includes(wanted) });
      }
    }
    if (stack.some((x) => x.match)) throw new Error(`sprinthost: unclosed ${wanted}`);
    return result;
  };
  // Restrict scanning to the observed public price grid. Reject ambiguity.
  const grids = blocks(html, 'grid-prices');
  if (grids.length !== 1) throw new Error(`sprinthost: expected one price grid, found ${grids.length}`);
  const cards = blocks(grids[0], 'card');
  if (cards.length < 12) throw new Error(`sprinthost: incomplete price grid (${cards.length} cards)`);
  const tlds = {};
  const nativePrices = {};
  for (const card of cards) {
    const rows = blocks(card, 'row-wrapper');
    if (rows.length !== 3) throw new Error('sprinthost: unexpected card structure');
    let remainder = card;
    for (const row of rows) remainder = remainder.replace(`<div class="row-wrapper">${row}</div>`, '');
    if (remainder.replace(/<!---->/g, '').trim()) throw new Error('sprinthost: unexpected card content');
    const title = /^\s*<div class="card__title">\.([a-zа-яё0-9-]+)<\/div>\s*(?:<!---->)?\s*$/iu.exec(rows[0]);
    const price = (row, label, klass) => {
      const escaped = klass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^\\s*<div class="card__desc">${label}<\\/div>\\s*<div class="right-side">\\s*<div class="${escaped}">([0-9 .,&;]+)<span><span class="ruble">(?:&nbsp;|&#160;|\\s)*₽<\\/span><\\/span><\\/div>\\s*<\\/div>\\s*$`, 'u');
      const m = pattern.exec(row);
      if (!m) return null;
      const raw = m[1].replace(/&nbsp;|&#160;/gi, ' ').trim();
      if (!/^(?:\d+|\d{1,3}(?:[ \u00a0]\d{3})+)(?:[.,]\d{1,2})?$/.test(raw)) return null;
      const cents = toCents(Number(raw.replace(/[ \u00a0]/g, '').replace(',', '.')));
      return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
    };
    if (!title) throw new Error('sprinthost: invalid zone title');
    const tld = title[1].toLowerCase();
    if (tlds[tld]) throw new Error(`sprinthost: duplicate zone ${tld}`);
    const reg = price(rows[1], 'Регистрация', 'card__price');
    const renew = price(rows[2], 'Продление', 'card__desc price');
    if (reg === null || renew === null) throw new Error(`sprinthost: invalid price for ${tld}`);
    nativePrices[tld] = [reg, renew];
    tlds[tld] = { sprinthost: { reg: Math.round(reg / rubToUsd), renew: Math.round(renew / rubToUsd), transfer: null } };
  }
  if (!tlds.ru || !tlds['рф'] || !tlds.com) throw new Error('sprinthost: missing required zones');
  return { tlds, coupons: {}, sourceRub: { sprinthost: nativePrices } };
}

/**
 * Parse the separately supplied public annual table. The visible table and
 * embedded public JSON must agree exactly, including yearly column labels.
 * Never execute the page script, and reject promotions/ambiguous markup.
 */
export function normalizeSprinthostAnnual(html, rubToUsd = regruRubToUsd) {
  if (!Number.isFinite(rubToUsd) || rubToUsd <= 0) throw new Error('sprinthost: invalid RUB/USD rate');
  const dataMatches = [...html.matchAll(/<div\s+id="prices-table-data"[^>]*>([^<]*)<\/div\s*>/gi)];
  const tables = [...html.matchAll(/<table\s+class="prices-table"\s*>([\s\S]*?)<\/table\s*>/gi)];
  if (dataMatches.length !== 1 || tables.length !== 1) throw new Error('sprinthost: expected one annual data block and table');
  let raw;
  try { raw = JSON.parse(dataMatches[0][1]); } catch { throw new Error('sprinthost: invalid price JSON'); }
  if (!Array.isArray(raw) || raw.length < 88) throw new Error('sprinthost: incomplete annual price JSON');
  const input = new Map();
  const zonePattern = /^[a-zа-яё0-9-]+(?:\.[a-zа-яё0-9-]+)*$/u;
  const kopecks = (n) => {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
    const cents = Math.round(n * 100);
    return Number.isSafeInteger(cents) && Math.abs(cents / 100 - n) < 1e-8 ? cents : null;
  };
  for (const item of raw) {
    if (!item || typeof item.tld !== 'string') throw new Error('sprinthost: invalid annual zone');
    const zone = item.tld.toLowerCase();
    const reg = kopecks(item.price_reg);
    const renew = kopecks(item.price_prl);
    if (!zonePattern.test(zone) || input.has(zone)) throw new Error(`sprinthost: invalid or duplicate zone ${zone}`);
    if (reg === null || renew === null || item.price_before !== 0) throw new Error(`sprinthost: invalid or promotional annual price for ${zone}`);
    input.set(zone, [reg, renew]);
  }
  const table = tables[0][1];
  const head = [...table.matchAll(/<thead\b[^>]*>([\s\S]*?)<\/thead\s*>/gi)];
  const bodies = [...table.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/gi)];
  if (head.length !== 1 || bodies.length !== 1) throw new Error('sprinthost: invalid annual table structure');
  const headings = [...head[0][1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi)].map((m) => m[1].trim());
  if (headings.length !== 7 || headings[0] || headings[2] || headings[4] || headings[6] ||
      headings[1] !== '<div class="header-item">Зона</div>' ||
      headings[3] !== '<div class="header-item">Регистрация на год</div>' ||
      headings[5] !== '<div class="header-item">Продление на год</div>') {
    throw new Error('sprinthost: annual column labels changed');
  }
  const rowMatches = [...bodies[0][1].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi)];
  // Do not silently skip an unexpected row, missing row, or unparsed text.
  const bodyRemainder = bodies[0][1].replace(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi, '').trim();
  if (bodyRemainder || rowMatches.length !== input.size) throw new Error('sprinthost: incomplete annual table');
  const seen = new Set();
  const nativePrices = {};
  const tlds = {};
  const valuePattern = /<div class="price-value"><span class="fu-aligning-string" style="display: inline-flex; flex-direction: row; flex-wrap: nowrap; align-items: center; white-space: nowrap">(\d+(?:[ \u00a0]\d{3})*(?:[.,]\d{1,2})?)<span class="ruble">&nbsp;₽<\/span><\/span><\/div>/u;
  for (const [, attrs, row] of rowMatches) {
    if (attrs.trim() !== 'class="table-row"') throw new Error('sprinthost: unexpected annual row');
    const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)];
    const rowRemainder = row.replace(/<td\b[^>]*>[\s\S]*?<\/td\s*>/gi, '').trim();
    if (rowRemainder || cells.length !== 7 || cells[0][1].trim() !== 'class="column-offset"' || cells[2][1].trim() !== 'class="column-gap"' ||
        cells[4][1].trim() !== 'class="column-gap"' || cells[6][1].trim() !== 'class="column-offset"' ||
        [0, 2, 4, 6].some((i) => cells[i][2].trim()) || [1, 3, 5].some((i) => cells[i][1].trim())) {
      throw new Error('sprinthost: unexpected annual cells');
    }
    const zoneMatch = /^<div class="tld">\.([a-zа-яё0-9.-]+)<\/div>$/iu.exec(cells[1][2].trim());
    const zone = zoneMatch?.[1].toLowerCase();
    const price = (cell, registration) => {
      let content = cell.trim();
      if (registration) {
        const wrapper = /^<div class="price-reg"><!---->([\s\S]*)<\/div>$/.exec(content);
        if (!wrapper) return null;
        content = wrapper[1];
      }
      const m = valuePattern.exec(content);
      if (!m || m[0] !== content) return null;
      const amount = m[1];
      if (!/^(?:\d+|\d{1,3}(?:[ \u00a0]\d{3})+)(?:[.,]\d{1,2})?$/.test(amount)) return null;
      return kopecks(Number(amount.replace(/[ \u00a0]/g, '').replace(',', '.')));
    };
    if (!zone || !zonePattern.test(zone) || seen.has(zone)) throw new Error('sprinthost: invalid or duplicate table zone');
    const reg = price(cells[3][2], true);
    const renew = price(cells[5][2], false);
    const expected = input.get(zone);
    if (reg === null || renew === null || !expected || expected[0] !== reg || expected[1] !== renew) {
      throw new Error(`sprinthost: annual table/data mismatch for ${zone}`);
    }
    seen.add(zone);
    nativePrices[zone] = [reg, renew];
    tlds[zone] = { sprinthost: { reg: Math.round(reg / rubToUsd), renew: Math.round(renew / rubToUsd), transfer: null } };
  }
  if (!seen.has('ru') || !seen.has('рф') || !seen.has('com')) throw new Error('sprinthost: missing required annual zones');
  return { tlds, coupons: {}, sourceRub: { sprinthost: nativePrices } };
}

export async function fetchTimeweb(fetcher = fetchWithRetry) {
  const res = await fetcher('https://timeweb.com/ru/services/domains/', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
    redirect: 'error',
  }, { retries: 1 });
  if (!res.ok) throw new Error(`timeweb ${res.status}`);
  return normalizeTimeweb(await res.text());
}

/**
 * HostiMan's public annual TLD-price table. Accept only a table with explicit
 * zone, annual registration and annual renewal headers, never search/order
 * tables or nonnumeric "free" offers. Prices are RUB, converted to USD cents.
 * Verified against a sanitized price table from a user-provided public page;
 * automatic access from the scheduled runner remains unverified.
 */
export function normalizeHostiman(html, rubToUsd = regruRubToUsd) {
  if (!Number.isFinite(rubToUsd) || rubToUsd <= 0) throw new Error('hostiman: invalid RUB/USD rate');
  const text = (s) => s.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  const money = (s) => {
    // Only the known empty ruble icon may accompany the amount. Nested
    // prices, crossed-out values, labels or promotions are not unambiguous.
    const plain = s.replace(/<i\b[^>]*class=["'][^"']*\bfa-ruble-sign\b[^"']*["'][^>]*>\s*<\/i\s*>/gi, '');
    if (/[<>]/.test(plain)) return null;
    const value = text(plain).replace(/\s/g, '');
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
    const amount = Number(value.replace(',', '.'));
    return Number.isFinite(amount) && amount > 0 ? toCents(amount) : null;
  };
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)];
  const matches = [];
  for (const [, table] of tables) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)]
      .map((row) => [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)\s*>/gi)].map((cell) => cell[1]));
    const header = rows.findIndex((row) => row.length === 5 &&
      /^зона$/i.test(text(row[0])) && /^регистрация\s*\(1 год\)$/i.test(text(row[1])) &&
      /^продление\s*\(1 год\)$/i.test(text(row[2])) && /^трансфер\s*\(единоразово\)$/i.test(text(row[3])) &&
      /^скрытие данных\s*\(1 год\)$/i.test(text(row[4])));
    if (header < 0) continue;
    const tlds = {};
    const nativePrices = {};
    for (const row of rows.slice(header + 1)) {
      if (row.length !== 5) continue;
      const tld = text(row[0]).toLowerCase().replace(/^\./, '');
      if (!/^[a-zа-яё0-9-]+(?:\.[a-zа-яё0-9-]+)*$/u.test(tld)) continue;
      // Explicitly free technical entries are not comparable registrar prices.
      if (/^бесплатно$/i.test(text(row[1])) && /^бесплатно$/i.test(text(row[2]))) continue;
      const reg = money(row[1]);
      const renew = money(row[2]);
      // A changed cell must not silently drop just one zone and re-date the rest.
      if (reg === null || renew === null) throw new Error(`hostiman: invalid price for ${tld}`);
      if (tlds[tld]) throw new Error(`hostiman: duplicate zone ${tld}`);
      tlds[tld] = { hostiman: { reg: Math.round(reg / rubToUsd), renew: Math.round(renew / rubToUsd), transfer: null } };
      nativePrices[tld] = [reg, renew];
    }
    matches.push({ tlds, nativePrices });
  }
  if (matches.length !== 1) throw new Error(`hostiman: expected one price table, found ${matches.length}`);
  const { tlds, nativePrices } = matches[0];
  if (Object.keys(tlds).length < 5 || !tlds.ru || !tlds['рф'] || !tlds.com) {
    throw new Error(`hostiman: incomplete price table (${Object.keys(tlds).length} zones)`);
  }
  return { tlds, coupons: {}, sourceRub: { hostiman: nativePrices } };
}

export async function fetchHostiman(fetcher = fetchWithRetry) {
  const res = await fetcher('https://my.hostiman.ru/domain/register', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
    redirect: 'error',
  }, { retries: 1 });
  if (!res.ok) throw new Error(`hostiman ${res.status}`);
  return normalizeHostiman(await res.text());
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

export async function fetchRegru(fetcher = fetchWithRetry) {
  // The public landing page saved from REG.RU contains the Nuxt price data.
  const res = await fetcher('https://www.reg.ru/domain/new/', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
  }, { retries: 1 });
  if (!res.ok) throw new Error(`regru ${res.status}`);
  return normalizeRegru(await res.text());
}

async function fetchBeget() {
  const res = await fetchWithRetry('https://beget.com/en/domains/zone', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
  }, { retries: 1 });
  if (!res.ok) throw new Error(`beget ${res.status}`);
  return normalizeBeget(await res.text());
}

async function fetchDynadot() {
  const res = await fetchWithRetry('https://www.dynadot.com/domain/prices', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
  }, { retries: 1 });
  if (!res.ok) throw new Error(`dynadot ${res.status}`);
  return normalizeDynadotHtml(await res.text());
}

async function fetchSpaceship() {
  const res = await fetchWithRetry('https://www.spaceship.com/domains/', {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'user-agent': UA, accept: 'text/html' },
  }, { retries: 1 });
  if (!res.ok) throw new Error(`spaceship ${res.status}`);
  return normalizeSpaceship(await res.text());
}

async function fetchRegctl() {
  const res = await fetchWithRetry('https://regctl.sh/prices.json', { timeoutMs: FETCH_TIMEOUT_MS }, { retries: 1 });
  if (!res.ok) throw new Error(`regctl ${res.status}`);
  return normalizeRegctl(await res.json());
}

// ---- Main ----

async function main() {
  const fx = await fetchFxRates();
  regruRubToUsd = fx.regruRubToUsd;
  begetEurToUsd = fx.begetEurToUsd;

  const apiSources = [
    ['porkbun', fetchPorkbun],
    ['cloudflare', fetchCloudflare],
  ];
  const scraperSources = [
    ['regru', fetchRegru],
    // HostiMan, Timeweb and Sprinthost are not scheduled; see their source docs.
    ['beget', fetchBeget],
    ['dynadot', fetchDynadot],
    ['spaceship', fetchSpaceship],
    ['regctl', fetchRegctl],
  ];
  const named = apiOnly ? apiSources : [...apiSources, ...scraperSources];

  // Carry-over: load the previous snapshot FIRST so a flaky source this run
  // does not erase TLD coverage from a prior successful harvest. Fresh
  // sources merge on top (Object.assign per registrar gives fresh-wins).
  const rawPrev = await readJson(SNAPSHOT_PATH).catch(() => null);
  const previous = rawPrev ? expandCompactSnapshot(rawPrev) : null;
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
      // Replace complete source subsets so omitted zones are not given a new date.
      applySuccessfulSource(merged, result.value, name);
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
    porkbunFormatVersion: 2,
    // No timestamp can be inferred for legacy carry-over prices.
    regruUpdatedAt: sourceUpdatedAt(sources, rawPrev?.regruUpdatedAt, 'regru'),
    hostimanUpdatedAt: sourceUpdatedAt(sources, rawPrev?.hostimanUpdatedAt, 'hostiman'),
    timewebUpdatedAt: sourceUpdatedAt(sources, rawPrev?.timewebUpdatedAt, 'timeweb'),
    sprinthostUpdatedAt: sourceUpdatedAt(sources, rawPrev?.sprinthostUpdatedAt, 'sprinthost'),
    webhost1UpdatedAt: sourceUpdatedAt(sources, rawPrev?.webhost1UpdatedAt, 'webhost1'),
    webhost1RenewalUpdatedAt: rawPrev?.webhost1RenewalUpdatedAt ?? null,
    adminvpsUpdatedAt: sourceUpdatedAt(sources, rawPrev?.adminvpsUpdatedAt, 'adminvps'),
    sourcePromotions: mergeSourcePromotions(rawPrev?.sourcePromotions, Object.fromEntries(
      results.flatMap((result, i) => result.status === 'fulfilled' ? [[named[i][0], result.value]] : []),
    )),
    sourceRub: mergeSourceRub(rawPrev?.sourceRub, Object.fromEntries(
      results.flatMap((result, i) => result.status === 'fulfilled' ? [[named[i][0], result.value]] : []),
    )),
    timewebRenewalFromRub: sources.includes('timeweb')
      ? results[named.findIndex(([name]) => name === 'timeweb')].value.timewebRenewalFromRub
      : (rawPrev?.timewebRenewalFromRub ?? {}),
    tlds: compactTlds,
    coupons: merged.coupons,
  };

  // Precomputed trends (weekly, build-price-history.mjs) survive the rewrite.
  if (rawPrev && rawPrev.trends) table.trends = rawPrev.trends;

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
