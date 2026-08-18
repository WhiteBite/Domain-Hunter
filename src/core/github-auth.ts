/**
 * GitHub OAuth device flow (RFC 8628) for static sites.
 * No client_secret anywhere: the CORS relay (worker.js routes gh/device/*)
 * only forwards client_id + device_code. Token ends up in the user's
 * localStorage and is sent only to api.github.com.
 */
export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSec: number;
  expiresInSec: number;
}

function proxyJoin(base: string, path: string): string {
  return (base.endsWith('/') ? base : `${base}/`) + path;
}

export async function startDeviceFlow(
  proxyBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceFlowStart> {
  const res = await fetchImpl(proxyJoin(proxyBase, 'gh/device/code'));
  if (!res.ok) throw new Error(`device code request failed: ${res.status}`);
  const j = (await res.json()) as Record<string, unknown>;
  if (typeof j.device_code !== 'string' || typeof j.user_code !== 'string') {
    throw new Error('bad device flow response');
  }
  return {
    deviceCode: j.device_code,
    userCode: j.user_code,
    verificationUri:
      typeof j.verification_uri === 'string' ? j.verification_uri : 'https://github.com/login/device',
    intervalSec: typeof j.interval === 'number' ? j.interval : 5,
    expiresInSec: typeof j.expires_in === 'number' ? j.expires_in : 900,
  };
}

/** Poll until the user authorizes; returns the access token or null. */
export async function pollDeviceToken(
  proxyBase: string,
  start: DeviceFlowStart,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const deadline = Date.now() + start.expiresInSec * 1000;
  let intervalMs = Math.max(1, start.intervalSec) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let res: Response;
    try {
      res = await fetchImpl(proxyJoin(proxyBase, 'gh/device/token'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_code: start.deviceCode }),
      });
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const j = (await res.json()) as Record<string, unknown>;
    if (typeof j.access_token === 'string') return j.access_token;
    if (j.error === 'slow_down') intervalMs += 5000;
    else if (j.error !== 'authorization_pending') return null;
  }
  return null;
}

/** Fetch the login name for a token (direct api.github.com call). */
export async function githubLoginName(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { login?: string };
    return typeof j.login === 'string' ? j.login : null;
  } catch {
    return null;
  }
}
