/** Machine-readable origins for CLI/MCP quotes; never dates a snapshot with a load time. */
import { toAscii } from '../src/core/idn';
import type { PricingTable } from '../src/types';
import type { SourceOverlay } from './sources/types';

export type PriceField = 'reg' | 'renew' | 'transfer';
export interface QuoteOrigin {
  kind: 'api' | 'snapshot' | 'unknown';
  /** The observation/collection time for this exact seller and field, if known. */
  observedAt: string | null;
  /** Public feeds share a recorded batch completion time, not individual fetch times. */
  batchObservedAt?: string | null;
  /** Only keyless endpoint URLs are returned; never a credential-bearing URL. */
  sourceUrl: string | null;
}

function validDate(value: string | null | undefined): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

export function snapshotOrigin(date: string | null | undefined): QuoteOrigin {
  return { kind: 'snapshot', observedAt: validDate(date), sourceUrl: null };
}

export function quoteOrigin(
  table: PricingTable,
  zone: string,
  seller: string,
  field: PriceField,
  overlays?: Record<string, SourceOverlay>,
): QuoteOrigin | null {
  if (table.tlds[zone]?.[seller]?.[field] == null) return null;
  const asciiZone = toAscii(zone);
  const overlay = overlays?.[seller];
  if (overlay?.zones.has(asciiZone)) {
    return { kind: 'api', observedAt: validDate(overlay.observedAt), sourceUrl: overlay.sourceUrl };
  }
  const provenance = table.priceProvenance;
  if (provenance?.liveTlds[seller]?.some((item) => toAscii(item) === asciiZone)) {
    const url = seller === 'porkbun' ? 'https://api.porkbun.com/api/json/v3/pricing/get'
      : seller === 'cloudflare' ? 'https://cfdomainpricing.com/prices.json' : null;
    return { kind: 'api', observedAt: null, batchObservedAt: validDate(provenance.observedAt), sourceUrl: url };
  }
  // Old caches had seller-level flags, not a zone-level record of what was fetched.
  if (!provenance && table.sources.includes(seller)) {
    return { kind: 'unknown', observedAt: null, sourceUrl: null };
  }
  const snapshotDate = seller === 'regru' ? table.regruUpdatedAt
    : seller === 'hostiman' ? table.hostimanUpdatedAt
    : seller === 'timeweb' ? table.timewebUpdatedAt
    : seller === 'sprinthost' ? table.sprinthostUpdatedAt
    : seller === 'webhost1' ? (field === 'renew' ? table.webhost1RenewalUpdatedAt : table.webhost1UpdatedAt)
    : seller === 'adminvps' ? table.adminvpsUpdatedAt : null;
  return snapshotOrigin(snapshotDate);
}
