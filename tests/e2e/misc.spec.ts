/**
 * Misc E2E — covers the remaining manifest testids that don't belong to a
 * single tab spec: skip link, footer link, input warnings, tooltip, results
 * toolbar (filter-all / suggest / sort-status / sort-renew / sort-tco /
 * showing count), generator sets-controls + tray-count badge, EUR rate input,
 * GitHub device-flow verify link.
 *
 * Selectors: data-testid ONLY. All network mocked; zero leaks asserted.
 */
import { test, expect, type Page } from '@playwright/test';
import { openApp, navigateToTab } from './helpers/setup';
import { assertNoNetworkLeaks, getLeakedRequests, mockAll, mockDoh, mockRdap } from './helpers/mocks';
import { DEFAULT_SETTINGS } from '../../src/types';
import {
  ianaBootstrap,
  porkbunPricing,
  cloudflarePricing,
  seedPricingTable,
} from './fixtures';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

async function bootWithMixedResults(page: Page): Promise<void> {
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
  // High-trust 404 is DoH-corroborated now (SPEC §7) — mock the probe.
  await mockDoh(page, { 'zzqxtest1.com': 'nxdomain' });
  await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

  // Narrow to .com only, run two mixed-status checks, wait for completion.
  await page.click('[data-testid="tld-button-clear"]');
  await page.click('[data-testid="tld-picker-toggle"]');
  await page.click('[data-testid="tld-chip-com"]');
  await page.click('[data-testid="tld-picker-toggle"]');
  await page.fill('[data-testid="check-input-domains"]', 'google.com\nzzqxtest1.com');
  await page.click('[data-testid="check-button-start"]');
  await expect(page.locator('[data-testid="results-row-google-com"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-testid="results-row-zzqxtest1-com"]')).toBeVisible({
    timeout: 15_000,
  });
  // Run completes: stop button disappears.
  await expect(page.locator('[data-testid="check-button-stop"]')).toBeHidden({
    timeout: 15_000,
  });
}

function expectNoLeaks(page: Page): void {
  expect(getLeakedRequests(page)).toEqual([]);
}

test.describe('Misc coverage', () => {
  test('skip link points at main content and is focusable', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    const skip = page.locator('[data-testid="app-skip-link"]');
    await expect(skip).toHaveAttribute('href', '#main-content');
    await skip.focus();
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    );
    expect(focused).toBe('app-skip-link');
    expectNoLeaks(page);
  });

  test('footer GitHub link is external-safe', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    const link = page.locator('[data-testid="app-footer-github"]');
    await expect(link).toHaveAttribute('href', /github\.com\/WhiteBite\/Domain-Hunter/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    expectNoLeaks(page);
  });

  test('input preview shows invalid-count warning', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    // A line that cannot be normalized as a domain counts as invalid.
    await page.fill('[data-testid="check-input-domains"]', 'goodname\n!!!bad line!!!');

    await expect(page.locator('[data-testid="check-preview-invalid"]')).toBeVisible({
      timeout: 10_000,
    });
    expectNoLeaks(page);
  });

  test('input preview shows too-many warning past the cap', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    // 3001 names > MAX_NAMES (3000) → warn span renders.
    const names = Array.from({ length: 3001 }, (_, i) => `n${i}`).join('\n');
    await page.fill('[data-testid="check-input-domains"]', names);

    await expect(page.locator('[data-testid="check-preview-warn"]')).toBeVisible({
      timeout: 10_000,
    });
    expectNoLeaks(page);
  });

  test('tooltip trigger shows the tooltip on hover', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    const trigger = page.locator('[data-testid="tooltip-trigger"]');
    const inner = page.locator('[data-testid="tooltip-trigger-inner"]');
    await expect(trigger).toBeVisible();
    await expect(inner).toBeVisible();

    await trigger.hover();
    await expect(page.locator('[role="tooltip"]')).toBeVisible({ timeout: 5_000 });
    expectNoLeaks(page);
  });

  test('promo-trap tooltip wraps and stays within the viewport near the right edge', async ({
    page,
  }) => {
    // Narrow viewport + long domain: the column sum (~567px) exceeds the
    // ~418px wrapper, so at scrollLeft=0 the price cell hugs the wrapper's
    // right edge — a centered 320px bubble over the trap chip WOULD cross the
    // viewport edge (~120px overflow) without horizontal clamping.
    await page.setViewportSize({ width: 450, height: 800 });
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    // .xyz fixture pricing is a promo trap ($2.04 first year, $12.98 renewal).
    await mockRdap(page, [{ domain: 'zzqxtest1zzqx2.xyz', response: { status: 404 } }]);
    await mockDoh(page, { 'zzqxtest1zzqx2.xyz': 'nxdomain' });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    // Narrow the run to .xyz only.
    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.click('[data-testid="tld-chip-xyz"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.fill('[data-testid="check-input-domains"]', 'zzqxtest1zzqx2.xyz');
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator('[data-testid="results-row-zzqxtest1zzqx2-xyz"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="check-button-stop"]')).toBeHidden({
      timeout: 15_000,
    });

    // The price cell sits at the right edge of the visible wrapper.
    await page.evaluate(() => {
      document.querySelector('.table-wrap')!.scrollLeft = 0;
    });
    const chip = page.locator('[data-testid="tooltip-trigger-inner"]:has(.chip-tag.trap)');
    await expect(chip).toBeVisible();
    // The trap chip itself is focusable (keyboard/touch tooltip path).
    await expect(
      page.locator('[data-testid="results-chip-trap-zzqxtest1zzqx2-xyz"]'),
    ).toBeVisible();

    // Hover via mouse.move (locator.hover() would auto-scroll the table).
    const chipBox = await chip.boundingBox();
    expect(chipBox).not.toBeNull();
    await page.mouse.move(chipBox!.x + chipBox!.width / 2, chipBox!.y + chipBox!.height / 2);
    const tip = page.locator('[role="tooltip"]');
    await expect(tip).toBeVisible({ timeout: 5_000 });

    // The bubble's bounding box stays fully within the viewport width.
    const box = await tip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(450);

    // The long parametrized text wraps inside the bubble (no single-line spill).
    const overflowPx = await tip.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflowPx).toBeLessThanOrEqual(1);

    // Keyboard focus shows the same clamped tooltip (focus-visible path).
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
    await chip.focus();
    // Programmatic focus may not match :focus-visible after mouse activity;
    // Tab moves keyboard focus onto the focusable chip itself, which must
    // open the tooltip.
    await page.keyboard.press('Tab');
    await expect(tip).toBeVisible({ timeout: 5_000 });
    const focusBox = await tip.boundingBox();
    expect(focusBox).not.toBeNull();
    expect(focusBox!.x).toBeGreaterThanOrEqual(0);
    expect(focusBox!.x + focusBox!.width).toBeLessThanOrEqual(450);
    expectNoLeaks(page);
  });

  test('promo chip below the wholesale floor shows and opens its tooltip', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await mockRdap(page, [{ domain: 'zzqxpromo.com', response: { status: 404 } }]);
    await mockDoh(page, { 'zzqxpromo.com': 'nxdomain' });
    // .com cheapest reg (999¢) below the $10.26 wholesale floor → promo chip.
    const promoSeed = seedPricingTable();
    promoSeed.table.tlds.com = {
      porkbun: { reg: 999, renew: 1168, transfer: 1168 },
      cloudflare: { reg: 1044, renew: 1044, transfer: null },
    };
    await openApp(page, { seed: { 'dh:v1:pricing': promoSeed } });

    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.click('[data-testid="tld-chip-com"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.fill('[data-testid="check-input-domains"]', 'zzqxpromo.com');
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator('[data-testid="results-row-zzqxpromo-com"]')).toBeVisible({
      timeout: 15_000,
    });

    const promo = page.locator('[data-testid="results-chip-promo-zzqxpromo-com"]');
    await expect(promo).toBeVisible();
    // Hovering the chip opens the promo tooltip.
    await promo.hover();
    await expect(page.locator('[role="tooltip"]')).toBeVisible({ timeout: 5_000 });
    expectNoLeaks(page);
  });

  test('results toolbar: filter-all restores rows, showing-count reflects them', async ({
    page,
  }) => {
    await bootWithMixedResults(page);

    // Filter to available → taken row hidden.
    await page.click('[data-testid="results-filter-available"]');
    await expect(page.locator('[data-testid="results-row-google-com"]')).toBeHidden();

    // Filter back to all → both rows visible again.
    await page.click('[data-testid="results-filter-all"]');
    await expect(page.locator('[data-testid="results-row-google-com"]')).toBeVisible();
    await expect(page.locator('[data-testid="results-row-zzqxtest1-com"]')).toBeVisible();

    // Showing count displays "X of Y" numbers.
    await expect(page.locator('[data-testid="results-showing-count"]')).toContainText(/\d+/);
    expectNoLeaks(page);
  });

  test('suggest-available shortcut switches to the available filter', async ({ page }) => {
    await bootWithMixedResults(page);

    const suggest = page.locator('[data-testid="results-filter-suggest-available"]');
    await expect(suggest).toBeVisible();
    await suggest.click();

    await expect(page.locator('[data-testid="results-row-zzqxtest1-com"]')).toBeVisible();
    await expect(page.locator('[data-testid="results-row-google-com"]')).toBeHidden();
    expectNoLeaks(page);
  });

  test('sort buttons set aria-sort on their column (name/status/price/renew)', async ({
    page,
  }) => {
    await bootWithMixedResults(page);

    // Literal testids (the inventory meta-test greps specs for exact strings).
    for (const testid of [
      'results-sort-name',
      'results-sort-status',
      'results-sort-price',
      'results-sort-renew',
    ]) {
      const btn = page.locator(`[data-testid="${testid}"]`);
      const th = page.locator(`th:has([data-testid="${testid}"])`);
      await btn.click();
      await expect(th).toHaveAttribute('aria-sort', /ascending|descending/);
    }
    expectNoLeaks(page);
  });

  test('premium-likely chip flags short names in premium-heavy zones', async ({
    page,
  }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await mockRdap(page, [{ domain: 'ace.xyz', response: { status: 404 } }]);
    // High-trust 404 is now corroborated by a DoH NS probe (SPEC §7 DoH
    // veto): the mock must answer NXDOMAIN for the unregistered name, or
    // the default noerror turns the row 'taken'.
    await mockDoh(page, { 'ace.xyz': 'nxdomain' });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.click('[data-testid="tld-chip-xyz"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.fill('[data-testid="check-input-domains"]', 'ace.xyz');
    await page.click('[data-testid="check-button-start"]');

    // 'ace' (≤4 chars) in .xyz (premium-heavy) → heuristic chip on the
    // available row.
    await expect(
      page.locator('[data-testid="results-chip-premium-likely-ace-xyz"]'),
    ).toBeVisible({ timeout: 15_000 });
    expectNoLeaks(page);
  });

  test('result row domain link and detail buy link render for available rows', async ({
    page,
  }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
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
    await mockRdap(page, [{ domain: 'zzqxtest1.com', response: { status: 404 } }]);
    await mockDoh(page, { 'zzqxtest1.com': 'nxdomain' });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.click('[data-testid="tld-chip-com"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.fill('[data-testid="check-input-domains"]', 'zzqxtest1.com');
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator('[data-testid="results-row-zzqxtest1-com"]')).toBeVisible({
      timeout: 15_000,
    });

    // Available row with pricing renders the domain as a registrar link.
    await expect(page.locator('[data-testid^="results-row-link-"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Detail row renders the DigMyName buy link (open ⋯ menu first).
    await page.click('[data-testid="results-row-menu-zzqxtest1-com"]');
    await page.click('[data-testid="results-row-detail-zzqxtest1-com"]');
    await expect(
      page.locator('[data-testid^="results-row-detail-buy-"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Expanded detail row carries the parent row status class.
    const expanded = page.locator('[data-testid="results-row-expanded-zzqxtest1-com"]');
    await expect(expanded).toBeVisible();
    await expect(expanded).toHaveClass(/is-available/);

    // Registrar comparison renders from the offline pricing store
    // (.com has 2 registrars in the fixture: Porkbun + Cloudflare).
    const registrarsBlock = page.locator(
      '[data-testid="results-row-registrars-zzqxtest1-com"]',
    );
    await expect(registrarsBlock).toBeVisible();
    await expect(registrarsBlock).toContainText('Porkbun');
    await expect(registrarsBlock).toContainText('Cloudflare Registrar');

    // Quotes are buy links: deep link when the template supports {domain},
    // landing page otherwise (Cloudflare has no public deep link).
    await expect(
      page.locator('[data-testid="results-row-registrar-zzqxtest1-com-porkbun"]'),
    ).toHaveAttribute('href', /porkbun\.com\/checkout\/search\?q=zzqxtest1\.com/);
    await expect(
      page.locator('[data-testid="results-row-registrar-zzqxtest1-com-cloudflare"]'),
    ).toHaveAttribute('href', 'https://domains.cloudflare.com/');
    expectNoLeaks(page);
  });

  test('premium override: row price cell shows premium price with standard struck through', async ({
    page,
  }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
      digmyname: [
        {
          domain: 'zzqxtest1.com',
          result: {
            premium: true,
            likely_premium: false,
            price_usd: 348,
            cheapest_registrar: { name: 'porkbun', reg_price_usd: 11.68 },
            buy_url: 'https://porkbun.com/checkout/search?q=zzqxtest1.com',
          },
        },
      ],
    });
    await mockRdap(page, [{ domain: 'zzqxtest1.com', response: { status: 404 } }]);
    await mockDoh(page, { 'zzqxtest1.com': 'nxdomain' });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.click('[data-testid="tld-chip-com"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.fill('[data-testid="check-input-domains"]', 'zzqxtest1.com');
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator('[data-testid="results-row-zzqxtest1-com"]')).toBeVisible({
      timeout: 15_000,
    });

    // Before opening details, the row shows the coupon-effective first-year
    // price ($10.44 − $0.95 AWESOME2026 = $9.49) with the standard price
    // struck through.
    const priceCell = page.locator('[data-testid="results-row-zzqxtest1-com"] .price-cell');
    await expect(priceCell).toContainText('$9.49');
    await expect(priceCell.locator('.price-strike')).toHaveCount(1);
    await expect(priceCell.locator('.price-strike')).toContainText('$10.44');

    // Open details (triggers the on-demand DigMyName premium check).
    await page.click('[data-testid="results-row-menu-zzqxtest1-com"]');
    await page.click('[data-testid="results-row-detail-zzqxtest1-com"]');

    // After the premium check resolves, the row price cell shows the
    // premium override ($348.00) with the standard price ($10.44) struck
    // through, plus an amber premium chip-tag.
    await expect(priceCell).toContainText('$348.00', { timeout: 10_000 });
    await expect(priceCell.locator('.price-strike')).toBeVisible();
    await expect(priceCell.locator('.price-strike')).toContainText('$10.44');
    await expect(priceCell.locator('.chip-tag.premium')).toBeVisible();
    await expect(
      priceCell.locator('[data-testid="results-chip-premium-zzqxtest1-com"]'),
    ).toBeVisible();

    expectNoLeaks(page);
  });

  test('bulk premium check: button fetches premium prices and shows found chip', async ({
    page,
  }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
      digmyname: [
        {
          domain: 'zzqxpremium.com',
          result: {
            premium: true,
            likely_premium: false,
            price_usd: 2500,
            cheapest_registrar: { name: 'porkbun', reg_price_usd: 11.68 },
            buy_url: 'https://porkbun.com/checkout/search?q=zzqxpremium.com',
          },
        },
        {
          domain: 'zzqxplain.com',
          result: {
            premium: false,
            likely_premium: false,
            cheapest_registrar: { name: 'porkbun', reg_price_usd: 11.68 },
            buy_url: 'https://porkbun.com/checkout/search?q=zzqxplain.com',
          },
        },
      ],
    });
    await mockRdap(page, [
      { domain: 'zzqxpremium.com', response: { status: 404 } },
      { domain: 'zzqxplain.com', response: { status: 404 } },
    ]);
    await mockDoh(page, { 'zzqxpremium.com': 'nxdomain', 'zzqxplain.com': 'nxdomain' });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });

    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.click('[data-testid="tld-chip-com"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.fill('[data-testid="check-input-domains"]', 'zzqxpremium.com\nzzqxplain.com');
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator('[data-testid="results-row-zzqxpremium-com"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="results-row-zzqxplain-com"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="check-button-stop"]')).toBeHidden({
      timeout: 15_000,
    });

    // Before bulk check: premium button is visible and enabled, no found chip.
    const btn = page.locator('[data-testid="results-premium-check"]');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await expect(page.locator('[data-testid="results-premium-found"]')).toHaveCount(0);

    // Before bulk check: premium row shows the coupon-effective first-year
    // price with the standard price struck through (AWESOME2026 applies to .com).
    const premCell = page.locator(
      '[data-testid="results-row-zzqxpremium-com"] .price-cell',
    );
    await expect(premCell).toContainText('$9.49');
    await expect(premCell.locator('.price-strike')).toHaveCount(1);
    await expect(premCell.locator('.price-strike')).toContainText('$10.44');

    // Click the bulk premium check button.
    await btn.click();

    // After the check resolves: premium domain shows $2,500.00 with strike
    // and amber premium chip; non-premium domain keeps standard price.
    await expect(premCell).toContainText('$2,500.00', { timeout: 10_000 });
    await expect(premCell.locator('.price-strike')).toBeVisible();
    await expect(premCell.locator('.price-strike')).toContainText('$10.44');
    await expect(premCell.locator('.chip-tag.premium')).toBeVisible();

    // Non-premium row keeps the coupon-effective price (strike stays visible).
    const plainCell = page.locator(
      '[data-testid="results-row-zzqxplain-com"] .price-cell',
    );
    await expect(plainCell.locator('.price-strike')).toHaveCount(1);

    // Found chip shows "premium: 1".
    const found = page.locator('[data-testid="results-premium-found"]');
    await expect(found).toBeVisible();
    await expect(found).toContainText('premium: 1');

    expectNoLeaks(page);
  });

  test('gen-sets-controls is rendered in the sets summary', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });
    await navigateToTab(page, 'generators');

    await expect(page.locator('[data-testid="gen-sets-controls"]')).toBeVisible();
    expectNoLeaks(page);
  });

  test('gen-tray-count badge shows the candidate count', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });
    await navigateToTab(page, 'generators');

    await page.locator('[data-testid="gen-input-keywords"]').fill('test');
    await page.click('[data-testid="gen-button-generate"]');

    const badge = page.locator('[data-testid="gen-tray-count"]');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    expect(await badge.textContent()).toMatch(/\d+/);
    expectNoLeaks(page);
  });

  test('EUR rate input persists a valid value', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });
    await navigateToTab(page, 'settings');

    const eur = page.locator('[data-testid="settings-input-rate-eur"]');
    // onchange-driven: blur fires the change event that persists the value.
    await eur.fill('90');
    await eur.blur();

    const stored = await page.evaluate(() => localStorage.getItem('dh:v1:settings'));
    expect(stored).not.toBeNull();
    expect((JSON.parse(stored as string) as { rates: { EUR: number } }).rates.EUR).toBe(90);
    expectNoLeaks(page);
  });

  test('GitHub device flow shows the verify link with the flow URI', async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, {
      bootstrap: ianaBootstrap(),
      porkbun: porkbunPricing().pricing,
      cloudflare: cloudflarePricing(),
    });
    // Device-flow endpoints (api.github.com is on the leak allowlist).
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
      // Keep the flow pending (authorization_pending) so the verify link stays up.
      await route.fulfill({
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'authorization_pending' }),
      });
    });

    await openApp(page, {
      seed: {
        'dh:v1:settings': { ...DEFAULT_SETTINGS, proxyUrl: 'https://api.github.com/' },
        'dh:v1:pricing': seedPricingTable(),
      },
    });
    await navigateToTab(page, 'settings');

    await page.click('[data-testid="settings-button-github-connect"]');

    const verify = page.locator('[data-testid="settings-link-github-verify"]');
    await expect(verify).toBeVisible({ timeout: 10_000 });
    await expect(verify).toHaveAttribute('href', 'https://github.com/login/device');
    await expect(verify).toHaveAttribute('target', '_blank');
    expectNoLeaks(page);
  });
});
