import { describe, expect, it } from 'vitest';
import { resultNoteKey } from '../src/ui/result-note';

describe('result diagnostics', () => {
  it.each([
    ['timeout', 'timeout'], ['rate limited (429)', 'rateLimit'],
    ['invalid RDAP domain response', 'invalid'], ['invalid RDAP 404 response', 'invalid'],
    ['proxy response is not verifiable', 'proxy'], ['RDAP 404 is unverified', 'unverified'],
    ['RDAP 404 contradicted by live NS delegation', 'conflict'],
  ])('maps %s only to its documented reason', (note, key) => {
    expect(resultNoteKey(note)).toBe(`result.reason.${key}`);
  });
  it('does not infer reasons from unrecognized network or HTTP errors', () => {
    expect(resultNoteKey('server error (503)')).toBeNull();
    expect(resultNoteKey('TypeError: Failed to fetch')).toBeNull();
    expect(resultNoteKey('')).toBeNull();
  });
});
