/** Verify the RU switch re-renders the whole UI in Russian. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(distUrl, { waitUntil: 'load' });
await page.waitForSelector('text=Domain availability check');

await page.getByRole('button', { name: 'Language' }).click();
await page.waitForSelector('text=Проверка доступности доменов', { timeout: 5000 });
const tabsRu = await page.locator('text=Генераторы').count();
const settingsRu = await page.locator('text=Настройки').count();
console.log(`RU switch: title OK, tabs=${tabsRu > 0}, settings=${settingsRu > 0}`);

// Generators tab in Russian
await page.getByRole('tab', { name: 'Генераторы' }).click();
await page.waitForSelector('text=Генераторы имён');
console.log('RU generators OK');

// Theme toggle still works + screenshot dark RU
await page.getByRole('button', { name: 'Тема' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(process.cwd(), 'docs', 'screenshot-ru-dark.png') });
console.log('screenshot-ru-dark saved');

await browser.close();
console.log('RU OK');
