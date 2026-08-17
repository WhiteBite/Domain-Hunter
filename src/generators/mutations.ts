/**
 * Word mutations — alternatives for taken names (SPEC §10.5).
 * Contract frozen for UI consumption; internals hardened.
 */

const VOWEL_SWAPS: ReadonlyArray<[RegExp, string]> = [
  [/i/g, 'y'],
  [/y/g, 'i'],
];

const SUFFIXES: readonly string[] = ['o', 'a', 'y', 'io', 'ify', 'ly', 'hq'];

function truncate(word: string): string[] {
  if (word.length <= 4) return [];
  return [word.slice(0, word.length - 1), word.slice(0, word.length - 2)];
}

/** Sanitize to lowercase ASCII alpha-only. */
function sanitizeAlpha(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

export function mutate(input: string): string[] {
  if (typeof input !== 'string') return [];
  const word = sanitizeAlpha(input);
  if (!word) return [];
  const out = new Set<string>();

  // vowel swaps i↔y
  for (const [pattern, replacement] of VOWEL_SWAPS) {
    const swapped = word.replace(pattern, replacement);
    if (swapped !== word) out.add(swapped);
  }
  // s↔z
  if (word.includes('s')) out.add(word.replace(/s/g, 'z'));
  if (word.includes('z')) out.add(word.replace(/z/g, 's'));
  // doubling of the final consonant
  const last = word.charAt(word.length - 1);
  if (last && !'aeiou'.includes(last)) out.add(word + last);
  // truncations
  for (const t of truncate(word)) out.add(t);
  // productive suffixes
  for (const suffix of SUFFIXES) {
    const base = word.endsWith('e') ? word.slice(0, -1) : word;
    out.add(base + suffix);
  }

  // never return the input word
  out.delete(word);
  return [...out].filter((w) => w.length >= 3 && w.length <= 63);
}
