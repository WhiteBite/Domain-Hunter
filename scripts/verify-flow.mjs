/** Verify the full pipeline: generators -> check now -> auto-run -> results. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(distUrl, { waitUntil: 'load' });

await page.getByRole('tab', { name: 'Generators' }).click();
await page.waitForSelector('text=Your idea');
await page.getByPlaceholder('midas, gold').fill('midas');
await page.getByRole('button', { name: 'Generate candidates' }).click();
await page.waitForTimeout(400);

await page.getByRole('button', { name: 'Check now' }).click();

// Must land on Check tab AND the run must auto-start (no second click).
await page.waitForSelector('text=Domain availability check', { timeout: 5000 });
await page.waitForSelector('text=/Checked \\d+ of \\d+/', { timeout: 15000 });
console.log('PASS: run auto-started after Check now');

await page.waitForSelector('table tbody tr', { timeout: 60000 });
const rows = await page.locator('table tbody tr').count();
console.log(`PASS: results streaming, rows=${rows}`);
await page.screenshot({ path: path.join(process.cwd(), 'docs', 'screenshot-flow.png') });

await browser.close();
console.log('FLOW OK');
