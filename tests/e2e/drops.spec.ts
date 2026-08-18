/**
 * E2E — Drops tab.
 *
 * Data source: src/config/dropped.snapshot.json is BUNDLED at build time
 * (imported in DropsTab.svelte) — no network fetch for the drops list.
 * Boot-time pricing fetch (from CheckTab onMount, since the app boots on
 * the 'check' tab) is mocked. IANA bootstrap is mocked too (defined but
 * currently uncalled at runtime — mocked defensively).
 *
 * Helper gaps (worked around locally, not fixed):
 *   1. helpers/mocks.ts imports tlds.json which fails under Node.js ESM
 *      ("needs an import attribute of type: json"). Workaround: import only
 *      from helpers/setup (no tlds.json dependency) and inline the mock +
 *      leak-detection helpers.
 *   2. navigateToTab() waits for [data-testid="app-tabpanel-{tab}"] which
 *      does NOT exist in App.svelte (tabs conditionally render components
 *      without a tabpanel wrapper). Workaround: click the tab button and
 *      wait for a tab-specific testid.
 */
import { test, expect, type Page } from '@playwright/test';
import { setupPage, grantClipboard, readClipboard } from './helpers/setup';
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

// ---- Test data (from src/config/dropped.snapshot.json, shipped with build) ----

// First domain in the snapshot. sanitizeId(d + '.' + tld) replaces '.' with '-'.
const FIRST_DOMAIN = 'acvaldezvillalobos.com';
const FIRST_COPY_TESTID = 'drops-row-copy-acvaldezvillalobos-com';
const FIRST_ADD_TESTID = 'drops-row-add-acvaldezvillalobos-com';

// RENDER_CAP in DropsTab.svelte — max visible rows.
const RENDER_CAP = 300;

// cfd has 21 entries in the snapshot — well under RENDER_CAP, in the top-20
// TLD select options.
const CFD_COUNT = 21;

// ---- Local tab navigation (workaround for navigateToTab gap) ----

async function gotoDrops(page: Page): Promise<void> {
  await page.click('[data-testid="app-tab-drops"]');
  await page.waitForSelector('[data-testid="drops-input-search"]', {
    state: 'visible',
    timeout: 10_000,
  });
}

// ---- Setup / teardown ----

test.beforeEach(async ({ page, context }) => {
  // Catch-all FIRST with allowlist — defers to specific mocks via fallback().
  await assertNoLeaks(page);
  // Specific mocks (registered after catch-all — handle allowlisted URLs).
  await mockBootstrap(page, ianaBootstrap());
  await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
  await setupPage(page);
  await grantClipboard(context);
});

test.afterEach(async () => {
  expect(leaked).toEqual([]);
});

// ---- Tests ----

test.describe('Drops tab', () => {
  test('renders the dropped-domains list with visible rows', async ({ page }) => {
    await gotoDrops(page);

    const rows = page.locator('[data-testid^="drops-row-copy-"]');
    await expect(rows).toHaveCount(RENDER_CAP);

    // First shipped domain is among the visible rows.
    await expect(page.locator(`[data-testid="${FIRST_COPY_TESTID}"]`)).toBeVisible();
  });

  test('search input filters rows by substring', async ({ page }) => {
    await gotoDrops(page);

    await page.fill('[data-testid="drops-input-search"]', 'acvaldezvillalobos');

    // Only one domain matches the full label substring.
    const rows = page.locator('[data-testid^="drops-row-copy-"]');
    await expect(rows).toHaveCount(1);
    await expect(page.locator(`[data-testid="${FIRST_COPY_TESTID}"]`)).toBeVisible();
  });

  test('TLD select filters rows by zone', async ({ page }) => {
    await gotoDrops(page);

    await page.selectOption('[data-testid="drops-select-tld"]', 'cfd');

    const rows = page.locator('[data-testid^="drops-row-copy-"]');
    await expect(rows).toHaveCount(CFD_COUNT);
  });

  test('row copy button writes the domain to the clipboard', async ({ page }) => {
    await gotoDrops(page);

    await page.click(`[data-testid="${FIRST_COPY_TESTID}"]`);

    // copyDomain() is async (navigator.clipboard.writeText); poll until written.
    await expect
      .poll(async () => readClipboard(page), { timeout: 5_000 })
      .toBe(FIRST_DOMAIN);
  });

  test('row add button switches to Check tab and places the domain in the input', async ({ page }) => {
    await gotoDrops(page);

    await page.click(`[data-testid="${FIRST_ADD_TESTID}"]`);

    const textarea = page.locator('[data-testid="check-input-domains"]');
    await expect(textarea).toBeVisible();
    const value = await textarea.inputValue();
    expect(value).toContain(FIRST_DOMAIN);
  });

  test('add-all button switches to Check tab with multiple domains in the input', async ({ page }) => {
    await gotoDrops(page);

    await page.click('[data-testid="drops-button-add-all"]');

    const textarea = page.locator('[data-testid="check-input-domains"]');
    await expect(textarea).toBeVisible();
    const value = await textarea.inputValue();
    // addAll appends up to 500 filtered domains (all 3000 by default, capped at 500).
    const lines = value.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(1);
    expect(value).toContain(FIRST_DOMAIN);
  });
});
