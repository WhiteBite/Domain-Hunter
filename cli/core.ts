/**
 * CLI command implementations — pure async functions on the contract types.
 * Both the arg-parser (cli/main.ts) and a future MCP server call ONLY these.
 *
 * Reuses the browser app's core logic directly: normalizeDomainInput +
 * parseCandidate for input expansion, runQueue for the AIMD-paced RDAP
 * orchestrator, getFresh/put for the result cache, and the pure pricing +
 * generator helpers. No engine/engine.worker imports.
 */
import type {
  CheckResult,
  CheckStatus,
  EngineEvent,
  PricingTable,
  Settings,
} from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';
import { normalizeDomainInput, parseCandidate } from '../src/core/idn';
import { runQueue } from '../src/core/queue';
import { getFresh, put } from '../src/core/cache';
import { bestEntry, formatPrice, isPromoTrap, tco3 } from '../src/pricing/pricing';
import { displayToUsdCents } from '../src/ui/table-filters';
import { combinator, DEFAULT_AFFIXES } from '../src/generators/combinator';
import { mixSyllables } from '../src/generators/syllables';
import { findHacks } from '../src/generators/hacks';
import { mutate } from '../src/generators/mutations';
import { themes } from '../src/generators/themes';
import { loadPricingTable, loadRegistry } from './data';
import type {
  CheckCommandOptions,
  CheckOutcome,
  CheckRow,
  CliCurrency,
  CliRates,
  FindCommandOptions,
  FindOutcome,
  FindRow,
  GenerateCommandOptions,
  GenerateOutcome,
  PriceInfo,
  PricesCommandOptions,
  PricesOutcome,
  PricesRow,
} from './contract';

const DEFAULT_CONCURRENCY = 6;
const MAX_GENERATE_NAMES = 500;
const MAX_GENERATE_DOMAINS = 500;
const DEFAULT_FIND_MAX_CHECKS = 30;

// ---- shared helpers ----

function buildSettings(opts: {
  currency?: CliCurrency;
  rates?: CliRates;
}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    currency: opts.currency ?? DEFAULT_SETTINGS.currency,
    rates: {
      RUB: opts.rates?.RUB ?? DEFAULT_SETTINGS.rates.RUB,
      EUR: opts.rates?.EUR ?? DEFAULT_SETTINGS.rates.EUR,
    },
  };
}

function buildPriceInfo(
  table: PricingTable,
  tld: string,
  settings: Settings,
): PriceInfo {
  const best = bestEntry(table, tld);
  if (!best) {
    return {
      registrarId: null,
      reg: null,
      renew: null,
      transfer: null,
      promoTrap: false,
    };
  }
  return {
    registrarId: best.registrarId,
    reg: best.entry.reg,
    renew: best.entry.renew,
    transfer: best.entry.transfer,
    promoTrap: isPromoTrap(best.entry),
    formatted: {
      first: formatPrice(best.entry.reg, settings),
      renew: formatPrice(best.entry.renew, settings),
    },
  };
}

function emptyCounts(): Record<CheckStatus, number> {
  return {
    available: 0,
    taken: 0,
    probably_available: 0,
    unknown: 0,
    error: 0,
  };
}

// ---- runCheckCommand ----

/**
 * Check domain availability via RDAP. Bare labels expand over
 * `opts.tlds ?? DEFAULT_SETTINGS.defaultTlds`. Cached hits (within
 * `cacheTtlHours`) are returned with `fromCache: true` and skip the queue.
 * When `withPrices`, a pricing table is loaded once and `PriceInfo` is
 * attached to `available` / `probably_available` rows.
 */
export async function runCheckCommand(
  opts: CheckCommandOptions,
): Promise<CheckOutcome> {
  const start = Date.now();
  const { registry, source, bootstrapMerged } = await loadRegistry({});

  const selectedTlds = opts.tlds ?? DEFAULT_SETTINGS.defaultTlds;

  // Normalize + expand bare labels into concrete candidate domains.
  const candidates: string[] = [];
  for (const input of opts.domains) {
    const parsed = normalizeDomainInput(input);
    for (const name of parsed.names) {
      candidates.push(...parseCandidate(name, selectedTlds));
    }
  }
  const uniqueCandidates = [...new Set(candidates)];

  // Cache lookup — fresh hits short-circuit the queue.
  const ttlMs = (opts.cacheTtlHours ?? DEFAULT_SETTINGS.cacheTtlHours) * 60 * 60 * 1000;
  const ignoreCache = opts.ignoreCache ?? false;
  const cachedRows: CheckRow[] = [];
  const toCheck: string[] = [];
  for (const domain of uniqueCandidates) {
    if (ignoreCache) {
      toCheck.push(domain);
      continue;
    }
    const entry = getFresh(domain, ttlMs);
    if (entry) {
      cachedRows.push({
        domain,
        tld: entry.tld,
        status: entry.status,
        source: entry.source,
        fromCache: true,
      });
    } else {
      toCheck.push(domain);
    }
  }

  // Run the queue for non-cached candidates (same orchestrator the Web Worker uses).
  const freshResults: CheckResult[] = [];
  const emit = (event: EngineEvent): void => {
    if (event.type === 'batch') {
      freshResults.push(...event.results);
    }
  };
  const controller = new AbortController();
  if (toCheck.length > 0) {
    await runQueue(
      toCheck,
      registry,
      { registry, concurrency: DEFAULT_CONCURRENCY, fetchImpl: globalThis.fetch },
      emit,
      controller.signal,
    );
  }

  // Build rows + persist fresh results to cache.
  const results: CheckRow[] = [...cachedRows];
  for (const r of freshResults) {
    results.push({
      domain: r.domain,
      tld: r.tld,
      status: r.status,
      source: r.source,
      note: r.note,
      latencyMs: r.latencyMs,
    });
    put(r.domain, {
      status: r.status,
      source: r.source,
      ts: r.checkedAt,
      tld: r.tld,
    });
  }

  // Pricing attachment.
  if (opts.withPrices) {
    const settings = buildSettings(opts);
    const pricingState = await loadPricingTable({
      currency: opts.currency ?? DEFAULT_SETTINGS.currency,
      rates: opts.rates ?? {
        RUB: DEFAULT_SETTINGS.rates.RUB,
        EUR: DEFAULT_SETTINGS.rates.EUR,
      },
    });
    for (const row of results) {
      if (row.status === 'available' || row.status === 'probably_available') {
        row.price = buildPriceInfo(pricingState.table, row.tld, settings);
      }
    }
  }

  const counts = emptyCounts();
  for (const row of results) {
    counts[row.status] += 1;
  }

  return {
    command: 'check',
    checkedAt: Date.now(),
    durationMs: Date.now() - start,
    total: results.length,
    counts,
    results,
    dataSource: { tlds: source, bootstrapMerged },
  };
}

// ---- runPricesCommand ----

/**
 * Per-registrar pricing rows. Filters by exact TLD match (`opts.tlds`) and/or
 * TLD substring (`opts.query`), sorts by cheapest registration price ascending
 * (nulls last). Each row carries the best registrar, 3-year TCO, promo-trap
 * flag, and the full registrar→entry map for the TLD.
 */
export async function runPricesCommand(
  opts: PricesCommandOptions,
): Promise<PricesOutcome> {
  const pricingState = await loadPricingTable({
    currency: opts.currency ?? DEFAULT_SETTINGS.currency,
    rates: opts.rates ?? {
      RUB: DEFAULT_SETTINGS.rates.RUB,
      EUR: DEFAULT_SETTINGS.rates.EUR,
    },
  });
  const table = pricingState.table;

  let tldKeys = Object.keys(table.tlds);
  if (opts.tlds) {
    const tldSet = new Set(opts.tlds);
    tldKeys = tldKeys.filter((t) => tldSet.has(t));
  }
  if (opts.query) {
    const q = opts.query.toLowerCase();
    tldKeys = tldKeys.filter((t) => t.toLowerCase().includes(q));
  }

  // Sort by best reg price ascending; nulls last.
  tldKeys.sort((a, b) => {
    const ra = bestEntry(table, a)?.entry.reg ?? Infinity;
    const rb = bestEntry(table, b)?.entry.reg ?? Infinity;
    return ra - rb;
  });

  const rows: PricesRow[] = tldKeys.map((tld) => {
    const best = bestEntry(table, tld);
    const entriesForTld = table.tlds[tld] ?? {};
    const entries: Record<
      string,
      { reg: number | null; renew: number | null; transfer: number | null }
    > = {};
    for (const [rid, entry] of Object.entries(entriesForTld)) {
      entries[rid] = {
        reg: entry.reg,
        renew: entry.renew,
        transfer: entry.transfer,
      };
    }
    return {
      tld,
      best: best
        ? {
            registrarId: best.registrarId,
            reg: best.entry.reg,
            renew: best.entry.renew,
          }
        : null,
      tco3UsdCents: tco3(table, tld),
      promoTrap: best ? isPromoTrap(best.entry) : false,
      entries,
    };
  });

  return {
    command: 'prices',
    sources: table.sources,
    fetchedAt: pricingState.fetchedAt,
    rows,
  };
}

// ---- runGenerateCommand ----

/**
 * Dispatch to one of the five pure generators. Names are capped at
 * `opts.count ?? 100` (hard cap 500). When `opts.tlds` is given (and the
 * generator is not `hacks`), `domains` = names × tlds (deduped, capped 500).
 * For `hacks`, the generated names are already full domains (e.g. `fami.ly`),
 * so `domains` mirrors `names`.
 */
export async function runGenerateCommand(
  opts: GenerateCommandOptions,
): Promise<GenerateOutcome> {
  const count = Math.min(opts.count ?? 100, MAX_GENERATE_NAMES);

  let names: string[];
  switch (opts.generator) {
    case 'combinator':
      names = combinator(
        opts.roots ?? [],
        opts.affixes ?? [...DEFAULT_AFFIXES],
        opts.mode ?? 'both',
      );
      break;
    case 'syllables':
      names = mixSyllables({ count, seed: opts.seed });
      break;
    case 'hacks': {
      const { registry } = await loadRegistry({});
      names = findHacks(opts.roots ?? [], registry.hackTlds).map((h) => h.domain);
      break;
    }
    case 'mutations':
      names = (opts.roots ?? []).flatMap((r) => mutate(r));
      break;
    case 'themes': {
      const themeId = opts.theme;
      const cats = themeId ? themes.filter((t) => t.id === themeId) : themes;
      names = cats.flatMap((t) => t.words.map((w) => w.w));
      break;
    }
    default:
      names = [];
  }

  names = names.slice(0, count);

  // Build domains.
  let domains: string[] = [];
  if (opts.generator === 'hacks') {
    // Hack names are already full domains (e.g. "fami.ly").
    domains = names.slice(0, MAX_GENERATE_DOMAINS);
  } else if (opts.tlds && opts.tlds.length > 0) {
    const seen = new Set<string>();
    outer: for (const name of names) {
      for (const tld of opts.tlds) {
        const d = `${name}.${tld}`;
        if (!seen.has(d)) {
          seen.add(d);
          domains.push(d);
          if (domains.length >= MAX_GENERATE_DOMAINS) break outer;
        }
      }
    }
  }

  return {
    command: 'generate',
    generator: opts.generator,
    names,
    domains,
  };
}

// ---- runFindCommand ----

/**
 * Find available domains within a budget. Candidate pool =
 * combinator(seed, DEFAULT_AFFIXES, 'both') + mutate(seed) +
 * findHacks([seed], registry.hackTlds), deduped and capped at
 * `opts.maxChecks ?? 30`. The pool is then checked with prices via
 * runCheckCommand. `withinBudget` compares the best reg price (USD cents)
 * against the budget (converted from display currency via displayToUsdCents).
 * No budget → every available row is `withinBudget: true`.
 */
export async function runFindCommand(
  opts: FindCommandOptions,
): Promise<FindOutcome> {
  const { registry } = await loadRegistry({});

  // Candidate pool.
  const pool = new Set<string>();
  for (const name of combinator([opts.seedName], [...DEFAULT_AFFIXES], 'both')) {
    pool.add(name);
  }
  for (const name of mutate(opts.seedName)) {
    pool.add(name);
  }
  for (const hack of findHacks([opts.seedName], registry.hackTlds)) {
    pool.add(hack.domain);
  }

  const maxChecks = opts.maxChecks ?? DEFAULT_FIND_MAX_CHECKS;
  const candidates = [...pool].slice(0, maxChecks);

  // Check the pool with prices.
  const checkOutcome = await runCheckCommand({
    domains: candidates,
    withPrices: true,
    currency: opts.currency,
    rates: opts.rates,
    tlds: opts.tlds,
  });

  // Budget conversion (USD cents).
  const settings = buildSettings(opts);
  const budgetUsdCents =
    opts.budget != null ? displayToUsdCents(opts.budget, settings) : null;

  // Build find rows — available/probably_available only, sorted by reg price.
  const available: FindRow[] = [];
  for (const row of checkOutcome.results) {
    if (row.status !== 'available' && row.status !== 'probably_available') continue;
    const reg = row.price?.reg ?? null;
    const withinBudget =
      budgetUsdCents != null
        ? reg != null && reg <= budgetUsdCents
        : true;
    available.push({ ...row, withinBudget });
  }
  available.sort((a, b) => {
    const ra = a.price?.reg ?? Infinity;
    const rb = b.price?.reg ?? Infinity;
    return ra - rb;
  });

  return {
    command: 'find',
    seedName: opts.seedName,
    budgetUsdCents,
    checked: checkOutcome.results.length,
    available,
  };
}
