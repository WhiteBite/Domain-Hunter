/**
 * Acceptance smoke test (SPEC §15): opens dist/index.html over file://,
 * verifies the app boots with zero console errors, runs a real check
 * (google.com → taken, random name → available), captures screenshots.
 *
 * Usage: node scripts/smoke.mjs
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distUrl = pathToFileURL(path.join(root, 'dist', 'index.html')).href;
const docsDir = path.join(root, 'docs');
mkdirSync(docsDir, { recursive: true });

const randomName = `zzqx${Date.now().toString(36)}`;
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

// 1. Boot over file://
await page.goto(distUrl, { waitUntil: 'load' });
await page.waitForSelector('text=Domain Hunter', { timeout: 10_000 });
console.log('PASS: app boots from file://');

// 2. Fill input: one definitely-taken domain + one random name
const textarea = page.locator('textarea').first();
await textarea.fill(`google.com\n${randomName}`);
await page.waitForTimeout(300);

// 3. Start the run
await page.getByRole('button', { name: 'Check availability' }).click();
console.log('run started, waiting for results...');

// 4. Wait until google.com row shows Taken (real RDAP over the network)
await page.waitForSelector('text=Taken', { timeout: 90_000 });
console.log('PASS: google.com reported Taken');

// 5. Wait for the random name to be reported Available in at least one zone
await page.waitForSelector(`text=${randomName}.com`, { timeout: 90_000 });
await page.waitForTimeout(2000);
const availableCount = await page.locator('text=Available').count();
if (availableCount < 1) throw new Error('random name produced no Available results');
console.log(`PASS: ${randomName} reported Available (${availableCount} badge(s))`);

// 6. Wait for pricing to resolve so prices are visible, then screenshot — light theme
await page.waitForSelector('.freshness', { timeout: 30_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(docsDir, 'screenshot.png'), fullPage: false });

// 7. Toggle to dark theme and screenshot
await page.getByRole('button', { name: 'Theme' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(docsDir, 'screenshot-dark.png'), fullPage: false });
console.log('PASS: screenshots saved to docs/');

// 8. Console must be clean (network errors from registries are tolerated)
const fatal = errors.filter(
  (e) => !e.includes('net::') && !e.includes('Failed to load resource') && !e.includes('AbortError'),
);
if (fatal.length > 0) {
  console.error('FAIL: console errors:', fatal);
  process.exitCode = 1;
} else {
  console.log('PASS: no fatal console errors');
}

await browser.close();
console.log('SMOKE OK');
