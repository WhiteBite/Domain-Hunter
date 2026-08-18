/** Refresh README screenshots with the current UI (EN). */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const docs = path.join(process.cwd(), 'docs');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto(distUrl, { waitUntil: 'load' });

await page.locator('textarea').first().fill('midas\norbitlab');
await page.getByRole('button', { name: 'Check availability' }).click();
await page.waitForSelector('table tbody tr', { timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(docs, 'screenshot-en-check.png') });
console.log('check shot saved');

await page.getByRole('tab', { name: 'Generators' }).click();
await page.waitForSelector('text=Your idea');
await page.getByPlaceholder('midas, gold').fill('midas');
await page.getByRole('button', { name: 'Generate candidates' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(docs, 'screenshot-en-generators.png') });
console.log('generators shot saved');

await browser.close();
