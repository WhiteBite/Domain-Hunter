import { describe, expect, it } from 'vitest';
import { runQueue } from '../src/core/queue';
import type { CheckResult, EngineEvent, TldRegistry } from '../src/types';

function collectResults(events: EngineEvent[]): CheckResult[] {
  const out: CheckResult[] = [];
  for (const e of events) {
    if (e.type === 'result') out.push(e.result);
    else if (e.type === 'batch') out.push(...e.results);
  }
  return out;
}

const registry: TldRegistry = {
  infras: {
    a: { id: 'a', rdapBase: 'https://rdap-a.test/domain/', minPauseMs: 0, maxParallel: 2, trust: 'high' },
    b: { id: 'b', rdapBase: 'https://rdap-b.test/domain/', minPauseMs: 0, maxParallel: 2, trust: 'high' },
  },
  tlds: [
    { tld: 'aaa', infra: 'a' },
    { tld: 'bbb', infra: 'b' },
  ],
  hackTlds: [],
};

const always404 = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

describe('runQueue', () => {
  it('processes all candidates across infras and emits final progress', async () => {
    const events: EngineEvent[] = [];
    const controller = new AbortController();
    await runQueue(
      ['x.aaa', 'y.aaa', 'z.bbb'],
      registry,
      { registry, concurrency: 4, fetchImpl: always404 },
      (e) => events.push(e),
      controller.signal,
    );
    const results = collectResults(events);
    expect(results).toHaveLength(3);
    const progress = events.filter((e) => e.type === 'progress');
    expect(progress.length).toBeGreaterThan(0);
    const last = progress[progress.length - 1];
    expect(last?.type).toBe('progress');
    if (last?.type === 'progress') {
      expect(last.done).toBe(3);
      expect(last.available).toBe(3);
      expect(last.errors).toBe(0);
    }
  });

  it('marks unknown TLDs as errors', async () => {
    const events: EngineEvent[] = [];
    const controller = new AbortController();
    await runQueue(
      ['x.zzz'],
      registry,
      { registry, concurrency: 2, fetchImpl: always404 },
      (e) => events.push(e),
      controller.signal,
    );
    const results = collectResults(events);
    const result = results[0];
    expect(result?.status).toBe('error');
    expect(result?.note).toBe('unknown TLD');
  });

  it('stops early on abort', async () => {
    const slow404 = (async () => {
      await new Promise((r) => setTimeout(r, 5));
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const controller = new AbortController();
    const candidates = Array.from({ length: 40 }, (_, i) => `n${i}.aaa`);
    setTimeout(() => controller.abort(), 20);
    const events: EngineEvent[] = [];
    await runQueue(
      candidates,
      registry,
      { registry, concurrency: 4, fetchImpl: slow404 },
      (e) => events.push(e),
      controller.signal,
    );
    const results = collectResults(events);
    expect(results.length).toBeLessThan(40);
  });
});
