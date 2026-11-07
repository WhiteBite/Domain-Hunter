import { describe, expect, it, vi } from 'vitest';
import { createPriceSourceService } from '../cli/sources/service';
import type { PriceSourceAdapter } from '../cli/sources/types';

function adapter(id: string, prepare: PriceSourceAdapter['prepare'], interval = 0): PriceSourceAdapter {
  return {
    descriptor: {
      id, name: id, operation: 'standard_tld_prices', mode: 'explicit', auth: 'local_key',
      credentialTransport: 'header', sourceUrl: 'https://example.test/prices', documentationUrl: 'https://example.test/docs',
      completeness: 'unknown', cacheTtlMs: 1000, minIntervalMs: interval, maxConcurrency: 1, limitations: [],
    },
    prepare,
  };
}

describe('source registry', () => {
  it('rejects duplicate IDs and unsafe or credential-bearing metadata URLs', () => {
    const a = adapter('first', () => null);
    expect(() => createPriceSourceService([a, a])).toThrow('duplicate');
    expect(() => createPriceSourceService([{ ...a, descriptor: { ...a.descriptor, sourceUrl: 'https://example.test/?key=secret' } }])).toThrow('unsafe');
    expect(() => createPriceSourceService([{ ...a, descriptor: { ...a.descriptor, documentationUrl: 'http://example.test/' } }])).toThrow('unsafe');
    expect(() => createPriceSourceService([{ ...a, descriptor: { ...a.descriptor, id: '../bad' } }])).toThrow('invalid');
  });

  it('keeps sources isolated, returns structured errors, and never returns thrown secrets', async () => {
    const first = adapter('first', () => ({ cacheIdentity: 'digest', run: async () => { throw new Error('https://secret.test/?key=private-value'); } }));
    const second = adapter('second', () => ({ cacheIdentity: 'digest', run: async () => ({ com: { reg: 150, renew: 200, transfer: null } }) }));
    const missing = adapter('missing', () => null);
    const service = createPriceSourceService([first, second, missing]);
    const [failed, ok, noKey, unsupported] = await Promise.all(['first', 'second', 'missing', 'unlisted'].map((id) => service.load(id)));
    expect(failed?.status).toBe('failed');
    expect(ok?.status).toBe('ok');
    expect(noKey?.status).toBe('missing_key');
    expect(unsupported?.status).toBe('unsupported');
    expect(JSON.stringify([failed, ok, noKey, unsupported])).not.toContain('private-value');
  });

  it('serializes even failed calls and applies a delay after the previous completion', async () => {
    let identity = 'a';
    let inProgress = 0;
    let peak = 0;
    const starts: number[] = [];
    const finishes: number[] = [];
    const run = vi.fn(async () => {
      inProgress++;
      peak = Math.max(peak, inProgress);
      starts.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 10));
      finishes.push(Date.now());
      inProgress--;
      throw new Error('failed');
    });
    const service = createPriceSourceService([adapter('first', () => ({ cacheIdentity: identity, run }), 30)]);
    const a = service.load('first');
    identity = 'b';
    const b = service.load('first');
    expect((await a).status).toBe('failed');
    expect((await b).status).toBe('failed');
    expect(peak).toBe(1);
    expect(starts[1]! - finishes[0]!).toBeGreaterThanOrEqual(28);
  });

  it('bounds the queue of distinct credentials', async () => {
    let next = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const service = createPriceSourceService([adapter('first', () => ({
      cacheIdentity: String(next++),
      run: async () => { await gate; return {}; },
    }))]);
    const pending = Array.from({ length: 32 }, () => service.load('first'));
    expect((await service.load('first')).status).toBe('busy');
    release();
    const outcomes = await Promise.all(pending);
    expect(outcomes.every((item) => item.status === 'ok')).toBe(true);
  });
});
