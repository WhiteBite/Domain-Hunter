import { createHash } from 'node:crypto';
import { loadRegistrarKeys } from '../keys';
import { fetchDynadotTldPrices } from '../registrar-sources';
import type { PriceSourceAdapter } from './types';

/** The official legacy API; no account validation has been performed. */
export function dynadotSource(fetchImpl?: typeof fetch): PriceSourceAdapter {
  return {
    descriptor: {
      id: 'dynadot', name: 'Dynadot legacy', operation: 'standard_tld_prices', mode: 'explicit',
      auth: 'local_key', credentialTransport: 'query',
      documentationUrl: 'https://www.dynadot.com/domain/api-commands#tld_price',
      sourceUrl: 'https://api.dynadot.com/api3.json', completeness: 'unknown',
      cacheTtlMs: 60_000, minIntervalMs: 1_100, maxConcurrency: 1,
      limitations: [
        'Legacy API scheduled for retirement; credentials are sent in the request URL.',
        'Only one page is fetched. Account access and live responses have not been validated.',
        'Prices are standard TLD estimates, not individual domain or premium quotes.',
      ],
    },
    prepare() {
      const key = loadRegistrarKeys().dynadot;
      if (!key) return null;
      return {
        cacheIdentity: createHash('sha256').update(key).digest('hex'),
        run: () => fetchDynadotTldPrices(key, fetchImpl),
      };
    },
  };
}
