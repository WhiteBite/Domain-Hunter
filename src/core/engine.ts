/**
 * UI-thread facade over the checking engine Web Worker.
 * Protocol contracts live in src/types.ts (EngineCommand / EngineEvent).
 * The worker itself (engine.worker.ts) is owned by the core-engine module.
 */
import type { EngineCommand, EngineEvent, EngineOptions } from '../types';
import EngineWorker from './engine.worker?worker&inline';

export interface EngineHandle {
  start(candidates: string[], options: EngineOptions): void;
  stop(): void;
  destroy(): void;
}

export function createEngine(onEvent: (event: EngineEvent) => void): EngineHandle {
  const worker: Worker = new EngineWorker();
  worker.onmessage = (ev: MessageEvent<EngineEvent>) => onEvent(ev.data);
  worker.onerror = (ev) => {
    onEvent({ type: 'log', level: 'warn', message: `worker error: ${ev.message}` });
  };
  return {
    start(candidates, options) {
      const command: EngineCommand = { type: 'start', candidates, options };
      worker.postMessage(command);
    },
    stop() {
      const command: EngineCommand = { type: 'stop' };
      worker.postMessage(command);
    },
    destroy() {
      worker.terminate();
    },
  };
}
