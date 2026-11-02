/**
 * Prices in old snapshots were parsed with parseFloat, truncating grouped
 * thousands. Only mask the observed corrupt fields: their true historical
 * values cannot be recovered from the truncated numbers.
 */
export function cleanLegacyPorkbun(tld, prices, version) {
  const [reg, renew, transfer] = prices;
  if ((tld === 'web' || tld === 'dot') && reg === 0 && renew === 0 && transfer === 0) {
    return [null, null, null];
  }
  if (typeof version === 'number' && version >= 2) return [reg, renew, transfer];
  const broken = ['car', 'cars', 'auto', 'country', 'vana', 'protection', 'security', 'sexy', 'inc', 'dealer'].includes(tld)
    ? 200 : ['pr', 'lotto', 'rich'].includes(tld) ? 100 : null;
  return [reg, renew, transfer].map((value) => broken !== null && value === broken ? null : value);
}
