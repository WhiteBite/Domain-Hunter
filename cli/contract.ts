/**
 * CLI contract types — shared between the CLI entry point (cli/main.ts),
 * the command implementations (cli/core.ts), and a future MCP server.
 * Mirrors the browser app's three-state model and pricing units (USD cents).
 */
import type { CheckStatus, ResultSource, TldRegistry } from '../src/types';
import type { QuoteOrigin } from './price-provenance';
import type { PriceSourceService } from './sources/types';


export interface CliRates {
  RUB: number;
  EUR: number;
}

export type CliCurrency = 'USD' | 'RUB' | 'EUR';

export interface CheckCommandOptions {
  domains: string[];
  tlds?: string[];
  currency?: CliCurrency;
  rates?: Partial<CliRates>;
  ignoreCache?: boolean;
  withPrices?: boolean;
  cacheTtlHours?: number;
  /** Skip loadRegistry and reuse this already-loaded registry. Avoids the
   *  double fetch when runFindCommand calls runCheckCommand internally. */
  preloadedRegistry?: {
    registry: TldRegistry;
    source: 'bundled' | 'fresh';
    bootstrapMerged: boolean;
  };
}

export interface PriceInfo {
  registrarId: string | null;
  reg: number | null;
  renew: number | null;
  transfer: number | null;
  promoTrap: boolean;
  formatted?: { first: string; renew: string };
  /** A standard TLD price, not a confirmed domain-specific or premium quote. */
  quoteType?: 'standard_tld';
  origins?: { reg: QuoteOrigin | null; renew: QuoteOrigin | null; transfer: QuoteOrigin | null };
}

export interface CheckRow {
  domain: string;
  tld: string;
  status: CheckStatus;
  source: ResultSource;
  note?: string;
  latencyMs?: number;
  fromCache?: boolean;
  price?: PriceInfo;
}

export interface CheckOutcome {
  limitations?: string[];
  command: 'check';
  checkedAt: number;
  durationMs: number;
  total: number;
  counts: Record<CheckStatus, number>;
  results: CheckRow[];
  dataSource: { tlds: 'bundled' | 'fresh'; bootstrapMerged: boolean };
  /** True when the run was cut short by SIGINT (Ctrl+C). The results array
   *  carries whatever was checked before the abort; main.ts exits 1. */
  aborted: boolean;
}

export interface PricesCommandOptions {
  tlds?: string[];
  query?: string;
  currency?: CliCurrency;
  rates?: Partial<CliRates>;
  /** Extra keyed pricing sources to merge (currently: 'dynadot'). */
  sources?: string[];
  /** Internal source registry; never passed as an MCP argument. */
  sourceService?: PriceSourceService;
  /** Return a structured missing-key status instead of throwing (MCP). */
  reportSourceErrors?: boolean;
  /** Optional page of results; omitted means the CLI returns all rows. */
  limit?: number;
  offset?: number;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export interface KeysOutcome {
  command: 'keys';
  action: 'set' | 'list' | 'remove';
  registrar?: string;
  removed?: boolean;
  registrars?: { registrarId: string; masked: string }[];
}

export interface PricesRow {
  tld: string;
  best: { registrarId: string; reg: number | null; renew: number | null; sellerPromotion?: boolean } | null;
  tco3UsdCents: number | null;
  promoTrap: boolean;
  entries: Record<string, { reg: number | null; renew: number | null; transfer: number | null; sellerPromotion?: boolean }>;
  /** Origins match the individual fields in entries, not the table fetch time. */
  quoteOrigins?: Record<string, { reg: QuoteOrigin | null; renew: QuoteOrigin | null; transfer: QuoteOrigin | null }>;
  /** Cheapest renewal may be at a different seller than best registration. */
  bestRenewal?: { registrarId: string; renew: number } | null;
  bestTco?: { registrarId: string; total: number } | null;
  /** Published lower bound, not an exact annual renewal and excluded from TCO. */
  renewalFromRub?: Record<string, number>;
  renewalFromOrigins?: Record<string, QuoteOrigin>;
  originalRubKopecks?: Record<string, [number | null, number | null]>;
}

export interface PricesOutcome {
  command: 'prices';
  sources: string[];
  fetchedAt: number | null;
  /** Aggregate table/cache time, not freshness of each quote. */
  fromCache?: boolean;
  quoteType?: 'standard_tld';
  limitations?: string[];
  requestedSources?: { source: string; status: 'ok' | 'empty' | 'failed' | 'missing_key' | 'unsupported' | 'busy'; completeness: 'unknown' | 'complete'; observedAt: string | null; receivedZones: number | null; appliedZones: number | null; fromCache: boolean }[];
  total?: number;
  offset?: number;
  nextOffset?: number | null;
  rows: PricesRow[];
}

export interface GenerateCommandOptions {
  generator: 'combinator' | 'syllables' | 'hacks' | 'mutations' | 'themes';
  roots?: string[];
  affixes?: string[];
  mode?: 'prefix' | 'suffix' | 'both';
  count?: number;
  seed?: number;
  theme?: string;
  tlds?: string[];
}

export interface GenerateOutcome {
  command: 'generate';
  generator: string;
  names: string[];
  domains: string[];
}

export interface FindCommandOptions {
  seedName: string;
  budget?: number;
  currency?: CliCurrency;
  rates?: Partial<CliRates>;
  tlds?: string[];
  maxChecks?: number;
}

export interface FindRow extends CheckRow {
  withinBudget: boolean;
}

export interface FindOutcome {
  limitations?: string[];
  command: 'find';
  seedName: string;
  budgetUsdCents: number | null;
  checked: number;
  available: FindRow[];
}

export interface TldsCommandOptions {
  infra?: string;
}

export interface TldsZone {
  tld: string;
  infra: string;
  trust: 'high' | 'low';
}

export interface TldsOutcome {
  command: 'tlds';
  source: 'bundled' | 'fresh';
  bootstrapMerged: boolean;
  count: number;
  tlds: TldsZone[];
}

export interface DropsCommandOptions {
  query?: string;
  tld?: string;
  limit?: number;
}

export interface DropsOutcome {
  command: 'drops';
  generatedAt: string;
  source: string;
  total: number;
  domains: string[];
}

export interface PriceTrendsCommandOptions {
  tlds?: string[];
  query?: string;
}

export interface PriceTrendEntry {
  pct: number | null;
  dir: 'up' | 'down' | 'flat' | null;
}

export interface PriceTrendsOutcome {
  command: 'price_trends';
  trends: Record<string, PriceTrendEntry>;
}

export interface WatchCommandOptions {
  domains: string[];
  tlds?: string[];
  currency?: CliCurrency;
  rates?: Partial<CliRates>;
  withPrices?: boolean;
  /** Poll interval in seconds (default 300, floor 5). */
  intervalSec?: number;
  /** Max polling rounds; 0 or omitted means unlimited. */
  rounds?: number;
}

export interface FlipEvent {
  domain: string;
  from: CheckStatus;
  to: CheckStatus;
  round: number;
}

export interface WatchOutcome {
  command: 'watch';
  rounds: number;
  flips: FlipEvent[];
  statuses: Record<string, CheckStatus>;
  stopped: 'flip' | 'rounds' | 'interrupted';
}
