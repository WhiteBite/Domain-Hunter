/** Diagnose the per-domain detail row flow. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console:${m.type()}]`, m.text().slice(0, 160));
});
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

await page.goto(distUrl, { waitUntil: 'load' });
await page.locator('textarea').first().fill('zzqxdiagflow');
await page.getByRole('button', { name: 'Check availability' }).click();
await page.waitForSelector('table tbody tr', { timeout: 60000 });

const info = page.locator('button[aria-label="Where to buy and premium info"]').first();
await info.waitFor({ timeout: 15000 });
await info.click();
await page.waitForTimeout(9000);
const detailText = await page.locator('.detail-row').first().innerText().catch(() => '(no detail row)');
console.log('DETAIL TEXT:', JSON.stringify(detailText.slice(0, 200)));
await browser.close();
