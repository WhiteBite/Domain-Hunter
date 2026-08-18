/**
 * Re-exports all E2E fixture factories and domain lists.
 * Consumed by tests/e2e/helpers/mocks.ts and spec files.
 */

// rdap.ts
export { rdapTaken, rdapFree, rdapThrottled, rdapError } from './rdap';
export type { RdapDomainBody, RdapMockResponse } from './rdap';

// domains.ts
export {
  TAKEN_GTLD,
  FREE_GTLD,
  CC_FREE,
  CC_TAKEN_BY_DOH,
  THROTTLED_DOMAIN,
  ERROR_DOMAIN,
} from './domains';

// pricing.ts
export { porkbunPricing, cloudflarePricing, seedPricingTable } from './pricing';
export type {
  PorkbunResponse,
  PorkbunTldEntry,
  PorkbunCoupon,
  CloudflareResponse,
  CloudflareTldEntry,
  SeedPricing,
} from './pricing';

// iana.ts
export { ianaBootstrap } from './iana';
export type { IanaBootstrapJson } from './iana';

// cache.ts
export { cacheEntries } from './cache';
