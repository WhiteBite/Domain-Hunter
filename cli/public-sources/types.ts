export const PUBLIC_SOURCE_IDS = ['dotsweep', 'domainee', 'digmyname'] as const;
export type PublicSourceId = (typeof PUBLIC_SOURCE_IDS)[number];
export type SignalStatus = 'possibly_available' | 'unavailable' | 'unknown';
export interface StandardPrice {
  kind: 'standard_tld';
  currency: 'USD';
  registrationCents: number | null;
  renewalCents: number | null;
  firstPaymentCents: number | null;
  minimumTermYears: number | null;
  registrar: string | null;
  transferCents?: number | null;
  promoFirstYear?: boolean | null;
}
export interface PublicSignal {
  domain: string;
  status: SignalStatus;
  /** The provider's claim, not an independently verified fact. */
  providerStatus: string | null;
  confidence: string | null;
  method: string | null;
  premium: boolean | null;
  standardPrice: StandardPrice | null;
  /** Additional third-party standard TLD prices; not domain-specific quotes. */
  standardPrices: StandardPrice[];
  links: string[];
  /** When this process received the response; provider may serve a cache. */
  fetchedAt: string;
  /** Provider does not reliably expose when its underlying data was observed. */
  observedAt: null;
  fromCache: boolean;
}
export type RequestStatus = 'ok' | 'partial' | 'failed' | 'rate_limited' | 'quota_exhausted' | 'busy' | 'coordination_error';
export interface PublicSourceResult {
  source: PublicSourceId;
  status: RequestStatus;
  signals: PublicSignal[];
  /** Domains with no valid response, never inferred as available or taken. */
  unresolved: string[];
  retryAfterSeconds: number | null;
}
export interface PublicSourceDescriptor {
  id: PublicSourceId;
  operation: 'availability_signal';
  documentationUrl: string;
  endpointUrl: string;
  batchSize: number;
  /** Conservative local request pacing, not the provider's complete shared-IP quota. */
  minIntervalMs: number;
  localDailyCap: number | null;
  limitations: string[];
}
