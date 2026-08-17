/**
 * TLD-hack finder — words ending in a hack zone: family → fami.ly (SPEC §10.4).
 * Contract frozen for UI consumption; internals hardened.
 */
export interface HackResult {
  /** Original word, e.g. "family". */
  word: string;
  /** Full domain, e.g. "fami.ly". */
  domain: string;
  tld: string;
}

const MAX_OUTPUT = 500;

/** Sanitize to lowercase ASCII alpha-only (RFC-1035 label-safe). */
function sanitizeAlpha(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

export function findHacks(words: string[], hackTlds: string[]): HackResult[] {
  const results: HackResult[] = [];
  const seen = new Set<string>();
  // Longest TLD first so the most specific match wins per word.
  const tlds = [...hackTlds]
    .filter((t) => typeof t === 'string')
    .map(sanitizeAlpha)
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const rawWord of words) {
    if (typeof rawWord !== 'string') continue;
    const word = sanitizeAlpha(rawWord);
    if (word.length < 3) continue;
    for (const tld of tlds) {
      // Word must be longer than tld + 1 (need ≥2-char prefix).
      if (word.length <= tld.length + 1) continue;
      if (!word.endsWith(tld)) continue;
      const prefix = word.slice(0, word.length - tld.length);
      if (prefix.length < 2) continue;
      const domain = `${prefix}.${tld}`;
      if (seen.has(domain)) continue;
      seen.add(domain);
      results.push({ word, domain, tld });
      if (results.length >= MAX_OUTPUT) return results;
      break; // longest matching TLD wins for this word
    }
  }
  return results;
}
