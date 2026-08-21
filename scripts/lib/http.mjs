/**
 * Shared HTTP + JSON I/O helpers for CI scripts. No external dependencies.
 * Node >=20 (uses global fetch, AbortController, node:fs/promises).
 */
import { readFile, writeFile } from 'node:fs/promises';

/** Common desktop User-Agent for scraper-style HTTP requests. */
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * fetch with AbortController-based timeout. Returns the Response object;
 * callers inspect res.ok / res.status themselves. On timeout or network
 * error, throws an Error whose message includes the url.
 *
 * Named options: timeoutMs, headers, redirect. Any other fetch options
 * (method, body, …) pass through via rest.
 *
 * @param {string} url
 * @param {{timeoutMs?: number, headers?: Record<string, string>, redirect?: RequestRedirect, [k: string]: unknown}} [opts]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, { timeoutMs = 10_000, headers, redirect, ...rest } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      ...(headers ? { headers } : {}),
      ...(redirect ? { redirect } : {}),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new Error(`fetch ${url} failed: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetchWithTimeout with retry. On failure, sleeps backoffMs*(attempt+1) and
 * retries up to `retries` times (so retries=2 means 3 total attempts).
 * Throws the last error after retries are exhausted.
 *
 * @param {string} url
 * @param {Parameters<typeof fetchWithTimeout>[1]} [opts]
 * @param {{retries?: number, backoffMs?: number}} [retryOpts]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, opts, { retries = 2, backoffMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, opts);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

/** Read a file and JSON.parse its contents. */
export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Write data as JSON + trailing newline. indent > 0 enables pretty-print. */
export async function writeJson(path, data, indent = 0) {
  const text = JSON.stringify(data, null, indent);
  await writeFile(path, text + '\n', 'utf8');
}
