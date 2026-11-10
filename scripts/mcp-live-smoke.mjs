/** Opt-in protocol smoke test: fixed public names only, no secrets or input domains. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const home = await mkdtemp(join(tmpdir(), 'domain-hunter-live-'));
const client = new Client({ name: 'domain-hunter-live-smoke', version: '1.0.0' });
try {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.NODE_OPTIONS;
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('dist-cli/mcp-server.mjs')], env, stderr: 'pipe' }));
  const result = await client.callTool({ name: 'compare_public_sources', arguments: {
    domains: ['example.com', 'example.net'], sources: ['dotsweep', 'domainee', 'digmyname'],
  } });
  if (result.isError || result.content?.[0]?.type !== 'text') throw new Error('MCP tool failed');
  const data = JSON.parse(result.content[0].text);
  if (!Array.isArray(data.sources) || data.sources.length !== 3) throw new Error('Missing provider responses');
  const failures = [];
  for (const id of ['dotsweep', 'domainee', 'digmyname']) {
    const source = data.sources.find((item) => item.source === id);
    if (!source || source.status !== 'ok' || source.unresolved.length !== 0 || source.signals.length !== 2 ||
        !['example.com', 'example.net'].every((domain) => source.signals.some((signal) => signal.domain === domain && ['unknown', 'unavailable', 'possibly_available'].includes(signal.status)))) {
      failures.push(`${id}: ${source?.status ?? 'missing'}`);
      continue;
    }
    console.log(`${id}: protocol response OK`);
  }
  if (failures.length) throw new Error(`Incomplete or invalid provider responses: ${failures.join(', ')}`);
  console.log('Advisory responses only; this does not establish accuracy or availability.');
} finally {
  await client.close();
  await rm(home, { recursive: true, force: true });
}
