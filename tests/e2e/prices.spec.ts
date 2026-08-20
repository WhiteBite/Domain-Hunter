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

    // Column headers include both registrars from the seed fixture.
    const headers = page.locator('thead th');
    await expect(headers).toHaveCount(3); // Zone + Porkbun + Cloudflare
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
});
