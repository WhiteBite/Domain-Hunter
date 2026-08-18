/** Verify registrar searchUrl templates: one polite request each. */
import { readFile } from 'node:fs/promises';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const registrars = JSON.parse(
  await readFile(new URL('../src/config/registrars.json', import.meta.url), 'utf8'),
);

const bad = [];
for (const r of registrars) {
  if (!r.searchUrl.includes('{domain}')) {
    console.log(`SKIP  ${r.id} (no {domain})`);
    continue;
  }
  const url = r.searchUrl.replace('{domain}', 'example.com');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    console.log(`${res.status}  ${r.id}`);
    if (res.status === 404) bad.push(r.id);
  } catch (e) {
    console.log(`ERR   ${r.id} ${String(e).slice(0, 60)}`);
    bad.push(r.id);
  }
  await new Promise((r2) => setTimeout(r2, 300));
}
console.log('BAD(404/err):', bad.join(',') || 'none');
