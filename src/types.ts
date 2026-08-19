/**
 * Domain Hunter v2 — shared contracts.
 * Single source of truth: every module imports types from here (SPEC §5).
 */

export type CheckStatus = 'available' | 'taken' | 'probably_available' | 'unknown' | 'error';
export type ResultSource = 'rdap' | 'doh' | 'cache';

export interface InfraConfig {
  id: string;
  /** RDAP base URL; may contain a '{tld}' placeholder. */
  rdapBase: string;
  /** Base pause between requests to this infra (AIMD adjusts at runtime). */
  minPauseMs: number;
  /** Max in-flight requests to this infra. */
  maxParallel: number;
  /** high = RDAP 404 reliably means "not registered" (ICANN-conformant gTLD infra). */
  trust: 'high' | 'low';
}

export interface TldFlags {
  experimental?: boolean;
  /** Minimum registration period in years (e.g. .ai = 2). */
  minYears?: number;
  /** Dictionary words in this zone are often registry-premium. */
  premiumLikely?: boolean;
  /** i18n key suffix for a reputation caution (spam-filter note). */
  reputationNote?: string;
  /** Participates in TLD-hack generation. */
  hackable?: boolean;
}

export interface TldConfig {
  tld: string;
  /** Key into TldRegistry.infras. */
  infra: string;
  /** Stealth override of the infra rdapBase. */
  rdapBase?: string;
  /** Overrides infra trust level. */
  trust?: 'high' | 'low';
  flags?: TldFlags;
}

export interface TldRegistry {
  infras: Record<string, InfraConfig>;
  tlds: TldConfig[];
  /** Subset of TLD strings used by the TLD-hack generator. */
  hackTlds: string[];
}

export interface CheckResult {
  /** Full ASCII domain, e.g. "myapp.dev". */
  domain: string;
  tld: string;
  status: CheckStatus;
  source: ResultSource;
  checkedAt: number;
  latencyMs?: number;
  note?: string;
}

// ---- Worker protocol (postMessage) ----

export interface EngineOptions {
  registry: TldRegistry;
  /** Optional CORS proxy base URL (user-deployed Cloudflare Worker). */
  proxyUrl?: string;
  fetchTimeoutMs?: number;
  maxRetries?: number;
  /** Global max in-flight checks (user setting). */
  concurrency?: number;
}

export type EngineCommand =
  | { type: 'start'; candidates: string[]; options: EngineOptions }
  | { type: 'stop' };

export type EngineEvent =
  | { type: 'result'; result: CheckResult }
  | { type: 'batch'; results: CheckResult[] }
  | { type: 'progress'; done: number; total: number; available: number; errors: number }
  | {
      type: 'finished';
      done: number;
      total: number;
      available: number;
      errors: number;
      aborted: boolean;
    }
  | { type: 'log'; level: 'info' | 'warn'; message: string };

// ---- Pricing ----

/** Prices are USD cents. null = unknown. */
export interface PriceEntry {
  reg: number | null;
  renew: number | null;
  transfer: number | null;
}

export interface Coupon {
  code: string;
  firstYearOnly: boolean;
  type: 'amount' | 'percentage';
  /** USD cents for 'amount', whole percent for 'percentage'. */
  amount: number;
}

export interface PricingTable {
  generatedAt: string;
  /** e.g. ['porkbun','cloudflare'] or ['snapshot']. */
  sources: string[];
  /** tld -> registrarId -> entry. */
  tlds: Record<string, Record<string, PriceEntry>>;
  /** tld -> active coupons (from Porkbun). */
  coupons: Record<string, Coupon[]>;
}

export interface RegistrarConfig {
  id: string;
  name: string;
  /** Search URL template with a '{domain}' placeholder. */
  searchUrl: string;
  affiliate?: { program: string; viable: boolean; note?: string };
}

// ---- Settings (persisted at dh:v1:settings) ----

/** Supported UI locales. Keep in sync with src/i18n/ dictionary files. */
export type Locale = 'en' | 'ru' | 'es' | 'de' | 'pt' | 'zh' | 'ja' | 'fr';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  lang: Locale;
  currency: 'USD' | 'RUB' | 'EUR';
  /** Units per 1 USD. */
  rates: { RUB: number; EUR: number };
  /** Global max in-flight checks. */
  concurrency: number;
  cacheTtlHours: number;
  proxyUrl: string;
  /** Optional user-provided GitHub token (PAT/device flow), stored locally only. */
  githubToken: string;
  defaultTlds: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  lang: 'en',
  currency: 'USD',
  rates: { RUB: 97, EUR: 0.92 },
  concurrency: 6,
  cacheTtlHours: 12,
  proxyUrl: '',
  githubToken: '',
  defaultTlds: [
    'com',
    'net',
    'dev',
    'app',
    'io',
    'ai',
    'xyz',
    'me',
    'info',
    'pro',
    'tech',
    'site',
    'online',
    'cloud',
    'page',
  ],
};

// ---- Generator candidate tray (persists across tab switches) ----

export type CandidateSource =
  | 'combinator'
  | 'mutations'
  | 'hacks'
  | 'syllables'
  | 'themes'
  | 'sets';

export interface Candidate {
  n: string;
  src: CandidateSource;
}

// ---- Cache entry (dh:v1:cache) ----

export interface CacheEntry {
  status: CheckStatus;
  source: ResultSource;
  ts: number;
  tld: string;
}

// ---- Resume snapshot (dh:v1:run) ----

export interface RunSnapshot {
  pending: string[];
  tlds: string[];
  ignoreCache: boolean;
  ts: number;
}

// ---- History entry (dh:v1:history) ----

export interface HistoryCounts {
  total: number;
  available: number;
  taken: number;
  problems: number;
}

export interface HistoryEntry {
  ts: number;
  /** Raw textarea content, trimmed and length-capped. */
  query: string;
  tlds: string[];
  counts: HistoryCounts;
  /** Raw textarea content (untrimmed, up to 60000 chars). Omitted on legacy entries. */
  input?: string;
}
