/** Diagnose GitHub social check from browser context. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distUrl = pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(distUrl, { waitUntil: 'load' });

const report = await page.evaluate(async () => {
  const out = [];
  try {
    const r = await fetch('https://api.github.com/users/whitebite');
    out.push(
      `api users: ${r.status} acao=${r.headers.get('access-control-allow-origin')} rl-remaining=${r.headers.get('x-ratelimit-remaining')}`,
    );
  } catch (e) {
    out.push(`api users: fail ${String(e)}`);
  }
  try {
    const r2 = await fetch('https://github.com/whitebite.png');
    out.push(
      `avatar png: ${r2.status} acao=${r2.headers.get('access-control-allow-origin')} url=${r2.url.slice(0, 60)}`,
    );
  } catch (e) {
    out.push(`avatar png: fail ${String(e)}`);
  }
  try {
    const r3 = await fetch('https://github.com/zzqx-not-exist-98765.png');
    out.push(`avatar missing: ${r3.status} acao=${r3.headers.get('access-control-allow-origin')}`);
  } catch (e) {
    out.push(`avatar missing: fail ${String(e)}`);
  }
  return out.join('\n');
});
console.log(report);
await browser.close();
