#!/usr/bin/env node
/**
 * Bundle the Domain Hunter CLI into a single ESM file.
 *
 * Uses the esbuild JS API (esbuild is present transitively via vite; this
 * script pins it as an explicit devDependency). Matches the style of
 * scripts/build-worker.mjs. Bundles cli/main.ts -> dist-cli/domain-hunter.mjs
 * (platform node, format esm, target node20, JSON imports inlined).
 *
 * If cli/mcp/server.ts exists, also bundles it -> dist-cli/mcp-server.mjs.
 * The MCP server is added by a separate task; its absence is not an error.
 */
import { build } from 'esbuild';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const entryMain = join(root, 'cli', 'main.ts');
const entryMcp = join(root, 'cli', 'mcp', 'server.ts');
const outMain = join(root, 'dist-cli', 'domain-hunter.mjs');
const outMcp = join(root, 'dist-cli', 'mcp-server.mjs');

/**
 * @param {string} entry
 * @param {string} outfile
 */
async function bundleEntry(entry, outfile) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    banner: { js: '#!/usr/bin/env node' },
    logLevel: 'info',
  });
  const size = statSync(outfile).size;
  console.log(`  ${outfile} — ${size} bytes`);
}

async function main() {
  console.log('Building CLI...');
  await bundleEntry(entryMain, outMain);
  if (existsSync(entryMcp)) {
    await bundleEntry(entryMcp, outMcp);
  } else {
    console.log('  cli/mcp/server.ts not found — skipping MCP server bundle.');
  }
  console.log('CLI build complete.');
}

main().catch((err) => {
  console.error('build-cli failed:', err);
  process.exit(1);
});
