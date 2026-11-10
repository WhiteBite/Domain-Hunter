/** Translate known internal RDAP diagnostics without guessing an unknown failure's cause. */
export function resultNoteKey(note: string): string | null {
  if (note === 'timeout') return 'result.reason.timeout';
  if (note === 'rate limited (429)') return 'result.reason.rateLimit';
  if (note === 'invalid RDAP domain response' || note === 'invalid RDAP 404 response') return 'result.reason.invalid';
  if (note === 'proxy response is not verifiable') return 'result.reason.proxy';
  if (note === 'RDAP 404 is unverified') return 'result.reason.unverified';
  if (note === 'RDAP 404 contradicted by live NS delegation') return 'result.reason.conflict';
  return null;
}
