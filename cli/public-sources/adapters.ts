import type { PublicSignal, PublicSourceDescriptor, PublicSourceId, StandardPrice } from './types';

export type ParsedSignal = Omit<PublicSignal, 'fetchedAt' | 'observedAt' | 'fromCache'>;
export interface PublicAdapter {
  descriptor: PublicSourceDescriptor;
  request(domains: string[]): { url: string; init: RequestInit };
  parse(json: unknown, domains: string[]): ParsedSignal[];
}

function obj(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function cents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const scaled = value * 100;
  return Number.isSafeInteger(Math.round(scaled)) && Math.abs(scaled - Math.round(scaled)) < 0.00001 ? Math.round(scaled) : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
}
function link(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function term(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
}
function base(domain: string): ParsedSignal {
  return { domain, status: 'unknown', providerStatus: null, confidence: null, method: null, premium: null, standardPrice: null, standardPrices: [], links: [] };
}

const dotsweep: PublicAdapter = {
  descriptor: { id: 'dotsweep', operation: 'availability_signal', documentationUrl: 'https://dotsweep.com/docs/check-batch', endpointUrl: 'https://dotsweep.com/check', batchSize: 10, minIntervalMs: 1000, localDailyCap: null,
    limitations: ['Third-party RDAP/WHOIS/DNS signal; available is not a registration guarantee.', 'Prices are standard TLD estimates, not domain-specific or premium quotes.', 'Provider may return cached data with no observation time; it reports a limit of 120 requests/minute per client.'] },
  request: (domains) => ({ url: 'https://dotsweep.com/check', init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domains }) } }),
  parse(json, domains) {
    const results = obj(json)?.results;
    if (!Array.isArray(results)) throw new Error('invalid response');
    const wanted = new Set(domains);
    const byDomain = new Map<string, ParsedSignal>();
    const duplicates = new Set<string>();
    for (const item of results) {
      const r = obj(item);
      if (!r || typeof r.domain !== 'string' || !wanted.has(r.domain)) continue;
      if (byDomain.has(r.domain)) { duplicates.add(r.domain); continue; }
      const signal = base(r.domain);
      signal.providerStatus = text(r.status);
      signal.confidence = text(r.confidence);
      signal.method = text(r.source);
      const policy = obj(r.policy);
      if (policy?.closed === true) signal.status = 'unavailable';
      else if (r.confidence === 'certain' && (r.source === 'rdap' || r.source === 'whois')) {
        if (r.status === 'available' && r.unused !== true && r.unsold !== true) signal.status = 'possibly_available';
        else if (r.status === 'taken') signal.status = 'unavailable';
      }
      const price = obj(r.price);
      if (policy?.closed !== true && r.unsold !== true && price?.currency === 'USD') {
        const reg = cents(price.registration), renew = cents(price.renewal), first = cents(price.first_payment);
        if (reg != null || renew != null || first != null) signal.standardPrice = {
          kind: 'standard_tld', currency: 'USD', registrationCents: reg, renewalCents: renew, firstPaymentCents: first,
          minimumTermYears: term(price.min_term_years) ?? term(policy?.min_term_years), registrar: text(price.source),
        };
      }
      if (policy?.closed !== true && r.unsold !== true && Array.isArray(r.prices)) {
        const entries = new Map<string, StandardPrice>();
        const duplicates = new Set<string>();
        for (const raw of r.prices.slice(0, 100)) {
          const item = obj(raw), vendor = text(item?.vendor);
          if (!item || !vendor || item.currency !== 'USD') continue;
          if (entries.has(vendor)) { duplicates.add(vendor); continue; }
          const reg = cents(item.registration), renew = cents(item.renewal), transfer = cents(item.transfer), first = cents(item.first_payment);
          if (reg == null && renew == null && transfer == null && first == null) continue;
          entries.set(vendor, { kind: 'standard_tld', currency: 'USD', registrar: vendor, registrationCents: reg,
            renewalCents: renew, transferCents: transfer, firstPaymentCents: first,
            minimumTermYears: term(item.min_term_years) ?? term(policy?.min_term_years),
            promoFirstYear: typeof item.promo_first_year === 'boolean' ? item.promo_first_year : null });
        }
        for (const vendor of duplicates) entries.delete(vendor);
        signal.standardPrices = [...entries.values()];
      }
      if (policy?.closed !== true && r.unsold !== true && Array.isArray(r.buy)) signal.links = r.buy.flatMap((v) => { const l = link(obj(v)?.url); return l ? [l] : []; }).slice(0, 10);
      byDomain.set(r.domain, signal);
    }
    for (const domain of duplicates) byDomain.delete(domain);
    return [...byDomain.values()];
  },
};

const domainee: PublicAdapter = {
  descriptor: { id: 'domainee', operation: 'availability_signal', documentationUrl: 'https://domainee.dev/free-apis/domain-availability-checker', endpointUrl: 'https://api.domainee.dev/v1/tools/domain-availability-checker', batchSize: 1, minIntervalMs: 2500, localDailyCap: 400,
    limitations: ['Provider-reported RDAP positives are preliminary; DNS positives and unsupported TLDs remain unknown.', 'Provider reports 30 requests/minute and 500 requests/day per IP, shared with other clients; no uptime commitment.'] },
  request: ([domain]) => { const [name, ...tld] = domain!.split('.'); const url = new URL('https://api.domainee.dev/v1/tools/domain-availability-checker'); url.searchParams.set('name', name!); url.searchParams.set('tlds', tld.join('.')); return { url: url.href, init: { method: 'GET' } }; },
  parse(json, domains) {
    const root = obj(json), data = obj(root?.data);
    const domain = domains[0]!; const [name, ...suffix] = domain.split('.');
    const providerError = obj(root?.error);
    if (root?.ok === false && providerError?.code === 'availability_check_failed' &&
        typeof providerError.message === 'string' && providerError.message.startsWith('Invalid TLD(s):')) {
      return [{ ...base(domain), providerStatus: 'unsupported' }];
    }
    if (root?.ok !== true || !data || data.name !== name || !Array.isArray(data.results)) throw new Error('invalid response');
    const matched = data.results.map(obj).filter((r) => r?.tld === suffix.join('.'));
    if (matched.length !== 1 || typeof matched[0]?.available !== 'boolean' ||
        (matched[0].fqdn !== undefined && matched[0].fqdn !== domain)) return [];
    const signal = base(domain);
    signal.method = matched[0].method === 'rdap' || matched[0].method === 'dns' ? matched[0].method : null;
    signal.providerStatus = matched[0].available ? 'available' : 'unavailable';
    signal.status = matched[0].available ? (signal.method === 'rdap' ? 'possibly_available' : 'unknown') : 'unavailable';
    return [signal];
  },
};

const digmyname: PublicAdapter = {
  descriptor: { id: 'digmyname', operation: 'availability_signal', documentationUrl: 'https://digmyname.com/api', endpointUrl: 'https://api.digmyname.com/functions/v1/public-api/check', batchSize: 1, minIntervalMs: 1500, localDailyCap: 4000,
    limitations: ['Third-party signal; uncertain answers remain unknown. Standard-tier prices are not premium quotes.', 'Provider reports 60 requests/minute and 5000 domains/day per IP, shared with other clients.', 'Please attribute results to https://digmyname.com/.'] },
  request: ([domain]) => { const url = new URL('https://api.digmyname.com/functions/v1/public-api/check'); url.searchParams.set('domain', domain!); return { url: url.href, init: { method: 'GET' } }; },
  parse(json, domains) {
    const r = obj(obj(json)?.result), domain = domains[0]!;
    if (!r || r.domain !== domain) throw new Error('invalid response');
    const signal = base(domain);
    signal.premium = typeof r.premium === 'boolean' ? r.premium : null;
    signal.providerStatus = typeof r.available === 'boolean' ? (r.available ? 'available' : 'unavailable') : null;
    signal.confidence = r.uncertain === true ? 'uncertain' : r.uncertain === false ? 'not_uncertain' : null;
    if (r.uncertain === false && typeof r.available === 'boolean') signal.status = r.available ? 'possibly_available' : 'unavailable';
    const price = cents(r.price_usd);
    if (signal.premium === false && r.likely_premium !== true && price != null) {
      const cheapest = obj(r.cheapest_registrar);
      signal.standardPrice = { kind: 'standard_tld', currency: 'USD', registrationCents: price, renewalCents: null, firstPaymentCents: null, minimumTermYears: null, registrar: text(cheapest?.name) } satisfies StandardPrice;
    }
    signal.links = [...new Set([link(r.buy_url), link(r.search_url), 'https://digmyname.com/'].filter((v): v is string => v != null))];
    return [signal];
  },
};

export const PUBLIC_ADAPTERS: Record<PublicSourceId, PublicAdapter> = { dotsweep, domainee, digmyname };
