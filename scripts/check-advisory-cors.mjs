/** One-shot live browser probe. Run only with a domain the user is willing to share. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { domainToASCII, pathToFileURL } from 'node:url';

const domain = domainToASCII(process.argv[2] ?? '').toLowerCase();
if (!domain || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]+$/.test(domain)) {
  console.error('Usage: node scripts/check-advisory-cors.mjs <domain>');
  process.exit(2);
}
const encoded = encodeURIComponent(domain);
const services = [
  ['Dotsweep', `https://dotsweep.com/check/${encoded}`],
  ['Who Dat', `https://who-dat.as93.net/v1/whois/${encoded}`],
];
if (/\.(?:ru|xn--p1ai)$/.test(domain)) services.push(['Russian RDAP', `https://cctld.ru/tci-ripn-rdap/domain/${encoded}`]);
console.log(`Each service receives ${domain} once per origin. No data is saved.`);
const dir = await mkdtemp(join(tmpdir(), 'dh-cors-'));
const file = join(dir, 'probe.html');
await writeFile(file, '<!doctype html><title>Domain Hunter CORS probe</title>');
const server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>CORS probe</title>'));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let browser;
let failed = false;
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true });
  const page = await browser.newPage();
  for (const [origin, url] of [['file://', pathToFileURL(file).href], ['http://', `http://127.0.0.1:${address.port}/`]]) {
    await page.goto(url);
    for (const [service, endpoint] of services) {
      let networkError = '';
      const onFailed = (request) => { if (request.url() === endpoint) networkError = request.failure()?.errorText ?? ''; };
      page.on('requestfailed', onFailed);
      const result = await page.evaluate(async ({ target, service, domain }) => {
        try {
          const response = await fetch(target, { signal: AbortSignal.timeout(8000), credentials: 'omit', referrerPolicy: 'no-referrer' });
          let body;
          try { body = await response.json(); } catch { /* A readable HTTP response can still have a non-JSON body. */ }
          const name = service === 'Who Dat' ? body?.query : service === 'Dotsweep' ? body?.domain : body?.ldhName;
          const match = typeof name === 'string' && name.toLowerCase().replace(/\.$/, '') === domain;
          const valid = service === 'Russian RDAP'
            ? (response.status === 200 && match && body?.objectClassName === 'domain') || (response.status === 404 && body?.errorCode === 404)
            : response.status === 200 && match;
          return { corsReadable: true, status: response.status, expectedShape: valid };
        } catch (error) { return { corsReadable: false, error: String(error) }; }
      }, { target: endpoint, service, domain });
      page.off('requestfailed', onFailed);
      if (!result.corsReadable || !result.expectedShape) failed = true;
      console.log(`${origin} ${service}: ${JSON.stringify(result)}${networkError ? ` (${networkError})` : ''}`);
    }
  }
} catch (error) {
  failed = true;
  console.error(`Browser probe failed: ${error.message}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
if (failed) {
  console.error('Unsuccessful fetches can be caused by network, CORS, service policy or other errors; do not infer which without further evidence.');
  process.exitCode = 1;
}
