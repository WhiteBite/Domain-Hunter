/**
 * E2E — Social tab.
 *
 * SocialTab fetches two live endpoints when the user clicks "check":
 *   - GitHub:  https://api.github.com/users/{handle}   (200→taken, 404→free)
 *   - TikTok:  https://www.tiktok.com/oembed?url=...   (200→taken, 404→free)
 * Non-live platforms (x, youtube, instagram, reddit) return 'unknown'
 * without fetching. Both live hosts are mocked via page.route() returning
 * 404 (→ 'free') so no real network is hit.
 *
 * Boot-time pricing fetch (from CheckTab onMount, since the app boots on
 * 'check') is mocked. IANA bootstrap mocked defensively (defined but
 * currently uncalled at runtime).
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

async function mockSocialEndpoints(page: Page): Promise<void> {
  // 404 → 'free' per social.ts interpret mapping.
  await page.route(/https:\/\/api\.github\.com\/users\//, async (route) => {
    await route.fulfill({ status: 404, headers: CORS });
  });
  await page.route(/https:\/\/www\.tiktok\.com\/oembed/, async (route) => {
    await route.fulfill({ status: 404, headers: CORS });
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

const HANDLE = 'testuser';
const PLATFORM_IDS = ['github', 'tiktok', 'x', 'youtube', 'instagram', 'reddit'] as const;

// ---- Local tab navigation (workaround for navigateToTab gap) ----

async function gotoSocial(page: Page): Promise<void> {
  await page.click('[data-testid="app-tab-social"]');
  await page.waitForSelector('[data-testid="social-input-handle"]', {
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
  await mockSocialEndpoints(page);
  await setupPage(page);
});

test.afterEach(async () => {
  expect(leaked).toEqual([]);
});

// ---- Tests ----

test.describe('Social tab', () => {
  test('check button is disabled while handle input is empty', async ({ page }) => {
    await gotoSocial(page);

    const button = page.locator('[data-testid="social-button-check"]');
    await expect(button).toBeDisabled();
  });

  test('typing a handle and clicking check renders platform cards with links', async ({ page }) => {
    await gotoSocial(page);

    await page.fill('[data-testid="social-input-handle"]', HANDLE);
    await page.click('[data-testid="social-button-check"]');

    // All 6 platform cards should render (links are set immediately on run()).
    for (const id of PLATFORM_IDS) {
      const link = page.locator(`[data-testid="social-card-link-${id}"]`);
      await expect(link).toBeVisible();
    }
  });

  test('platform card links have correct href, target=_blank, and rel containing noopener', async ({ page }) => {
    await gotoSocial(page);

    await page.fill('[data-testid="social-input-handle"]', HANDLE);
    await page.click('[data-testid="social-button-check"]');

    const expected: Record<string, string> = {
      github: `https://github.com/${HANDLE}`,
      tiktok: `https://www.tiktok.com/@${HANDLE}`,
      x: `https://x.com/${HANDLE}`,
      youtube: `https://www.youtube.com/@${HANDLE}`,
      instagram: `https://www.instagram.com/${HANDLE}`,
      reddit: `https://www.reddit.com/user/${HANDLE}`,
    };

    for (const [id, href] of Object.entries(expected)) {
      const link = page.locator(`[data-testid="social-card-link-${id}"]`);
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      const rel = await link.getAttribute('rel');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });

  test('Enter key in handle input triggers check', async ({ page }) => {
    await gotoSocial(page);

    await page.fill('[data-testid="social-input-handle"]', HANDLE);
    await page.press('[data-testid="social-input-handle"]', 'Enter');

    // Cards should appear — verify at least the github card link.
    await expect(page.locator('[data-testid="social-card-link-github"]')).toBeVisible();
  });
});
