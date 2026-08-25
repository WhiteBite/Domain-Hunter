/**
 * CLI contract types — shared between the CLI entry point (cli/main.ts),
 * the command implementations (cli/core.ts), and a future MCP server.
 * Mirrors the browser app's three-state model and pricing units (USD cents).
 */
import type { CheckStatus, ResultSource } from '../src/types';

export interface CliRates {
  RUB: number;
  EUR: number;
}

export type CliCurrency = 'USD' | 'RUB' | 'EUR';

export interface CheckCommandOptions {
  domains: string[];
  tlds?: string[];
  currency?: CliCurrency;
  rates?: CliRates;
  ignoreCache?: boolean;
  withPrices?: boolean;
  cacheTtlHours?: number;
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
}

export interface PricesCommandOptions {
  tlds?: string[];
  query?: string;
  currency?: CliCurrency;
  rates?: CliRates;
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
  rates?: CliRates;
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
