/**
 * Social handle availability — SPEC §7 three-state model.
 *
 * Live platforms (GitHub, TikTok) are queried via their public oembed / user
 * endpoints, both of which send permissive CORS headers. The remaining
 * platforms are CORS-blocked or have no anonymous endpoint, so they report
 * 'unknown' with a manual profile link. We never guess availability.
 */

export type SocialStatus = 'free' | 'taken' | 'unknown';

export interface Platform {
  id: string;
  name: string;
  live: boolean;
  profileUrl: (name: string) => string;
}

export const PLATFORMS: Platform[] = [
  { id: 'github', name: 'GitHub', live: true, profileUrl: (n) => `https://github.com/${n}` },
  { id: 'tiktok', name: 'TikTok', live: true, profileUrl: (n) => `https://www.tiktok.com/@${n}` },
  { id: 'x', name: 'X', live: false, profileUrl: (n) => `https://x.com/${n}` },
  { id: 'youtube', name: 'YouTube', live: false, profileUrl: (n) => `https://www.youtube.com/@${n}` },
  { id: 'instagram', name: 'Instagram', live: false, profileUrl: (n) => `https://www.instagram.com/${n}` },
  { id: 'reddit', name: 'Reddit', live: false, profileUrl: (n) => `https://www.reddit.com/user/${n}` },
];

const HANDLE_RE = /^[a-z0-9_.]{1,30}$/;

/** A handle is valid if its lowercase form matches ^[a-z0-9_.]{1,30}$. */
export function isValidHandle(s: string): boolean {
  return HANDLE_RE.test(s.toLowerCase());
}

interface LiveConfig {
  url: (name: string) => string;
  interpret: (status: number) => SocialStatus;
}

/** Per-platform live endpoint + status mapping (verified 2026-08-18). */
const LIVE: Record<string, LiveConfig> = {
  github: {
    url: (n) => `https://api.github.com/users/${n}`,
    interpret: (s) => (s === 200 ? 'taken' : s === 404 ? 'free' : 'unknown'),
  },
  tiktok: {
    url: (n) =>
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${n}`)}`,
    interpret: (s) => (s === 200 ? 'taken' : s === 404 ? 'free' : 'unknown'),
  },
};

/**
 * Check a single platform for a handle. Non-live platforms return 'unknown'
 * without fetching. Live platforms map HTTP status per the verified facts;
 * any throw (network/CORS failure) resolves to 'unknown'.
 */
export async function checkPlatform(
  platform: Platform,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SocialStatus> {
  if (!platform.live) return 'unknown';
  const cfg = LIVE[platform.id];
  if (!cfg) return 'unknown';
  try {
    const res = await fetchImpl(cfg.url(name));
    return cfg.interpret(res.status);
  } catch {
    return 'unknown';
  }
}
