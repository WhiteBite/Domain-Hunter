#!/usr/bin/env node
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
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, '..', 'src', 'config', 'pricing.snapshot.json');
const FETCH_TIMEOUT_MS = 15_000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const REGRU_RUB_TO_USD = 97; // 97 RUB = 1 USD
const BEGET_EUR_TO_USD = 1.08; // 1 EUR = 1.08 USD

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

function mergePricing(target, src) {
  for (const [tld, registrars] of Object.entries(src.tlds)) {
    if (!target.tlds[tld]) target.tlds[tld] = {};
    Object.assign(target.tlds[tld], registrars);
  }
  for (const [tld, coupons] of Object.entries(src.coupons)) {
    if (!target.coupons[tld]) target.coupons[tld] = [];
    target.coupons[tld].push(...coupons);
  }
}

// ---- Fetch ----

async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPorkbun() {
  const res = await fetchWithTimeout('https://api.porkbun.com/api/json/v3/pricing/get', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`porkbun ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== 'object' || !json.pricing) throw new Error('porkbun bad response');
  return normalizePorkbun(json.pricing);
}

async function fetchCloudflare() {
  const res = await fetchWithTimeout('https://cfdomainpricing.com/prices.json');
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
            reg: toCents(price / REGRU_RUB_TO_USD),
            renew: toCents(oldPrice / REGRU_RUB_TO_USD),
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
            reg: toCents(reg * BEGET_EUR_TO_USD),
            renew: toCents(renew * BEGET_EUR_TO_USD),
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
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`regru ${res.status}`);
  return normalizeRegru(await res.text());
}

async function fetchBeget() {
  const res = await fetchWithTimeout('https://beget.com/en/domains/zone', {
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`beget ${res.status}`);
  return normalizeBeget(await res.text());
}

async function fetchDynadot() {
  const res = await fetchWithTimeout('https://www.dynadot.com/domain/prices', {
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`dynadot ${res.status}`);
  return normalizeDynadotHtml(await res.text());
}

async function fetchSpaceship() {
  const res = await fetchWithTimeout('https://www.spaceship.com/domains/', {
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`spaceship ${res.status}`);
  return normalizeSpaceship(await res.text());
}

async function fetchRegctl() {
  const res = await fetchWithTimeout('https://regctl.sh/prices.json');
  if (!res.ok) throw new Error(`regctl ${res.status}`);
  return normalizeRegctl(await res.json());
}

// ---- Main ----

async function main() {
  const apiSources = [
    ['porkbun', fetchPorkbun],
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

  const results = await Promise.allSettled(named.map(([, fn]) => fn()));
  const sources = [];
  const merged = { tlds: {}, coupons: {} };

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

  await writeFile(SNAPSHOT_PATH, JSON.stringify(table) + '\n', 'utf8');

  const tldCount = Object.keys(merged.tlds).length;
  const couponCount = Object.keys(merged.coupons).length;
  console.log(
    `harvested ${tldCount} TLDs from ${sources.join(', ')}, ${couponCount} coupons -> ${SNAPSHOT_PATH}`,
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
