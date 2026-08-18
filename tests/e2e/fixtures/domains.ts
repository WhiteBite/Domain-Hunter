/**
 * Deterministic domain lists for E2E test scenarios.
 *
 * TLD trust levels are from src/config/tlds.json:
 *   - com  → verisign          (trust: high)
 *   - dev  → google             (trust: high)
 *   - io   → identity-digital   (trust: high)
 *   - app  → google             (trust: high)
 *   - xyz  → centralnic         (trust: high)
 *   - de   → denic              (trust: low)
 *   - co   → registry-co        (trust: low)
 *   - uk   → nominet            (trust: low)
 *
 * Three-state model (SPEC §7):
 *   - High-trust 404                    → 'available'
 *   - Low-trust 404 + DoH NXDOMAIN      → 'probably_available'
 *   - Low-trust 404 + DoH NOERROR       → 'taken' (by DNS)
 *   - Low-trust 404 + DoH error         → 'unknown'
 */

/** High-trust gTLDs known to be registered — RDAP 200 → 'taken'. */
export const TAKEN_GTLD = [
  'google.com',
  'github.com',
  'notion.dev',
  'example.app',
  'web.io',
] as const;

/** High-trust gTLDs — RDAP 404 → 'available'. */
export const FREE_GTLD = [
  'zzqxtest1.com',
  'zzqxtest1.dev',
  'zzqxtest1.xyz',
  'zzqxtest1.app',
] as const;

/** Low-trust ccTLDs — RDAP 404 + DoH NXDOMAIN → 'probably_available'. */
export const CC_FREE = [
  'zzqxtest1.de',
  'zzqxtest1.co',
  'zzqxtest1.uk',
] as const;

/** Low-trust ccTLD — RDAP 404 + DoH NOERROR → 'taken' (by DNS). */
export const CC_TAKEN_BY_DOH = [
  'dnsalive.de',
] as const;

/** Domain that returns 429 — tests AIMD backoff + Retry-After. */
export const THROTTLED_DOMAIN = 'throttled-example.com';

/** Domain that returns 5xx — tests server-error retry path. */
export const ERROR_DOMAIN = 'error500-example.com';
