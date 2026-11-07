import type { PriceSourceAdapter, PriceSourceService, SourceLoadResult } from './types';

/**
 * One queue per provider, including failures and credential changes. Never logs or
 * returns exceptions: adapters and transport errors can contain credentials.
 * This is per process; other processes or applications may share account limits.
 */
export function createPriceSourceService(adapters: PriceSourceAdapter[]): PriceSourceService {
  const sources = new Map<string, PriceSourceAdapter>();
  const state = new Map<string, {
    tail: Promise<void>;
    lastFinishedAt: number | null;
    cache?: { identity: string; expiresAt: number; result: Extract<SourceLoadResult, { status: 'ok' }> };
    inFlight: Map<string, Promise<SourceLoadResult>>;
  }>();
  for (const adapter of adapters) {
    const d = adapter.descriptor;
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(d.id) || d.maxConcurrency !== 1 ||
        !Number.isSafeInteger(d.cacheTtlMs) || d.cacheTtlMs < 0 ||
        !Number.isSafeInteger(d.minIntervalMs) || d.minIntervalMs < 0) throw new Error('invalid source descriptor');
    for (const [value, allowHash] of [[d.sourceUrl, false], [d.documentationUrl, true]] as const) {
      let url: URL;
      try { url = new URL(value); } catch { throw new Error('invalid source URL'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || (!allowHash && url.hash)) throw new Error('unsafe source URL');
    }
    if (sources.has(adapter.descriptor.id)) throw new Error('duplicate source id');
    sources.set(adapter.descriptor.id, adapter);
    state.set(adapter.descriptor.id, { tail: Promise.resolve(), lastFinishedAt: null, inFlight: new Map() });
  }
  return {
    list: () => [...sources.values()].map(({ descriptor }) => ({ ...descriptor, limitations: [...descriptor.limitations] })),
    async load(id) {
      const adapter = sources.get(id);
      const runtime = state.get(id);
      if (!adapter || !runtime) return { status: 'unsupported', prices: null, observedAt: null, fromCache: false };
      let prepared;
      try { prepared = adapter.prepare(); } catch { return { status: 'failed', prices: null, observedAt: null, fromCache: false }; }
      if (!prepared) return { status: 'missing_key', prices: null, observedAt: null, fromCache: false };
      const { cacheIdentity, run } = prepared;
      const cached = runtime.cache;
      if (cached?.identity === cacheIdentity && Date.now() < cached.expiresAt) return { ...cached.result, fromCache: true };
      const existing = runtime.inFlight.get(cacheIdentity);
      if (existing) return existing;
      if (runtime.inFlight.size >= 32) return { status: 'busy', prices: null, observedAt: null, fromCache: false };
      const task: Promise<SourceLoadResult> = runtime.tail.then(async () => {
        const since = runtime.lastFinishedAt == null ? Infinity : Date.now() - runtime.lastFinishedAt;
        const wait = Math.max(0, adapter.descriptor.minIntervalMs - since);
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          const prices = await run();
          const result = { status: 'ok', prices, observedAt: new Date().toISOString(), fromCache: false } as const;
          runtime.cache = { identity: cacheIdentity, result, expiresAt: Date.now() + adapter.descriptor.cacheTtlMs };
          return result;
        } catch {
          return { status: 'failed', prices: null, observedAt: null, fromCache: false } as const;
        } finally {
          runtime.lastFinishedAt = Date.now();
        }
      });
      runtime.tail = task.then(() => undefined, () => undefined);
      runtime.inFlight.set(cacheIdentity, task);
      const cleanup = () => { if (runtime.inFlight.get(cacheIdentity) === task) runtime.inFlight.delete(cacheIdentity); };
      void task.then(cleanup, cleanup);
      return task;
    },
  };
}
