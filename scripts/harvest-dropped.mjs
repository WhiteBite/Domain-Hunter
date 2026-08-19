#!/usr/bin/env node
/**
 * Weekly harvester for the "Dropped domains" tab.
 *
 * Source: GitHub repo WhoisFreaks/daily-expired-and-dropped-domains.
 *   - Lists repo contents via the GitHub Contents API (root, then /data if
 *     the root listing has no matching CSV).
 *   - Picks the newest file whose name matches /dropped.*\.csv$/i, breaking
 *     ties by the latest date parsed out of the filename.
 *   - Fetches the raw file via raw.githubusercontent.com.
 *   - Parses CSV lines into lowercase domain strings.
 *   - Filters: TLD must exist in src/config/tlds.json; label length 4–18;
 *     letters only (a-z, no digits/hyphens); dedupes; caps at 3000.
 *   - Writes src/config/dropped.snapshot.json.
 *
 * Exit codes:
 *   0 — snapshot written, OR graceful no-op (source unreachable → existing
 *       snapshot kept, warning logged; if no snapshot exists, an empty one
 *       is written so the UI has the data shape).
 *   1 — write error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, '..', 'src', 'config', 'dropped.snapshot.json');
const TLDS_PATH = join(__dirname, '..', 'src', 'config', 'tlds.json');
const FETCH_TIMEOUT_MS = 10_000;
const MAX_DOMAINS = 3000;
const REPO = 'WhoisFreaks/daily-expired-and-dropped-domains';
const BRANCH = 'main'; // raw.githubusercontent.com default branch

// ---- HTTP ----

async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url) {
  const res = await fetchWithTimeout(url, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// ---- TLD allowlist ----

async function loadTldSet() {
  const raw = await readFile(TLDS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  /** @type {Set<string>} */
  const set = new Set();
  for (const entry of parsed.tlds ?? []) {
    if (entry && typeof entry.tld === 'string') set.add(entry.tld.toLowerCase());
  }
  return set;
}

// ---- File discovery ----

/** Parse a YYYY-MM-DD or YYYYMMDD date out of a filename; returns 0 if none. */
function dateScore(name) {
  // YYYY-MM-DD
  const m1 = /(\d{4})-(\d{2})-(\d{2})/.exec(name);
  if (m1) {
    const s = `${m1[1]}${m1[2]}${m1[3]}`;
    return Number(s);
  }
  // YYYYMMDD
  const m2 = /(\d{4})(\d{2})(\d{2})/.exec(name);
  if (m2) {
    return Number(`${m2[1]}${m2[2]}${m2[3]}`);
  }
  return 0;
}

/**
 * Pick the best CSV entry from a GitHub Contents API listing.
 * Returns { name, path } or null.
 */
function pickCsv(entries) {
  if (!Array.isArray(entries)) return null;
  const candidates = entries.filter((e) => {
    if (!e || typeof e.name !== 'string' || typeof e.type !== 'string') return false;
    if (e.type !== 'file') return false;
    return /dropped.*\.csv$/i.test(e.name);
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => dateScore(b.name) - dateScore(a.name));
  const top = candidates[0];
  return { name: top.name, path: top.path };
}

/**
 * Discover the newest dropped-domains CSV.
 *
 * Primary path: probe the last 30 days via raw.githubusercontent.com for
 * `YYYY-MM-DD-free-dropped-domains.csv` (the README-documented naming pattern).
 * This avoids the GitHub REST Contents API, which is rate-limited to 60
 * unauthenticated requests/hour per IP and routinely returns 403.
 *
 * Fallback: if raw probing finds nothing (e.g. naming pattern changed), try
 * the Contents API on root and /data.
 */
async function discoverCsv() {
  const found = await probeRecentDates(30);
  if (found) return found;
  const apiFound = await discoverViaContentsApi().catch((err) => {
    throw new Error(`raw date probe found nothing and contents API failed: ${err.message}`);
  });
  if (apiFound) return apiFound;
  throw new Error('no dropped*.csv found via raw probing or contents API');
}

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
      const res = await fetchWithTimeout(url, { method: 'HEAD' });
      if (res.ok) return { name, path: name };
    } catch {
      // network blip or 404 — try next date
    }
  }
  return null;
}

async function discoverViaContentsApi() {
  const rootUrl = `https://api.github.com/repos/${REPO}/contents/`;
  let entries;
  try {
    entries = await getJson(rootUrl);
  } catch (err) {
    const dataUrl = `https://api.github.com/repos/${REPO}/contents/data`;
    try {
      entries = await getJson(dataUrl);
    } catch (err2) {
      throw new Error(`contents listing failed: root (${err.message}), /data (${err2.message})`);
    }
  }
  let picked = pickCsv(entries);
  if (!picked && Array.isArray(entries)) {
    const dataEntries = await getJson(`https://api.github.com/repos/${REPO}/contents/data`);
    picked = pickCsv(dataEntries);
  }
  return picked;
}

async function fetchCsvText(picked) {
  const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${picked.path}`;
  const res = await fetchWithTimeout(rawUrl);
  if (!res.ok) throw new Error(`raw ${rawUrl} -> ${res.status}`);
  return res.text();
}

// ---- CSV parsing & filtering ----

/** RFC-4180-ish minimal CSV line splitter (handles quoted fields). */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const LABEL_RE = /^[a-z]{4,18}$/;

function parseDomains(csvText, tldSet) {
  const seen = new Set();
  const out = [];
  const lines = csvText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip header-ish lines.
    if (/^"?domain/i.test(line)) continue;
    const fields = splitCsvLine(line);
    const cell = (fields[0] ?? '').trim().toLowerCase();
    if (!cell) continue;
    // Cell may be "example.com" or "EXAMPLE.COM" or bare "example".
    let label;
    let tld;
    const dot = cell.lastIndexOf('.');
    if (dot > 0) {
      label = cell.slice(0, dot);
      tld = cell.slice(dot + 1);
    } else {
      // Bare label without TLD — skip, we need a TLD to filter.
      continue;
    }
    if (!LABEL_RE.test(label)) continue;
    if (!tldSet.has(tld)) continue;
    const key = `${label}.${tld}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ d: label, tld });
    if (out.length >= MAX_DOMAINS) break;
  }
  return out;
}

// ---- Main ----

async function main() {
  let tldSet;
  try {
    tldSet = await loadTldSet();
  } catch (err) {
    console.error(`failed to load tlds.json: ${err.message}`);
    process.exit(1);
  }

  let csvText;
  let sourceFile = null;
  try {
    const picked = await discoverCsv();
    sourceFile = picked.name;
    csvText = await fetchCsvText(picked);
  } catch (err) {
    console.warn(`dropped-domains source unavailable: ${err.message}`);
    if (existsSync(SNAPSHOT_PATH)) {
      console.warn('keeping existing snapshot');
      return;
    }
    // No existing snapshot — write an empty one so the UI has the shape.
    const empty = {
      generatedAt: new Date().toISOString(),
      source: 'whoisfreaks',
      list: [],
    };
    try {
      await writeFile(SNAPSHOT_PATH, JSON.stringify(empty, null, 2) + '\n', 'utf8');
      console.warn('wrote empty snapshot (source unreachable, no prior snapshot)');
      return;
    } catch (writeErr) {
      console.error(`failed to write empty snapshot: ${writeErr.message}`);
      process.exit(1);
    }
  }

  const domains = parseDomains(csvText, tldSet);
  // Compact, order-preserving format: "label tld" strings (~3× smaller than objects).
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: 'whoisfreaks',
    list: domains.map((x) => `${x.d} ${x.tld}`),
  };

  try {
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot) + '\n', 'utf8');
  } catch (writeErr) {
    console.error(`failed to write snapshot: ${writeErr.message}`);
    process.exit(1);
  }

  console.log(
    `harvested ${domains.length} dropped domains from ${sourceFile} -> ${SNAPSHOT_PATH}`,
  );
}

main().catch((err) => {
  console.error('harvest failed:', err);
  process.exit(1);
});
