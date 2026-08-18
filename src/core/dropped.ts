/**
 * Dropped-domains helpers (SPEC §17 — post-spec evolution).
 * Pure functions over the snapshot shipped at src/config/dropped.snapshot.json.
 */

export interface DroppedDomain {
  /** ASCII label, lowercase, no TLD. */
  d: string;
  /** TLD without leading dot, lowercase. */
  tld: string;
}

/**
 * Filter a list of dropped domains by free-text query and optional TLD.
 *
 * Query semantics: a domain matches when the query is a substring of the
 * bare label (`d`) OR of the full `d.tld` form. Matching is case-insensitive.
 * An empty/whitespace query returns all domains (subject to the TLD filter).
 * A null/empty TLD returns domains from every TLD.
 */
export function filterDrops(
  domains: DroppedDomain[],
  query: string,
  tld: string | null,
): DroppedDomain[] {
  const q = query.trim().toLowerCase();
  const t = tld?.trim().toLowerCase() || null;
  return domains.filter((dom) => {
    if (t !== null && dom.tld !== t) return false;
    if (q === '') return true;
    if (dom.d.includes(q)) return true;
    return `${dom.d}.${dom.tld}`.includes(q);
  });
}
