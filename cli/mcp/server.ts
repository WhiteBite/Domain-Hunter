/** Node stdio MCP entry point. Stdout is reserved for the protocol. */
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { installStorage } from '../shims/storage.js';
import { createMcpServer } from './tools.js';

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch { return 'unknown'; }
}

async function main(): Promise<void> {
  installStorage();
  const core = await import('../core.js');
  await createMcpServer(core, readVersion()).connect(new StdioServerTransport());
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${msg}\n`);
  process.exit(1);
});
