/**
 * Inventory meta-test — the "every button is covered" guarantee.
 *
 * Three checks:
 *  1. DOM inventory: boot the app, visit every tab and every transient UI
 *     state (TLD picker expanded, populated results table incl. detail row,
 *     populated generator tray, theme word grid, opened <details> panels,
 *     tooltip trigger), enumerate every interactive element, and FAIL if any
 *     lacks a data-testid.
 *  2. Manifest ↔ source drift: every static testid in the manifest exists
 *     verbatim in src/, every dynamic prefix exists in src/.
 *  3. Manifest ↔ spec coverage: every static testid and every dynamic prefix
 *     is referenced by at least one tests/e2e/*.spec.ts file.
 *
 * Selectors here use data-testid only (same rule as every other spec).
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openApp, navigateToTab } from './helpers/setup';
import { assertNoNetworkLeaks, getLeakedRequests, mockAll, mockRdap } from './helpers/mocks';
import { ALL_TESTIDS, DYNAMIC_TESTID_PREFIXES } from './helpers/manifest';
import {
  ianaBootstrap,
  porkbunPricing,
  cloudflarePricing,
  seedPricingTable,
} from './fixtures';

const ROOT = new URL('../../', import.meta.url);

// Selectors for elements a user can interact with. Svelte attaches listeners
// via addEventListener (no [onclick] attribute to detect), so this list covers
// native interactive elements + ARIA interactive roles + keyboard focusables.
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[tabindex="0"]',
].join(', ');

/** Collect [tag, testid-or-empty, outerHTML-snippet] for every interactive element. */
async function collectInteractive(page: Page): Promise<{ tag: string; testid: string; html: string }[]> {
  return page.evaluate((selector: string) => {
    const els = Array.from(document.querySelectorAll(selector));
    return els.map((el) => ({
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid') ?? '',
      html: el.outerHTML.slice(0, 160),
    }));
  }, INTERACTIVE_SELECTOR);
}

/** Expand transient UI states so their elements exist in the DOM. */
async function expandTransientUi(page: Page): Promise<void> {
  // Check tab: full TLD list + populated results table incl. a detail row.
  await navigateToTab(page, 'check');
  // Open the TLD popover so its contained elements (presets, chips) are in the DOM.
  await page.click('[data-testid="tld-picker-toggle"]');
  await page.click('[data-testid="tld-preset-all"]');

  // Narrow the run to exactly 2 checks: clear selection, keep only .com.
  await page.click('[data-testid="tld-button-clear"]');
  await page.click('[data-testid="tld-chip-com"]');
  // Close popover so it doesn't intercept clicks on elements below it.
  await page.click('[data-testid="tld-picker-toggle"]');
  await page.fill('[data-testid="check-input-domains"]', 'google.com\nzzqxtest1.com');
  await page.click('[data-testid="check-button-start"]');
  await expect(page.locator('[data-testid="results-row-google-com"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-testid="results-row-zzqxtest1-com"]')).toBeVisible({
    timeout: 15_000,
  });
  // Open the detail row of the available domain (renders the detail-buy link).
  await page.click('[data-testid="results-row-menu-zzqxtest1-com"]');
  await page.click('[data-testid="results-row-detail-zzqxtest1-com"]');
  await expect(page.locator('[data-testid^="results-row-detail-buy-"]')).toBeVisible({
    timeout: 10_000,
  });

  // Generators tab: populated tray + theme grid + opened <details> panels.
  await navigateToTab(page, 'generators');
  await page.fill('[data-testid="gen-input-keywords"]', 'midas');
  await page.click('[data-testid="gen-button-generate"]');
  await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible({
    timeout: 10_000,
  });
  await page.click('[data-testid="gen-summary-params"]');
  await expect(page.locator('[data-testid="gen-textarea-affixes"]')).toBeVisible();
  await page.click('[data-testid="gen-summary-sets"]');
  await expect(page.locator('[data-testid="gen-button-export-sets"]')).toBeVisible();
  // Open the first theme category to render its word grid.
  const firstTheme = page.locator('[data-testid^="gen-theme-chip-"]').first();
  await firstTheme.click();
  await expect(page.locator('[data-testid^="gen-theme-word-"]').first()).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Inventory meta-test', () => {
  test('every interactive element in every tab/state has a data-testid', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await mockRdap(page, [
      {
        domain: 'google.com',
        response: {
          status: 200,
          body: { objectClassName: 'domain', ldhName: 'google.com', handle: 'google.com' },
        },
      },
      { domain: 'zzqxtest1.com', response: { status: 404 } },
    ]);
    await mockAll(page, {
      digmyname: [
        {
          domain: 'zzqxtest1.com',
          result: {
            premium: false,
            likely_premium: false,
            cheapest_registrar: { name: 'porkbun', reg_price_usd: 11.68 },
            buy_url: 'https://porkbun.com/checkout/search?q=zzqxtest1.com',
          },
        },
      ],
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    // Visit every tab so lazily-mounted content enters the DOM.
    for (const tab of ['check', 'generators', 'drops', 'prices', 'social', 'settings', 'about'] as const) {
      await navigateToTab(page, tab);
    }

    await expandTransientUi(page);

    const elements = await collectInteractive(page);
    const missing = elements.filter((el) => el.testid === '');
    expect(
      missing,
      `Interactive elements without data-testid:\n${missing
        .map((m) => `  <${m.tag}> ${m.html}`)
        .join('\n')}`,
    ).toEqual([]);

    expect(getLeakedRequests(page)).toEqual([]);
  });

  test('manifest matches src/ (no drift)', async () => {
    const srcFiles = listFiles(fileURLToPath(new URL('src/', ROOT)));
    const srcContent = srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

    const missingStatic = ALL_TESTIDS.filter((id) => !srcContent.includes(`"${id}"`));
    const missingDynamic = DYNAMIC_TESTID_PREFIXES.filter(
      (p) => !srcContent.includes(`\`${p}\${`) && !srcContent.includes(`"${p}"`),
    );

    expect(missingStatic, 'Static testids absent from src/').toEqual([]);
    expect(missingDynamic, 'Dynamic testid prefixes absent from src/').toEqual([]);
  });

  test('every manifest testid is referenced by at least one spec', async () => {
    const e2eDir = fileURLToPath(new URL('.', import.meta.url));
    const specFiles = readdirSync(e2eDir)
      .filter((f) => f.endsWith('.spec.ts') && f !== 'inventory.spec.ts');
    expect(specFiles.length).toBeGreaterThan(0);
    const specContent = specFiles
      .map((f) => readFileSync(e2eDir + f, 'utf8'))
      .join('\n');

    const uncoveredStatic = ALL_TESTIDS.filter((id) => !specContent.includes(id));
    const uncoveredDynamic = DYNAMIC_TESTID_PREFIXES.filter((p) => !specContent.includes(p));

    expect(
      uncoveredStatic,
      `Static testids not referenced by any spec:\n${uncoveredStatic.join('\n')}`,
    ).toEqual([]);
    expect(
      uncoveredDynamic,
      `Dynamic testid prefixes not referenced by any spec:\n${uncoveredDynamic.join('\n')}`,
    ).toEqual([]);
  });
});

/** Recursively list files under a directory (Windows-safe). */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.name.endsWith('.svelte') || entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
