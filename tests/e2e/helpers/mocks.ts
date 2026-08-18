/**
 * E2E network mocks — deterministic, offline. Every runtime endpoint is
 * intercepted via page.route(); no real network is ever reached.
 *
 * Endpoint classes (from source audit):
 *   1. RDAP — 18 unique bases in src/config/tlds.json infras
 *   2. IANA bootstrap — https://data.iana.org/rdap/dns.json
 *   3. DoH — cloudflare-dns.com/dns-query + dns.google/resolve (?name=&type=NS)
 *   4. Porkbun pricing — POST api.porkbun.com/api/json/v3/pricing/get
 *   5. Cloudflare pricing — GET cfdomainpricing.com/prices.json
 *   6. DigMyName — GET api.digmyname.com/functions/v1/public-api/check?domain=
 *   7. GitHub — api.github.com/user (auth) + api.github.com/users/{n} (social)
 *   8. TikTok oembed — www.tiktok.com/oembed (social)
 *   9. Social profile links — github.com, x.com, youtube.com, instagram.com, reddit.com
 *
 * Route precedence: Playwright matches routes in registration order (first
 * registered = first checked). assertNoNetworkLeaks() registers a catch-all
 * FIRST; for allowlisted URLs it calls route.fallback() to defer to specific
 * mocks registered later. Non-allowlisted URLs are aborted and recorded.
 */
import type { Page, Route } from '@playwright/test';
import tldsJson from '../../../src/config/tlds.json' with { type: 'json' };
import type { TldRegistry } from '../../../src/types';

// ---- RDAP base collection ----

const REGISTRY = tldsJson as unknown as TldRegistry;

/** All unique RDAP base URLs from tlds.json (infras + tld-level overrides). */
function collectRdapBases(): string[] {
  const bases = new Set<string>();
  for (const infra of Object.values(REGISTRY.infras)) {
    bases.add(infra.rdapBase);
  }
  for (const tld of REGISTRY.tlds) {
    if (tld.rdapBase) bases.add(tld.rdapBase);
  }
  return [...bases];
}

const RDAP_BASES = collectRdapBases();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a RegExp matching any RDAP URL from any base in tlds.json. */
function buildRdapRegex(): RegExp {
  const patterns = RDAP_BASES.map((base) => {
    const escaped = escapeRegex(base);
    const withTld = escaped.replace('\\{tld\\}', '[^/]+');
    // Base ends with '/' and the domain (last path segment) is appended.
    return withTld + '[^/]+';
  });
  return new RegExp('^(?:' + patterns.join('|') + ')$');
}

/** Extract the domain (last path segment) from an RDAP URL. */
function extractDomainFromRdapUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

// ---- CORS helper ----

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

// ---- mockRdap ----

export interface RdapRule {
  domain: string;
  response: {
    status: 200 | 404 | 429 | 500 | 503;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
}

/**
 * Route every RDAP base from tlds.json. Match the domain from the URL path
 * (last segment after /domain/). Unmatched domain → 404.
 */
export async function mockRdap(page: Page, rules: RdapRule[]): Promise<void> {
  const ruleMap = new Map(rules.map((r) => [r.domain, r]));
  const rdapRegex = buildRdapRegex();
  await page.route(rdapRegex, async (route: Route) => {
    const url = route.request().url();
    const domain = extractDomainFromRdapUrl(url);
    if (!domain) {
      await route.fulfill({ status: 404, headers: CORS_HEADERS });
      return;
    }
    const rule = ruleMap.get(domain);
    if (!rule) {
      await route.fulfill({ status: 404, headers: CORS_HEADERS });
      return;
    }
    const headers: Record<string, string> = {
      ...CORS_HEADERS,
      'Content-Type': 'application/rdap+json',
      ...rule.response.headers,
    };
    await route.fulfill({
      status: rule.response.status,
      headers,
      body: rule.response.body ? JSON.stringify(rule.response.body) : '',
    });
  });
}

// ---- mockDoh ----

export type DohOutcome = 'nxdomain' | 'noerror' | 'error';

/**
 * Route both DoH providers (cloudflare-dns.com + dns.google).
 * Parse the `name` query param; respond with { Status: 3|0|2 } JSON.
 * 'error' outcome → HTTP 500 (so !resp.ok triggers in doh.ts).
 */
export async function mockDoh(
  page: Page,
  outcomes: Record<string, DohOutcome>,
): Promise<void> {
  const handler = async (route: Route): Promise<void> => {
    const reqUrl = route.request().url();
    const u = new URL(reqUrl);
    const domain = u.searchParams.get('name');
    if (!domain) {
      await route.fulfill({
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/dns-json' },
        body: '',
      });
      return;
    }
    const outcome = outcomes[domain];
    if (!outcome) {
      // No rule → SERVFAIL (Status 2 → doh.ts tries the next resolver)
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/dns-json' },
        body: JSON.stringify({ Status: 2 }),
      });
      return;
    }
    if (outcome === 'error') {
      await route.fulfill({ status: 500, headers: CORS_HEADERS });
      return;
    }
    const status = outcome === 'nxdomain' ? 3 : 0;
    const body: Record<string, unknown> = { Status: status };
    if (outcome === 'noerror') {
      // Minimal Answer array (doh.ts only checks Status, but include for realism)
      body.Answer = [{ name: domain, type: 2, TTL: 3600, data: 'ns1.example.com' }];
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/dns-json' },
      body: JSON.stringify(body),
    });
  };
  await page.route(/https:\/\/cloudflare-dns\.com\/dns-query/, handler);
  await page.route(/https:\/\/dns\.google\/resolve/, handler);
}

// ---- mockBootstrap ----

/**
 * Route the IANA bootstrap URL. null → abort (simulate network failure).
 * Non-null → fulfill with the JSON payload.
 */
export async function mockBootstrap(
  page: Page,
  services: unknown,
): Promise<void> {
  await page.route('https://data.iana.org/rdap/dns.json', async (route: Route) => {
    if (services === null) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(services),
    });
  });
}

// ---- mockPorkbun ----

/**
 * Route the Porkbun pricing POST. null → abort.
 * Non-null → fulfill with { pricing: pricing } (the shape pricing.ts expects).
 */
export async function mockPorkbun(
  page: Page,
  pricing: Record<string, unknown> | null,
): Promise<void> {
  await page.route(
    'https://api.porkbun.com/api/json/v3/pricing/get',
    async (route: Route) => {
      if (pricing === null) {
        await route.abort('failed');
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing }),
      });
    },
  );
}

// ---- mockCloudflare ----

/**
 * Route the cfdomainpricing.com prices.json GET. null → abort.
 * Non-null → fulfill with the raw JSON (tld → { registration, renewal }).
 */
export async function mockCloudflare(
  page: Page,
  pricing: Record<string, unknown> | null,
): Promise<void> {
  await page.route('https://cfdomainpricing.com/prices.json', async (route: Route) => {
    if (pricing === null) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(pricing),
    });
  });
}

// ---- mockDigMyName ----

export interface DigMyNameRule {
  domain: string;
  result: Record<string, unknown> | null;
}

/**
 * Route the DigMyName per-domain detail API. Parse the `domain` query param.
 * No rule or null result → 404. Non-null result → fulfill with { result }.
 */
export async function mockDigMyName(
  page: Page,
  rules: DigMyNameRule[],
): Promise<void> {
  const ruleMap = new Map(rules.map((r) => [r.domain, r]));
  await page.route(
    /https:\/\/api\.digmyname\.com\/functions\/v1\/public-api\/check/,
    async (route: Route) => {
      const u = new URL(route.request().url());
      const domain = u.searchParams.get('domain');
      if (!domain) {
        await route.fulfill({ status: 400, headers: CORS_HEADERS });
        return;
      }
      const rule = ruleMap.get(domain);
      if (!rule || rule.result === null) {
        await route.fulfill({ status: 404, headers: CORS_HEADERS });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: rule.result }),
      });
    },
  );
}

// ---- mockPricing ----

/** Convenience: route both pricing endpoints in one call. */
export async function mockPricing(
  page: Page,
  porkbun: Record<string, unknown> | null,
  cloudflare: Record<string, unknown> | null,
): Promise<void> {
  await mockPorkbun(page, porkbun);
  await mockCloudflare(page, cloudflare);
}

// ---- mockAll ----

export interface MockAllOpts {
  rdap?: RdapRule[];
  doh?: Record<string, DohOutcome>;
  /** null simulates network failure; undefined = don't mock. */
  bootstrap?: unknown;
  porkbun?: Record<string, unknown> | null;
  cloudflare?: Record<string, unknown> | null;
  digmyname?: DigMyNameRule[];
}

/** Register all specified mocks in one call. Skip any endpoint not in opts. */
export async function mockAll(page: Page, opts: MockAllOpts): Promise<void> {
  if (opts.rdap) await mockRdap(page, opts.rdap);
  if (opts.doh) await mockDoh(page, opts.doh);
  if (opts.bootstrap !== undefined) await mockBootstrap(page, opts.bootstrap);
  if (opts.porkbun !== undefined) await mockPorkbun(page, opts.porkbun);
  if (opts.cloudflare !== undefined) await mockCloudflare(page, opts.cloudflare);
  if (opts.digmyname) await mockDigMyName(page, opts.digmyname);
}

// ---- assertNoNetworkLeaks ----

/**
 * Known-endpoint allowlist. Any request NOT matching one of these patterns
 * is aborted and recorded as a leak.
 *
 * Built from: tlds.json RDAP bases + DoH + IANA + Porkbun + Cloudflare +
 * DigMyName + GitHub (auth + social) + TikTok (social) + social profile
 * link hosts + file:// (local app page, health.json) + blob: (workers).
 */
function buildAllowlist(): RegExp[] {
  const patterns: RegExp[] = [];

  // file:// URLs (app page, local files) and blob: URLs (Web Workers)
  patterns.push(/^file:/);
  patterns.push(/^blob:/);

  // RDAP bases
  for (const base of RDAP_BASES) {
    const escaped = escapeRegex(base);
    const withTld = escaped.replace('\\{tld\\}', '[^/]+');
    patterns.push(new RegExp('^' + withTld));
  }

  // IANA bootstrap
  patterns.push(/^https:\/\/data\.iana\.org\/rdap\/dns\.json/);

  // DoH
  patterns.push(/^https:\/\/cloudflare-dns\.com\/dns-query/);
  patterns.push(/^https:\/\/dns\.google\/resolve/);

  // Porkbun pricing
  patterns.push(/^https:\/\/api\.porkbun\.com\/api\/json\/v3\/pricing\/get/);

  // Cloudflare pricing
  patterns.push(/^https:\/\/cfdomainpricing\.com\/prices\.json/);

  // DigMyName
  patterns.push(/^https:\/\/api\.digmyname\.com\/functions\/v1\/public-api\/check/);

  // GitHub (auth + social + profile links)
  patterns.push(/^https:\/\/api\.github\.com\//);
  patterns.push(/^https:\/\/github\.com\//);

  // TikTok (social oembed + profile links)
  patterns.push(/^https:\/\/www\.tiktok\.com\//);

  // Other social profile link hosts (not fetched, but allow for safety)
  patterns.push(/^https:\/\/x\.com\//);
  patterns.push(/^https:\/\/www\.youtube\.com\//);
  patterns.push(/^https:\/\/www\.instagram\.com\//);
  patterns.push(/^https:\/\/www\.reddit\.com\//);

  return patterns;
}

const ALLOWLIST = buildAllowlist();

const leaks = new WeakMap<Page, string[]>();

/**
 * Register a catch-all route that aborts any request whose URL is not on the
 * known-endpoint allowlist. Aborted requests are recorded and exposed via
 * getLeakedRequests().
 *
 * Should be called BEFORE mockAll() / specific mocks so that allowlisted
 * URLs defer via route.fallback() to the specific handlers registered later.
 * If called after specific mocks, those handle their URLs first and the
 * catch-all only sees unmatched (non-allowlisted) requests — also correct.
 */
export async function assertNoNetworkLeaks(page: Page): Promise<void> {
  leaks.set(page, []);
  await page.route(/.*/, async (route: Route) => {
    const url = route.request().url();
    const isAllowed = ALLOWLIST.some((re) => re.test(url));
    if (isAllowed) {
      await route.fallback();
      return;
    }
    const list = leaks.get(page);
    if (list) list.push(url);
    await route.abort('blockedbyclient');
  });
}

/** Return URLs of requests aborted by assertNoNetworkLeaks (off-allowlist). */
export function getLeakedRequests(page: Page): string[] {
  return leaks.get(page) ?? [];
}
