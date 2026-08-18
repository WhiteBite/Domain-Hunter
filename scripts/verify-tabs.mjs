/** E2E: Drops and Social tabs render and work. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

await page.goto(distUrl, { waitUntil: 'load' });

// Drops tab
await page.getByRole('tab', { name: 'Dropped' }).click();
await page.waitForSelector('text=/Snapshot:/', { timeout: 10000 });
const dropChips = await page.locator('.tray-chip, .drop-chip, [class*="chip"]').count();
console.log(`PASS: drops tab renders (chips: ${dropChips})`);
await page.getByRole('button', { name: 'To check', exact: true }).first().click();
await page.waitForSelector('text=Domain availability check', { timeout: 5000 });
console.log('PASS: drop "To check" lands on Check tab with the domain');

// Social tab
await page.getByRole('tab', { name: 'Social' }).click();
await page.waitForSelector('text=Check social handles');
await page.locator('input').first().fill('torvalds');
await page.getByRole('button', { name: 'Check', exact: true }).click();
await page.waitForSelector('text=/Free|Taken/', { timeout: 15000 });
console.log('PASS: social live check (GitHub/TikTok) returns statuses');

await page.screenshot({ path: path.join(process.cwd(), 'docs', 'ui-social.png') });
await browser.close();
console.log('TABS OK');
