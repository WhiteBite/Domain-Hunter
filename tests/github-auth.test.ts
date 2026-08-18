import { describe, expect, it } from 'vitest';
import { pollDeviceToken, startDeviceFlow, githubLoginName } from '../src/core/github-auth';

function jsonBody(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('startDeviceFlow', () => {
  it('parses a valid response', async () => {
    const f = (async () =>
      jsonBody(200, {
        device_code: 'dc1',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        interval: 5,
        expires_in: 900,
      })) as unknown as typeof fetch;
    const start = await startDeviceFlow('https://proxy.test/', f);
    expect(start.userCode).toBe('ABCD-EFGH');
    expect(start.deviceCode).toBe('dc1');
    expect(start.intervalSec).toBe(5);
  });

  it('throws on bad response', async () => {
    const f = (async () => jsonBody(200, { nope: 1 })) as unknown as typeof fetch;
    await expect(startDeviceFlow('https://proxy.test', f)).rejects.toThrow();
  });
});

describe('pollDeviceToken', () => {
  it('returns token after authorization_pending', async () => {
    let calls = 0;
    const f = (async () => {
      calls += 1;
      return calls < 2 ? jsonBody(200, { error: 'authorization_pending' }) : jsonBody(200, { access_token: 'tok' });
    }) as unknown as typeof fetch;
    const token = await pollDeviceToken(
      'https://proxy.test',
      { deviceCode: 'dc', userCode: 'u', verificationUri: '', intervalSec: 0, expiresInSec: 60 },
      f,
    );
    expect(token).toBe('tok');
    expect(calls).toBe(2);
  });

  it('returns null on terminal error', async () => {
    const f = (async () => jsonBody(200, { error: 'access_denied' })) as unknown as typeof fetch;
    const token = await pollDeviceToken(
      'https://proxy.test',
      { deviceCode: 'dc', userCode: 'u', verificationUri: '', intervalSec: 0, expiresInSec: 60 },
      f,
    );
    expect(token).toBeNull();
  });
});

describe('githubLoginName', () => {
  it('returns login', async () => {
    const f = (async () => jsonBody(200, { login: 'whitebite' })) as unknown as typeof fetch;
    expect(await githubLoginName('tok', f)).toBe('whitebite');
  });

  it('null on failure', async () => {
    const f = (async () => jsonBody(401, {})) as unknown as typeof fetch;
    expect(await githubLoginName('bad', f)).toBeNull();
  });
});
