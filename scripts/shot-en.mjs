/** README screenshots (EN): Check tab with live results + Generators tab in dark theme. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await page.goto(distUrl, { waitUntil: 'load' });
await page.waitForSelector('text=Domain availability check', { timeout: 10000 });

// --- Check tab: run a live demo check so the results table is populated ---
await page.locator('textarea').first().fill('karato\nmidas\nfalcon\nzephyr\nnovabrand');
await page.getByRole('button', { name: 'Check availability' }).click();
await page.waitForSelector('text=Checked', { timeout: 15000 });
await page.waitForTimeout(9000); // let results + prices stream in
await page.screenshot({ path: path.join(process.cwd(), 'docs', 'screenshot-en-check.png') });
console.log('screenshot-en-check saved');

// --- Generators tab, dark theme, populated combinator ---
await page.getByRole('button', { name: 'Theme' }).click();
const darkBtn = page.getByRole('button', { name: 'Dark', exact: true });
if (await darkBtn.count()) await darkBtn.click(); // theme button may open a menu
await page.getByRole('tab', { name: 'Generators' }).click();
await page.waitForSelector('text=Name generators');
await page.locator('textarea').first().fill('karato\nnova');
await page.getByRole('button', { name: 'Generate' }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(process.cwd(), 'docs', 'screenshot-en-generators.png') });
console.log('screenshot-en-generators saved');

await browser.close();
