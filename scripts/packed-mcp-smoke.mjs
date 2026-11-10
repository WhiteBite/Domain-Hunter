/** Check the installed, bundled MCP server without contacting external providers. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

if (!process.argv[2]) throw new Error('Pass the installed MCP server path');
const home = await mkdtemp(join(tmpdir(), 'domain-hunter-package-'));
const client = new Client({ name: 'package-smoke', version: '1.0.0' });
try {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.NODE_OPTIONS;
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(process.argv[2])], env, stderr: 'pipe' }));
  const tools = await client.listTools();
  if (!tools.tools.some((t) => t.name === 'compare_public_sources')) throw new Error('MCP tool missing');
  const result = await client.callTool({ name: 'list_public_sources', arguments: {} });
  if (result.isError || result.content?.[0]?.type !== 'text') throw new Error('Source discovery failed');
  const sources = JSON.parse(result.content[0].text).sources;
  if (!['dotsweep', 'domainee', 'digmyname'].every((id) => sources.some((source) => source.id === id))) throw new Error('Sources missing');
  console.log('Installed MCP server: source discovery OK (no provider calls).');
} finally {
  await client.close();
  await rm(home, { recursive: true, force: true });
}
