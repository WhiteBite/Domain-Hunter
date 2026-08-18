/** Screenshots: desktop check/generators + mobile check. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const docs = path.join(process.cwd(), 'docs');
const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto(distUrl, { waitUntil: 'load' });
await page.waitForSelector('text=Domain availability check');
await page.screenshot({ path: path.join(docs, 'ui-check.png') });

await page.getByRole('tab', { name: 'Generators' }).click();
await page.waitForSelector('text=Your idea');
await page.screenshot({ path: path.join(docs, 'ui-generators.png') });
await page.close();

const mob = await browser.newPage({ viewport: { width: 375, height: 740 } });
await mob.goto(distUrl, { waitUntil: 'load' });
await mob.waitForSelector('text=Domain availability check');
await mob.screenshot({ path: path.join(docs, 'ui-mobile.png'), fullPage: true });
await mob.close();

await browser.close();
console.log('shots saved');
