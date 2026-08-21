/**
 * Maintain src/config/price-history.json — a compact per-TLD monthly
 * min-price history derived from the pricing snapshot.
 *
 * Default mode: read the current snapshot, compute per-TLD min reg/renew
 * for the current month, upsert into the history, prune points older
 * than 13 months, write.
 *
 * --seed mode: iterate the git log of the snapshot path (capped at 200
 * commits), group commits by month keeping the OLDEST commit per month,
 * extract per-TLD min reg/renew (handles both compact array and legacy
 * object formats), merge into history (git months first, then current),
 * write. Run once locally to bootstrap the history from existing git data.
 *
 * Output shape: { tld: [ [m, reg, renew], ... ] } sorted by month asc.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson, writeJson } from './lib/http.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, '..', 'src', 'config', 'pricing.snapshot.json');
const HISTORY_PATH = join(__dirname, '..', 'src', 'config', 'price-history.json');
const SNAPSHOT_REL = 'src/config/pricing.snapshot.json';
const MAX_COMMITS = 200;
const PRUNE_MONTHS = 13;

// ---- Helpers ----

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthIndex(m) {
  const [y, mo] = m.split('-').map(Number);
  return y * 12 + (mo - 1);
}

/**
 * Extract per-TLD min reg/renew from a snapshot's tlds block.
 * Handles both compact ([reg, renew, transfer]) and legacy
 * ({reg, renew, transfer}) registrar value formats.
 * Returns { tld: { reg: number|null, renew: number|null } }.
 */
function extractMinPoints(raw) {
  const tlds = raw?.tlds ?? {};
  const result = {};
  for (const [tld, regs] of Object.entries(tlds)) {
    if (!regs || typeof regs !== 'object') continue;
    let minReg = null;
    let minRenew = null;
    for (const val of Object.values(regs)) {
      let reg = null;
      let renew = null;
      if (Array.isArray(val)) {
        reg = val[0] ?? null;
        renew = val[1] ?? null;
      } else if (val && typeof val === 'object') {
        reg = val.reg ?? null;
        renew = val.renew ?? null;
      }
      if (reg != null) minReg = minReg == null ? reg : Math.min(minReg, reg);
      if (renew != null) minRenew = minRenew == null ? renew : Math.min(minRenew, renew);
    }
    result[tld] = { reg: minReg, renew: minRenew };
  }
  return result;
}

/** Upsert a month's points into the history (compact [m, reg, renew] tuples). */
function upsertMonth(history, month, points) {
  for (const [tld, { reg, renew }] of Object.entries(points)) {
    if (!history[tld]) history[tld] = [];
    const arr = history[tld];
    const idx = arr.findIndex((p) => p[0] === month);
    if (idx >= 0) arr.splice(idx, 1);
    arr.push([month, reg, renew]);
    arr.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
}

/** Remove points whose month is older than PRUNE_MONTHS from now. */
function pruneOld(history) {
  const nowIdx = monthIndex(currentMonth());
  for (const arr of Object.values(history)) {
    while (arr.length > 0 && nowIdx - monthIndex(arr[0][0]) > PRUNE_MONTHS) {
      arr.shift();
    }
  }
}

/** Remove TLDs with empty arrays and sort keys for stable output. */
function cleanAndSort(history) {
  const sorted = {};
  for (const key of Object.keys(history).sort()) {
    if (history[key].length > 0) sorted[key] = history[key];
  }
  return sorted;
}

// ---- Default mode ----

async function defaultMode() {
  const snapshot = await readJson(SNAPSHOT_PATH);
  const month = currentMonth();
  const points = extractMinPoints(snapshot);

  let history = {};
  try {
    history = await readJson(HISTORY_PATH);
  } catch {
    // missing or corrupt — start fresh
  }

  upsertMonth(history, month, points);
  pruneOld(history);
  history = cleanAndSort(history);

  await writeJson(HISTORY_PATH, history, 2);
  const tldCount = Object.keys(history).length;
  console.log(
    `price-history: upserted ${month} for ${Object.keys(points).length} TLDs -> ${HISTORY_PATH} (${tldCount} TLDs total)`,
  );
}

// ---- Seed mode ----

async function seedMode() {
  // 1. Get git log (newest first), capped at MAX_COMMITS
  let logOutput;
  try {
    logOutput = execFileSync(
      'git',
      ['log', `-${MAX_COMMITS}`, '--format=%H:%cs', '--', SNAPSHOT_REL],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (err) {
    console.error('git log failed:', err.message);
    process.exit(1);
  }

  // 2. Group by month, keep oldest commit per month.
  //    Git log is newest-first, so overwriting gives the last (oldest) commit.
  const monthToCommit = new Map();
  for (const line of logOutput.trim().split('\n')) {
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const hash = line.slice(0, sep);
    const date = line.slice(sep + 1);
    const month = date.substring(0, 7); // YYYY-MM
    monthToCommit.set(month, hash);
  }

  // 3. Process months ascending, extract min points from each commit
  const sortedMonths = [...monthToCommit.keys()].sort();
  const history = {};
  let skipped = 0;
  for (const month of sortedMonths) {
    const hash = monthToCommit.get(month);
    let raw;
    try {
      const out = execFileSync('git', ['show', `${hash}:${SNAPSHOT_REL}`], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      raw = JSON.parse(out);
    } catch (err) {
      console.warn(`skipping ${month} (${hash.slice(0, 8)}): ${err.message}`);
      skipped++;
      continue;
    }
    const points = extractMinPoints(raw);
    upsertMonth(history, month, points);
  }

  // 4. Merge current snapshot (git months first, then current)
  const snapshot = await readJson(SNAPSHOT_PATH);
  const month = currentMonth();
  const points = extractMinPoints(snapshot);
  upsertMonth(history, month, points);

  pruneOld(history);
  const cleaned = cleanAndSort(history);

  await writeJson(HISTORY_PATH, cleaned, 2);
  const tldCount = Object.keys(cleaned).length;
  const monthCount = sortedMonths.length - skipped + 1;
  console.log(
    `price-history: seeded ${monthCount} months across ${tldCount} TLDs from ${sortedMonths.length} git months (${skipped} skipped) -> ${HISTORY_PATH}`,
  );
}

// ---- Entry ----

const isSeed = process.argv.includes('--seed');
if (isSeed) {
  seedMode().catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
} else {
  defaultMode().catch((err) => {
    console.error('build-price-history failed:', err);
    process.exit(1);
  });
}
