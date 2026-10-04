#!/usr/bin/env node
/**
 * Zone health check — for each curated TLD, GET the resolved RDAP base with
 * a random unregistered domain and expect HTTP 404 (domain not found).
 * Records {http, cors, ok, directOk, cfOk, ms, ts} per TLD. Concurrency 4, timeout 8s.
 * Writes public/health.json (vite copies it into dist/ so the hosted app can
 * fetch ./health.json; file:// builds skip the probe). Always exits 0.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchWithTimeout, readJson, writeJson } from './lib/http.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TLDS_PATH = join(__dirname, '..', 'src', 'config', 'tlds.json');
const HEALTH_PATH = join(__dirname, '..', 'public', 'health.json');
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 4;
const CF_RDAP = 'https://rdap.cloudflare.com/domain/';

function resolveRdapBase(rdapBase, tld) {
  return rdapBase.includes('{tld}') ? rdapBase.replace('{tld}', tld) : rdapBase;
}

function randomChars(n) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function probe(url) {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: TIMEOUT_MS, redirect: 'manual' });
    return {
      http: res.status,
      cors: res.headers.get('access-control-allow-origin') !== null,
      ms: Date.now() - start,
    };
  } catch (err) {
    return { http: 0, cors: false, ms: Date.now() - start, error: err?.message ?? 'fetch failed' };
  }
}

async function checkTld(tld, infra) {
  const domain = 'dh-health-' + randomChars(12) + '.' + tld;
  const direct = await probe(resolveRdapBase(infra.rdapBase, tld) + domain);
  const directOk = direct.http === 404;
  const cf = directOk ? null : await probe(CF_RDAP + domain);
  const cfOk = cf === null ? null : cf.http === 404;
  const result = {
    http: direct.http,
    cors: direct.cors,
    ok: directOk || cfOk === true,
    directOk,
    cfOk,
    ms: direct.ms,
  };
  if (direct.error !== undefined) result.error = direct.error;
  if (cf !== null) result.cfHttp = cf.http;
  return result;
}

async function runWithConcurrency(items, fn, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const registry = await readJson(TLDS_PATH);
  const infras = registry.infras;
  const tldConfigs = registry.tlds;

  const items = tldConfigs.map((c) => ({ tld: c.tld, infra: infras[c.infra] }));
  const results = await runWithConcurrency(items, async ({ tld, infra }) => {
    const result = await checkTld(tld, infra);
    return [tld, result];
  }, CONCURRENCY);

  const tlds = {};
  for (const [tld, result] of results) {
    tlds[tld] = { ...result, ts: new Date().toISOString() };
  }

  const health = {
    generatedAt: new Date().toISOString(),
    tlds,
  };

  await writeJson(HEALTH_PATH, health, 2);

  const okCount = Object.values(tlds).filter((t) => t.ok).length;
  const totalCount = Object.keys(tlds).length;
  console.log(`zone health: ${okCount}/${totalCount} OK -> ${HEALTH_PATH}`);
}

main().catch((err) => {
  console.error('zone-health failed:', err);
  process.exit(0); // always exit 0 per spec
});
