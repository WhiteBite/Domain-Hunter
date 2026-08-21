/**
 * E2E — Drops tab.
 *
 * Data source: src/config/dropped.snapshot.json is BUNDLED at build time
 * (imported in DropsTab.svelte) — no network fetch for the drops list.
 * Boot-time pricing fetch (from CheckTab onMount, since the app boots on
 * the 'check' tab) is mocked. RDAP + DoH are mocked because «To check» /
 * «Add all» auto-start a run (pendingShareRun), same as Generators Check-now.
 */
import { test, expect, type Page } from '@playwright/test';
import { setupPage, grantClipboard, readClipboard } from './helpers/setup';
import { assertNoNetworkLeaks, getLeakedRequests, mockAll } from './helpers/mocks';
import { ianaBootstrap, porkbunPricing, cloudflarePricing } from './fixtures';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---- Test data (derived from src/config/dropped.snapshot.json, bundled) ----

// Read via node:fs (Playwright's Node runner) — JSON import attributes are
// unavailable in the transpiled specs. Same pattern as inventory.spec.ts.
const SNAPSHOT_PATH = fileURLToPath(
  new URL('../../src/config/dropped.snapshot.json', import.meta.url),
);

// First domain in the snapshot. sanitizeId(d + '.' + tld) replaces '.' with '-'.
const snapshotList = (
  JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as { list: string[] }
).list;
const [firstLabel = '', firstTld = ''] = (snapshotList[0] ?? '').split(' ');
const FIRST_DOMAIN = `${firstLabel}.${firstTld}`;
const FIRST_SID = FIRST_DOMAIN.replaceAll('.', '-');
const FIRST_COPY_TESTID = `drops-row-copy-${FIRST_SID}`;
const FIRST_ADD_TESTID = `drops-row-add-${FIRST_SID}`;
const FIRST_ROW_TESTID = `results-row-${FIRST_SID}`;

// RENDER_CAP in DropsTab.svelte — max visible rows.
const RENDER_CAP = 300;

// Pick a TLD among the top-20 select options whose count fits under the
// render cap, so the select-filter test can assert an exact row count.
const tldCounts = new Map<string, number>();
for (const row of snapshotList) {
  const tld = row.split(' ')[1] ?? '';
  if (tld) tldCounts.set(tld, (tldCounts.get(tld) ?? 0) + 1);
}
const top20 = [...tldCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
const underCap = top20.filter(([, n]) => n <= RENDER_CAP);
const [SEL_TLD, SEL_COUNT] = underCap[underCap.length - 1] ?? top20[0] ?? ['', 0];

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
  await assertNoNetworkLeaks(page);
  // Specific mocks: boot pricing + bootstrap, plus RDAP/DoH because «To check»
  // and «Add all» auto-start a run (RDAP unmatched → 404, DoH unmatched → SERVFAIL).
  await mockAll(page, {
    bootstrap: ianaBootstrap(),
    porkbun: porkbunPricing().pricing,
    cloudflare: cloudflarePricing(),
    rdap: [],
    doh: {},
  });
  await setupPage(page);
  await grantClipboard(context);
});

test.afterEach(async ({ page }) => {
  expect(getLeakedRequests(page)).toEqual([]);
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

    await page.fill('[data-testid="drops-input-search"]', firstLabel);

    // Only one domain matches the full label substring.
    const rows = page.locator('[data-testid^="drops-row-copy-"]');
    await expect(rows).toHaveCount(1);
    await expect(page.locator(`[data-testid="${FIRST_COPY_TESTID}"]`)).toBeVisible();
  });

  test('TLD select filters rows by zone', async ({ page }) => {
    await gotoDrops(page);

    await page.selectOption('[data-testid="drops-select-tld"]', SEL_TLD);

    const rows = page.locator('[data-testid^="drops-row-copy-"]');
    await expect(rows).toHaveCount(Math.min(SEL_COUNT, RENDER_CAP));
  });

  test('row copy button writes the domain to the clipboard', async ({ page }) => {
    await gotoDrops(page);

    await page.click(`[data-testid="${FIRST_COPY_TESTID}"]`);

    // copyDomain() is async (navigator.clipboard.writeText); poll until written.
    await expect
      .poll(async () => readClipboard(page), { timeout: 5_000 })
      .toBe(FIRST_DOMAIN);
  });

  test('row add button switches to Check, fills the input, and auto-runs', async ({ page }) => {
    await gotoDrops(page);

    await page.click(`[data-testid="${FIRST_ADD_TESTID}"]`);

    const textarea = page.locator('[data-testid="check-input-domains"]');
    await expect(textarea).toBeVisible();
    const value = await textarea.inputValue();
    expect(value).toContain(FIRST_DOMAIN);

    // «To check» auto-starts the run (pendingShareRun): a result row streams in
    // (RDAP unmatched → 404; the row renders regardless of final status).
    await expect(page.locator(`[data-testid="${FIRST_ROW_TESTID}"]`)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('add-all button fills many domains and auto-runs', async ({ page }) => {
    await gotoDrops(page);

    await page.click('[data-testid="drops-button-add-all"]');

    const textarea = page.locator('[data-testid="check-input-domains"]');
    await expect(textarea).toBeVisible();
    const value = await textarea.inputValue();
    // addAll appends up to 500 filtered domains (capped at 500).
    const lines = value.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(1);
    expect(value).toContain(FIRST_DOMAIN);

    // Auto-run started: progress bar appears (run no longer idle).
    await expect(page.locator('[data-testid="check-bar-progress"]')).toBeVisible({
      timeout: 15_000,
    });
  });
});
