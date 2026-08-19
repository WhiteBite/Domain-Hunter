/**
 * Generators tab E2E — all 5 generators, technique toggles, params panel,
 * tray management (filter/sort/remove/clear/copy/check-now), saved sets
 * (save/load/delete/export/import), toast.
 *
 * Selectors: data-testid ONLY. Network: boot fetches pricing only — mocked
 * (and pricing is seeded so the fetch is a no-op safety net). assertNoNetworkLeaks
 * enforces zero real requests.
 */
import { test, expect, type Page } from '@playwright/test';
import { openApp, navigateToTab, grantClipboard, readClipboard } from './helpers/setup';
import { assertNoNetworkLeaks, getLeakedRequests, mockAll, mockRdap } from './helpers/mocks';
import {
  ianaBootstrap,
  porkbunPricing,
  cloudflarePricing,
  seedPricingTable,
} from './fixtures';

// ---- Helpers ----

async function boot(page: Page): Promise<void> {
  await assertNoNetworkLeaks(page);
  await mockAll(page, {
    bootstrap: ianaBootstrap(),
    porkbun: porkbunPricing().pricing,
    cloudflare: cloudflarePricing(),
  });
  await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable() } });
  await navigateToTab(page, 'generators');
}

/** Ensure exactly the given technique toggles are on, all others off. */
async function setTechniques(
  page: Page,
  desired: Partial<Record<'combinator' | 'mutations' | 'hacks' | 'syllables', boolean>>,
): Promise<void> {
  const all = ['combinator', 'mutations', 'hacks', 'syllables'] as const;
  for (const name of all) {
    const want = desired[name] ?? false;
    const box = page.locator(`[data-testid="gen-toggle-${name}"]`);
    if ((await box.isChecked()) !== want) await box.click();
  }
}

async function openParamsPanel(page: Page): Promise<void> {
  const affixes = page.locator('[data-testid="gen-textarea-affixes"]');
  if (!(await affixes.isVisible())) {
    await page.click('[data-testid="gen-summary-params"]');
  }
  await expect(affixes).toBeVisible();
}

async function openSetsPanel(page: Page): Promise<void> {
  // Close the tray ⋯ menu if open (its pointerdown handler can interfere).
  const menuBtn = page.locator('[data-testid="gen-button-tray-menu"]');
  if (await menuBtn.isVisible()) {
    const expanded = await menuBtn.getAttribute('aria-expanded');
    if (expanded === 'true') {
      await menuBtn.click();
    }
  }
  // Export/import buttons live INSIDE the <summary> (always visible), so the
  // panel's open state must be checked via the <details open> attribute.
  const details = page.locator('details:has([data-testid="gen-summary-sets"])');
  if ((await details.getAttribute('open')) === null) {
    // Click near the left edge of the summary to avoid the controls span
    // (which has stopPropagation and would prevent toggling).
    await page.locator('[data-testid="gen-summary-sets"]').click({ position: { x: 10, y: 10 } });
    await details.waitFor({ state: 'visible' });
    await expect(details).toHaveAttribute('open', '');
  }
}

async function clearTray(page: Page): Promise<void> {
  const count = await page.locator('[data-testid^="gen-tray-chip-"]').count();
  if (count > 0) {
    await openTrayMenu(page);
    await page.click('[data-testid="gen-button-clear-tray"]');
  }
  await expect(page.locator('[data-testid="gen-tray-empty"]')).toBeVisible();
}

async function generate(page: Page, keywords: string): Promise<void> {
  await page.locator('[data-testid="gen-input-keywords"]').fill(keywords);
  await page.click('[data-testid="gen-button-generate"]');
}

/** Open the tray ⋯ overflow menu so secondary actions are in the DOM. */
async function openTrayMenu(page: Page): Promise<void> {
  const btn = page.locator('[data-testid="gen-button-tray-menu"]');
  if (!(await btn.isVisible())) return; // menu not available (empty tray)
  const menu = page.locator('[data-testid="gen-button-save-set"]');
  if (await menu.isVisible()) return;
  await btn.click();
  await expect(menu).toBeVisible();
}

/** Tray candidate names in DOM order (reads the .row-name span text). */
async function chipNames(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="gen-tray-chip-"] .row-name')
    .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
}

function expectNoLeaks(page: Page): void {
  expect(getLeakedRequests(page)).toEqual([]);
}

// ---- Tests ----

test.describe('Generators tab', () => {
  test.beforeEach(async ({ context }) => {
    await grantClipboard(context);
  });

  test('keywords + generate populates tray with chips', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });

    await generate(page, 'test');

    await expect(page.locator('[data-testid="gen-tray-chip-apptest"]')).toBeVisible();
    expect((await chipNames(page)).length).toBeGreaterThanOrEqual(1);
    expectNoLeaks(page);
  });

  test('syllables-only generates without keywords, at most N chips', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await setTechniques(page, { syllables: true });
    await page.locator('[data-testid="gen-input-syllable-count"]').fill('5');

    await page.click('[data-testid="gen-button-generate"]');

    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible({
      timeout: 10_000,
    });
    const n = (await chipNames(page)).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(5);
    expectNoLeaks(page);
  });

  test('technique toggles gate output (combinator / mutations / hacks)', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');

    // Combinator only: "apptest" yes, "testo" (mutation) no.
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid="gen-tray-chip-apptest"]')).toBeVisible();
    expect(await page.locator('[data-testid="gen-tray-chip-testo"]').count()).toBe(0);
    await clearTray(page);

    // Mutations only: "testo" yes, "apptest" no.
    await setTechniques(page, { mutations: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid="gen-tray-chip-testo"]')).toBeVisible();
    expect(await page.locator('[data-testid="gen-tray-chip-apptest"]').count()).toBe(0);
    await clearTray(page);

    // Hacks only: "family" → "fami.ly"; no combinator output.
    await setTechniques(page, { hacks: true });
    await generate(page, 'family');
    await expect(page.locator('[data-testid="gen-tray-chip-fami-ly"]')).toBeVisible();
    expect(await page.locator('[data-testid="gen-tray-chip-appfamily"]').count()).toBe(0);
    expectNoLeaks(page);
  });

  test('combinator mode prefix/suffix/both changes produced chips', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    const mode = page.locator('[data-testid="gen-select-mode"]');

    await mode.selectOption('prefix');
    await generate(page, 'test');
    await expect(page.locator('[data-testid="gen-tray-chip-apptest"]')).toBeVisible();
    expect(await page.locator('[data-testid="gen-tray-chip-testapp"]').count()).toBe(0);
    await clearTray(page);

    await mode.selectOption('suffix');
    await generate(page, 'test');
    await expect(page.locator('[data-testid="gen-tray-chip-testapp"]')).toBeVisible();
    expect(await page.locator('[data-testid="gen-tray-chip-apptest"]').count()).toBe(0);
    await clearTray(page);

    await mode.selectOption('both');
    await generate(page, 'test');
    await expect(page.locator('[data-testid="gen-tray-chip-apptest"]')).toBeVisible();
    await expect(page.locator('[data-testid="gen-tray-chip-testapp"]')).toBeVisible();
    expectNoLeaks(page);
  });

  test('params panel: edit affixes, reset restores defaults', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    const affixes = page.locator('[data-testid="gen-textarea-affixes"]');
    const initial = await affixes.inputValue();

    await affixes.fill('zzz-custom');
    await expect(affixes).toHaveValue('zzz-custom');

    await page.click('[data-testid="gen-button-affixes-reset"]');
    await expect(affixes).toHaveValue(initial);
    expectNoLeaks(page);
  });

  test('theme words: click word adds to tray, click again removes', async ({ page }) => {
    await boot(page);
    await clearTray(page);

    await page.locator('[data-testid^="gen-theme-chip-"]').first().click();
    const word = page.locator('[data-testid^="gen-theme-word-"]').first();
    await expect(word).toBeVisible();

    const before = (await chipNames(page)).length;
    await word.click();
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();
    expect((await chipNames(page)).length).toBe(before + 1);

    await word.click();
    expect((await chipNames(page)).length).toBe(before);
    expectNoLeaks(page);
  });

  test('tray filter hides non-matching chips', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true, mutations: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid="gen-tray-chip-apptest"]')).toBeVisible();
    await expect(page.locator('[data-testid="gen-tray-chip-testo"]')).toBeVisible();

    await page.locator('[data-testid="gen-input-tray-filter"]').fill('app');

    await expect(page.locator('[data-testid="gen-tray-chip-apptest"]')).toBeVisible();
    await expect(page.locator('[data-testid="gen-tray-chip-testo"]')).toBeHidden();
    expectNoLeaks(page);
  });

  test('tray sort az orders chips alphabetically', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    // Single technique → single render group, so DOM order == global sort order
    // (the app sorts the flat list but renders grouped by source).
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app\npro');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();

    await page.locator('[data-testid="gen-select-tray-sort"]').selectOption('az');

    const names = await chipNames(page);
    expect(names.length).toBeGreaterThan(1);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
    expectNoLeaks(page);
  });

  test('clicking a tray chip remove button removes it', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    const chip = page.locator('[data-testid="gen-tray-chip-apptest"]');
    await expect(chip).toBeVisible();

    await page.click('[data-testid="gen-tray-remove-apptest"]');

    await expect(chip).toBeHidden();
    expectNoLeaks(page);
  });

  test('clear tray empties it and shows the empty message', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();

    await openTrayMenu(page);
    await page.click('[data-testid="gen-button-clear-tray"]');

    await expect(page.locator('[data-testid="gen-tray-empty"]')).toBeVisible();
    expect(await page.locator('[data-testid^="gen-tray-chip-"]').count()).toBe(0);
    expectNoLeaks(page);
  });

  test('copy tray puts candidate names on the clipboard', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid="gen-tray-chip-apptest"]')).toBeVisible();

    await openTrayMenu(page);
    await page.click('[data-testid="gen-button-copy-tray"]');

    const clip = await readClipboard(page);
    expect(clip).toContain('apptest');
    expectNoLeaks(page);
  });

  test('check-now switches to Check tab with candidates in the input', async ({ page }) => {
    await boot(page);
    // RDAP: every candidate check resolves to 404 (unmatched → 404).
    await mockRdap(page, []);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid="gen-tray-chip-apptest"]')).toBeVisible();

    await page.click('[data-testid="gen-button-check-now"]');

    const input = page.locator('[data-testid="check-input-domains"]');
    await expect(input).toBeVisible({ timeout: 10_000 });
    expect(await input.inputValue()).toContain('apptest');
    // The handoff auto-starts the run.
    await expect(page.locator('[data-testid="check-bar-progress"]')).toBeVisible({
      timeout: 10_000,
    });
    expectNoLeaks(page);
  });

  test('save set creates a row with load/delete buttons', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();

    await openTrayMenu(page);
    await page.locator('[data-testid="gen-input-set-name"]').fill('alphaset');
    await page.click('[data-testid="gen-button-save-set"]');

    await openSetsPanel(page);
    await expect(page.locator('[data-testid="gen-set-load-alphaset"]')).toBeVisible();
    await expect(page.locator('[data-testid="gen-set-delete-alphaset"]')).toBeVisible();
    expectNoLeaks(page);
  });

  test('load set adds its words back to the tray', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();
    await openTrayMenu(page);
    await page.locator('[data-testid="gen-input-set-name"]').fill('alphaset');
    await page.click('[data-testid="gen-button-save-set"]');
    await clearTray(page);

    await openSetsPanel(page);
    await page.click('[data-testid="gen-set-load-alphaset"]');

    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible({
      timeout: 10_000,
    });
    expectNoLeaks(page);
  });

  test('delete set removes its row', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();
    await openTrayMenu(page);
    await page.locator('[data-testid="gen-input-set-name"]').fill('alphaset');
    await page.click('[data-testid="gen-button-save-set"]');
    await openSetsPanel(page);
    await expect(page.locator('[data-testid="gen-set-delete-alphaset"]')).toBeVisible();

    await page.click('[data-testid="gen-set-delete-alphaset"]');

    await expect(page.locator('[data-testid="gen-set-delete-alphaset"]')).toBeHidden();
    expectNoLeaks(page);
  });

  test('export sets downloads JSON containing the saved set', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();
    await openTrayMenu(page);
    await page.locator('[data-testid="gen-input-set-name"]').fill('alphaset');
    await page.click('[data-testid="gen-button-save-set"]');
    await openSetsPanel(page);

    // Capture the blob content (blob: downloads have no file path on file://).
    await page.evaluate(() => {
      const w = window as Window & { __exportText?: string };
      w.__exportText = '';
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (blob: Blob | MediaSource): string {
        if (blob instanceof Blob) {
          void blob.text().then((t: string) => {
            w.__exportText = t;
          });
        }
        return orig.call(URL, blob);
      };
    });
    await page.click('[data-testid="gen-button-export-sets"]');
    await page.waitForFunction(
      () => ((window as Window & { __exportText?: string }).__exportText ?? '').length > 0,
    );
    const text = await page.evaluate<string>(
      () => (window as Window & { __exportText?: string }).__exportText ?? '',
    );

    const parsed = JSON.parse(text) as { name?: string }[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((s) => s.name === 'alphaset')).toBe(true);
    expectNoLeaks(page);
  });

  test('import sets restores sets from a JSON file', async ({ page }) => {
    await boot(page);
    await openSetsPanel(page);

    // Build the File in-page (DataTransfer) — avoids Node Buffer, which has
    // no types in this project (tsconfig types: ["vite/client"]).
    const payload = [{ id: 'imp-1', name: 'importedset', words: ['alpha', 'beta'] }];
    await page.evaluate((json: string) => {
      const input = document.querySelector(
        '[data-testid="gen-input-import-sets"]',
      ) as HTMLInputElement;
      const file = new File([json], 'sets.json', { type: 'application/json' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, JSON.stringify(payload));

    await expect(page.locator('[data-testid="gen-set-load-importedset"]')).toBeVisible({
      timeout: 10_000,
    });
    expectNoLeaks(page);
  });

  test('Enter key in keywords input triggers generate', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });

    await page.locator('[data-testid="gen-input-keywords"]').fill('test');
    await page.locator('[data-testid="gen-input-keywords"]').press('Enter');

    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible({
      timeout: 10_000,
    });
    expectNoLeaks(page);
  });

  test('projected checks paragraph shows a number', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();

    const projected = page.locator('[data-testid="gen-tray-projected"]');
    await expect(projected).toBeVisible();
    expect(await projected.textContent()).toMatch(/\d+/);
    expectNoLeaks(page);
  });

  test('toast appears after saving a set', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();
    await openTrayMenu(page);
    await page.locator('[data-testid="gen-input-set-name"]').fill('alphaset');

    await page.click('[data-testid="gen-button-save-set"]');

    // Toast auto-dismisses (~1.8s) — assert it appears promptly.
    await expect(page.locator('[data-testid="gen-toast"]')).toBeVisible({ timeout: 1_500 });
    expectNoLeaks(page);
  });

  test('group collapse toggle hides and shows rows', async ({ page }) => {
    await boot(page);
    await openParamsPanel(page);
    await page.locator('[data-testid="gen-textarea-affixes"]').fill('app');
    await setTechniques(page, { combinator: true });
    await generate(page, 'test');
    await expect(page.locator('[data-testid^="gen-tray-chip-"]').first()).toBeVisible();

    const toggle = page.locator('[data-testid="gen-group-toggle-combinator"]');
    await expect(toggle).toBeVisible();
    // Collapse: rows disappear.
    await toggle.click();
    await expect(page.locator('[data-testid="gen-group-toggle-combinator"]')).toHaveAttribute('aria-expanded', 'false');
    // Expand: rows reappear.
    await toggle.click();
    await expect(page.locator('[data-testid="gen-group-toggle-combinator"]')).toHaveAttribute('aria-expanded', 'true');
    expectNoLeaks(page);
  });
});
