/**
 * E2E spec for the favorites shortlist, results search/multi-select,
 * run history and the collapsible input panel.
 *
 * All selections are by data-testid ONLY. All network is mocked via
 * page.route() -- no real network is ever reached. Mock helpers are inlined
 * (same workaround as check.spec.ts: helpers/mocks.ts imports tlds.json which
 * fails under Node ESM).
 */
import { test, expect, type Page } from '@playwright/test';
import { openApp, grantClipboard, readClipboard, navigateToTab } from './helpers/setup';
import {
  porkbunPricing,
  cloudflarePricing,
  seedPricingTable,
  ianaBootstrap,
  rdapTaken,
  rdapFree,
  type RdapMockResponse,
} from './fixtures';

// ---- Inlined mock helpers ----

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
  await page.route('https://api.porkbun.com/api/json/v3/pricing/get', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricing: porkbun }),
    });
  });
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

function extractDomain(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

async function mockRdap(page: Page, rules: RdapRule[]): Promise<void> {
  const ruleMap = new Map(rules.map((r) => [r.domain, r.response]));
  await page.route(/\/domain\//, async (route) => {
    const domain = extractDomain(route.request().url());
    const rule = domain ? ruleMap.get(domain) : undefined;
    if (!rule) {
      await route.fulfill({ status: 404, headers: { ...CORS, 'Content-Type': 'application/rdap+json' } });
      return;
    }
    await route.fulfill({
      status: rule.status,
      headers: { ...CORS, 'Content-Type': 'application/rdap+json', ...rule.headers },
      body: rule.body ? JSON.stringify(rule.body) : '',
    });
  });
}

let leaked: string[] = [];

const ALLOWLIST: RegExp[] = [
  /^file:/,
  /^blob:/,
  /\/domain\//,
  /^https:\/\/data\.iana\.org\/rdap\/dns\.json/,
  /^https:\/\/cloudflare-dns\.com\/dns-query/,
  /^https:\/\/dns\.google\/resolve/,
  /^https:\/\/api\.porkbun\.com\/api\/json\/v3\/pricing\/get/,
  /^https:\/\/cfdomainpricing\.com\/prices\.json/,
  /^https:\/\/api\.digmyname\.com\/functions\/v1\/public-api\/check/,
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

async function bootCheckTab(page: Page): Promise<void> {
  await openApp(page, {
    seed: {
      'dh:v1:pricing': seedPricingTable(),
      'dh:v1:bootstrap': { json: ianaBootstrap(), fetchedAt: Date.now() },
    },
  });
  await page.waitForSelector('[data-testid="check-input-domains"]', {
    state: 'visible',
    timeout: 10_000,
  });
}

function sanitizeDomain(domain: string): string {
  return domain.replace(/[^a-z0-9]/gi, '-');
}

async function runCheck(page: Page, input: string): Promise<void> {
  await page.locator('[data-testid="check-input-domains"]').fill(input);
  await page.locator('[data-testid="check-button-start"]').click();
}

function row(page: Page, domain: string) {
  return page.locator(`[data-testid="results-row-${sanitizeDomain(domain)}"]`);
}

// ---- Tests ----

test.describe('Favorites, search, multi-select, history, panel', () => {
  test.afterEach(async () => {
    expect(leaked).toEqual([]);
  });

  test('star a row, favorites filter and copy favorites', async ({ page, context }) => {
    await grantClipboard(context);
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();

    // Star the available domain.
    await page.locator(`[data-testid="results-row-fav-${sanitizeDomain('zzqxtest1.com')}"]`).click();

    // Favorites filter shows only the starred row.
    await page.locator('[data-testid="results-filter-favorites"]').click();
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();
    await expect(row(page, 'google.com')).toBeHidden();

    // Copy favorites puts the starred domain on the clipboard.
    await page.locator('[data-testid="results-copy-favorites"]').click();
    expect(await readClipboard(page)).toContain('zzqxtest1.com');

    // Unstar -> favorites filter shows the empty state (no rows).
    await page.locator(`[data-testid="results-row-fav-${sanitizeDomain('zzqxtest1.com')}"]`).click();
    await expect(row(page, 'zzqxtest1.com')).toBeHidden();
  });

  test('results search filters rows by substring', async ({ page }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();

    await page.locator('[data-testid="results-search"]').fill('google');
    await expect(row(page, 'google.com')).toBeVisible();
    await expect(row(page, 'zzqxtest1.com')).toBeHidden();

    await page.locator('[data-testid="results-search"]').fill('');
    await expect(row(page, 'zzqxtest1.com')).toBeVisible();
  });

  test('multi-select rows and copy selected', async ({ page, context }) => {
    await grantClipboard(context);
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com\nzzqxtest1.com');
    await expect(row(page, 'google.com')).toBeVisible();

    // Select one row -> copy-selected appears and copies it.
    await page.locator(`[data-testid="results-row-select-${sanitizeDomain('google.com')}"]`).click();
    const copySel = page.locator('[data-testid="results-copy-selected"]');
    await expect(copySel).toBeVisible();
    await copySel.click();
    expect(await readClipboard(page)).toContain('google.com');
    // Selection clears after copy.
    await expect(copySel).toBeHidden();

    // Select-all selects every visible row.
    await page.locator('[data-testid="results-select-all"]').click();
    await expect(copySel).toBeVisible();
    const label = (await copySel.textContent()) ?? '';
    expect(label).toContain('2');
  });

  test('completed run lands in history; restore re-runs; clear empties', async ({ page }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await mockRdap(page, [{ domain: 'google.com', response: rdapTaken('google.com') }]);
    await bootCheckTab(page);
    await runCheck(page, 'google.com');
    await expect(row(page, 'google.com')).toBeVisible();

    // History entry appears after the run completes (history is collapsed by
    // default — expand it to reveal the entry).
    await page.locator('[data-testid="check-history-toggle"]').click();
    const entry = page.locator('[data-testid="history-entry-0"]');
    await expect(entry).toBeVisible({ timeout: 10_000 });

    // Restore: input is re-filled and the run restarts (from cache).
    await page.locator('[data-testid="check-input-domains"]').fill('zzqxtest1.com');
    await entry.click();
    const input = page.locator('[data-testid="check-input-domains"]');
    await expect(input).toHaveValue('google.com');
    await expect(row(page, 'google.com')).toBeVisible({ timeout: 10_000 });

    // Clear history removes entries and the clear button.
    await page.locator('[data-testid="history-clear"]').click();
    await expect(entry).toBeHidden();
    await expect(page.locator('[data-testid="history-clear"]')).toBeHidden();
  });

  test('panel toggle collapses and expands the input column', async ({ page }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await bootCheckTab(page);

    const input = page.locator('[data-testid="check-input-domains"]');
    await expect(input).toBeVisible();
    await page.locator('[data-testid="check-panel-toggle"]').click();
    await expect(input).toBeHidden();
    await page.locator('[data-testid="check-panel-toggle"]').click();
    await expect(input).toBeVisible();
  });
});

test.describe('Generator tray and drops favorites', () => {
  test.afterEach(async () => {
    expect(leaked).toEqual([]);
  });

  async function boot(page: Page): Promise<void> {
    await openApp(page, {
      seed: {
        'dh:v1:pricing': seedPricingTable(),
        'dh:v1:bootstrap': { json: ianaBootstrap(), fetchedAt: Date.now() },
      },
    });
  }

  test('tray sections paginate at 100 chips and chip stars toggle', async ({ page }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await boot(page);
    await navigateToTab(page, 'generators');
    // The syllable count input lives inside the collapsed params <details>.
    await page.locator('[data-testid="gen-summary-params"]').click();
    await page.locator('[data-testid="gen-input-syllable-count"]').fill('200');
    await page.locator('[data-testid="gen-input-keywords"]').fill('midas');
    await page.locator('[data-testid="gen-button-generate"]').click();
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Syllable section (200 items) is paginated: show more/less toggles chip count.
    const more = page.locator('[data-testid="gen-more-syllables"]');
    await expect(more).toBeVisible({ timeout: 10_000 });
    const stars = page.locator('[data-testid^="gen-tray-fav-"]');
    const collapsedCount = await stars.count();
    await more.click();
    expect(await stars.count()).toBeGreaterThan(collapsedCount);
    await more.click();
    expect(await stars.count()).toBe(collapsedCount);

    // Star a candidate: active class toggles.
    const firstStar = stars.first();
    await firstStar.click();
    await expect(firstStar).toHaveClass(/active/);
    await firstStar.click();
    await expect(firstStar).not.toHaveClass(/active/);
  });

  test('drops rows have working favorite stars', async ({ page }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await boot(page);
    await navigateToTab(page, 'drops');
    const star = page.locator('[data-testid^="drops-row-fav-"]').first();
    await expect(star).toBeVisible({ timeout: 10_000 });
    await star.click();
    await expect(star).toHaveClass(/active/);
    await star.click();
    await expect(star).not.toHaveClass(/active/);
  });
});

test.describe('Watchlist — silent re-check of favorited domains', () => {
  test.afterEach(async () => {
    expect(leaked).toEqual([]);
  });

  async function boot(page: Page): Promise<void> {
    await openApp(page, {
      seed: {
        'dh:v1:pricing': seedPricingTable(),
        'dh:v1:bootstrap': { json: ianaBootstrap(), fetchedAt: Date.now() },
        'dh:v1:favorites': ['zzqxwatch.com'],
        'dh:v1:watch': { 'zzqxwatch.com': { status: 'taken', ts: Date.now() } },
      },
    });
    await page.waitForSelector('[data-testid="check-input-domains"]', {
      state: 'visible',
      timeout: 10_000,
    });
  }

  test('detects a freed domain, shows banner + badge, dismiss hides banner', async ({ page }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    // zzqxwatch.com → 404 (high-trust .com → available)
    await mockRdap(page, [{ domain: 'zzqxwatch.com', response: rdapFree() }]);
    await boot(page);

    // Watch banner appears with freed count 1.
    const banner = page.locator('[data-testid="check-watch-banner"]');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    expect(await banner.textContent()).toContain('1');

    // "Show favorites" button switches the results filter to favorites.
    await page.locator('[data-testid="check-watch-show"]').click();
    await expect(row(page, 'zzqxwatch.com')).toBeVisible({ timeout: 10_000 });

    // Watch badge appears next to the domain.
    const badge = page.locator(`[data-testid="results-watch-${sanitizeDomain('zzqxwatch.com')}"]`);
    await expect(badge).toBeVisible();

    // Dismiss hides the banner.
    await page.locator('[data-testid="check-watch-dismiss"]').click();
    await expect(banner).toBeHidden();
  });

  test('refresh button is visible and enabled after initial watchlist run', async ({ page }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await mockRdap(page, [{ domain: 'zzqxwatch.com', response: rdapFree() }]);
    await boot(page);

    // Wait for the initial watchlist run to finish (banner appears).
    const banner = page.locator('[data-testid="check-watch-banner"]');
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // The refresh button exists in the results toolbar and is enabled.
    const refresh = page.locator('[data-testid="results-watch-refresh"]');
    await expect(refresh).toBeVisible();
    await expect(refresh).not.toBeDisabled();
  });
});
