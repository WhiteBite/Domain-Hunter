/**
 * Pricing response fixtures for E2E mocks.
 *
 * Field names match what src/pricing/pricing.ts parses:
 *   - Porkbun: { status, pricing: { tld: { registration, renewal, transfer, coupons? } } }
 *     Prices are decimal strings. Coupons: { code, first_year_only, type, amount }.
 *   - Cloudflare (cfdomainpricing.com): { tld: { registration, renewal } }
 *     Prices are numbers.
 *
 * The internal PricingTable (src/types.ts) stores prices as integer USD cents.
 */
import type { Coupon, PriceEntry, PricingTable } from '../../../src/types';

// ---- Raw Porkbun API response (what the network returns) ----

export interface PorkbunCoupon {
  code: string;
  first_year_only: 'true' | 'false';
  type: 'amount' | 'percentage';
  /** Decimal USD string (e.g. '0.95' = $0.95). */
  amount: string;
}

export interface PorkbunTldEntry {
  /** Decimal USD string (e.g. '11.68' = $11.68). */
  registration: string;
  renewal: string;
  transfer: string | null;
  coupons?: PorkbunCoupon[];
}

export interface PorkbunResponse {
  status: 'SUCCESS';
  pricing: Record<string, PorkbunTldEntry>;
}

/**
 * Raw Porkbun /api/json/v3/pricing/get response covering the TLD set
 * used in E2E tests. Prices are USD decimal strings (as Porkbun returns).
 */
export function porkbunPricing(): PorkbunResponse {
  return {
    status: 'SUCCESS',
    pricing: {
      com: {
        registration: '11.68',
        renewal: '11.68',
        transfer: '11.68',
        coupons: [
          { code: 'AWESOME2026', first_year_only: 'true', type: 'amount', amount: '0.95' },
        ],
      },
      net: {
        registration: '12.87',
        renewal: '12.87',
        transfer: '12.87',
      },
      io: {
        registration: '45.87',
        renewal: '45.87',
        transfer: '45.87',
      },
      dev: {
        registration: '8.75',
        renewal: '12.87',
        transfer: '12.87',
      },
      xyz: {
        registration: '2.04',
        renewal: '12.98',
        transfer: '12.98',
        coupons: [
          { code: 'XYZDEAL', first_year_only: 'true', type: 'percentage', amount: '50' },
        ],
      },
      ai: {
        registration: '82.70',
        renewal: '82.70',
        transfer: null,
      },
      de: {
        registration: '5.04',
        renewal: '5.04',
        transfer: '5.04',
      },
      co: {
        registration: '20.87',
        renewal: '20.87',
        transfer: '20.87',
      },
    },
  };
}

// ---- Raw cfdomainpricing.com response ----

export interface CloudflareTldEntry {
  /** USD number (e.g. 10.44 = $10.44). */
  registration: number;
  renewal: number;
}

export type CloudflareResponse = Record<string, CloudflareTldEntry>;

/**
 * Raw cfdomainpricing.com /prices.json response for the same TLD set.
 * Prices are USD numbers (as cfdomainpricing returns).
 */
export function cloudflarePricing(): CloudflareResponse {
  return {
    com: { registration: 10.44, renewal: 10.44 },
    net: { registration: 11.04, renewal: 11.04 },
    io: { registration: 38.0, renewal: 38.0 },
    dev: { registration: 10.44, renewal: 12.25 },
    xyz: { registration: 10.44, renewal: 10.44 },
    ai: { registration: 70.0, renewal: 70.0 },
    de: { registration: 5.04, renewal: 5.04 },
    co: { registration: 20.0, renewal: 20.0 },
  };
}

// ---- Internal merged PricingTable (for seeding localStorage) ----

/** localStorage cache shape for dh:v1:pricing (matches pricing.ts CachedPricing). */
export interface SeedPricing {
  table: PricingTable;
  fetchedAt: number;
}

/**
 * The app's internal merged pricing table — both Porkbun and Cloudflare
 * normalized into USD cents. Suitable for seeding localStorage via the
 * setup helper (JSON.stringify → dh:v1:pricing). fetchedAt is fresh.
 */
export function seedPricingTable(): SeedPricing {
  const tlds: Record<string, Record<string, PriceEntry>> = {
    com: {
      porkbun: { reg: 1168, renew: 1168, transfer: 1168 },
      cloudflare: { reg: 1044, renew: 1044, transfer: null },
    },
    net: {
      porkbun: { reg: 1287, renew: 1287, transfer: 1287 },
      cloudflare: { reg: 1104, renew: 1104, transfer: null },
    },
    io: {
      porkbun: { reg: 4587, renew: 4587, transfer: 4587 },
      cloudflare: { reg: 3800, renew: 3800, transfer: null },
    },
    dev: {
      porkbun: { reg: 875, renew: 1287, transfer: 1287 },
      cloudflare: { reg: 1044, renew: 1225, transfer: null },
    },
    xyz: {
      porkbun: { reg: 204, renew: 1298, transfer: 1298 },
      cloudflare: { reg: 1044, renew: 1044, transfer: null },
    },
    ai: {
      porkbun: { reg: 8270, renew: 8270, transfer: null },
      cloudflare: { reg: 7000, renew: 7000, transfer: null },
    },
    de: {
      porkbun: { reg: 504, renew: 504, transfer: 504 },
      cloudflare: { reg: 504, renew: 504, transfer: null },
    },
    co: {
      porkbun: { reg: 2087, renew: 2087, transfer: 2087 },
      cloudflare: { reg: 2000, renew: 2000, transfer: null },
    },
  };

  const coupons: Record<string, Coupon[]> = {
    com: [{ code: 'AWESOME2026', firstYearOnly: true, type: 'amount', amount: 95 }],
    xyz: [{ code: 'XYZDEAL', firstYearOnly: true, type: 'percentage', amount: 50 }],
  };

  const table: PricingTable = {
    generatedAt: '2026-08-18T00:00:00.000Z',
    sources: ['porkbun', 'cloudflare'],
    tlds,
    coupons,
  };

  return { table, fetchedAt: Date.now() };
}
