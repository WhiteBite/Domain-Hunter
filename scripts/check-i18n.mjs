/**
 * i18n parity checker — verifies every locale dictionary stays in sync.
 *
 * Zero-dep; parses src/i18n/*.ts as text (no TS runner needed, works on
 * Node >= 20). Wired into `npm run lint`, which the husky pre-commit hook
 * and the CI workflow both run — so a broken translation blocks the commit
 * and the deploy.
 *
 * Checks:
 *  (1) Discovery  — every src/i18n/<code>.ts that exports a Dict is a locale.
 *  (2) Key parity — each locale exposes exactly the reference (en) key set.
 *  (3) No empties — no locale has an empty-string value.
 *  (4) Placeholders — {param} interpolation tokens match the reference.
 *  (5) Type sync  — types.ts `Locale` union == discovered locale codes.
 *  (6) Registry   — locales.ts LOCALES codes == discovered locale codes.
 *  (7) Core wire  — index.svelte.ts imports + dicts keys == discovered codes.
 *  (8) Unused keys — every reference key appears as a quoted literal in src/.
 *
 * Exit code 1 on any violation (blocks commit / CI), 0 when clean.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const i18nDir = join(root, 'src', 'i18n');

/** Files in src/i18n/ that are infrastructure, not locale dictionaries. */
const NON_LOCALE_FILES = new Set(['index.ts', 'index.svelte.ts', 'locales.ts']);

const REFERENCE = 'en';

const violations = [];
function fail(check, detail) {
  violations.push({ check, detail });
}

// ---------------------------------------------------------------------------
// Parsing helpers (text-based — locale files are flat `Dict` object literals)
// ---------------------------------------------------------------------------

/**
 * Parse a locale dictionary source into an ordered map of key -> raw value
 * block. A value block is the text from after the `:` up to the start of the
 * next `'key':` (or end of the object), which lets us inspect multi-line
 * string values and their {param} placeholders without a TS parser.
 */
function parseDict(source) {
  const entries = new Map();
  // Keys may be single- OR double-quoted (en.ts mixes both styles).
  const keyRe = /['"]([a-zA-Z0-9._]+)['"]\s*:/g;
  const positions = [];
  let m;
  while ((m = keyRe.exec(source)) !== null) {
    positions.push({ key: m[1], start: m.index, afterColon: m.index + m[0].length });
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].afterColon;
    const end = i + 1 < positions.length ? positions[i + 1].start : source.length;
    entries.set(positions[i].key, source.slice(start, end));
  }
  return entries;
}

/** Extract sorted {param} placeholder names from a value block. */
function placeholders(valueBlock) {
  const out = [];
  const re = /\{(\w+)\}/g;
  let m;
  while ((m = re.exec(valueBlock)) !== null) out.push(m[1]);
  return out.sort();
}

/** Extract the set of quoted string literals (single or double) from a value block (to detect empties). */
function stringLiterals(valueBlock) {
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(valueBlock)) !== null) out.push(m[1] ?? m[2] ?? '');
  return out;
}

/** Recursively list all .ts and .svelte files under a directory. */
function listSrcFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSrcFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte')) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// (1) Discover locale dictionary files
// ---------------------------------------------------------------------------

const localeFiles = readdirSync(i18nDir)
  .filter((f) => f.endsWith('.ts') && !NON_LOCALE_FILES.has(f))
  .sort();

if (localeFiles.length === 0) {
  fail('discovery', 'no locale dictionary files found in src/i18n/');
}

/** code -> parsed Map<key, valueBlock> */
const dicts = new Map();
for (const file of localeFiles) {
  const code = file.replace(/\.ts$/, '');
  const src = readFileSync(join(i18nDir, file), 'utf8');
  // Sanity: the file should actually export a Dict.
  if (!/export\s+const\s+\w+\s*:\s*Dict\s*=/.test(src)) {
    fail('discovery', `src/i18n/${file} does not export a \`Dict\` — is it a locale file?`);
    continue;
  }
  dicts.set(code, parseDict(src));
}

const codes = [...dicts.keys()].sort();

if (!dicts.has(REFERENCE)) {
  fail('discovery', `reference locale '${REFERENCE}' (src/i18n/en.ts) is missing`);
  report();
}

// ---------------------------------------------------------------------------
// (2)(3)(4) Key parity, empty values, placeholder matching vs reference
// ---------------------------------------------------------------------------

const refEntries = dicts.get(REFERENCE);
const refKeys = [...refEntries.keys()].sort();

for (const [code, entries] of dicts) {
  if (code === REFERENCE) continue;

  // (2) key parity
  const keys = [...entries.keys()].sort();
  const missing = refKeys.filter((k) => !entries.has(k));
  const extra = keys.filter((k) => !refEntries.has(k));
  if (missing.length > 0) {
    fail('key-parity', `[${code}] missing ${missing.length} key(s): ${listKeys(missing)}`);
  }
  if (extra.length > 0) {
    fail('key-parity', `[${code}] has ${extra.length} extra key(s) not in '${REFERENCE}': ${listKeys(extra)}`);
  }

  // (3) empty values (check every key this locale defines)
  for (const [key, block] of entries) {
    const lits = stringLiterals(block);
    if (lits.some((s) => s.trim() === '')) {
      fail('empty-value', `[${code}] '${key}' has an empty string value`);
    }
  }

  // (4) placeholder matching (only for keys present in both)
  for (const key of refKeys) {
    if (!entries.has(key)) continue; // already reported as missing
    const refPh = placeholders(refEntries.get(key));
    const locPh = placeholders(entries.get(key));
    if (refPh.join(',') !== locPh.join(',')) {
      fail('placeholder', `[${code}] '${key}' placeholders {${locPh.join(',')}} != ${REFERENCE} {${refPh.join(',')}}`);
    }
  }
}

// Also flag empty values in the reference itself.
for (const [key, block] of refEntries) {
  const lits = stringLiterals(block);
  if (lits.some((s) => s.trim() === '')) {
    fail('empty-value', `[${REFERENCE}] '${key}' has an empty string value`);
  }
}

// ---------------------------------------------------------------------------
// (5) types.ts `Locale` union must match discovered codes
// ---------------------------------------------------------------------------

const typesPath = join(root, 'src', 'types.ts');
if (existsSync(typesPath)) {
  const typesSrc = readFileSync(typesPath, 'utf8');
  const localeTypeMatch = typesSrc.match(/export\s+type\s+Locale\s*=\s*([^;]+);/);
  if (!localeTypeMatch) {
    fail('type-sync', 'src/types.ts: could not find `export type Locale = ...`');
  } else {
    const typeCodes = [...localeTypeMatch[1].matchAll(/'([a-zA-Z-]+)'/g)].map((m) => m[1]).sort();
    const missing = codes.filter((c) => !typeCodes.includes(c));
    const extra = typeCodes.filter((c) => !codes.includes(c));
    if (missing.length > 0) fail('type-sync', `src/types.ts Locale is missing: ${missing.join(', ')}`);
    if (extra.length > 0) fail('type-sync', `src/types.ts Locale has codes without a dictionary: ${extra.join(', ')}`);
  }
} else {
  fail('type-sync', 'src/types.ts not found');
}

// ---------------------------------------------------------------------------
// (6) locales.ts LOCALES registry must match discovered codes
// ---------------------------------------------------------------------------

const localesPath = join(i18nDir, 'locales.ts');
if (existsSync(localesPath)) {
  const localesSrc = readFileSync(localesPath, 'utf8');
  const registryCodes = [...localesSrc.matchAll(/code:\s*'([a-zA-Z-]+)'/g)].map((m) => m[1]).sort();
  const missing = codes.filter((c) => !registryCodes.includes(c));
  const extra = registryCodes.filter((c) => !codes.includes(c));
  if (missing.length > 0) fail('registry-sync', `src/i18n/locales.ts LOCALES is missing: ${missing.join(', ')}`);
  if (extra.length > 0) fail('registry-sync', `src/i18n/locales.ts LOCALES has codes without a dictionary: ${extra.join(', ')}`);
} else {
  fail('registry-sync', 'src/i18n/locales.ts not found');
}

// ---------------------------------------------------------------------------
// (7) index.svelte.ts must import every locale and include it in `dicts`
// ---------------------------------------------------------------------------

const corePath = join(i18nDir, 'index.svelte.ts');
if (existsSync(corePath)) {
  const coreSrc = readFileSync(corePath, 'utf8');
  for (const code of codes) {
    const imported = new RegExp(`import\\s*{\\s*${code}\\s*}\\s*from\\s*'./${code}'`).test(coreSrc)
      || new RegExp(`from\\s*'./${code}'`).test(coreSrc);
    if (!imported) {
      fail('core-wire', `src/i18n/index.svelte.ts does not import locale '${code}' from './${code}'`);
    }
    // The dicts record must reference the identifier.
    const dictsMatch = coreSrc.match(/const\s+dicts\s*:\s*Record<Locale,\s*Dict>\s*=\s*{([^}]*)}/);
    if (dictsMatch && !new RegExp(`\\b${code}\\b`).test(dictsMatch[1])) {
      fail('core-wire', `src/i18n/index.svelte.ts \`dicts\` object is missing locale '${code}'`);
    }
  }
} else {
  fail('core-wire', 'src/i18n/index.svelte.ts not found');
}

// ---------------------------------------------------------------------------
// (8) Unused-key check — every reference key must appear as a quoted string
// literal somewhere in src/ (excluding the i18n dict files themselves).
// Keys that are legitimately constructed dynamically (no literal in source)
// can be added to UNUSED_KEY_ALLOWLIST below.
// ---------------------------------------------------------------------------

/** Keys exempt from the unused check because they are constructed dynamically
 *  (e.g. via template literals) and don't appear as quoted literals in src/.
 *  Keep this list as small as possible — every entry is a maintenance risk. */
const UNUSED_KEY_ALLOWLIST = new Set([
  // No dynamic keys currently — all keys are used as string literals.
]);

{
  const srcRoot = join(root, 'src');
  const srcFiles = listSrcFiles(srcRoot).filter(
    (f) => !f.includes(`${sep}i18n${sep}`) || NON_LOCALE_FILES.has(basename(f)),
  );
  const srcContent = srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

  const unused = [];
  for (const key of refKeys) {
    if (UNUSED_KEY_ALLOWLIST.has(key)) continue;
    const singleQuoted = `'${key}'`;
    const doubleQuoted = `"${key}"`;
    if (!srcContent.includes(singleQuoted) && !srcContent.includes(doubleQuoted)) {
      unused.push(key);
    }
  }

  if (unused.length > 0) {
    fail('unused-key', `${unused.length} key(s) in '${REFERENCE}' have no usage in src/: ${listKeys(unused)}`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function listKeys(keys) {
  const shown = keys.slice(0, 8).map((k) => `'${k}'`).join(', ');
  return keys.length > 8 ? `${shown}, … (+${keys.length - 8} more)` : shown;
}

function report() {
  if (violations.length > 0) {
    console.error('\n\x1b[31mi18n-check: %d violation(s)\x1b[0m\n', violations.length);
    for (const v of violations) {
      console.error(`  [${v.check}] ${v.detail}`);
    }
    console.error('\n  Fix the translation files so all locales stay in sync, then re-commit.\n');
    process.exit(1);
  } else {
    console.log(`i18n-check: OK — ${codes.length} locales (${codes.join(', ')}) in sync, ${refKeys.length} keys each`);
  }
}

report();
