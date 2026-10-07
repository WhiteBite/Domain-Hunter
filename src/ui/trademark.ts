/**
 * Trademark link-outs (P3): deep links into USPTO / TMview name searches.
 * Zero API — navigation-only anchors from the results detail rows.
 */
export function trademarkLabel(domain: string): string {
  const i = domain.lastIndexOf('.');
  return i > 0 ? domain.slice(0, i) : domain;
}

export function usptoSearchUrl(label: string): string {
  return `https://tmsearch.uspto.gov/search/search-results?searchText=${encodeURIComponent(label)}`;
}

export function tmviewSearchUrl(label: string): string {
  return `https://www.tmdn.org/tmview/#/tmview/search?basicSearch=${encodeURIComponent(label)}`;
}
