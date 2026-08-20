/**
 * E2E spec for the Check tab.
 *
 * Covers (~26 tests): input parsing + preview count, TLD chip toggle/clear/
 * presets/search, start-button enabled/disabled states, run->badge (taken /
 * available / probably_available / error), results filters (all/available/
 * taken/problems), sorts (name/price), row actions (copy/recheck/detail/buy),
 * stop-during-run, ignore-cache toggle, progress-bar lifecycle, Ctrl+Enter
 * start, empty CTA -> generators, hint dismiss, share/csv enablement.
 *
 * All selections are by data-testid ONLY. All network is mocked via
 * page.route() -- no real network is ever reached.
 *
 * Helper gaps (worked around locally, same as settings.spec.ts / drops.spec.ts):
 *   1. helpers/mocks.ts imports tlds.json which fails under Node.js ESM
 *      ("needs an import attribute of type: json"). Workaround: inline the
 *      mock + leak-detection helpers. RDAP URLs are matched by the universal
 *      `/domain/` path segment (every RDAP base in tlds.json ends with
 *      `/domain/` and the domain is appended as the last path segment).
 *   2. navigateToTab() was fixed (waits on a real anchor testid), but the
 *      Check tab is the default boot tab so we only need it for the empty-CTA
 *      navigation test.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, grantClipboard, readClipboard } from './helpers/setup';
import {
  ERROR_DOMAIN,
  rdapTaken,
  rdapError,
  porkbunPricing,
  cloudflarePricing,
  seedPricingTable,
  ianaBootstrap,
  type RdapMockResponse,
} from './fixtures';

// ---- Inlined mock helpers (avoid helpers/mocks.ts tlds.json import) ----

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

async function mockBootstrap(page: Page, services: unknown): Promise<void> {
  await page.route('https://data.iana.org/rdap/dns.json', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(services),
    });
  });
}

async function mockPricing(
  page: Page,
  porkbun: Record<string, unknown>,
  cloudflare: Record<string, unknown>,
): Promise<void> {
  await page.route(
    'https://api.porkbun.com/api/json/v3/pricing/get',
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing: porkbun }),
      });
    },
  );
  await page.route('https://cfdomainpricing.com/prices.json', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(cloudflare),
    });
  });
}

interface RdapRule {
  domain: string;
  response: RdapMockResponse;
}

/** Extract the domain (last path segment) from an RDAP URL. */
function extractDomain(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Route every RDAP base by matching the universal `/domain/` path segment.
 * Unmatched domain -> 404 (the default for "not in registry").
 */
async function mockRdap(page: Page, rules: RdapRule[]): Promise<void> {
  const ruleMap = new Map(rules.map((r) => [r.domain, r.response]));
  await page.route(/\/domain\//, async (route) => {
    const domain = extractDomain(route.request().url());
    if (!domain) {
      await route.fulfill({
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/rdap+json' },
      });
      return;
    }
    const rule = ruleMap.get(domain);
    if (!rule) {
      await route.fulfill({
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/rdap+json' },
      });
      return;
    }
    await route.fulfill({
      status: rule.status,
      headers: { ...CORS, 'Content-Type': 'application/rdap+json', ...rule.headers },
      body: rule.body ? JSON.stringify(rule.body) : '',
    });
  });
}

type DohOutcome = 'nxdomain' | 'noerror' | 'error';

/** Route both DoH providers (cloudflare-dns.com + dns.google). */
async function mockDoh(
  page: Page,
  outcomes: Record<string, DohOutcome>,
): Promise<void> {
  const handler = async (route: { request: () => { url: () => string }; fulfill: (opts: { status: number; headers?: Record<string, string>; body?: string }) => Promise<void> }) => {
    const u = new URL(route.request().url());
    const domain = u.searchParams.get('name');
    if (!domain) {
      await route.fulfill({ status: 400, headers: CORS });
      return;
    }
    const outcome = outcomes[domain];
    if (!outcome) {
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/dns-json' },
        body: JSON.stringify({ Status: 2 }),
      });
      return;
    }
    if (outcome === 'error') {
      await route.fulfill({ status: 500, headers: CORS });
      return;
    }
    const status = outcome === 'nxdomain' ? 3 : 0;
    const body: Record<string, unknown> = { Status: status };
    if (outcome === 'noerror') {
      body.Answer = [{ name: domain, type: 2, TTL: 3600, data: 'ns1.example.com' }];
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/dns-json' },
      body: JSON.stringify(body),
    });
  };
  await page.route(/https:\/\/cloudflare-dns\.com\/dns-query/, handler);
  await page.route(/https:\/\/dns\.google\/resolve/, handler);
}

// ---- assertNoNetworkLeaks (catch-all registered FIRST) ----

let leaked: string[] = [];

const ALLOWLIST: RegExp[] = [
  /^file:/,
  /^blob:/,
  /\/domain\//, // RDAP (any host)
  /^https:\/\/data\.iana\.org\/rdap\/dns\.json/,
  /^https:\/\/cloudflare-dns\.com\/dns-query/,
  /^https:\/\/dns\.google\/resolve/,
  /^https:\/\/api\.porkbun\.com\/api\/json\/v3\/pricing\/get/,
  /^https:\/\/cfdomainpricing\.com\/prices\.json/,
  /^https:\/\/api\.digmyname\.com\/functions\/v1\/public-api\/check/,
  /^https:\/\/api\.github\.com\//,
  /^https:\/\/github\.com\//,
  /^https:\/\/www\.tiktok\.com\//,
  /^https:\/\/x\.com\//,
  /^https:\/\/www\.youtube\.com\//,
  /^https:\/\/www\.instagram\.com\//,
  /^https:\/\/www\.reddit\.com\//,
];

async function assertNoLeaks(page: Page): Promise<void> {
  leaked = [];
  await page.route(/.*/, async (route) => {
    const url = route.request().url();
    if (ALLOWLIST.some((re) => re.test(url))) {
      await route.fallback();
      return;
    }
    leaked.push(url);
    await route.abort('blockedbyclient');
  });
}

// ---- Shared boot helpers ----

/** Register the catch-all leak guard + bootstrap + pricing mocks (before goto). */
async function setupBaseMocks(page: Page): Promise<void> {
  await assertNoLeaks(page);
  await mockBootstrap(page, ianaBootstrap());
  await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
}

/**
 * Boot the app on the Check tab with seeded pricing/bootstrap (and any extra
 * seed entries). Assumes all route mocks (including RDAP/DoH/DigMyName) are
 * already registered -- openApp() does the goto.
 */
async function bootCheckTab(
  page: Page,
  seed?: Record<string, unknown>,
): Promise<void> {
  const fullSeed: Record<string, unknown> = {
    'dh:v1:pricing': seedPricingTable(),
    'dh:v1:bootstrap': { json: ianaBootstrap(), fetchedAt: Date.now() },
    ...seed,
  };
  await openApp(page, { seed: fullSeed });
  await page.waitForSelector('[data-testid="check-input-domains"]', {
    state: 'visible',
    timeout: 10_000,
  });
}

// ---- Small utilities ----

/** Sanitize a domain for data-testid (non-alphanumerics -> hyphens). */
function sanitizeDomain(domain: string): string {
  return domain.replace(/[^a-z0-9]/gi, '-');
}

/** Fill the input and click start. */
async function runCheck(page: Page, input: string): Promise<void> {
  await page.locator('[data-testid="check-input-domains"]').fill(input);
  await page.locator('[data-testid="check-button-start"]').click();
}

/** Locator for a results row by raw domain name. */
function row(page: Page, domain: string) {
  return page.locator(`[data-testid="results-row-${sanitizeDomain(domain)}"]`);
}

// ---- Tests ----

test.describe('Check tab', () => {
  test.afterEach(async () => {
    expect(leaked).toEqual([]);
  });

  // 1. input parsing -> preview count appears with numbers
  test('1. input parsing shows preview count with numbers', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    await page.locator('[data-testid="check-input-domains"]').fill('google.com\nzzqxtest1.com');
    const preview = page.locator('[data-testid="check-preview-count"]');
    await expect(preview).toBeVisible();
    const text = (await preview.textContent()) ?? '';
    expect(/\d/.test(text)).toBe(true);
  });

  // 2. chip toggle flips selection (aria-selected is {@const}-bound and not
  //    reactive to selectedTlds changes; assert via the reactive count)
  test('2. chip toggle flips selection state', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    const countEl = page.locator('[data-testid="tld-selected-count"]');
    const count = async (): Promise<number> =>
      parseInt(((await countEl.textContent()) ?? '').match(/\d+/)?.[0] ?? '0', 10);
    const before = await count();
    await page.locator('[data-testid="tld-picker-toggle"]').click();
    const chip = page.locator('[data-testid="tld-chip-io"]');
    await chip.click();
    expect(await count()).not.toBe(before);
    await chip.click();
    expect(await count()).toBe(before);
  });

  // 3. clear selection empties selected TLDs
  test('3. clear selection empties selected TLDs', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    await page.locator('[data-testid="tld-button-clear"]').click();
    const text = (await page.locator('[data-testid="tld-selected-count"]').textContent()) ?? '';
    const count = parseInt(text.match(/\d+/)?.[0] ?? 'x', 10);
    expect(count).toBe(0);
  });

  // 4. presets popular/all/cheapest select expected counts
  test('4. presets popular/all/cheapest select expected counts', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    const countEl = page.locator('[data-testid="tld-selected-count"]');
    const count = async (): Promise<number> =>
      parseInt(((await countEl.textContent()) ?? '').match(/\d+/)?.[0] ?? '0', 10);

    await page.locator('[data-testid="tld-picker-toggle"]').click();
    await page.locator('[data-testid="tld-preset-popular"]').click();
    expect(await count()).toBe(15);

    await page.locator('[data-testid="tld-preset-all"]').click();
    expect(await count()).toBeGreaterThan(15);

    await page.locator('[data-testid="tld-preset-cheapest"]').click();
    expect(await count()).toBeGreaterThan(0);
  });

  // 5. search filters TLD chips
  test('5. search filters TLD chips', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    await page.locator('[data-testid="tld-picker-toggle"]').click();
    await page.locator('[data-testid="tld-input-search"]').fill('com');
    await expect(page.locator('[data-testid="tld-chip-com"]')).toBeVisible();
    await expect(page.locator('[data-testid="tld-chip-xyz"]')).toBeHidden();
    await page.locator('[data-testid="tld-input-search"]').fill('');
    await expect(page.locator('[data-testid="tld-chip-xyz"]')).toBeVisible();
  });

  // 6. start button disabled without input or without TLDs
  test('6. start button disabled without input or without TLDs', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    const start = page.locator('[data-testid="check-button-start"]');
    await expect(start).toBeDisabled();
    await page.locator('[data-testid="check-input-domains"]').fill('google.com');
    await expect(start).toBeEnabled();
    await page.locator('[data-testid="tld-button-clear"]').click();
    await expect(start).toBeDisabled();
  });

  // 7. start button enabled with input and TLDs starts run
  test('7. start button enabled with input and TLDs starts run', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await page.locator('[data-testid="check-input-domains"]').fill('google.com');
    await expect(page.locator('[data-testid="check-button-start"]')).toBeEnabled();
    await page.locator('[data-testid="check-button-start"]').click();
    await expect(row(page, 'google.com')).toBeVisible();
  });

  // 8. run shows taken badge for registered gTLD (RDAP 200)
  test('8. run shows taken badge for registered gTLD (RDAP 200)', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com').locator('[data-testid="status-badge-taken"]')).toBeVisible();
  });

  // 9. run shows available badge for free gTLD (RDAP 404)
  test('9. run shows available badge for free gTLD (RDAP 404)', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, []);
    await bootCheckTab(page);
    await runCheck(page, 'zzqxtest1.com');
    await expect(row(page, 'zzqxtest1.com').locator('[data-testid="status-badge-available"]')).toBeVisible();
  });

  // 10. ccTLD 404 + DoH NXDOMAIN yields probably_available
  test('10. ccTLD 404 + DoH NXDOMAIN yields probably_available', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, []);
    await mockDoh(page, { 'zzqxtest1.de': 'nxdomain' });
    await bootCheckTab(page);
    await runCheck(page, 'zzqxtest1.de');
    await expect(row(page, 'zzqxtest1.de').locator('[data-testid="status-badge-probably_available"]')).toBeVisible();
  });

  // 11. filter available shows only available rows
  test('11. filter available shows only available rows', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();
    await page.locator('[data-testid="results-filter-available"]').click();
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();
    await expect(row(page, 'google.com')).toBeHidden();
  });

  // 12. filter taken shows only taken rows
  test('12. filter taken shows only taken rows', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();
    await page.locator('[data-testid="results-filter-taken"]').click();
    await expect(row(page, 'google.com')).toBeVisible();
    await expect(row(page, 'zzqxtest1.com')).toBeHidden();
  });

  // 13. filter problems shows error rows
  test('13. filter problems shows error rows', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: ERROR_DOMAIN, response: rdapError(500) }]);
    await bootCheckTab(page);
    await runCheck(page, ERROR_DOMAIN);
    await expect(row(page, ERROR_DOMAIN)).toBeVisible();
    await page.locator('[data-testid="results-filter-problems"]').click();
    await expect(row(page, ERROR_DOMAIN)).toBeVisible();
  });

  // 14. sort by name: default is name/asc, click toggles to desc
  test('14. sort by name toggles direction', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();
    const rowTestids = async (): Promise<string[]> =>
      page
        .locator('[data-testid^="results-row-"]')
        .evaluateAll((els) =>
          els
            .map((e) => e.getAttribute('data-testid') ?? '')
            .filter(
              (tid) =>
                !tid.includes('-copy-') &&
                !tid.includes('-recheck-') &&
                !tid.includes('-detail-') &&
                !tid.includes('-buy-'),
            ),
        );
    // Default sort is name/asc -> google before zzqxtest1
    const t1 = await rowTestids();
    expect(t1.indexOf('results-row-google-com')).toBeLessThan(
      t1.indexOf('results-row-zzqxtest1-com'),
    );
    // Click sort-name -> toggles to desc -> zzqxtest1 before google
    await page.locator('[data-testid="results-sort-name"]').click();
    const t2 = await rowTestids();
    expect(t2.indexOf('results-row-zzqxtest1-com')).toBeLessThan(
      t2.indexOf('results-row-google-com'),
    );
  });

  // 15. sort by price orders rows by first-year price
  test('15. sort by price orders rows by first-year price', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, []);
    await bootCheckTab(page);
    await runCheck(page, 'zzqxtest1.com\nzzqxtest1.xyz');
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();
    await page.locator('[data-testid="results-sort-price"]').click();
    const testids = await page
      .locator('[data-testid^="results-row-"]')
      .evaluateAll((els) =>
        els
          .map((e) => e.getAttribute('data-testid') ?? '')
          .filter(
            (tid) =>
              !tid.includes('-copy-') &&
              !tid.includes('-recheck-') &&
              !tid.includes('-detail-') &&
              !tid.includes('-buy-'),
          ),
      );
    const xyz = testids.indexOf('results-row-zzqxtest1-xyz');
    const com = testids.indexOf('results-row-zzqxtest1-com');
    expect(xyz).toBeGreaterThanOrEqual(0);
    expect(com).toBeGreaterThanOrEqual(0);
    expect(xyz).toBeLessThan(com);
  });

  // 16. row copy copies domain to clipboard
  test('16. row copy copies domain to clipboard', async ({ page, context }) => {
    await grantClipboard(context);
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com')).toBeVisible();
    await page.locator('[data-testid="results-row-menu-google-com"]').click();
    await page.locator('[data-testid="results-row-copy-google-com"]').click();
    expect(await readClipboard(page)).toContain('google.com');
  });

  // 17. recheck flips status after second RDAP call
  test('17. recheck flips status after second RDAP call', async ({ page }) => {
    const hits = new Map<string, number>();
    await setupBaseMocks(page);
    await page.route(/\/domain\//, async (route) => {
      const domain = extractDomain(route.request().url());
      if (!domain) {
        await route.fulfill({ status: 404, headers: CORS });
        return;
      }
      const n = (hits.get(domain) ?? 0) + 1;
      hits.set(domain, n);
      if (domain === 'zzqxtest1.com') {
        if (n === 1) {
          await route.fulfill({
            status: 404,
            headers: { ...CORS, 'Content-Type': 'application/rdap+json' },
          });
          return;
        }
        const taken = rdapTaken(domain);
        await route.fulfill({
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/rdap+json' },
          body: JSON.stringify(taken.body ?? {}),
        });
        return;
      }
      await route.fulfill({ status: 404, headers: CORS });
    });
    await bootCheckTab(page);
    await runCheck(page, 'zzqxtest1.com');
    await expect(row(page, 'zzqxtest1.com').locator('[data-testid="status-badge-available"]')).toBeVisible();
    await page.locator('[data-testid="results-row-menu-zzqxtest1-com"]').click();
    await page.locator('[data-testid="results-row-recheck-zzqxtest1-com"]').click();
    await expect(row(page, 'zzqxtest1.com').locator('[data-testid="status-badge-taken"]')).toBeVisible();
    expect(hits.get('zzqxtest1.com') ?? 0).toBeGreaterThanOrEqual(2);
  });

  // 18. buy link href points to cheapest registrar for .dev
  test('18. buy link href points to cheapest registrar for .dev', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, []);
    await bootCheckTab(page);
    await runCheck(page, 'zzqxtest1.dev');
    await expect(row(page, 'zzqxtest1.dev')).toBeVisible();
    const buy = page.locator('[data-testid="results-row-buy-zzqxtest1-dev"]');
    await expect(buy).toBeVisible();
    const href = await buy.evaluate((el: HTMLElement) => {
      const a = el.tagName.toLowerCase() === 'a' ? el : el.querySelector('a');
      return a?.getAttribute('href') ?? null;
    });
    expect(href).not.toBeNull();
    expect(href).toContain('porkbun.com/checkout');
    expect(href).toContain('zzqxtest1.dev');
  });

  // 19. detail toggle fetches DigMyName
  test('19. detail toggle fetches DigMyName', async ({ page }) => {
    let digHits = 0;
    await setupBaseMocks(page);
    await mockRdap(page, []);
    await page.route(
      /https:\/\/api\.digmyname\.com\/functions\/v1\/public-api\/check/,
      async (route) => {
        digHits++;
        await route.fulfill({
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ result: { status: 'available' } }),
        });
      },
    );
    await bootCheckTab(page);
    await runCheck(page, 'zzqxtest1.dev');
    await expect(row(page, 'zzqxtest1.dev')).toBeVisible();
    expect(digHits).toBe(0);
    await page.locator('[data-testid="results-row-menu-zzqxtest1-dev"]').click();
    await page.locator('[data-testid="results-row-detail-zzqxtest1-dev"]').click();
    await expect.poll(async () => digHits).toBe(1);
  });

  // 20. stop during run terminates and shows partial state
  test('20. stop during run terminates and shows partial state', async ({ page }) => {
    await setupBaseMocks(page);
    await page.route(/\/domain\//, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({ status: 404, headers: CORS });
    });
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(page.locator('[data-testid="check-button-stop"]')).toBeVisible();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="check-button-stop"]').click();
    await expect(page.locator('[data-testid="check-button-start"]')).toBeVisible({ timeout: 10_000 });
  });

  // 21. ignore-cache toggle: re-run uses cache (0 new hits), ignore forces fresh
  test('21. ignore-cache toggle controls whether cache is used', async ({ page }) => {
    const hits = new Map<string, number>();
    await setupBaseMocks(page);
    await page.route(/\/domain\//, async (route) => {
      const domain = extractDomain(route.request().url());
      if (!domain) {
        await route.fulfill({ status: 404, headers: CORS });
        return;
      }
      hits.set(domain, (hits.get(domain) ?? 0) + 1);
      if (domain === 'google.com') {
        const taken = rdapTaken(domain);
        await route.fulfill({
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/rdap+json' },
          body: JSON.stringify(taken.body ?? {}),
        });
        return;
      }
      await route.fulfill({ status: 404, headers: CORS });
    });
    await bootCheckTab(page);

    // Run 1: ignore-cache OFF, no cache yet -> 1 RDAP hit (populates cache)
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com').locator('[data-testid="status-badge-taken"]')).toBeVisible();
    const hitsAfterRun1 = hits.get('google.com') ?? 0;
    expect(hitsAfterRun1).toBeGreaterThanOrEqual(1);

    // Run 2: ignore-cache OFF, cache populated -> 0 new RDAP hits (cache used)
    await page.locator('[data-testid="check-input-domains"]').fill('');
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com')).toBeVisible();
    expect(hits.get('google.com') ?? 0).toBe(hitsAfterRun1);

    // Toggle ignore-cache ON, re-run -> fresh RDAP fetch (cache bypassed)
    await page.locator('[data-testid="check-toggle-ignore-cache"]').check();
    await page.locator('[data-testid="check-input-domains"]').fill('');
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com')).toBeVisible();
    expect(hits.get('google.com') ?? 0).toBeGreaterThan(hitsAfterRun1);
  });

  // 22. progress bar lifecycle: hidden idle, visible during/after run
  test('22. progress bar lifecycle: hidden idle, visible during/after run', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    // ProgressBar has id="run-progress" (no data-testid in the component).
    await expect(page.locator('#run-progress')).not.toBeVisible();
    await runCheck(page, 'google.com');
    await expect(page.locator('#run-progress')).toBeVisible();
  });

  // 23. Ctrl+Enter in textarea starts run
  test('23. Ctrl+Enter in textarea starts run', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await page.locator('[data-testid="check-input-domains"]').fill('google.com');
    await page.locator('[data-testid="check-input-domains"]').press('Control+Enter');
    // A fast CI run can finish before a "stop" button poll — assert the outcome instead.
    await expect(row(page, 'google.com')).toBeVisible({ timeout: 15_000 });
  });

  // 24. empty CTA navigates to generators tab
  test('24. empty CTA navigates to generators tab', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    await page.locator('[data-testid="check-button-empty-cta"]').click();
    await expect(page.locator('[data-testid="gen-input-keywords"]')).toBeVisible();
  });

  // 24b. empty-state example button fills the check input
  test('24b. empty-state example button fills the check input', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    const input = page.locator('[data-testid="check-input-domains"]');
    await expect(input).toHaveValue('');
    await page.locator('[data-testid="check-button-example"]').click();
    const value = await input.inputValue();
    expect(value).toContain('midas');
    expect(value).toContain('aurora');
  });

  // 24c. status legend opens and shows all five statuses
  test('24c. status legend opens and shows 5 statuses', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com')).toBeVisible();

    const toggle = page.locator('[data-testid="results-legend-toggle"]');
    await toggle.click();
    // Legend popover lists all 5 statuses by name (en locale).
    const legend = page.locator('.legend');
    await expect(legend).toBeVisible();
    const text = (await legend.textContent()) ?? '';
    expect(text).toContain('Available');
    expect(text).toContain('Likely available');
    expect(text).toContain('Taken');
    expect(text).toContain('Unknown');
    expect(text).toContain('Error');
    // 5 legend rows (one per status).
    await expect(legend.locator('.legend-row')).toHaveCount(5);
    // Close via Escape.
    await page.keyboard.press('Escape');
    await expect(legend).toBeHidden();
  });

  // 25. hint dismiss hides hint strip
  test('25. hint dismiss hides hint strip', async ({ page }) => {
    await setupBaseMocks(page);
    await bootCheckTab(page);
    await expect(page.locator('[data-testid="check-hint-strip"]')).toBeVisible();
    await page.locator('[data-testid="check-button-hint-dismiss"]').click();
    await expect(page.locator('[data-testid="check-hint-strip"]')).toBeHidden();
  });

  // 26. share and csv disabled when empty, enabled after run
  test('26. share and csv disabled when empty, enabled after run', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await expect(page.locator('[data-testid="check-button-share"]')).toBeDisabled();
    await expect(page.locator('[data-testid="check-button-csv"]')).toBeDisabled();
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com')).toBeVisible();
    await expect(page.locator('[data-testid="check-button-share"]')).toBeEnabled();
    await expect(page.locator('[data-testid="check-button-csv"]')).toBeEnabled();
  });

  // 27. export menu: copy as Markdown puts a table on the clipboard
  test('27. export menu copy-md puts a Markdown table on the clipboard', async ({ page, context }) => {
    await grantClipboard(context);
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();

    await page.locator('[data-testid="check-button-export-menu"]').click();
    await page.locator('[data-testid="check-export-copy-md"]').click();
    const clip = await readClipboard(page);
    expect(clip).toContain('| Domain');
    expect(clip).toContain('| --- |');
    expect(clip).toContain('zzqxtest1.com');
  });

  // 27b. export menu: copy as CSV and TSV put tabular data on the clipboard
  test('27b. export menu copy-csv and copy-tsv put data on the clipboard', async ({ page, context }) => {
    await grantClipboard(context);
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();

    await page.locator('[data-testid="check-button-export-menu"]').click();

    // Copy as CSV — header joined by commas, no BOM, no markdown pipes.
    await page.locator('[data-testid="check-export-copy-csv"]').click();
    const csvClip = await readClipboard(page);
    expect(csvClip).toContain('Domain,Status');
    expect(csvClip).toContain('zzqxtest1.com');
    expect(csvClip.charCodeAt(0)).not.toBe(0xfeff);

    // Copy as TSV — header joined by tabs.
    await page.locator('[data-testid="check-export-copy-tsv"]').click();
    const tsvClip = await readClipboard(page);
    expect(tsvClip).toContain('Domain\tStatus');
    expect(tsvClip).toContain('zzqxtest1.com');
  });

  // 28. available menu: copy puts the available domain list on the clipboard
  test('28. available menu copy puts the available list on the clipboard', async ({ page, context }) => {
    await grantClipboard(context);
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();

    // The available menu appears only when the run is done and there are available domains.
    const availMenu = page.locator('[data-testid="results-available-menu"]');
    await expect(availMenu).toBeVisible({ timeout: 10_000 });
    await availMenu.click();
    await page.locator('[data-testid="results-available-copy"]').click();
    const clip = await readClipboard(page);
    expect(clip).toContain('zzqxtest1.com');
    // Taken domain is not in the available list.
    expect(clip).not.toContain('google.com');
  });

  // 29. available menu: fav adds all available domains to favorites
  test('29. available menu fav adds all available to favorites', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();

    const availMenu = page.locator('[data-testid="results-available-menu"]');
    await expect(availMenu).toBeVisible({ timeout: 10_000 });
    await availMenu.click();
    await page.locator('[data-testid="results-available-fav"]').click();

    // Switch to favorites filter — the available domain should appear.
    await page.locator('[data-testid="results-filter-favorites"]').click();
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();
    // Taken domain was not favorited.
    await expect(row(page, 'google.com')).toBeHidden();
  });

  // 29b. available menu: csv downloads a file containing only available rows
  test('29b. available menu csv downloads an available-only CSV file', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();

    const availMenu = page.locator('[data-testid="results-available-menu"]');
    await expect(availMenu).toBeVisible({ timeout: 10_000 });
    await availMenu.click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="results-available-csv"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('available');
    const path = await download.path();
    expect(path).not.toBeNull();
    const content = readFileSync(path!, 'utf8');
    expect(content).toContain('zzqxtest1.com');
    // Taken domain is not in the available-only CSV.
    expect(content).not.toContain('google.com');
  });

  // 30. row overflow menu traps focus; Escape returns focus to the trigger
  test('30. row overflow menu traps focus and Escape returns focus to trigger', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com')).toBeVisible();

    const focusedTestid = (): Promise<string> =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');

    await page.locator('[data-testid="results-row-menu-google-com"]').click();
    const menu = page.locator(
      '.menu-wrap:has([data-testid="results-row-menu-google-com"]) .menu',
    );
    await expect(menu).toBeVisible();

    // Opening the menu moves focus inside it (first item = copy).
    await expect.poll(focusedTestid).toBe('results-row-copy-google-com');

    // Tab cycles within the menu: copy -> recheck -> detail -> wrap to copy.
    await page.keyboard.press('Tab');
    expect(await focusedTestid()).toBe('results-row-recheck-google-com');
    await page.keyboard.press('Tab');
    expect(await focusedTestid()).toBe('results-row-detail-google-com');
    await page.keyboard.press('Tab');
    expect(await focusedTestid()).toBe('results-row-copy-google-com');

    // Shift+Tab wraps backwards.
    await page.keyboard.press('Shift+Tab');
    expect(await focusedTestid()).toBe('results-row-detail-google-com');

    // Escape closes the menu and returns focus to the trigger button.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(await focusedTestid()).toBe('results-row-menu-google-com');
  });

  // 31. lastrun restore: results restored after reload (cache-only, no network)
  test('31. lastrun restore: results restored after reload', async ({ page }) => {
    await setupBaseMocks(page);
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com')).toBeVisible();
    // Wait for the run to finish (start button reappears after 'finished')
    // and the debounced cache write + synchronous lastrun write to land.
    await expect(page.locator('[data-testid="check-button-start"]')).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(
      () =>
        localStorage.getItem('dh:v1:cache') !== null &&
        localStorage.getItem('dh:v1:lastrun') !== null,
      { timeout: 5000 },
    );

    // Read the cache and lastrun that the run persisted.
    const cacheRaw = await page.evaluate(() => localStorage.getItem('dh:v1:cache'));
    const lastrunRaw = await page.evaluate(() => localStorage.getItem('dh:v1:lastrun'));

    // Reload: openApp's init script clears dh:* keys on every navigation,
    // so re-seed with the original data plus the cache and lastrun.
    await openApp(page, {
      seed: {
        'dh:v1:pricing': seedPricingTable(),
        'dh:v1:bootstrap': { json: ianaBootstrap(), fetchedAt: Date.now() },
        'dh:v1:cache': JSON.parse(cacheRaw!),
        'dh:v1:lastrun': JSON.parse(lastrunRaw!),
      },
    });
    await page.waitForSelector('[data-testid="check-input-domains"]', {
      state: 'visible',
      timeout: 10_000,
    });

    // Without clicking check, the results table shows the row again.
    await expect(row(page, 'google.com')).toBeVisible();
    // The textarea still contains the input.
    const input = await page.locator('[data-testid="check-input-domains"]').inputValue();
    expect(input).toContain('google.com');
    // The runState line shows done count.
    const progress = page.locator('[data-testid="check-bar-progress"]');
    await expect(progress).toBeVisible();
    const progressText = (await progress.textContent()) ?? '';
    expect(progressText).toMatch(/Checked \d+ of \d+/);
  });
});
