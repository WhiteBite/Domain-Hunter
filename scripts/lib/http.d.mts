/**
 * Type declarations for lib/http.mjs — used by tests/lib-http.test.ts.
 * The actual implementation lives in scripts/lib/http.mjs (plain ESM, no TS).
 */

export declare const UA: string;

export interface FetchTimeoutOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  redirect?: RequestRedirect;
  [k: string]: unknown;
}

export interface RetryOptions {
  retries?: number;
  backoffMs?: number;
}

export declare function fetchWithTimeout(url: string, opts?: FetchTimeoutOptions): Promise<Response>;
export declare function fetchWithRetry(
  url: string,
  opts?: FetchTimeoutOptions,
  retryOpts?: RetryOptions,
): Promise<Response>;
export declare function readJson(path: string): Promise<unknown>;
export declare function writeJson(path: string, data: unknown, indent?: number): Promise<void>;
