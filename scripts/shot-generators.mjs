/** Screenshot the pipeline-style Generators tab after a real generation. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto(distUrl, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Language' }).click();
await page.getByRole('tab', { name: 'Генераторы' }).click();
await page.waitForSelector('text=Ваша идея');

await page.getByPlaceholder('midas, gold').fill('midas');
await page.getByRole('button', { name: 'Придумать кандидаты' }).click();
await page.waitForTimeout(600);
await page.screenshot({
  path: path.join(process.cwd(), 'docs', 'screenshot-generators.png'),
  fullPage: true,
});
console.log('saved');
await browser.close();
