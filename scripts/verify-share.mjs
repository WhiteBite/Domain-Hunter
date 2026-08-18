/** Verify a share link fills the input and auto-runs on open. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const hash =
  '#s=eyJxIjoibG9yaW5cbnJlbnRpZFxuZnJpbmNhblxuY3JhbGl0c1xuc2tlbnNlbmRcbm1pbHZhbmdcbmJsb2xtaW5kXG5nbG9waGVzdFxudGluc2Vrc1xucGVuZG9sZFxuc3dpbnNhdFxuc3dpbGxhbmRcbmtlbnR1a3NcbmxvbmZlbGx1cmRcbmNoYWNob3ZmXG5zcHVzaHVzdFxuc2hhbHNlcnBcbnJhdHNha3NcbnNwYWxtb3J0XG5ib3RydWxcbmdsaWxkYW5cbmZsaXNmZXNoXG5wcmlkdGVydFxuc3B1bXNhbnRcbnBsaWJ1cHNcbnNodXJ0YXlzXG5mcm9kc2lnXG5sZWxzYW1cbnNlbmhlcm5cbmZsYW5rdXRzIiwidGxkcyI6WyJjb20iLCJuZXQiLCJkZXYiLCJhcHAiLCJpbyIsImFpIiwieHl6IiwibWUiLCJpbmZvIiwicHJvIiwidGVjaCIsInNpdGUiLCJvbmxpbmUiLCJjbG91ZCIsInBhZ2UiXSwicnVuIjpmYWxzZX0';
const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(distUrl + hash, { waitUntil: 'load' });

await page.waitForSelector('textarea', { timeout: 10000 });
const value = await page.locator('textarea').first().inputValue();
console.log('input filled:', value.includes('lorin') && value.includes('flankuts'));

// New default: share links auto-run on open.
await page.waitForSelector('text=/Checked \\d+ of \\d+/', { timeout: 20000 });
console.log('auto-run started from share link');
await page.waitForSelector('table tbody tr', { timeout: 60000 });
console.log('results rendered');
await browser.close();
console.log('SHARE OK');
