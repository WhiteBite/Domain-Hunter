/**
 * RDAP response factories for E2E mocks.
 *
 * The app (src/core/rdap-client.ts) only inspects `resp.status` and
 * `resp.headers.get('retry-after')` — it never parses the body for
 * availability decisions. The 200 body just needs to be valid JSON.
 * See SPEC §7 for the status interpretation matrix.
 *
 * These return plain objects ready to be handed to Playwright's
 * `route.fulfill()` (the helpers in tests/e2e/helpers/mocks.ts wrap them).
 */

/** Minimal valid RDAP 200 response body (RFC 7483 objectClassName=domain). */
export interface RdapDomainBody {
  objectClassName: 'domain';
  ldhName: string;
  handle: string;
  status: string[];
  events: { eventAction: string; eventDate: string }[];
}

/** Shape consumed by page.route('…', route => route.fulfill(resp)). */
export interface RdapMockResponse {
  status: 200 | 404 | 429 | 500 | 503;
  body?: object;
  headers?: Record<string, string>;
}

/** RDAP 200 — domain is registered. Body is minimal valid RDAP JSON. */
export function rdapTaken(domain: string): RdapMockResponse {
  const body: RdapDomainBody = {
    objectClassName: 'domain',
    ldhName: domain,
    handle: domain,
    status: ['clientTransferProhibited'],
    events: [
      { eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' },
      { eventAction: 'last changed', eventDate: '2026-01-01T00:00:00Z' },
    ],
  };
  return { status: 200, body };
}

/** RDAP 404 — domain not found in registry (availability depends on trust level). */
export function rdapFree(): RdapMockResponse {
  return { status: 404 };
}

/** RDAP 429 — rate limited; honor Retry-After (seconds). */
export function rdapThrottled(retryAfterSec = 1): RdapMockResponse {
  return {
    status: 429,
    headers: { 'retry-after': String(retryAfterSec) },
  };
}

/** RDAP 5xx — server error. */
export function rdapError(code: 500 | 503 = 500): RdapMockResponse {
  return { status: code };
}
