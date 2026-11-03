export interface HealthEntry {
  ok?: boolean;
  directOk?: boolean;
  cfOk?: boolean | null;
}

/** Do not trust legacy health entries that only passed the retired fallback. */
export function healthNote(entry: HealthEntry | undefined): 'unverified' | 'indirect' | null {
  if (entry == null) return null;
  if (entry.ok === false || entry.directOk === false) return 'unverified';
  return null;
}
