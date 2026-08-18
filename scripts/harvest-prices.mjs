#!/usr/bin/env node
/**
 * Harvest live pricing from Porkbun + cfdomainpricing and write the result
 * to src/config/pricing.snapshot.json as the offline baseline.
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
const FETCH_TIMEOUT_MS = 10_000;

// ---- Normalization (mirrors src/pricing/pricing.ts) ----

function toCents(value) {
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

/** Dynadot GUEST API: XML <tld name="com" register="10.99" renew="10.99" .../> */
function normalizeDynadotXml(xml) {
  const tlds = {};
  const re = /<tld\b[^>]*\bname="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const tld = m[1];
    const reg = /(?:register|registration)="([\d.]+)"/.exec(tag)?.[1];
    const renew = /(?:renew|renewal)="([\d.]+)"/.exec(tag)?.[1];
    if (reg == null && renew == null) continue;
    tlds[tld] = {
      dynadot: { reg: toCents(reg), renew: toCents(renew ?? reg), transfer: toCents(reg) },
    };
  }
  if (Object.keys(tlds).length === 0) throw new Error('dynadot: no tld entries parsed');
  return { tlds, coupons: {} };
}

async function fetchDynadot() {
  const res = await fetchWithTimeout(
    'https://www.dynadot.com/api3.xml?uid=GUEST&key=GUEST&command=tldPrices',
  );
  if (!res.ok) throw new Error(`dynadot ${res.status}`);
  return normalizeDynadotXml(await res.text());
}

async function fetchRegctl() {
  const res = await fetchWithTimeout('https://regctl.sh/prices.json');
  if (!res.ok) throw new Error(`regctl ${res.status}`);
  return normalizeRegctl(await res.json());
}

// ---- Main ----

async function main() {
  const named = [
    ['porkbun', fetchPorkbun],
    ['cloudflare', fetchCloudflare],
    ['dynadot', fetchDynadot],
    ['regctl', fetchRegctl],
  ];
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

  // Snapshot file always carries sources: ['snapshot'] — it IS the baseline.
  const table = {
    generatedAt: new Date().toISOString(),
    sources: ['snapshot'],
    tlds: merged.tlds,
    coupons: merged.coupons,
  };

  await writeFile(SNAPSHOT_PATH, JSON.stringify(table, null, 2) + '\n', 'utf8');

  const tldCount = Object.keys(merged.tlds).length;
  const couponCount = Object.keys(merged.coupons).length;
  console.log(
    `harvested ${tldCount} TLDs from ${sources.join(', ')}, ${couponCount} coupons -> ${SNAPSHOT_PATH}`,
  );
}

main().catch((err) => {
  console.error('harvest failed:', err);
  process.exit(1);
});
