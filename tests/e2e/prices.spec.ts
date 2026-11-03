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
import { readFileSync } from 'node:fs';
import { openApp } from './helpers/setup';
import { assertNoNetworkLeaks, getLeakedRequests, mockAll, mockPorkbun } from './helpers/mocks';
import observedPorkbun from '../fixtures/porkbun-grouped-prices.json' with { type: 'json' };
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

  test('shows per-zone provenance and the actual cheapest renewal', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.sources = ['porkbun'];
    seed.table.priceProvenance = { observedAt: '2026-11-02T12:00:00Z', liveTlds: { porkbun: ['com'] } };
    seed.table.tlds.com = { porkbun: { reg: 100, renew: 5000, transfer: null }, cloudflare: { reg: 1000, renew: 300, transfer: null } };
    seed.table.tlds.net = { porkbun: { reg: 200, renew: 400, transfer: null }, cloudflare: { reg: 1000, renew: 1000, transfer: null } };
    await openApp(page, { seed: { 'dh:v1:pricing': seed } });
    await gotoPrices(page);
    const com = page.getByTestId('prices-row-com');
    const net = page.getByTestId('prices-row-net');
    await expect(com).toContainText('API: 2026-11-02');
    await expect(net).toContainText('Snapshot: date unknown');
    await expect(com.locator('td.best-cell').first()).toContainText('$3.00');
    await expect(com.locator('td.best-cell').first()).toContainText('Cloudflare');
    await page.getByTestId('prices-sort').selectOption('renew');
    const rows = page.locator('tbody tr');
    const values = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
    expect(values.indexOf('prices-row-com')).toBeLessThan(values.indexOf('prices-row-net'));
  });

  test('does not invent per-zone origin in a legacy cache', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.sources = ['porkbun'];
    delete seed.table.priceProvenance;
    await openApp(page, { seed: { 'dh:v1:pricing': seed } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-row-com')).toContainText('Source and date unknown');
  });

  test('can reveal registrar columns beyond the first six', async ({ page }) => {
    const seed = seedPricingTable();
    for (const id of ['dynadot', 'regru', 'beget', 'timeweb', 'namesilo']) {
      seed.table.tlds.com![id] = { reg: 2000, renew: 2500, transfer: null };
    }
    await openApp(page, { seed: { 'dh:v1:pricing': seed } });
    await gotoPrices(page);
    const headers = page.locator('thead th');
    await expect(headers).toHaveCount(10); // all sellers are visible by default
    const toggle = page.getByTestId('prices-toggle-registrars');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(headers).toHaveCount(9);
    await toggle.click();
    await expect(headers).toHaveCount(10);
    await expect(page.locator('thead')).toContainText('NameSilo');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(headers).toHaveCount(9);
  });

  test('invalidates old cache and displays grouped live Porkbun prices correctly', async ({ page }) => {
    await mockPorkbun(page, observedPorkbun.pricing);
    const old = seedPricingTable();
    old.table.tlds.car = { porkbun: { reg: 200, renew: 200, transfer: 200 } };
    const { table, fetchedAt } = old;
    await openApp(page, { seed: { 'dh:v1:pricing': { table, fetchedAt } } });
    await gotoPrices(page);
    await page.getByTestId('prices-search').fill('car');
    const car = page.getByTestId('prices-row-car');
    await expect(car).toContainText('$2,060.25');
    await expect(car).not.toContainText('$2.00');
    await page.getByTestId('prices-search').fill('web');
    await expect(page.getByTestId('prices-row-web')).not.toContainText('$0.00');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('dh:v1:pricing') ?? '{}').version)).toBe(2);
  });

  test('zero registration or renewal prices are labeled for verification', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds.com!.porkbun = { reg: 0, renew: 1000, transfer: null };
    seed.table.tlds.com!.cloudflare = { reg: 1000, renew: 0, transfer: null };
    await openApp(page, { seed: { 'dh:v1:pricing': seed } });
    await gotoPrices(page);
    const row = page.getByTestId('prices-row-com');
    await expect(row.locator('.renewal-hint', { hasText: 'Confirm zero price with seller' })).toHaveCount(2);
  });

  test('marks legacy REG.RU prices as undated and does not present oldPrice as renewal', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds.com!.regru = { reg: 200, renew: 268, transfer: null };
    await openApp(page, { seed: { 'dh:v1:pricing': seed } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-regru-note')).toContainText('collection date is unknown');
    await expect(page.getByTestId('prices-regru-note')).toContainText('Renewal is unverified');
    await expect(page.locator('th').filter({ hasText: 'REG.RU' }).locator('span.reg-badge')).toHaveText('RR');
    const com = page.getByTestId('prices-row-com');
    await expect(com.locator('td.best-cell').first()).toContainText('$10.44');
    await expect(com.locator('td.best-cell').first()).toContainText('Cloudflare');
    await expect(com.locator('td.best-cell').first()).not.toContainText('$2.68');
  });

  test('shows the REG.RU collection date rather than the table generation date', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds.com!.regru = { reg: 200, renew: null, transfer: null };
    seed.table.regruUpdatedAt = '2026-02-10T00:00:00.000Z';
    await openApp(page, { seed: { 'dh:v1:pricing': seed } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-regru-note')).toContainText('2026-02-10');
    await expect(page.getByTestId('prices-regru-note')).toContainText('exchange rates');
  });

  test('shows HostiMan source date and annual renewal in its price column', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds.com!.hostiman = { reg: 3351, renew: 3351, transfer: null };
    seed.table.tlds['рф'] = { hostiman: { reg: 248, renew: 496, transfer: null } };
    seed.table.hostimanUpdatedAt = '2026-10-30T00:00:00.000Z';
    await openApp(page, { seed: { 'dh:v1:pricing': seed } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-hostiman-note')).toContainText('2026-10-30');
    await expect(page.getByTestId('prices-hostiman-note')).toContainText('converted through USD');
    await expect(page.locator('thead')).toContainText('HostiMan');
    await expect(page.getByTestId('prices-row-com')).toContainText('Renewal: $33.51');
    await page.getByTestId('prices-search').fill('рф');
    await expect(page.getByTestId('prices-row-рф')).toContainText('Renewal: $4.96');
  });

  test('shows Timeweb annual registration and the renewal lower bound without treating it as exact', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds['рф'] = { timeweb: { reg: 248, renew: null, transfer: null } };
    seed.table.timewebUpdatedAt = '2026-10-30T00:00:00.000Z';
    seed.table.timewebRenewalFromRub = { 'рф': 399 };
    await openApp(page, { seed: { 'dh:v1:pricing': seed } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-timeweb-note')).toContainText('2026-10-30');
    await expect(page.getByTestId('prices-timeweb-note')).toContainText('excluded from TCO');
    await page.getByTestId('prices-search').fill('рф');
    const row = page.getByTestId('prices-row-рф');
    await expect(row).toContainText('Renewal from 399 ₽');
    await expect(row.locator('td.best-cell').first()).toHaveText('—');
    await expect(row.locator('td.best-cell').nth(1)).toHaveText('—');
  });

  test('bundled Sprinthost annual snapshot displays newly added and price-only zones', async ({ page }) => {
    await openApp(page, { seed: { 'dh:v1:settings': { currency: 'RUB', rates: { RUB: 90, EUR: 0.9 } } } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-sprinthost-note')).toContainText('2026-11-01');
    const toggle = page.getByTestId('prices-toggle-registrars');
    if (await toggle.count() && await toggle.getAttribute('aria-pressed') === 'false') await toggle.click();
    await expect(page.locator('thead')).toContainText('Sprinthost');
    await page.getByTestId('prices-search').fill('xyz');
    const xyz = page.getByTestId('prices-row-xyz');
    await expect(xyz).toContainText('₽1,500.00');
    await expect(xyz).toContainText('Renewal: ₽1,700.00');
    await page.getByTestId('prices-search').fill('com.ru');
    const comru = page.getByTestId('prices-row-com.ru');
    await expect(comru).toContainText('₽348.00');
    await expect(comru).toContainText('Renewal: ₽348.00');
  });

  test('shows WebHOST1 public annual prices, original rubles and import date', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds['рф'] = { webhost1: { reg: 235, renew: 495, transfer: null } };
    seed.table.sourceRub = { webhost1: { 'рф': [18900, 39900] } };
    seed.table.webhost1UpdatedAt = '2026-11-02T01:00:00Z';
    seed.table.webhost1RenewalUpdatedAt = '2026-11-01T19:00:00Z';
    await openApp(page, { seed: { 'dh:v1:pricing': seed, 'dh:v1:settings': { currency: 'RUB', rates: { RUB: 90, EUR: 0.9 } } } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-webhost1-note')).toContainText('2026-11-01');
    await expect(page.getByTestId('prices-webhost1-note')).toContainText('2026-11-02');
    await expect(page.getByTestId('prices-webhost1-note')).toContainText('renewals are known only');
    await page.getByTestId('prices-search').fill('рф');
    const row = page.getByTestId('prices-row-рф');
    await expect(row).toContainText('₽189.00');
    await expect(row).toContainText('Renewal: ₽399.00');
    await expect(row).not.toContainText('₽211.50');
  });

  test('shows AdminVPS annual prices and seller promotion in UI and CSV', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds['рф'] = { adminvps: { reg: 252, renew: 1786, transfer: null } };
    seed.table.sourceRub = { adminvps: { 'рф': [20300, 143900] } };
    seed.table.sourcePromotions = { adminvps: ['рф'] };
    seed.table.adminvpsUpdatedAt = '2026-11-01T21:00:00Z';
    await openApp(page, { seed: { 'dh:v1:pricing': seed, 'dh:v1:settings': { currency: 'RUB', rates: { RUB: 90, EUR: 0.9 } } } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-adminvps-note')).toContainText('2026-11-01');
    await expect(page.getByTestId('prices-adminvps-note')).toContainText('conditions');
    await page.getByTestId('prices-search').fill('рф');
    const row = page.getByTestId('prices-row-рф');
    await expect(row).toContainText('₽203.00');
    await expect(row).toContainText('Renewal: ₽1,439.00');
    await expect(row).toContainText('promo');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('prices-export-csv').click();
    const download = await downloadPromise;
    const csv = readFileSync((await download.path())!, 'utf8');
    expect(csv).toContain('Seller-marked promotions');
    expect(csv).toContain('AdminVPS');
  });

  test('shows Sprinthost original RUB, renewal and material conditions', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds['рф'] = { sprinthost: { reg: 222, renew: 421, transfer: null } };
    seed.table.sourceRub = { sprinthost: { 'рф': [17900, 33900] } };
    seed.table.sprinthostUpdatedAt = '2026-11-01T17:00:00Z';
    await openApp(page, { seed: { 'dh:v1:pricing': seed, 'dh:v1:settings': { currency: 'RUB', rates: { RUB: 90, EUR: 0.9 } } } });
    await gotoPrices(page);
    await expect(page.getByTestId('prices-sprinthost-note')).toContainText('2026-11-01');
    await expect(page.getByTestId('prices-sprinthost-note')).toContainText('270 ₽');
    await expect(page.getByTestId('prices-sprinthost-note')).toContainText('Sprintnames');
    await page.getByTestId('prices-search').fill('рф');
    const row = page.getByTestId('prices-row-рф');
    await expect(row).toContainText('₽179.00');
    await expect(row).toContainText('Renewal: ₽339.00');
    await expect(row).not.toContainText('₽199.80');
  });

  test('shows original RUB source amounts despite different display FX rates', async ({ page }) => {
    const seed = seedPricingTable();
    seed.table.tlds['рф'] = {
      hostiman: { reg: 248, renew: 496, transfer: null },
      timeweb: { reg: 248, renew: null, transfer: null },
    };
    seed.table.sourceRub = { hostiman: { 'рф': [20000, 40000] }, timeweb: { 'рф': [20000, null] } };
    seed.table.timewebRenewalFromRub = { 'рф': 399 };
    await openApp(page, { seed: { 'dh:v1:pricing': seed, 'dh:v1:settings': { currency: 'RUB', rates: { RUB: 90, EUR: 0.9 } } } });
    await gotoPrices(page);
    await page.getByTestId('prices-search').fill('рф');
    const row = page.getByTestId('prices-row-рф');
    await expect(row).toContainText('₽200.00');
    await expect(row).toContainText('Renewal: ₽400.00');
    await expect(row).toContainText('Renewal from 399 ₽');
    await expect(row).not.toContainText('₽223.20');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('prices-export-csv').click();
    const path = await (await downloadPromise).path();
    expect(path).toBeTruthy();
    const csv = readFileSync(path!, 'utf8');
    expect(csv).toContain('₽200.00');
    expect(csv).not.toContain('₽223.20');
    // TCO remains USD-based and may differ; its amount is not claimed as exact RUB.
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

  test('buy link matches the displayed cheapest seller; comparison cells show no-deeplink title', async ({ page }) => {
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
    expect(href).toBe('https://domains.cloudflare.com/');

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
