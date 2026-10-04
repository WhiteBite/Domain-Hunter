#!/usr/bin/env node
/**
 * Bundle-size gate for dist/index.html (gzip). Exits 1 over the hard cap;
 * warns (exit 0) when over the committed baseline by more than 5%. Runs
 * after `npm run build` (npm run size).
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HARD_CAP = 350 * 1024;

const dist = readFileSync(join(root, 'dist', 'index.html'));
const gzip = gzipSync(dist, { level: 9 }).length;
const baseline = JSON.parse(
  readFileSync(join(root, '.github', 'size-baseline.json'), 'utf8'),
).gzipBytes;

console.log(
  `dist/index.html: raw ${dist.length} B, gzip ${gzip} B (baseline ${baseline}, cap ${HARD_CAP})`,
);

if (gzip > HARD_CAP) {
  console.error(`size-limit FAIL: gzip ${gzip} B exceeds hard cap ${HARD_CAP} B`);
  process.exit(1);
}
if (gzip > baseline * 1.05) {
  console.warn(
    `size-limit WARN: gzip grew >5% over baseline (${baseline} -> ${gzip}); update .github/size-baseline.json if intentional`,
  );
}
process.exit(0);
