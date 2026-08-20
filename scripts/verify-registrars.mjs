/** Verify registrar searchUrl templates: one polite request each. */
import { fetchWithTimeout, UA, readJson } from './lib/http.mjs';

const registrars = await readJson(new URL('../src/config/registrars.json', import.meta.url));

const bad = [];
for (const r of registrars) {
  if (!r.searchUrl.includes('{domain}')) {
    console.log(`SKIP  ${r.id} (no {domain})`);
    continue;
  }
  const url = r.searchUrl.replace('{domain}', 'example.com');
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 10_000,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html' },
    });
    console.log(`${res.status}  ${r.id}`);
    if (res.status === 404) bad.push(r.id);
  } catch (e) {
    console.log(`ERR   ${r.id} ${String(e).slice(0, 60)}`);
    bad.push(r.id);
  }
  await new Promise((r2) => setTimeout(r2, 300));
}
console.log('BAD(404/err):', bad.join(',') || 'none');
