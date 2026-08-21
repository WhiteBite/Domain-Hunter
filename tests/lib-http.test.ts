import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchWithRetry } from '../scripts/lib/http.mjs';

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('succeeds after 1 failure then returns the response', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWithRetry(
      'https://example.com/test',
      { timeoutMs: 1000 },
      { retries: 2, backoffMs: 1 },
    );
    expect(result).toBeInstanceOf(Response);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after retries are exhausted', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('https://example.com/test', { timeoutMs: 1000 }, { retries: 2, backoffMs: 1 }),
    ).rejects.toThrow(/fetch .* failed/);
    // retries=2 means 3 total attempts (1 initial + 2 retries)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
