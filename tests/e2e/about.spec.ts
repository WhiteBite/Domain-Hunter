/**
 * E2E — About tab.
 *
 * AboutTab is fully static (no network, no state). Boot-time pricing fetch
 * (from CheckTab onMount, since the app boots on 'check') is mocked.
 * IANA bootstrap mocked defensively (defined but currently uncalled).
 *
 * Helper gaps (worked around locally, not fixed):
 *   1. helpers/mocks.ts imports tlds.json which fails under Node.js ESM.
 *      Workaround: import only from helpers/setup and inline mock helpers.
 *   2. navigateToTab() waits for [data-testid="app-tabpanel-{tab}"] which
 *      does NOT exist in App.svelte. Workaround: click tab + wait for a
 *      tab-specific testid.
 */
import { test, expect, type Page } from '@playwright/test';
import { setupPage } from './helpers/setup';
import { ianaBootstrap, porkbunPricing, cloudflarePricing } from './fixtures';

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

// Catch-all registered FIRST with an allowlist: allowlisted URLs defer via
// route.fallback() to the specific mocks registered later; anything else is
// aborted and recorded as a leak. This mirrors the helpers/mocks.ts pattern.
let leaked: string[] = [];

const ALLOWLIST: RegExp[] = [
  /^file:/,
  /^blob:/,
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

// ---- Test data ----

const GITHUB_URL = 'https://github.com/WhiteBite/Domain-Hunter';

// ---- Local tab navigation (workaround for navigateToTab gap) ----

async function gotoAbout(page: Page): Promise<void> {
  await page.click('[data-testid="app-tab-about"]');
  await page.waitForSelector('[data-testid="about-link-github"]', {
    state: 'visible',
    timeout: 10_000,
  });
}

// ---- Setup / teardown ----

test.beforeEach(async ({ page }) => {
  // Catch-all FIRST with allowlist — defers to specific mocks via fallback().
  await assertNoLeaks(page);
  // Specific mocks (registered after catch-all — handle allowlisted URLs).
  await mockBootstrap(page, ianaBootstrap());
  await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
  await setupPage(page);
});

test.afterEach(async () => {
  expect(leaked).toEqual([]);
});

// ---- Tests ----

test.describe('About tab', () => {
  test('renders its content sections including the GitHub link', async ({ page }) => {
    await gotoAbout(page);

    // The GitHub link is the anchor of the footer card — its visibility
    // confirms the About panel mounted and rendered its content.
    await expect(page.locator('[data-testid="about-link-github"]')).toBeVisible();
  });

  test('GitHub link has correct href, target=_blank, and rel containing noopener noreferrer', async ({ page }) => {
    await gotoAbout(page);

    const link = page.locator('[data-testid="about-link-github"]');
    await expect(link).toHaveAttribute('href', GITHUB_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });
});
