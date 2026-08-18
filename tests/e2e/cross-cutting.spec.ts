/**
 * Cross-cutting E2E spec — theme, language, share-link, resume, CSV export,
 * tab-switch state preservation, settings persistence.
 *
 * Selectors: data-testid ONLY. Text assertions: only exact i18n strings.
 * All network mocked via page.route(); assertNoNetworkLeaks enforces zero leaks.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  openApp,
  navigateToTab,
  grantClipboard,
  readClipboard,
  assertNoNetworkLeaks,
  getLeakedRequests,
  mockAll,
  mockRdap,
  type RdapRule,
} from './helpers';
import {
  ianaBootstrap,
  porkbunPricing,
  cloudflarePricing,
  seedPricingTable,
} from './fixtures';
import { encodeShare, parseShare } from '../../src/ui/share';
import type { RunSnapshot } from '../../src/types';

// ---- Shared helpers ----

/** Register leak detector + bootstrap/pricing mocks. Call before openApp. */
async function setupCommonMocks(page: Page): Promise<void> {
  await assertNoNetworkLeaks(page);
  await mockAll(page, {
    bootstrap: ianaBootstrap(),
    // mockPorkbun wraps as { pricing: <input> }, so pass the inner pricing map.
    porkbun: porkbunPricing().pricing,
    cloudflare: cloudflarePricing(),
  });
}

/** Assert no off-allowlist requests were made. */
function expectNoLeaks(page: Page): void {
  expect(getLeakedRequests(page)).toEqual([]);
}

/** RDAP 200 rule (domain registered). */
function rdapTakenRule(domain: string): RdapRule {
  return {
    domain,
    response: {
      status: 200,
      body: {
        objectClassName: 'domain',
        ldhName: domain,
        handle: domain,
        status: ['clientTransferProhibited'],
        events: [],
      },
    },
  };
}

/** RDAP 404 rule (domain not in registry). */
function rdapFreeRule(domain: string): RdapRule {
  return { domain, response: { status: 404 } };
}

/** Wait for a result row to appear (dots in domain → hyphens in testid). */
function resultRow(domain: string): string {
  return `[data-testid="results-row-${domain.replace(/\./g, '-')}"]`;
}

// ---- Tests ----

test.describe('Cross-cutting features', () => {
  test('theme toggle flips theme and back', async ({ page }) => {
    await setupCommonMocks(page);
    await openApp(page);

    // Default: 'system' + colorScheme 'light' → data-theme='light'
    const themeBefore = await page.evaluate<string | undefined>(
      () => document.documentElement.dataset.theme,
    );
    expect(themeBefore).toBe('light');

    // Toggle → dark
    await page.click('[data-testid="app-theme-toggle"]');
    const themeAfter = await page.evaluate<string | undefined>(
      () => document.documentElement.dataset.theme,
    );
    expect(themeAfter).toBe('dark');

    // Toggle back → light
    await page.click('[data-testid="app-theme-toggle"]');
    const themeFinal = await page.evaluate<string | undefined>(
      () => document.documentElement.dataset.theme,
    );
    expect(themeFinal).toBe('light');

    expectNoLeaks(page);
  });

  test('language toggle EN→RU changes aria-label', async ({ page }) => {
    await setupCommonMocks(page);
    await openApp(page);

    const toggle = page.locator('[data-testid="app-lang-toggle"]');
    // EN: aria-label is t('lang.label') = 'Language' (from en.ts)
    await expect(toggle).toHaveAttribute('aria-label', 'Language');

    await toggle.click();
    // RU: aria-label is t('lang.label') = 'Язык' (from ru.ts)
    await expect(toggle).toHaveAttribute('aria-label', 'Язык');

    expectNoLeaks(page);
  });

  test('language toggle RU→EN restores English', async ({ page }) => {
    await setupCommonMocks(page);
    await openApp(page);

    const toggle = page.locator('[data-testid="app-lang-toggle"]');
    await toggle.click(); // EN → RU
    await expect(toggle).toHaveAttribute('aria-label', 'Язык');

    await toggle.click(); // RU → EN
    await expect(toggle).toHaveAttribute('aria-label', 'Language');

    expectNoLeaks(page);
  });

  test('share link auto-runs the check', async ({ page }) => {
    await setupCommonMocks(page);
    await mockRdap(page, [rdapFreeRule('zzqxtest1.com')]);

    // Craft share URL with run:true — encodeShare produces '#s=<base64url>'
    const shareHash = encodeShare({ q: 'zzqxtest1', tlds: ['com'], run: true });
    await openApp(page, { hash: shareHash });

    // Input pre-filled with the encoded query
    await expect(page.locator('[data-testid="check-input-domains"]')).toHaveValue('zzqxtest1');

    // TLD 'com' selected (chip has 'selected' class)
    await expect(page.locator('[data-testid="tld-chip-com"]')).toHaveClass(/selected/);

    // Auto-run: result row appears without clicking start
    await expect(page.locator(resultRow('zzqxtest1.com'))).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="status-badge-available"]')).toBeVisible();

    expectNoLeaks(page);
  });

  test('share link encode roundtrips query and zones', async ({ page, context }) => {
    await setupCommonMocks(page);
    await mockRdap(page, [rdapFreeRule('zzqxtest1.com')]);
    await grantClipboard(context);

    await openApp(page);

    // Clear default TLD selection, then select only 'com'
    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-chip-com"]');

    // Fill input
    await page.fill('[data-testid="check-input-domains"]', 'zzqxtest1');

    // Run check (needed so share button is enabled: disabled={!hasResults})
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator(resultRow('zzqxtest1.com'))).toBeVisible({ timeout: 15_000 });

    // Click share
    await page.click('[data-testid="check-button-share"]');

    // Read clipboard
    const url = await readClipboard(page);
    expect(url).toContain('#s=');

    // Decode and verify roundtrip
    const hashStart = url.indexOf('#s=');
    const hash = url.substring(hashStart);
    const parsed = parseShare(hash);
    expect(parsed).not.toBeNull();
    expect(parsed?.q).toBe('zzqxtest1');
    expect(parsed?.tlds).toEqual(['com']);
    expect(parsed?.run).toBe(true);

    expectNoLeaks(page);
  });

  test('resume YES continues interrupted run', async ({ page }) => {
    await setupCommonMocks(page);
    await mockRdap(page, [rdapFreeRule('zzqxtest1.com')]);

    // Seed interrupted-run snapshot (dh:v1:run) before boot
    const snapshot: RunSnapshot = {
      pending: ['zzqxtest1.com'],
      tlds: ['com'],
      ignoreCache: false,
      ts: Date.now(),
    };
    await openApp(page, { seed: { 'dh:v1:run': snapshot } });

    // Resume banner visible
    await expect(page.locator('[data-testid="check-button-resume"]')).toBeVisible();
    await expect(page.locator('[data-testid="check-button-discard"]')).toBeVisible();

    // Click resume
    await page.click('[data-testid="check-button-resume"]');

    // Results appear
    await expect(page.locator(resultRow('zzqxtest1.com'))).toBeVisible({ timeout: 15_000 });

    // Banner gone
    await expect(page.locator('[data-testid="check-button-resume"]')).toBeHidden();

    expectNoLeaks(page);
  });

  test('resume NO discards and clears localStorage', async ({ page }) => {
    await setupCommonMocks(page);

    const snapshot: RunSnapshot = {
      pending: ['zzqxtest1.com'],
      tlds: ['com'],
      ignoreCache: false,
      ts: Date.now(),
    };
    await openApp(page, { seed: { 'dh:v1:run': snapshot } });

    // Banner visible
    await expect(page.locator('[data-testid="check-button-discard"]')).toBeVisible();

    // Click discard
    await page.click('[data-testid="check-button-discard"]');

    // Banner gone
    await expect(page.locator('[data-testid="check-button-discard"]')).toBeHidden();

    // dh:v1:run removed from localStorage
    const runKey = await page.evaluate<string | null>(() => localStorage.getItem('dh:v1:run'));
    expect(runKey).toBeNull();

    expectNoLeaks(page);
  });

  test('CSV export has BOM, headers, and domain rows', async ({ page }) => {
    await setupCommonMocks(page);
    await mockRdap(page, [
      rdapTakenRule('google.com'),
      rdapFreeRule('zzqxtest1.com'),
    ]);

    // Seed pricing cache so prices are available immediately (no live fetch)
    await openApp(page, {
      seed: { 'dh:v1:pricing': seedPricingTable() },
    });

    // Fill input with mixed-status domains
    await page.fill('[data-testid="check-input-domains"]', 'google.com\nzzqxtest1.com');
    // 'com' is in defaultTlds, already selected

    // Start check
    await page.click('[data-testid="check-button-start"]');

    // Wait for both results
    await expect(page.locator(resultRow('google.com'))).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(resultRow('zzqxtest1.com'))).toBeVisible({ timeout: 15_000 });

    // Install blob-URL spy to capture CSV content (downloadCsv uses blob + <a download>).
    // Capture RAW BYTES: blob.text() UTF-8-decodes and strips the BOM we need to assert.
    await page.evaluate(() => {
      const w = window as Window & { __csvBytes?: number[] };
      w.__csvBytes = [];
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (blob: Blob | MediaSource): string {
        if (blob instanceof Blob) {
          void blob.arrayBuffer().then((buf: ArrayBuffer) => {
            w.__csvBytes = Array.from(new Uint8Array(buf));
          });
        }
        return orig.call(URL, blob);
      };
    });

    // Click CSV export
    await page.click('[data-testid="check-button-csv"]');

    // Wait for blob content to be captured
    await page.waitForFunction(
      () => ((window as Window & { __csvBytes?: number[] }).__csvBytes ?? []).length > 0,
    );

    const bytes = await page.evaluate<number[]>(
      () => (window as Window & { __csvBytes?: number[] }).__csvBytes ?? [],
    );

    // BOM prefix: raw UTF-8 bytes EF BB BF
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);

    // Decode for content assertions (TextDecoder strips the BOM — fine here)
    const content = new TextDecoder().decode(new Uint8Array(bytes));

    // Header row (translated — test runs in English locale)
    expect(content).toContain(
      'Domain,Status,TLD,First year,Renewal,Cheapest registrar,Checked at',
    );

    // Domain rows with correct statuses
    expect(content).toContain('google.com,taken,com,');
    expect(content).toContain('zzqxtest1.com,available,com,');

    // CRLF line endings
    expect(content).toContain('\r\n');

    expectNoLeaks(page);
  });

  test('tab switch preserves results', async ({ page }) => {
    await setupCommonMocks(page);
    await mockRdap(page, [rdapFreeRule('zzqxtest1.com')]);

    await openApp(page);

    // Run check
    await page.fill('[data-testid="check-input-domains"]', 'zzqxtest1');
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator(resultRow('zzqxtest1.com'))).toBeVisible({ timeout: 15_000 });

    // Switch to generators tab
    await navigateToTab(page, 'generators');
    // Switch back to check tab
    await navigateToTab(page, 'check');

    // Results still present
    await expect(page.locator(resultRow('zzqxtest1.com'))).toBeVisible();

    expectNoLeaks(page);
  });

  test('settings persist across tab switch', async ({ page }) => {
    await setupCommonMocks(page);
    await openApp(page);

    // Go to settings tab
    await navigateToTab(page, 'settings');

    // Change currency to EUR
    await page.selectOption('[data-testid="settings-select-currency"]', 'EUR');

    // Switch to check tab
    await navigateToTab(page, 'check');
    // Switch back to settings tab
    await navigateToTab(page, 'settings');

    // Value retained
    await expect(page.locator('[data-testid="settings-select-currency"]')).toHaveValue('EUR');

    expectNoLeaks(page);
  });
});
