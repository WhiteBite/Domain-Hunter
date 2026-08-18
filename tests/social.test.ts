import { describe, expect, it } from 'vitest';
import { PLATFORMS, checkPlatform, isValidHandle } from '../src/core/social';

function jsonResponse(status: number): Response {
  return new Response('null', { status });
}

const throwFetch = (() => Promise.reject(new TypeError('failed to fetch'))) as unknown as typeof fetch;

const github = PLATFORMS.find((p) => p.id === 'github')!;
const tiktok = PLATFORMS.find((p) => p.id === 'tiktok')!;
const reddit = PLATFORMS.find((p) => p.id === 'reddit')!;

describe('isValidHandle', () => {
  it('accepts lowercase letters, digits, dot, underscore, 1–30 chars', () => {
    expect(isValidHandle('a')).toBe(true);
    expect(isValidHandle('foo.bar')).toBe(true);
    expect(isValidHandle('user_name')).toBe(true);
    expect(isValidHandle('a1.b2_c3')).toBe(true);
    expect(isValidHandle('x'.repeat(30))).toBe(true);
  });

  it('rejects empty, too long, and disallowed chars', () => {
    expect(isValidHandle('')).toBe(false);
    expect(isValidHandle('x'.repeat(31))).toBe(false);
    expect(isValidHandle('-dash')).toBe(false);
    expect(isValidHandle('space here')).toBe(false);
    expect(isValidHandle('@at')).toBe(false);
    expect(isValidHandle('café')).toBe(false);
  });

  it('lowercases before matching', () => {
    expect(isValidHandle('FooBar')).toBe(true);
    expect(isValidHandle('USER.Name')).toBe(true);
  });
});

describe('checkPlatform — GitHub', () => {
  it('200 → taken', async () => {
    const f = (async () => jsonResponse(200)) as unknown as typeof fetch;
    expect(await checkPlatform(github, 'torvalds', f)).toBe('taken');
  });

  it('404 → free', async () => {
    const f = (async () => jsonResponse(404)) as unknown as typeof fetch;
    expect(await checkPlatform(github, 'free-name-xyz', f)).toBe('free');
  });

  it('403 → unknown', async () => {
    const f = (async () => jsonResponse(403)) as unknown as typeof fetch;
    expect(await checkPlatform(github, 'name', f)).toBe('unknown');
  });

  it('network error → unknown', async () => {
    expect(await checkPlatform(github, 'name', throwFetch)).toBe('unknown');
  });
});

describe('checkPlatform — TikTok', () => {
  it('200 → taken', async () => {
    const f = (async () => jsonResponse(200)) as unknown as typeof fetch;
    expect(await checkPlatform(tiktok, 'someuser', f)).toBe('taken');
  });

  it('404 → free', async () => {
    const f = (async () => jsonResponse(404)) as unknown as typeof fetch;
    expect(await checkPlatform(tiktok, 'free-user-xyz', f)).toBe('free');
  });

  it('500 → unknown', async () => {
    const f = (async () => jsonResponse(500)) as unknown as typeof fetch;
    expect(await checkPlatform(tiktok, 'name', f)).toBe('unknown');
  });
});

describe('checkPlatform — non-live platforms', () => {
  it('every non-live platform returns unknown', async () => {
    const nonLive = PLATFORMS.filter((p) => !p.live);
    expect(nonLive.length).toBeGreaterThan(0);
    for (const p of nonLive) {
      expect(await checkPlatform(p, 'name')).toBe('unknown');
    }
  });

  it('does NOT call fetch', async () => {
    let calls = 0;
    const countingFetch = (async () => {
      calls += 1;
      return jsonResponse(200);
    }) as unknown as typeof fetch;
    const result = await checkPlatform(reddit, 'name', countingFetch);
    expect(result).toBe('unknown');
    expect(calls).toBe(0);
  });
});

describe('PLATFORMS', () => {
  it('includes github and tiktok as live, others as not', () => {
    const live = PLATFORMS.filter((p) => p.live).map((p) => p.id);
    expect(live).toEqual(['github', 'tiktok']);
  });

  it('profileUrl templates match the verified URLs', () => {
    const byId = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.profileUrl('foo')]));
    expect(byId.github).toBe('https://github.com/foo');
    expect(byId.tiktok).toBe('https://www.tiktok.com/@foo');
    expect(byId.x).toBe('https://x.com/foo');
    expect(byId.youtube).toBe('https://www.youtube.com/@foo');
    expect(byId.instagram).toBe('https://www.instagram.com/foo');
    expect(byId.reddit).toBe('https://www.reddit.com/user/foo');
  });
});

describe('checkPlatform — proxy fallback', () => {
  function jsonBody(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
  }

  const reddit = PLATFORMS.find((p) => p.id === 'reddit')!;
  const github = PLATFORMS.find((p) => p.id === 'github')!;

  it('non-live platform resolves through the proxy when provided', async () => {
    const f = (async (url: string) =>
      String(url).includes('/social/')
        ? jsonBody(200, { status: 'taken' })
        : jsonBody(500, {})) as unknown as typeof fetch;
    expect(await checkPlatform(reddit, 'name', f, 'https://proxy.test/')).toBe('taken');
  });

  it('github 403 (rate limit) falls back to the proxy', async () => {
    const f = (async (url: string) =>
      String(url).includes('/social/')
        ? jsonBody(200, { status: 'free' })
        : jsonBody(403, {})) as unknown as typeof fetch;
    expect(await checkPlatform(github, 'name', f, 'https://proxy.test')).toBe('free');
  });

  it('github token is sent as Bearer header', async () => {
    let seenAuth = '';
    const f = (async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seenAuth = headers.Authorization ?? '';
      return jsonBody(200, {});
    }) as unknown as typeof fetch;
    await checkPlatform(github, 'name', f, undefined, 'tok123');
    expect(seenAuth).toBe('Bearer tok123');
  });

  it('proxy failure keeps unknown', async () => {
    const f = (async () => {
      throw new TypeError('proxy down');
    }) as unknown as typeof fetch;
    expect(await checkPlatform(reddit, 'name', f, 'https://proxy.test')).toBe('unknown');
  });
});
