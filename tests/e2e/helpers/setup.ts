/**
 * E2E test setup helpers — page navigation, localStorage seeding, tab routing.
 *
 * Storage keys (from src/ui/settings.ts KEYS + src/ui/store.ts):
 *   dh:v1:settings   — Settings JSON (merged with DEFAULT_SETTINGS on load)
 *   dh:v1:cache      — Record<string, CacheEntry> (domain → {status, source, ts, tld})
 *   dh:v1:pricing    — { table: PricingTable, fetchedAt: number }
 *   dh:v1:bootstrap  — { json: unknown, fetchedAt: number }
 *   dh:v1:run        — RunSnapshot { pending, tlds, ignoreCache, ts }
 *   dh:v1:wordsets   — custom generator word sets
 *   dh:v1:gentray    — Candidate[] (gen tray; note: NOT in KEYS object but dh:v1: prefixed)
 *
 * Read timing (determines whether pre-boot or post-boot seeding is needed):
 *   - genCandidates (dh:v1:gentray): read at MODULE INIT in store.ts → MUST seed before goto
 *   - settings (dh:v1:settings): read via loadSettings() at App boot → MUST seed before goto
 *   - cache (dh:v1:cache): read LAZILY on first getFresh() call → can seed after goto (before any check)
 *   - pricing (dh:v1:pricing): read via readCache() in loadPricing() at boot → MUST seed before goto
 *   - bootstrap (dh:v1:bootstrap): read in fetchBootstrap() at boot → MUST seed before goto
 *
 * Conclusion: openApp() uses context.addInitScript() to install seed BEFORE goto,
 * which is the safe choice for all keys. The seed*() helpers write via
 * page.evaluate() AFTER goto and require a page.reload() to take effect on
 * stores that already loaded (settings, pricing, gen tray, bootstrap).
 */
import type { BrowserContext, Page } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../../src/types';
import type { CacheEntry, PricingTable, RunSnapshot, Settings } from '../../../src/types';

// ---- distUrl ----

/**
 * file:// URL to the built dist/index.html.
 * Repo root is three levels up from tests/e2e/helpers/ — resolved via the
 * URL constructor against import.meta.url (no node:path/node:url needed,
 * which would require @types/node not in the project's types array).
 * Optional hash appended for share-link tests (e.g. '#s=...').
 */
export function distUrl(hash?: string): string {
  const here = new URL(import.meta.url);
  const url = new URL('../../../dist/index.html', here).href;
  return hash ? `${url}${hash}` : url;
}

// ---- setupPage / openApp ----

/**
 * Boot the app from dist/index.html over file://, wait for the app shell,
 * then clear ALL dh:v1:* localStorage keys for a clean slate.
 *
 * The clearing happens AFTER goto (app has already booted with whatever
 * was in localStorage). Use openApp() with a seed for pre-boot state.
 */
export async function setupPage(page: Page): Promise<void> {
  await page.goto(distUrl());
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 10_000 });
  await clearDhStorage(page);
}

/**
 * Boot the app with optional pre-seeded localStorage and/or share-link hash.
 *
 * When seed is provided, it is installed via context.addInitScript() BEFORE
 * goto. The init script first clears all dh:* keys (clean slate), then writes
 * each seed entry as JSON. This runs on every navigation of this page,
 * ensuring deterministic state. The seed keys must be full localStorage key
 * names (e.g. 'dh:v1:settings', 'dh:v1:cache').
 *
 * Note: addInitScript is cumulative — calling openApp() multiple times stacks
 * scripts, but each clears + re-seeds, so the last call's seed wins.
 */
export async function openApp(
  page: Page,
  opts?: { hash?: string; seed?: Record<string, unknown> },
): Promise<void> {
  const seed = opts?.seed ?? {};
  // addInitScript runs before any page script on every navigation.
  // The function is stringified, so it cannot close over outer variables —
  // the seed is passed as the `arg` parameter (structured-cloned).
  await page.context().addInitScript((s: Record<string, unknown>) => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('dh:')) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(s)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, seed);

  await page.goto(distUrl(opts?.hash));
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 10_000 });
}

// ---- Storage clearing ----

/** Remove every dh:v1:* key from localStorage (post-goto, same-origin). */
export async function clearDhStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('dh:v1:')) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  });
}

// ---- Seed helpers (post-goto; require reload for already-loaded stores) ----

/**
 * Write dh:v1:settings, merging partial over DEFAULT_SETTINGS.
 * Requires page.reload() for the app to re-read settings (loadSettings runs at boot).
 */
export async function seedSettings(page: Page, partial: Partial<Settings>): Promise<void> {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...partial };
  await page.evaluate(
    (s: Settings) => localStorage.setItem('dh:v1:settings', JSON.stringify(s)),
    settings,
  );
}

/**
 * Write dh:v1:cache as a Record<string, CacheEntry>.
 * Cache is loaded lazily on first getFresh() call, so if no check has run
 * yet, the seed takes effect without a reload.
 */
export async function seedCache(
  page: Page,
  entries: Record<string, CacheEntry>,
): Promise<void> {
  await page.evaluate(
    (e: Record<string, CacheEntry>) =>
      localStorage.setItem('dh:v1:cache', JSON.stringify(e)),
    entries,
  );
}

/**
 * Write dh:v1:pricing as { table, fetchedAt }.
 * Requires page.reload() for the app to re-read pricing (loadPricing runs at boot).
 */
export async function seedPricing(page: Page, table: PricingTable): Promise<void> {
  const cached = { table, fetchedAt: Date.now() };
  await page.evaluate(
    (c: { table: PricingTable; fetchedAt: number }) =>
      localStorage.setItem('dh:v1:pricing', JSON.stringify(c)),
    cached,
  );
}

/**
 * Write dh:v1:run (RunSnapshot for interrupted-run resume).
 * The resume prompt store reads this on boot, so a reload is needed
 * for the banner to appear.
 */
export async function seedRunSnapshot(page: Page, snapshot: RunSnapshot): Promise<void> {
  await page.evaluate(
    (s: RunSnapshot) => localStorage.setItem('dh:v1:run', JSON.stringify(s)),
    snapshot,
  );
}

// ---- Tab navigation ----

export type TabId = 'check' | 'generators' | 'drops' | 'social' | 'settings' | 'about';

/**
 * A stable interactive element inside each tab panel, used to confirm the
 * panel actually rendered after clicking its tab button. (There is no
 * app-tabpanel-* testid — panels are plain conditional renders.)
 */
const TAB_ANCHOR_TESTID: Record<TabId, string> = {
  check: 'check-input-domains',
  generators: 'gen-input-keywords',
  drops: 'drops-input-search',
  social: 'social-input-handle',
  settings: 'settings-select-theme',
  about: 'about-link-github',
};

/**
 * Click the tab button [data-testid="app-tab-${tab}"] and wait for a known
 * element inside that tab's panel to become visible.
 */
export async function navigateToTab(page: Page, tab: TabId): Promise<void> {
  await page.click(`[data-testid="app-tab-${tab}"]`);
  await page.waitForSelector(`[data-testid="${TAB_ANCHOR_TESTID[tab]}"]`, {
    state: 'visible',
    timeout: 10_000,
  });
}

// ---- Clipboard ----

/** Grant clipboard-read and clipboard-write permissions to the context. */
export async function grantClipboard(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

/** Read the clipboard contents via navigator.clipboard.readText(). */
export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}
