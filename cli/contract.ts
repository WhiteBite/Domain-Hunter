/**
 * CLI contract types — shared between the CLI entry point (cli/main.ts),
 * the command implementations (cli/core.ts), and a future MCP server.
 * Mirrors the browser app's three-state model and pricing units (USD cents).
 */
import type { CheckStatus, ResultSource, TldRegistry } from '../src/types';

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
}

export interface PricesRow {
  tld: string;
  best: { registrarId: string; reg: number | null; renew: number | null } | null;
  tco3UsdCents: number | null;
  promoTrap: boolean;
  entries: Record<string, { reg: number | null; renew: number | null; transfer: number | null }>;
}

export interface PricesOutcome {
  command: 'prices';
  sources: string[];
  fetchedAt: number | null;
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
