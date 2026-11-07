import type { PriceEntry } from '../../src/types';

/** Public metadata only: never include credentials, account identifiers or authenticated URLs. */
export interface SourceDescriptor {
  id: string;
  name: string;
  operation: 'standard_tld_prices';
  mode: 'explicit';
  auth: 'local_key' | 'none';
  credentialTransport: 'query' | 'header' | 'body' | 'none';
  documentationUrl: string;
  sourceUrl: string;
  completeness: 'complete' | 'unknown';
  cacheTtlMs: number;
  minIntervalMs: number;
  maxConcurrency: 1;
  limitations: string[];
}

export interface SourcePreparedRequest {
  /** Opaque digest; never include a key, account name or other credential here. */
  cacheIdentity: string;
  run(): Promise<Record<string, PriceEntry>>;
}

/** Read-only, opt-in standard TLD-price adapter. Domain quotes must use a separate contract. */
export interface PriceSourceAdapter {
  descriptor: SourceDescriptor;
  prepare(): SourcePreparedRequest | null;
}

export type SourceLoadResult =
  | { status: 'ok'; prices: Record<string, PriceEntry>; observedAt: string; fromCache: boolean }
  | { status: 'missing_key' | 'failed' | 'unsupported' | 'busy'; prices: null; observedAt: null; fromCache: false };

export interface PriceSourceService {
  list(): SourceDescriptor[];
  load(id: string): Promise<SourceLoadResult>;
}

export interface SourceOverlay {
  zones: Set<string>;
  observedAt: string;
  sourceUrl: string;
}
