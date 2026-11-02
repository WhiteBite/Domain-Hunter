#!/usr/bin/env node
/** Offline import of manually reviewed public price data. Never contacts sellers. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  normalizeHostiman, normalizeTimeweb, normalizeSprinthostAnnual,
  normalizeAdminvpsAnnual, normalizeWebhost1Annual,
} from './harvest-prices.mjs';

const usage = `Usage: node scripts/import-reviewed-prices.mjs --source SOURCE --input FILE --observed-at UTC --rub-per-usd RATE --output NEW_FILE [--snapshot FILE]
SOURCE: hostiman, timeweb, sprinthost, adminvps, webhost1
webhost1 also requires --renewals FILE --renewal-observed-at UTC
UTC must be an ISO timestamp, e.g. 2026-11-01T19:06:15Z. Output must not exist.
The operator must review source semantics and supply the actual observation date and FX rate.`;

function parseArgs(args) {
  const allowed = new Set(['source', 'input', 'observed-at', 'rub-per-usd', 'output', 'snapshot', 'renewals', 'renewal-observed-at']);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    if (!allowed.has(name) || !args[i + 1] || args[i + 1].startsWith('--') || result[name] !== undefined) throw new Error(usage);
    result[name] = args[i + 1];
  }
  for (const key of ['source', 'input', 'observed-at', 'rub-per-usd', 'output']) {
    if (!result[key]) throw new Error(usage);
  }
  return result;
}

function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw new Error('observation date must be a UTC ISO timestamp');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19) || ms > Date.now()) {
    throw new Error('invalid or future observation date');
  }
  return new Date(ms).toISOString();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const at = utc(args['observed-at']);
  const rate = Number(args['rub-per-usd']);
  if (!/^\d+(?:\.\d+)?$/.test(args['rub-per-usd']) || !Number.isFinite(rate) || rate <= 0) throw new Error('invalid RUB per USD exchange rate');
  const previous = JSON.parse(await readFile(args.snapshot ?? 'src/config/pricing.snapshot.json', 'utf8'));
  if (!previous?.tlds || !Array.isArray(previous.sources) || !previous.sources.includes('snapshot')) throw new Error('invalid compact snapshot');
  const text = await readFile(args.input, 'utf8');
  let fresh;
  switch (args.source) {
    case 'hostiman': fresh = normalizeHostiman(text, rate); break;
    case 'timeweb': fresh = normalizeTimeweb(text, rate); break;
    case 'sprinthost': fresh = normalizeSprinthostAnnual(text, rate); break;
    case 'adminvps': fresh = normalizeAdminvpsAnnual(JSON.parse(text), rate); break;
    case 'webhost1': {
      if (!args.renewals || !args['renewal-observed-at']) throw new Error(usage);
      const renewalAt = utc(args['renewal-observed-at']);
      if (renewalAt > at) throw new Error('renewal observation must not postdate registration observation');
      if (typeof previous.webhost1RenewalUpdatedAt === 'string' && Date.parse(previous.webhost1RenewalUpdatedAt) > Date.parse(renewalAt)) {
        throw new Error('renewal observation is older than the existing renewal data');
      }
      fresh = normalizeWebhost1Annual(JSON.parse(text), JSON.parse(await readFile(args.renewals, 'utf8')), rate);
      previous.webhost1RenewalUpdatedAt = renewalAt;
      break;
    }
    default: throw new Error(usage);
  }
  if (args.source !== 'webhost1' && (args.renewals || args['renewal-observed-at'])) throw new Error(usage);
  const id = args.source;
  const dateKey = `${id}UpdatedAt`;
  const priorAt = previous[dateKey];
  if (typeof priorAt === 'string' && Date.parse(priorAt) > Date.parse(at)) throw new Error('observation is older than the existing source data');

  // Replace only this source; never re-date or overwrite unrelated seller data.
  for (const [tld, entries] of Object.entries(previous.tlds)) {
    delete entries[id];
    if (Object.keys(entries).length === 0) delete previous.tlds[tld];
  }
  for (const [tld, entries] of Object.entries(fresh.tlds)) {
    const entry = entries[id];
    (previous.tlds[tld] ??= {})[id] = [entry.reg, entry.renew, entry.transfer];
  }
  previous.sourceRub ??= {};
  previous.sourceRub[id] = Object.fromEntries(Object.entries(fresh.sourceRub[id]).sort(([, a], [, b]) =>
    (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0)));
  if (id === 'timeweb') previous.timewebRenewalFromRub = fresh.timewebRenewalFromRub;
  if (id === 'adminvps') {
    previous.sourcePromotions ??= {};
    previous.sourcePromotions.adminvps = fresh.sourcePromotions.adminvps;
  }
  previous[dateKey] = at;
  previous.generatedAt = new Date().toISOString(); // assembly time, not a seller observation
  await writeFile(resolve(args.output), JSON.stringify(previous) + '\n', { encoding: 'utf8', flag: 'wx' });
  console.log(`Prepared ${Object.keys(fresh.tlds).length} ${id} zones in ${args.output}; review before publishing.`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
