#!/usr/bin/env node
/**
 * Delta gate for the pricing-snapshot bot commit. Exit 0 = commit, 1 = skip.
 * Skips when fewer than 0.5% of snapshot leaves changed AND the last snapshot
 * commit is younger than 24h — keeps bot noise out of main history while
 * guaranteeing at least one snapshot commit per day.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const MIN_RATIO = 0.005;
const MIN_AGE_H = 24;
const SNAPSHOT_REL = 'src/config/pricing.snapshot.json';

export function diffLeaves(a, b) {
  let total = 0;
  let changed = 0;
  const walk = (x, y) => {
    const xObj = x !== null && typeof x === 'object';
    const yObj = y !== null && typeof y === 'object';
    if (!xObj && !yObj) {
      total += 1;
      if (x !== y) changed += 1;
      return;
    }
    const keys = new Set([...Object.keys(xObj ? x : {}), ...Object.keys(yObj ? y : {})]);
    for (const k of keys) walk(xObj ? x[k] : undefined, yObj ? y[k] : undefined);
  };
  walk(a, b);
  return { total, changed, ratio: total === 0 ? 0 : changed / total };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const next = JSON.parse(readFileSync(join(root, SNAPSHOT_REL), 'utf8'));
  const prev = JSON.parse(git(['show', `HEAD:${SNAPSHOT_REL}`]));
  const { ratio, changed, total } = diffLeaves(prev, next);
  const lastTs = Number(git(['log', '-1', '--format=%ct', '--', SNAPSHOT_REL]));
  const ageH = (Date.now() / 1000 - lastTs) / 3600;
  console.log(
    `snapshot delta: ${changed}/${total} cells (${(ratio * 100).toFixed(2)}%), last commit ${ageH.toFixed(1)}h ago`,
  );
  if (ratio < MIN_RATIO && ageH < MIN_AGE_H) process.exit(1);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
