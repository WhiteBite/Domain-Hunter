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
}

interface CompactSnapshot {
  tlds?: Record<string, Record<string, unknown>>;
  coupons?: Record<string, unknown[]>;
}

export declare function toCents(value: string | number | null | undefined): number | null;
export declare function normalizeRegru(html: string): ParsedPricing;
export declare function normalizeBeget(html: string): ParsedPricing;
export declare function normalizeDynadotHtml(html: string): ParsedPricing;
export declare function normalizeSpaceship(html: string): ParsedPricing;
export declare function mergePricing(target: ParsedPricing, src: ParsedPricing): void;
export declare function expandCompactSnapshot(raw: CompactSnapshot): ParsedPricing;
export declare function readPrevious(path: string): Promise<ParsedPricing | null>;
export declare function dedupeCoupons(coupons: Record<string, unknown[]>): Record<string, unknown[]>;
