/** E2E: Generators -> Check now auto-runs (even with a resume snapshot) and tray survives tab switches. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

// Seed an interrupted run so the resume banner would normally show on the Check tab.
await page.addInitScript(() => {
  localStorage.setItem(
    'dh:v1:run',
    JSON.stringify({
      pending: ['google.com'],
      tlds: ['com'],
      ignoreCache: false,
      ts: Date.now(),
    }),
  );
});

await page.goto(distUrl, { waitUntil: 'load' });

// Generators: produce candidates
await page.getByRole('tab', { name: 'Generators' }).click();
await page.waitForSelector('text=Your idea');
await page.getByPlaceholder('midas, gold').fill('midas');
await page.getByRole('button', { name: 'Generate candidates' }).click();
await page.waitForSelector('.tray-chip', { timeout: 5000 });
const trayCount = await page.locator('.tray-chip').count();
if (trayCount === 0) throw new Error('tray empty after generate');
console.log(`PASS: tray populated (${trayCount})`);

// "Check now" must auto-start the run even though a resume snapshot exists
await page.getByRole('button', { name: 'Check now' }).click();
await page.waitForSelector('text=Domain availability check', { timeout: 5000 });
await page.waitForSelector('text=/Checked \\d+ of \\d+/', { timeout: 20000 });
console.log('PASS: run auto-started from Generators despite resume snapshot');

// The resume banner must be gone (fresh run superseded it)
const banner = await page.locator('text=Resume interrupted run?').count();
if (banner !== 0) throw new Error('resume banner still visible after fresh run');
console.log('PASS: resume banner dismissed');

// Generators tray must survive the tab switch (store-backed, persisted)
await page.getByRole('tab', { name: 'Generators' }).click();
await page.waitForSelector('text=Your idea');
await page.waitForSelector('.tray-chip', { timeout: 5000 });
const trayAfter = await page.locator('.tray-chip').count();
if (trayAfter !== trayCount) throw new Error(`tray changed: ${trayAfter} != ${trayCount}`);
console.log(`PASS: tray preserved across tabs (${trayAfter})`);

// On-demand per-domain registrar detail (DigMyName) on an available row
await page.getByRole('tab', { name: 'Check' }).click();
// The run was interrupted by the tab switch; a resume snapshot must exist.
const resumeBtn = page.getByRole('button', { name: 'Resume' });
if ((await resumeBtn.count()) > 0) {
  await resumeBtn.click();
  console.log('PASS: interrupted run offered resume after tab switch');
}
await page.waitForSelector('table tbody tr', { timeout: 60000 });
const infoBtn = page.locator('button[aria-label="Where to buy and premium info"]').first();
await infoBtn.click();
await page.waitForSelector('text=/Cheapest now|No extra data/', { timeout: 30000 });
console.log('PASS: per-domain registrar detail loads');

await browser.close();
console.log('FLOW OK');
