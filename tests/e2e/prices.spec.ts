/**
 * E2E — Prices tab.
 *
 * The Prices tab reads the pricing store (populated at boot by CheckTab's
 * loadPricing call). No new network calls — the tab is a pure view over the
 * existing pricing table. Pricing endpoints + bootstrap are mocked; RDAP/DoH
 * are mocked empty (the prices tab never triggers checks, but the catch-all
 * leak guard requires allowlisted endpoints to be mocked or absent).
 *
 * The seeded pricing table (seedPricingTable) has 8 TLDs (com, net, io, dev,
 * xyz, ai, de, co) each with porkbun + cloudflare entries — 2 registrars per
 * zone, satisfying the "2+ registrars per zone" fixture requirement.
 */
import { test, expect, type Page } from '@playwright/test';
import { openApp } from './helpers/setup';
import { assertNoNetworkLeaks, getLeakedRequests, mockAll } from './helpers/mocks';
import { ianaBootstrap, porkbunPricing, cloudflarePricing, seedPricingTable } from './fixtures';

// ---- Local tab navigation ----

async function gotoPrices(page: Page): Promise<void> {
  await page.click('[data-testid="app-tab-prices"]');
  await page.waitForSelector('[data-testid="prices-search"]', {
    state: 'visible',
    timeout: 10_000,
  });
}

// ---- Setup / teardown ----

test.beforeEach(async ({ page }) => {
  await assertNoNetworkLeaks(page);
  await mockAll(page, {
    bootstrap: ianaBootstrap(),
    porkbun: porkbunPricing().pricing,
    cloudflare: cloudflarePricing(),
    rdap: [],
    doh: {},
    digmyname: [],
  });
  await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });
});

test.afterEach(async ({ page }) => {
  expect(getLeakedRequests(page)).toEqual([]);
});

// ---- Tests ----

test.describe('Prices tab', () => {
  test('renders the price matrix with .com row and registrar columns', async ({ page }) => {
    await gotoPrices(page);

    // Wait for pricing data to populate the matrix (loadPricing is async).
    await expect(page.locator('[data-testid="prices-row-com"]')).toBeVisible({
      timeout: 10_000,
    });

    // Column headers include both registrars from the seed fixture plus the
    // cheapest-registrar Renewal and 3-year TCO columns.
    const headers = page.locator('thead th');
    await expect(headers).toHaveCount(5); // Zone + Porkbun + Cloudflare + Renewal + TCO
    await expect(headers.nth(1)).toContainText('Porkbun');
    await expect(headers.nth(2)).toContainText('Cloudflare');

    // The .com row has a cell with the min class (cheapest = cloudflare $10.44).
    const comRow = page.locator('[data-testid="prices-row-com"]');
    const minCell = comRow.locator('td.min');
    await expect(minCell).toHaveCount(1);
  });

  test('search input filters zones by substring', async ({ page }) => {
    await gotoPrices(page);
    await expect(page.locator('[data-testid="prices-row-com"]')).toBeVisible({
      timeout: 10_000,
    });

    await page.fill('[data-testid="prices-search"]', 'dev');

    // 'dev' zone is visible; 'com' is not.
    await expect(page.locator('[data-testid="prices-row-dev"]')).toBeVisible();
    await expect(page.locator('[data-testid="prices-row-com"]')).toHaveCount(0);
  });

  test('sort select changes the first row', async ({ page }) => {
    await gotoPrices(page);
    await expect(page.locator('[data-testid="prices-row-com"]')).toBeVisible({
      timeout: 10_000,
    });

    // Default sort = cheapest first-year. xyz has the cheapest reg ($2.04 porkbun).
    const firstRowDefault = page.locator('tbody tr').first();
    await expect(firstRowDefault).toHaveAttribute('data-testid', 'prices-row-xyz');

    // Switch to alphabetical — 'ac' comes first among curated zones.
    await page.selectOption('[data-testid="prices-sort"]', 'alpha');
    const firstRowAlpha = page.locator('tbody tr').first();
    await expect(firstRowAlpha).toHaveAttribute('data-testid', 'prices-row-ac');
  });

  test('hide-unpriced toggle filters zones without registrar prices', async ({ page }) => {
    await gotoPrices(page);
    await expect(page.locator('[data-testid="prices-row-com"]')).toBeVisible({
      timeout: 10_000,
    });

    const toggle = page.locator('[data-testid="prices-toggle-unpriced"]');
    // Default OFF: every curated zone renders, priced or not.
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const rowsBefore = await page.locator('[data-testid^="prices-row-"]').count();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // Zones with no reg price in the visible column set disappear.
    await expect
      .poll(async () => page.locator('[data-testid^="prices-row-"]').count(), {
        timeout: 5_000,
      })
      .toBeLessThan(rowsBefore);
    // Priced zones stay.
    await expect(page.locator('[data-testid="prices-row-com"]')).toBeVisible();
  });

  test('export button triggers a CSV download', async ({ page }) => {
    await gotoPrices(page);
    await expect(page.locator('[data-testid="prices-row-com"]')).toBeVisible({
      timeout: 10_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="prices-export-csv"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('prices');
  });

  test('show-more button reveals additional rows', async ({ page }) => {
    await gotoPrices(page);
    await expect(page.locator('[data-testid="prices-row-com"]')).toBeVisible({
      timeout: 10_000,
    });

    // The registry has 147+ curated zones — more than the initial 100-row cap.
    const moreBtn = page.locator('[data-testid="prices-more"]');
    await expect(moreBtn).toBeVisible();

    const rowsBefore = await page.locator('[data-testid^="prices-row-"]').count();
    await moreBtn.click();
    // After clicking, more rows are visible (count increases).
    await expect
      .poll(async () => page.locator('[data-testid^="prices-row-"]').count(), {
        timeout: 5_000,
      })
      .toBeGreaterThan(rowsBefore);
  });

  test('price cell shows the cheapest registrar monogram badge', async ({ page }) => {
    // App opens on Check tab. Narrow to .dev — porkbun is the cheapest
    // quote there in the seed fixture ($8.75 < cloudflare $10.44).
    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.click('[data-testid="tld-chip-dev"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.fill('[data-testid="check-input-domains"]', 'zzqxtest2.dev');
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator('[data-testid="results-row-zzqxtest2-dev"]')).toBeVisible({
      timeout: 15_000,
    });

    // The price cell carries the registrar badge with a title naming
    // the registrar whose quote is displayed. When a favicon is available
    // (REGISTRAR_ICONS) the badge is an <img>; otherwise a monogram <span>.
    const badge = page.locator(
      '[data-testid="results-row-zzqxtest2-dev"] .price-cell .reg-badge',
    );
    await expect(badge).toBeVisible({ timeout: 10_000 });
    const title = await badge.getAttribute('title');
    expect(title).toContain('Porkbun');
  });

  test('buy link uses deep-link registrar; comparison cells show no-deeplink title', async ({ page }) => {
    // App opens on Check tab. Narrow to .com and run a check.
    await page.click('[data-testid="tld-button-clear"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.click('[data-testid="tld-chip-com"]');
    await page.click('[data-testid="tld-picker-toggle"]');
    await page.fill('[data-testid="check-input-domains"]', 'zzqxtest1.com');
    await page.click('[data-testid="check-button-start"]');
    await expect(page.locator('[data-testid="results-row-zzqxtest1-com"]')).toBeVisible({
      timeout: 15_000,
    });

    // Buy button uses the deep-link registrar (porkbun), not the cheapest
    // landing-only registrar (cloudflare is cheaper but has no {domain}).
    const buy = page.locator('[data-testid="results-row-buy-zzqxtest1-com"]');
    await expect(buy).toBeVisible();
    const href = await buy.evaluate((el: HTMLElement) => el.getAttribute('href') ?? '');
    expect(href).toContain('porkbun.com/checkout/search');
    expect(href).toContain('zzqxtest1.com');

    // Open details to see comparison cells.
    await page.click('[data-testid="results-row-menu-zzqxtest1-com"]');
    await page.click('[data-testid="results-row-detail-zzqxtest1-com"]');

    // Cloudflare comparison anchor has a non-empty title (no deep link)
    // and href without the domain.
    const cfAnchor = page.locator(
      '[data-testid="results-row-registrar-zzqxtest1-com-cloudflare"]',
    );
    await expect(cfAnchor).toBeVisible({ timeout: 10_000 });
    await expect(cfAnchor).toHaveAttribute('href', 'https://domains.cloudflare.com/');
    const cfTitle = await cfAnchor.getAttribute('title');
    expect(cfTitle).not.toBeNull();
    expect(cfTitle).not.toBe('');

    // Porkbun comparison anchor has a deep link (no no-deeplink title).
    const pbAnchor = page.locator(
      '[data-testid="results-row-registrar-zzqxtest1-com-porkbun"]',
    );
    await expect(pbAnchor).toHaveAttribute(
      'href',
      /porkbun\.com\/checkout\/search\?q=zzqxtest1\.com/,
    );
    const pbTitle = await pbAnchor.getAttribute('title');
    expect(pbTitle).toBeNull();
  });
});
