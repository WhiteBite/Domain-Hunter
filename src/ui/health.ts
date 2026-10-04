export interface HealthEntry {
  ok?: boolean;
  directOk?: boolean;
  cfOk?: boolean | null;
}

/** 'unverified': no transport answered the probe. 'indirect': only the
 *  Cloudflare aggregator answered — runtime checks ride the fallback
 *  transport. Legacy entries ({ok} only) map ok:false to 'unverified'. */
export function healthNote(entry: HealthEntry | undefined): 'unverified' | 'indirect' | null {
  if (entry == null) return null;
  if (entry.ok === false) return 'unverified';
  if (entry.directOk === false && entry.cfOk === true) return 'indirect';
  return null;
}
