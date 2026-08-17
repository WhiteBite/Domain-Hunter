/** Screenshot the redesigned Generators tab (RU) with a populated tray. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(distUrl, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Language' }).click();
await page.getByRole('tab', { name: 'Генераторы' }).click();
await page.waitForSelector('text=Генераторы имён');

// populate the tray: syllables + a theme word
await page.getByRole('button', { name: 'Сгенерировать' }).first().click();
await page.getByRole('button', { name: 'Космос' }).click();
await page.locator('.word').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(process.cwd(), 'docs', 'screenshot-generators.png'), fullPage: true });
console.log('screenshot-generators saved');
await browser.close();
