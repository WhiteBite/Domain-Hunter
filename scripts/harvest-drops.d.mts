/**
 * Type declarations for harvest-drops.mjs — used by tests/drops-harvest.test.ts.
 * The actual implementation lives in scripts/harvest-drops.mjs (plain ESM, no TS).
 */

interface DroppedDomain {
  d: string;
  tld: string;
}

export declare function normalizeDropsCsv(text: string, maxDomains?: number): DroppedDomain[];
