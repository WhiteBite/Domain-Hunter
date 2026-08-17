/**
 * Combinator generator — roots × affixes, mode prefix/suffix/both (SPEC §10.1).
 * Contract frozen for UI consumption; internals hardened.
 */
export type CombinatorMode = 'prefix' | 'suffix' | 'both';

const MAX_OUTPUT = 500;

/** Neutral presets from SPEC §10.1. */
export const DEFAULT_AFFIXES: readonly string[] = [
  'app', 'pro', 'hq', 'hub', 'ai', 'io', 'get', 'use', 'my', 'go',
  'try', 'top', 'one', 'lab', 'kit', 'base', 'flow', 'forge', 'nest', 'peak',
];

/** Sanitize to a lowercase RFC-1035-safe label fragment (letters, digits, hyphen). */
function sanitize(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function combinator(
  roots: string[],
  affixes: string[],
  mode: CombinatorMode,
): string[] {
  const out = new Set<string>();
  const cleanRoots = roots.filter((r) => typeof r === 'string').map(sanitize);
  const cleanAffixes = affixes.filter((a) => typeof a === 'string').map(sanitize);

  for (const root of cleanRoots) {
    if (!root) continue;
    for (const affix of cleanAffixes) {
      if (!affix) continue;
      if (mode === 'prefix' || mode === 'both') out.add(`${affix}${root}`);
      if (mode === 'suffix' || mode === 'both') out.add(`${root}${affix}`);
      if (out.size >= MAX_OUTPUT) return [...out];
    }
  }
  return [...out];
}
