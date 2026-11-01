/**
 * Type declarations for harvest-prices.mjs — used by tests/harvest-parsers.test.ts.
 * The actual implementations live in scripts/harvest-prices.mjs (plain ESM, no TS).
 */

interface PriceEntry {
  reg: number | null;
  renew: number | null;
  transfer: number | null;
}

interface ParsedPricing {
  tlds: Record<string, Record<string, PriceEntry>>;
  coupons: Record<string, unknown[]>;
  timewebRenewalFromRub?: Record<string, number>;
  sourceRub?: Record<string, Record<string, [number | null, number | null]>>;
}

interface CompactSnapshot {
  tlds?: Record<string, Record<string, unknown>>;
  coupons?: Record<string, unknown[]>;
}

export declare function toCents(value: string | number | null | undefined): number | null;
export declare function normalizeRegru(html: string): ParsedPricing;
export declare function fetchRegru(fetcher?: (url: string, opts: { timeoutMs: number; headers: Record<string, string> }, retries: { retries: number }) => Promise<Response>): Promise<ParsedPricing>;
export declare function normalizeHostiman(html: string, rubToUsd?: number): ParsedPricing;
export declare function fetchHostiman(fetcher?: (url: string, opts: { timeoutMs: number; headers: Record<string, string> }, retries: { retries: number }) => Promise<Response>): Promise<ParsedPricing>;
export declare function normalizeBeget(html: string): ParsedPricing;
export declare function normalizeDynadotHtml(html: string): ParsedPricing;
export declare function normalizeSpaceship(html: string): ParsedPricing;
export declare function mergePricing(target: ParsedPricing, src: ParsedPricing): void;
export declare function replaceRegistrar(target: ParsedPricing, fresh: ParsedPricing, registrarId: string): void;
export declare function expandCompactSnapshot(raw: CompactSnapshot): ParsedPricing;
export declare function readPrevious(path: string): Promise<ParsedPricing | null>;
export declare function dedupeCoupons(coupons: Record<string, unknown[]>): Record<string, unknown[]>;

export declare function applySuccessfulSource(target: ParsedPricing, fresh: ParsedPricing, name: string): void;
export declare function sourceUpdatedAt(sources: string[], previous: unknown, name: string, now?: string): string | null;
export declare function normalizeWebhost1Observed(rows: unknown, rubToUsd?: number): ParsedPricing;
export declare function normalizeSprinthostAnnual(html: string, rubToUsd?: number): ParsedPricing;
export declare function normalizeSprinthost(html: string, rubToUsd?: number): ParsedPricing;
export declare function normalizeTimeweb(html: string, rubToUsd?: number): ParsedPricing;
export declare function fetchTimeweb(fetcher?: (url: string, opts: { timeoutMs: number; headers: Record<string, string> }, retries: { retries: number }) => Promise<Response>): Promise<ParsedPricing>;

export declare function mergeSourceRub(previous: ParsedPricing["sourceRub"], successful: Record<string, ParsedPricing>): NonNullable<ParsedPricing["sourceRub"]>;
