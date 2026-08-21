/**
 * Affiliate tagging for registrar buy/search links (SPEC §16). Tags are
 * data-driven via registrars.json (affiliate.param + affiliate.tag); with an
 * empty or absent tag the URL is returned unchanged, so the mechanism stays
 * inert until an ambassador tag is configured. Price data is never affected.
 */
import type { RegistrarConfig } from '../types';

/** Append the registrar's affiliate query pair (if configured) to a URL. */
export function applyAffiliate(registrar: RegistrarConfig, url: string): string {
  const aff = registrar.affiliate;
  if (!aff?.viable || !aff.tag || !aff.param) return url;
  const pair = aff.param.replace('{tag}', encodeURIComponent(aff.tag));
  return `${url}${url.includes('?') ? '&' : '?'}${pair}`;
}
