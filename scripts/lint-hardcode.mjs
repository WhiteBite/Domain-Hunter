/**
 * Zero-dep heuristic linter — flags three classes of hardcoding mistakes:
 *
 *  (a) Raw user-visible strings in Svelte templates: text nodes between > and <
 *      containing >=2 latin/cyrillic words NOT inside {t(...)}; and raw
 *      title=/aria-label=/placeholder= attribute values not using t().
 *  (b) Off-allowlist network hosts: literal https:// hosts in src/ that are
 *      not in the SPEC section 13 allowlist (variables like proxyUrl/base and
 *      relative './' paths are always allowed).
 *  (c) Zone literals: arrays of 3+ tld-like strings outside src/config/ —
 *      zones are data and must live in src/config/tlds.json.
 *
 * Tuned to zero false positives on the current codebase. When a legitimate
 * exception is needed, add it to the relevant ALLOWLIST below with a reason.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');

// ---------------------------------------------------------------------------
// (a) String allowlist — raw strings that are legitimate brands/symbols and
//     must not be forced through t(). Each entry needs a reason.
// ---------------------------------------------------------------------------
const STRING_ALLOWLIST = new Set([
  'GitHub',          // brand name in footer / about link text
  'EN', 'RU',        // language toggle button (2-letter code, locale-agnostic)
  'English',         // language option label (endonym — must match the locale)
  'Русский',         // language option label (endonym — must match the locale)
  'USD ($)',         // currency option (code + symbol — locale-agnostic)
  'RUB (₽)',         // currency option (code + symbol — locale-agnostic)
  'EUR (€)',         // currency option (code + symbol — locale-agnostic)
  'RUB', 'EUR',      // currency rate input labels (ISO 4217 codes)
  'https://your-worker.workers.dev/', // proxy URL placeholder (example, not text)
  'ghp_… / github_pat_…',             // GitHub token placeholder (format hint)
  '…',               // loading ellipsis
  '×',               // remove-chip button symbol
  '·',               // inline separator
  '▲',               // sort-arrow glyph
]);

// ---------------------------------------------------------------------------
// (b) Network allowlist — SPEC §13 hosts that may be contacted at runtime.
//     Regexes are anchored to the host portion of the URL.
// ---------------------------------------------------------------------------
const NETWORK_ALLOWLIST = [
  // RDAP registries (curated + bootstrap-discovered)
  /^rdap\.verisign\.com$/,
  /^tld-rdap\.verisign\.com$/,
  /^pubapi\.registry\.google$/,
  /^rdap\.identitydigital\.services$/,
  /^rdap\.centralnic\.com$/,
  /^rdap\.radix\.host$/,
  /^rdap\.uniregistry\.net$/,
  /^rdap\.denic\.de$/,
  /^rdap\.registry\.co$/,
  /^rdap\.nic\.(us|ch|so|ly)$/,
  /^rdap\.nominet\.uk$/,
  /^rdap\.sidn\.nl$/,
  /^rdap\.afnic\.fr$/,
  /^rdap\.tcinet\.ru$/,
  /^rdap\.dns\.pl$/,
  // IANA bootstrap
  /^data\.iana\.org$/,
  // DNS-over-HTTPS
  /^cloudflare-dns\.com$/,
  /^dns\.google$/,
  // Pricing
  /^api\.porkbun\.com$/,
  /^cfdomainpricing\.com$/,
  // DigMyName (per-domain buy-link API)
  /^api\.digmyname\.com$/,
  // GitHub (device flow + user API + profile links)
  /^api\.github\.com$/,
  /^github\.com$/,
  // Social platform profile URLs (constructed literals, not all fetched)
  /^www\.tiktok\.com$/,
  /^x\.com$/,
  /^www\.youtube\.com$/,
  /^www\.instagram\.com$/,
  /^www\.reddit\.com$/,
  // Proxy placeholder (example host in placeholder text)
  /^your-worker\.workers\.dev$/,
];

// ---------------------------------------------------------------------------
// (c) Zone-literals allowlist — files that legitimately contain arrays of
//     tld-like strings outside src/config/. Each entry needs a reason.
// ---------------------------------------------------------------------------
const ZONE_ALLOWLIST_FILES = new Set([
  'src/types.ts',                            // DEFAULT_SETTINGS.defaultTlds — default selection, not zone defs
  'src/App.svelte',                          // tab IDs ('check', 'generators', …) — not TLDs
  'src/ui/components/GeneratorsTab.svelte',  // DEFAULT_AFFIXES — generator affixes, not zones
  'src/core/social.ts',                      // platform IDs ('github', 'tiktok', …) — not TLDs
  'src/generators/combinator.ts',            // affix list — generator data, not zones
  'src/generators/mutations.ts',             // mutation suffixes ('io', 'ify', …) — not zones
  'src/generators/syllables.ts',             // onset/rime phoneme clusters — not zones
  'src/ui/csv.ts',                           // CSV column names ('domain', 'status', …) — not zones
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect files under dir matching a predicate. */
function walk(dir, pred, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

/** Read a file as a string. */
function read(p) {
  return readFileSync(p, 'utf8');
}

/** Count latin/cyrillic words (1+ letter sequences) in text. */
function countWords(text) {
  const matches = text.match(/[a-zA-Zа-яА-ЯёЁ]+/g);
  return matches ? matches.length : 0;
}

/** Extract <template> portion of a .svelte file (strip <script> and <style>). */
function extractTemplate(src) {
  return src
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/** Remove <svg>…</svg> blocks (path data contains letter commands). */
function stripSvg(template) {
  return template.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
}

/** Strip Svelte brace expressions {…} from a text node (non-nested). */
function stripBraces(text) {
  return text.replace(/\{[^}]*\}/g, '');
}

/** Strip ALL Svelte brace expressions {…} including nested, from any text.
 *  Used to remove {onclick={...}} etc. before scanning for text nodes, so
 *  arrow-function > and < are not mistaken for tag boundaries. */
function stripAllBraces(text) {
  let result = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') { if (depth > 0) depth--; }
    else if (depth === 0) result += ch;
  }
  return result;
}

/** Check if a host matches any entry in the network allowlist. */
function isHostAllowed(host) {
  return NETWORK_ALLOWLIST.some((re) => re.test(host));
}

/** Extract the host from a https:// URL literal. */
function extractHost(url) {
  const m = url.match(/^https:\/\/([^/]+)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Check (a): raw user-visible strings in .svelte files
// ---------------------------------------------------------------------------

function checkSvelteStrings(file, src, violations) {
  const rel = relative(root, file).replace(/\\/g, '/');
  const template = stripSvg(extractTemplate(src));

  // (a1) Text nodes between > and < with >=2 words not inside {t(...)}.
  // Strip ALL Svelte expressions first so arrow-function > and < inside
  // onclick={...} are not mistaken for tag boundaries.
  const stripped = stripAllBraces(template);
  const textNodeRe = />([^<]+)</g;
  let m;
  while ((m = textNodeRe.exec(stripped)) !== null) {
    const raw = m[1].trim();
    if (raw.length === 0) continue;
    if (countWords(raw) >= 2) {
      const cleaned = raw.replace(/\s+/g, ' ').trim();
      if (!STRING_ALLOWLIST.has(cleaned)) {
        violations.push({
          file: rel,
          kind: 'hardcoded-text',
          detail: `"${cleaned}" — use t() for user-visible text`,
        });
      }
    }
  }

  // (a2) title=/aria-label=/placeholder= with raw quoted words not using t().
  // Run on the ORIGINAL template (before brace stripping) to correctly
  // distinguish title="raw" from title={t('key')}.
  const attrRe = /\b(title|aria-label|placeholder)\s*=\s*"([^"]*)"/g;
  while ((m = attrRe.exec(template)) !== null) {
    const attr = m[1];
    const val = m[2];
    if (val.startsWith('{')) continue; // Svelte expression — skip
    if (countWords(val) >= 1 && !STRING_ALLOWLIST.has(val)) {
      violations.push({
        file: rel,
        kind: 'hardcoded-attr',
        detail: `${attr}="${val}" — use t() for user-visible text`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Check (b): off-allowlist network hosts
// ---------------------------------------------------------------------------

function checkNetworkHosts(file, src, violations) {
  const rel = relative(root, file).replace(/\\/g, '/');
  // Match literal https://host in the source (not inside comments).
  const urlRe = /https:\/\/([a-zA-Z0-9][a-zA-Z0-9.-]*)/g;
  let m;
  while ((m = urlRe.exec(src)) !== null) {
    const host = m[1];
    if (!isHostAllowed(host)) {
      violations.push({
        file: rel,
        kind: 'off-allowlist-host',
        detail: `https://${host} — not in SPEC §13 network allowlist`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Check (c): zone literals outside src/config/
// ---------------------------------------------------------------------------

const TLD_LIKE = /^[a-z]{2,10}$/;

function checkZoneLiterals(file, src, violations) {
  const rel = relative(root, file).replace(/\\/g, '/');
  if (rel.startsWith('src/config/')) return;
  if (ZONE_ALLOWLIST_FILES.has(rel)) return;

  // Find array-like sequences of 3+ quoted tld-like strings.
  // Handles both single-line ['a','b','c'] and multi-line arrays.
  const arrayRe = /\[([\s\S]*?)\]/g;
  let m;
  while ((m = arrayRe.exec(src)) !== null) {
    const body = m[1];
    const strRe = /['"]([a-z]{2,10})['"]/g;
    const tldLike = [];
    let s;
    while ((s = strRe.exec(body)) !== null) {
      if (TLD_LIKE.test(s[1])) tldLike.push(s[1]);
    }
    if (tldLike.length >= 3) {
      violations.push({
        file: rel,
        kind: 'zone-literal',
        detail: `array of ${tldLike.length} tld-like strings (${tldLike.slice(0, 5).join(', ')}${tldLike.length > 5 ? ', …' : ''}) — zones belong in src/config/tlds.json`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const violations = [];

// Collect .svelte and .ts files under src/
const svelteFiles = walk(srcDir, (p) => extname(p) === '.svelte');
const tsFiles = walk(srcDir, (p) => extname(p) === '.ts');

// Run checks
for (const f of svelteFiles) {
  const src = read(f);
  checkSvelteStrings(f, src, violations);
  checkNetworkHosts(f, src, violations);
  checkZoneLiterals(f, src, violations);
}
for (const f of tsFiles) {
  const src = read(f);
  checkNetworkHosts(f, src, violations);
  checkZoneLiterals(f, src, violations);
}

// Report
if (violations.length > 0) {
  console.error('\n\x1b[31mhardcode-lint: %d violation(s)\x1b[0m\n', violations.length);
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.kind}`);
    console.error(`    ${v.detail}\n`);
  }
  process.exit(1);
} else {
  console.log('hardcode-lint: 0 violations');
}
