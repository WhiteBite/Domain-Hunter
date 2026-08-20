/**
 * Candidate queue: per-infra sub-queues + AIMD limiters + global concurrency cap
 * + abort + throttled progress (SPEC §8).
 */
import type { CheckResult, EngineEvent, EngineOptions, TldRegistry } from '../types';
import { AimdLimiter } from './rate-limiter';
import { checkDomain } from './rdap-client';

export interface QueueOptions extends EngineOptions {
  concurrency?: number;
  /** Test hook. */
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function tldOf(domain: string): string {
  return domain.slice(domain.lastIndexOf('.') + 1);
}

export async function runQueue(
  candidates: string[],
  registry: TldRegistry,
  opts: QueueOptions,
  emit: (event: EngineEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const tldIndex = new Map(registry.tlds.map((t) => [t.tld, t]));
  const limiters = new Map<string, AimdLimiter>();
  for (const infra of Object.values(registry.infras)) {
    limiters.set(infra.id, new AimdLimiter(infra.minPauseMs, infra.maxParallel));
  }

  const globalMax = Math.max(1, opts.concurrency ?? 6);
  let inFlightGlobal = 0;
  let done = 0;
  let available = 0;
  let errors = 0;
  const total = candidates.length;
  let lastProgressAt = 0;

  const emitProgress = (force = false): void => {
    const now = Date.now();
    if (force || now - lastProgressAt >= 250) {
      lastProgressAt = now;
      emit({ type: 'progress', done, total, available, errors });
    }
  };

  let batch: CheckResult[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    flushTimer = null;
    if (batch.length === 0) return;
    const results = batch;
    batch = [];
    emit({ type: 'batch', results });
  };

  const recordResult = (result: CheckResult): void => {
    done += 1;
    if (result.status === 'available' || result.status === 'probably_available') available += 1;
    if (result.status === 'error') errors += 1;
    batch.push(result);
    if (flushTimer == null) flushTimer = setTimeout(flush, 50);
    emitProgress();
  };

  const byInfra = new Map<string, string[]>();
  const unknownTlds: string[] = [];
  for (const candidate of candidates) {
    const config = tldIndex.get(tldOf(candidate));
    if (!config) {
      unknownTlds.push(candidate);
      continue;
    }
    const list = byInfra.get(config.infra) ?? [];
    list.push(candidate);
    byInfra.set(config.infra, list);
  }

  const runInfra = async (infraId: string, domains: string[]): Promise<void> => {
    const limiter = limiters.get(infraId);
    const infra = registry.infras[infraId];
    if (!limiter || !infra) return;
    for (const domain of domains) {
      if (signal.aborted) return;
      while (inFlightGlobal >= globalMax && !signal.aborted) await sleep(5);
      if (signal.aborted) return;
      await limiter.acquire();
      if (signal.aborted) {
        limiter.reportOk();
        return;
      }
      inFlightGlobal += 1;
      let saw429 = false;
      let retryAfterMs: number | undefined;
      const tldConfig = tldIndex.get(tldOf(domain)) ?? { tld: tldOf(domain), infra: infraId };
      let result: CheckResult;
      try {
        result = await checkDomain(
          domain,
          tldConfig,
          infra,
          {
            fetchImpl: opts.fetchImpl,
            proxyUrl: opts.proxyUrl,
            fetchTimeoutMs: opts.fetchTimeoutMs,
            maxRetries: opts.maxRetries,
            onOutcome: (kind, retryAfter) => {
              if (kind === '429') {
                saw429 = true;
                retryAfterMs = retryAfter;
              }
            },
          },
          signal,
        );
      } finally {
        inFlightGlobal -= 1;
      }
      if (saw429) limiter.report429(retryAfterMs);
      else limiter.reportOk();
      recordResult(result);
    }
  };

  await Promise.all(
    [...byInfra.entries()].map(([infraId, domains]) => runInfra(infraId, domains)),
  );

  for (const domain of unknownTlds) {
    recordResult({
      domain,
      tld: tldOf(domain),
      status: 'error',
      source: 'rdap',
      checkedAt: Date.now(),
      note: 'unknown TLD',
    });
  }
  flush();
  emitProgress(true);
}
