import type { PricingTable } from '../types';
import { t } from '../i18n';

/** Identify the source of this exact quote, never a different zone of the same seller. */
export function priceSourceLabel(
  table: PricingTable | null, tld: string, registrar: string | null, field: 'reg' | 'renew',
): string {
  if (!table || !registrar || table.tlds[tld]?.[registrar]?.[field] == null) return '';
  const provenance = table.priceProvenance;
  const live = provenance?.liveTlds[registrar]?.includes(tld) ?? false;
  // Legacy caches contain a seller-level success flag but no per-zone information.
  if (!provenance && table.sources.includes(registrar)) return t('price.source.unknown');
  const date = live ? provenance?.observedAt
    : registrar === 'regru' ? table.regruUpdatedAt
    : registrar === 'hostiman' ? table.hostimanUpdatedAt
    : registrar === 'timeweb' ? table.timewebUpdatedAt
    : registrar === 'sprinthost' ? table.sprinthostUpdatedAt
    : registrar === 'webhost1' ? (field === 'renew' ? table.webhost1RenewalUpdatedAt : table.webhost1UpdatedAt)
    : registrar === 'adminvps' ? table.adminvpsUpdatedAt : undefined;
  const day = date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : t('price.source.dateUnknown');
  return t(live ? 'price.source.api' : 'price.source.snapshot', { date: day });
}
