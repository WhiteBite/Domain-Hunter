/**
 * E2E spec for the Settings tab.
 *
 * Covers: theme/language/currency selects, exchange-rate inputs, concurrency
 * range, cache TTL, proxy URL, GitHub connection section, data export/import,
 * clear data, reset defaults, persistence across reload.
 *
 * All selections are by data-testid ONLY. All network is mocked via
 * page.route() — no real network is ever reached (including GitHub).
 *
 * Helper gaps (worked around locally, not fixed):
 *   1. helpers/mocks.ts imports tlds.json which fails under Node.js 24 ESM.
 *      Workaround: import openApp from helpers/setup and inline mock helpers.
 *   2. navigateToTab() waits for [data-testid="app-tabpanel-{tab}"] which
 *      does NOT exist in App.svelte. Workaround: click tab + wait for a
 *      Settings-specific testid.
 *   3. CheckTab currency badge lacks data-testid — cannot assert badge text
 *      by testid. Asserting select value + localStorage instead.
 */
import { test, expect, type Page } from '@playwright/test';
import { openApp, setupPage } from './helpers/setup';
import {
  ianaBootstrap,
  seedPricingTable,
  porkbunPricing,
  cloudflarePricing,
} from './fixtures';
import { DEFAULT_SETTINGS, type Settings } from '../../src/types';

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

// ---- Local tab navigation (workaround for navigateToTab gap) ----

async function gotoSettings(page: Page): Promise<void> {
  await page.click('[data-testid="app-tab-settings"]');
  await page.waitForSelector('[data-testid="settings-select-theme"]', {
    state: 'visible',
    timeout: 10_000,
  });
}

// ---- Shared helpers ----

/**
 * Boot the app with mocked network, pre-seeded pricing/bootstrap cache, and
 * optional settings overrides. Navigates to the Settings tab.
 *
 * assertNoLeaks is registered FIRST (catch-all with route.fallback for
 * allowlisted URLs), then specific mocks. The seed is installed via
 * addInitScript BEFORE goto so stores read cached values at boot.
 */
async function bootSettingsTab(page: Page, overrides?: Partial<Settings>): Promise<void> {
  await assertNoLeaks(page);
  await mockBootstrap(page, ianaBootstrap());
  await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
  const seed: Record<string, unknown> = {
    'dh:v1:pricing': seedPricingTable(),
    'dh:v1:bootstrap': { json: ianaBootstrap(), fetchedAt: Date.now() },
  };
  if (overrides) {
    seed['dh:v1:settings'] = { ...DEFAULT_SETTINGS, ...overrides };
  }
  await openApp(page, { seed });
  await gotoSettings(page);
}

/** Read and parse dh:v1:settings from localStorage. Throws if missing. */
async function readSettings(page: Page): Promise<Settings> {
  const raw = await page.evaluate<string | null>(
    () => localStorage.getItem('dh:v1:settings'),
  );
  if (!raw) throw new Error('dh:v1:settings not found in localStorage');
  return JSON.parse(raw) as Settings;
}

// ---- Tests ----

test.describe('Settings tab', () => {
  test.afterEach(async () => {
    expect(leaked).toEqual([]);
  });

  // 1. Theme select → data-theme attribute on <html>
  test('theme select applies data-theme to <html>', async ({ page }) => {
    await bootSettingsTab(page);

    const select = page.locator('[data-testid="settings-select-theme"]');

    await select.selectOption('dark');
    expect(
      await page.evaluate<string>(() => document.documentElement.dataset.theme ?? ''),
    ).toBe('dark');

    await select.selectOption('light');
    expect(
      await page.evaluate<string>(() => document.documentElement.dataset.theme ?? ''),
    ).toBe('light');
  });

  // 2. Language select → UI language switches (aria-label signal, not free text)
  test('language select switches UI language (aria-label signal)', async ({ page }) => {
    await bootSettingsTab(page);

    const langToggle = page.locator('[data-testid="app-lang-toggle"]');
    const select = page.locator('[data-testid="settings-select-lang"]');

    // Default EN: aria-label is "Language" (from i18n en.ts lang.label)
    expect(await langToggle.getAttribute('aria-label')).toBe('Language');

    // Switch to RU: aria-label becomes "Язык" (from i18n ru.ts lang.label)
    await select.selectOption('ru');
    expect(await langToggle.getAttribute('aria-label')).toBe('Язык');

    // Switch back to EN
    await select.selectOption('en');
    expect(await langToggle.getAttribute('aria-label')).toBe('Language');
  });

  // 3. Currency select → persists to localStorage
  //    GAP: CheckTab currency badge lacks data-testid — cannot assert badge
  //    text by testid. Asserting select value + localStorage instead.
  test('currency select persists to localStorage', async ({ page }) => {
    await bootSettingsTab(page);

    const select = page.locator('[data-testid="settings-select-currency"]');
    await select.selectOption('RUB');
    expect(await select.inputValue()).toBe('RUB');

    const stored = await readSettings(page);
    expect(stored.currency).toBe('RUB');
  });

  // 4. Rate inputs: valid persists, invalid rejected (patchRate guards <= 0 / NaN)
  test('rate input: valid value persists, invalid value rejected', async ({ page }) => {
    await bootSettingsTab(page);

    const rubInput = page.locator('[data-testid="settings-input-rate-rub"]');
    const before = (await readSettings(page)).rates.RUB;

    // Invalid: 0 (fails the > 0 check in patchRate → rateError set, no update).
    // The input persists via onchange — blur() fires the change event.
    await rubInput.fill('0');
    await rubInput.blur();
    expect((await readSettings(page)).rates.RUB).toBe(before);

    // Valid: 100
    await rubInput.fill('100');
    await rubInput.blur();
    expect((await readSettings(page)).rates.RUB).toBe(100);
  });

  // 5. Concurrency range changes and persists
  test('concurrency range changes and persists', async ({ page }) => {
    await bootSettingsTab(page);

    const range = page.locator('[data-testid="settings-range-concurrency"]');
    await range.fill('8');
    expect(await range.inputValue()).toBe('8');

    expect((await readSettings(page)).concurrency).toBe(8);
  });

  // 6. Cache TTL input changes and persists
  test('cache TTL input changes and persists', async ({ page }) => {
    await bootSettingsTab(page);

    const ttlInput = page.locator('[data-testid="settings-input-ttl"]');
    // onchange-driven input: blur() fires the change event that persists it.
    await ttlInput.fill('24');
    await ttlInput.blur();
    expect((await readSettings(page)).cacheTtlHours).toBe(24);
  });

  // 7. Proxy URL input persists
  test('proxy URL input persists', async ({ page }) => {
    await bootSettingsTab(page);

    const proxyInput = page.locator('[data-testid="settings-input-proxy"]');
    await proxyInput.fill('https://my-worker.workers.dev/');
    expect((await readSettings(page)).proxyUrl).toBe('https://my-worker.workers.dev/');
  });

  // 8. Export data triggers download with JSON content containing dh state
  test('export data triggers download with JSON content', async ({ page }) => {
    await bootSettingsTab(page);

    // Spy on URL.createObjectURL to capture blob text (blob: downloads have
    // no file path on disk, so download.path() returns null).
    await page.evaluate(() => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = (obj: Blob | MediaSource): string => {
        if (obj instanceof Blob) {
          void obj.text().then((text) => {
            (window as unknown as { __capturedDownload?: string }).__capturedDownload = text;
          });
        }
        return orig.call(URL, obj);
      };
    });

    await page.locator('[data-testid="settings-button-export"]').click();

    await page.waitForFunction(
      () =>
        (window as unknown as { __capturedDownload?: string }).__capturedDownload !==
        undefined,
    );

    const content = await page.evaluate<string>(
      () =>
        (window as unknown as { __capturedDownload: string }).__capturedDownload,
    );

    const parsed = JSON.parse(content) as { settings?: unknown; wordsets?: unknown };
    expect(parsed.settings).toBeDefined();
    expect(parsed.wordsets).toBeDefined();
  });

  // 9. Import data via file input restores settings
  test('import data restores settings via file input', async ({ page }) => {
    await bootSettingsTab(page);

    const fileContent = JSON.stringify({
      settings: { theme: 'dark', currency: 'EUR' },
      wordsets: [],
    });

    // setInputFiles requires Buffer (@types/node not installed); use
    // DataTransfer + File via page.evaluate to set the file on the hidden input.
    await page.evaluate((content: string) => {
      const file = new File([content], 'import.json', { type: 'application/json' });
      const input = document.querySelector(
        '[data-testid="settings-input-import"]',
      ) as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, fileContent);

    const themeSelect = page.locator('[data-testid="settings-select-theme"]');
    expect(await themeSelect.inputValue()).toBe('dark');

    const currencySelect = page.locator('[data-testid="settings-select-currency"]');
    expect(await currencySelect.inputValue()).toBe('EUR');
  });

  // 10. Reset defaults restores default settings
  test('reset defaults restores default settings', async ({ page }) => {
    await bootSettingsTab(page);

    const themeSelect = page.locator('[data-testid="settings-select-theme"]');
    const currencySelect = page.locator('[data-testid="settings-select-currency"]');

    // Change theme and currency away from defaults
    await themeSelect.selectOption('dark');
    await currencySelect.selectOption('EUR');
    expect(await themeSelect.inputValue()).toBe('dark');
    expect(await currencySelect.inputValue()).toBe('EUR');

    // Reset
    await page.locator('[data-testid="settings-button-reset"]').click();

    // Assert defaults restored
    expect(await themeSelect.inputValue()).toBe('system');
    expect(await currencySelect.inputValue()).toBe('USD');
  });

  // 11. Clear data asks confirm() → after accept, storage cleared and UI reset
  test('clear data asks confirm and clears storage', async ({ page }) => {
    // openApp's addInitScript only seeds pricing/bootstrap, NOT settings.
    // clearData() calls location.reload(); addInitScript re-runs on reload
    // but only re-seeds pricing/bootstrap — settings stay cleared and the app
    // boots with DEFAULT_SETTINGS.
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await openApp(page, {
      seed: {
        'dh:v1:pricing': seedPricingTable(),
        'dh:v1:bootstrap': { json: ianaBootstrap(), fetchedAt: Date.now() },
      },
    });
    await gotoSettings(page);

    // Change theme so settings are non-default
    await page.locator('[data-testid="settings-select-theme"]').selectOption('dark');
    expect((await readSettings(page)).theme).toBe('dark');

    // Set a marker before reload so we can detect the reload completed
    await page.evaluate(() => {
      (window as unknown as { __preClear?: boolean }).__preClear = true;
    });

    // Handle confirm() dialog
    let dialogShown = false;
    page.on('dialog', (dialog) => {
      dialogShown = true;
      void dialog.accept();
    });

    await page.locator('[data-testid="settings-button-clear"]').click();

    // Wait for reload: marker disappears in new page context
    await page.waitForFunction(
      () =>
        (window as unknown as { __preClear?: boolean }).__preClear === undefined,
    );

    expect(dialogShown).toBe(true);

    // After reload, app boots with no stored settings → DEFAULT_SETTINGS
    const after = await readSettings(page);
    expect(after.theme).toBe('system');
  });

  // 12. Persistence across reload.
  // NOTE: boots via setupPage (no addInitScript) — openApp's init script runs
  // on EVERY navigation, clearing dh:* keys, which would wipe the changed
  // setting on reload. Pricing is covered by the mocked routes instead.
  test('settings persist across page reload', async ({ page }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());
    await setupPage(page);
    await gotoSettings(page);

    await page.locator('[data-testid="settings-select-theme"]').selectOption('dark');
    expect((await readSettings(page)).theme).toBe('dark');

    await page.reload();
    await page.waitForSelector('[data-testid="app-shell"]', { state: 'visible' });
    await gotoSettings(page);

    expect(
      await page.locator('[data-testid="settings-select-theme"]').inputValue(),
    ).toBe('dark');
  });

  // 13a. GitHub section: connect button disabled without proxy, token input exists
  test('GitHub section: connect disabled without proxy, token input visible', async ({
    page,
  }) => {
    await bootSettingsTab(page);

    const connectBtn = page.locator('[data-testid="settings-button-github-connect"]');
    const tokenInput = page.locator('[data-testid="settings-input-github-token"]');

    await expect(connectBtn).toBeDisabled();
    await expect(tokenInput).toBeVisible();
  });

  // 13b. GitHub device flow: connect with proxy yields disconnect button
  //
  // The device flow calls {proxy}/gh/device/code and {proxy}/gh/device/token
  // (user-deployed worker), then api.github.com/user for the login name.
  // We set proxyUrl to https://api.github.com/ (on the network allowlist) so
  // the catch-all defers to our specific mocks. No real network is hit.
  test('GitHub device flow: connect with proxy yields disconnect button', async ({
    page,
  }) => {
    await assertNoLeaks(page);
    await mockBootstrap(page, ianaBootstrap());
    await mockPricing(page, porkbunPricing().pricing, cloudflarePricing());

    // Mock the device-flow endpoints on the proxy host (api.github.com is
    // allowlisted, so the catch-all defers via route.fallback()).
    await page.route('https://api.github.com/gh/device/code', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_code: 'dc1',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://github.com/login/device',
          interval: 0,
          expires_in: 60,
        }),
      });
    });
    await page.route('https://api.github.com/gh/device/token', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: 'ghp_testtoken' }),
      });
    });
    await page.route('https://api.github.com/user', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: 'testuser' }),
      });
    });

    await openApp(page, {
      seed: {
        'dh:v1:settings': {
          ...DEFAULT_SETTINGS,
          proxyUrl: 'https://api.github.com/',
        },
        'dh:v1:pricing': seedPricingTable(),
        'dh:v1:bootstrap': { json: ianaBootstrap(), fetchedAt: Date.now() },
      },
    });
    await gotoSettings(page);

    const connectBtn = page.locator('[data-testid="settings-button-github-connect"]');
    await expect(connectBtn).toBeEnabled();

    await connectBtn.click();

    // pollDeviceToken has Math.max(1, intervalSec)*1000ms delay before the
    // first poll (interval:0 → 1000ms). After the token is obtained, the
    // connected-state UI renders with the disconnect button.
    const disconnectBtn = page.locator(
      '[data-testid="settings-button-github-disconnect"]',
    );
    await expect(disconnectBtn).toBeVisible({ timeout: 15_000 });

    // Token persisted to localStorage
    expect((await readSettings(page)).githubToken).toBe('ghp_testtoken');
  });
});
