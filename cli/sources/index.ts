import { dynadotSource } from './dynadot';
import { createPriceSourceService } from './service';
import type { PriceSourceService } from './types';

// Keep this allowlist and the registry together. Unsupported APIs are never advertised.
export const PRICE_SOURCE_IDS = ['dynadot'] as const;
export function createDefaultPriceSourceService(fetchImpl?: typeof fetch): PriceSourceService {
  return createPriceSourceService([dynadotSource(fetchImpl)]);
}
