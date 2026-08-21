/**
 * Weekly harvester for the "Dropped domains" tab.
 *
 * Source: GitHub repo WhoisFreaks/daily-expired-and-dropped-domains, which
 * publishes a daily CSV of ~10,000 dropped domains named
 * `YYYY-MM-DD-free-dropped-domains.csv` on the `main` branch (no auth).
 *
 * Flow:
 *   1. Discover the newest CSV by probing the last 30 days via HEAD on
 *      raw.githubusercontent.com (avoids the 60 req/h unauthenticated
 *      GitHub Contents API limit). Fallback to the Contents API listing.
 *   2. Fetch the raw CSV text (15s timeout, desktop UA).
 *   3. normalizeDropsCsv(text) — pure filter: ASCII letters only, label
 *      length 4-12, contains a vowel, no 4+ consecutive consonants,
 *      dedupe, cap at MAX_DOMAINS (2000).
 *   4. Write src/config/dropped.snapshot.json preserving the existing
 *      top-level shape { generatedAt, source, list }.
 *
 * Exit 0 on success; exit 1 on fetch/parse failure (snapshot untouched).
 *
 * normalizeDropsCsv is exported for unit tests (no I/O, no side effects).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchWithTimeout, readJson, writeJson } from './lib/http.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, '..', 'src', 'config', 'dropped.snapshot.json');
const FETCH_TIMEOUT_MS = 15_000;
const MAX_DOMAINS = 2000;
const REPO = 'WhoisFreaks/daily-expired-and-dropped-domains';
const BRANCH = 'main';
const PROBE_DAYS = 30;

// ---- Discovery ----

/** Probe `YYYY-MM-DD-free-dropped-domains.csv` for the last `days` days. */
async function probeRecentDates(days) {
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const name = `${yyyy}-${mm}-${dd}-free-dropped-domains.csv`;
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${name}`;
    try {
      const res = await fetchWithTimeout(url, { method: 'HEAD', timeoutMs: FETCH_TIMEOUT_MS });
      if (res.ok) return { name, path: name };
    } catch {
      // 404 or network blip — try next date
    }
  }
  return null;
}

/** Parse a YYYY-MM-DD date out of a filename; returns 0 if none. */
function dateScore(name) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(name) ?? /(\d{4})(\d{2})(\d{2})/.exec(name);
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : 0;
}

/** Fallback: list repo contents via GitHub API, pick newest dropped CSV. */
async function discoverViaApi() {
  for (const dir of ['', 'data']) {
    const url = `https://api.github.com/repos/${REPO}/contents/${dir}`;
    let entries;
    try {
      const res = await fetchWithTimeout(url, {
        timeoutMs: FETCH_TIMEOUT_MS,
        headers: { accept: 'application/vnd.github+json' },
      });
      if (!res.ok) continue;
      entries = await res.json();
    } catch {
      continue;
    }
    if (!Array.isArray(entries)) continue;
    const csvs = entries.filter(
      (e) => e && e.type === 'file' && /dropped.*\.csv$/i.test(e.name ?? ''),
    );
    if (csvs.length === 0) continue;
    csvs.sort((a, b) => dateScore(b.name) - dateScore(a.name));
    const top = csvs[0];
    return { name: top.name, path: top.path };
  }
  return null;
}

async function discoverCsv() {
  const probed = await probeRecentDates(PROBE_DAYS);
  if (probed) return probed;
  const apiFound = await discoverViaApi();
  if (apiFound) return apiFound;
  throw new Error('no dropped CSV found via raw probing or contents API');
}

async function fetchCsvText(picked) {
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${picked.path}`;
  const res = await fetchWithTimeout(url, { timeoutMs: FETCH_TIMEOUT_MS });
  if (!res.ok) throw new Error(`raw ${url} -> ${res.status}`);
  return res.text();
}

// ---- CSV normalization (pure, exported for tests) ----

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const LABEL_RE = /^[a-z]{4,12}$/;

/** True when `s` contains at least one vowel (a, e, i, o, u). */
function hasVowel(s) {
  for (const ch of s) if (VOWELS.has(ch)) return true;
  return false;
}

/** True when `s` has 4+ consecutive consonants (non-vowels). */
function hasFourConsecutiveConsonants(s) {
  let run = 0;
  for (const ch of s) {
    if (VOWELS.has(ch)) {
      run = 0;
    } else if (++run >= 4) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a WhoisFreaks dropped-domains CSV (one domain per line, no header)
 * into a filtered, deduped list of { d, tld } objects matching DroppedDomain
 * from src/core/dropped.ts.
 *
 * Filters: ASCII letters only (a-z), label length 4-12, contains a vowel,
 * no 4+ consecutive consonants, deduped, capped at maxDomains.
 *
 * @param {string} text - raw CSV text
 * @param {number} [maxDomains] - cap on returned items (default 2000)
 * @returns {{ d: string, tld: string }[]}
 */
export function normalizeDropsCsv(text, maxDomains = MAX_DOMAINS) {
  const seen = new Set();
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const cell = rawLine.trim().toLowerCase();
    if (!cell) continue;
    const dot = cell.lastIndexOf('.');
    if (dot <= 0) continue; // no dot or leading dot — can't split label/tld
    const label = cell.slice(0, dot);
    const tld = cell.slice(dot + 1);
    if (!tld) continue;
    if (!LABEL_RE.test(label)) continue; // ASCII letters only, length 4-12
    if (!hasVowel(label)) continue;
    if (hasFourConsecutiveConsonants(label)) continue;
    const key = `${label}.${tld}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ d: label, tld });
    if (out.length >= maxDomains) break;
  }
  return out;
}

// ---- Main ----

async function main() {
  // Read current snapshot length for order-of-magnitude context.
  let prevLen = 0;
  try {
    const prev = await readJson(SNAPSHOT_PATH);
    prevLen = Array.isArray(prev?.list) ? prev.list.length : 0;
  } catch {
    // no prior snapshot — fine
  }

  let csvText;
  let sourceFile;
  try {
    const picked = await discoverCsv();
    sourceFile = picked.name;
    csvText = await fetchCsvText(picked);
  } catch (err) {
    console.error(`dropped-domains source unavailable: ${err.message}`);
    console.error('snapshot untouched');
    process.exit(1);
  }

  const domains = normalizeDropsCsv(csvText);
  if (domains.length === 0) {
    console.error('parse produced 0 domains — snapshot untouched');
    process.exit(1);
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: 'whoisfreaks',
    list: domains.map((x) => `${x.d} ${x.tld}`),
  };

  try {
    await writeJson(SNAPSHOT_PATH, snapshot);
  } catch (writeErr) {
    console.error(`failed to write snapshot: ${writeErr.message}`);
    process.exit(1);
  }

  console.log(
    `harvested ${domains.length} dropped domains (cap ${MAX_DOMAINS}, prev ${prevLen}) from ${sourceFile} -> ${SNAPSHOT_PATH}`,
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error('harvest failed:', err);
    process.exit(1);
  });
}
