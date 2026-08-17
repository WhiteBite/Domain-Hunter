/**
 * Checking engine worker — EngineCommand/EngineEvent protocol (SPEC §5.4).
 * Imported via '?worker&inline' so it works from file:// as a blob worker.
 */
import type { EngineCommand, EngineEvent } from '../types';
import { runQueue, type QueueOptions } from './queue';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let controller: AbortController | null = null;

scope.onmessage = (ev: MessageEvent<EngineCommand>) => {
  const cmd = ev.data;
  if (cmd.type === 'stop') {
    controller?.abort();
    return;
  }
  if (cmd.type !== 'start') return;

  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const total = cmd.candidates.length;
  let last = { done: 0, available: 0, errors: 0 };

  const emit = (event: EngineEvent): void => {
    if (event.type === 'progress') {
      last = { done: event.done, available: event.available, errors: event.errors };
    }
    scope.postMessage(event);
  };

  const concurrency = (cmd.options as { concurrency?: number }).concurrency;
  const options: QueueOptions = { ...cmd.options, concurrency };

  void (async () => {
    try {
      await runQueue(cmd.candidates, cmd.options.registry, options, emit, signal);
    } catch (err) {
      emit({
        type: 'log',
        level: 'warn',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    const finished: EngineEvent = {
      type: 'finished',
      done: last.done,
      total,
      available: last.available,
      errors: last.errors,
      aborted: signal.aborted,
    };
    scope.postMessage(finished);
  })();
};
