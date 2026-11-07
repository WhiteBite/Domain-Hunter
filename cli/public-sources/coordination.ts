/** Cross-process, per-user coordination for public API limits. No domains are stored. */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { lock } from 'proper-lockfile';
import type { PublicSourceDescriptor, PublicSourceId } from './types';
import type { ParsedSignal } from './adapters';

const DAY = 86_400_000;
// Crash reservation covers the request timeout; a stale lock cannot be recovered sooner.
const CRASH_RESERVATION_MS = 15_000;

export type ProviderRequest =
  | { kind: 'ok'; signals: ParsedSignal[] }
  | { kind: 'failed' }
  | { kind: 'rate_limited'; delayMs: number };
export type CoordinatedRequest = ProviderRequest | { kind: 'busy' | 'coordination_error' | 'quota_exhausted' };
export interface RateCoordinator {
  run(id: PublicSourceId, descriptor: PublicSourceDescriptor, request: () => Promise<ProviderRequest>): Promise<CoordinatedRequest>;
}
interface RateState { version: 1; requests: number[]; lastFinished: number | null; blockedUntil: number }

function parseState(data: string): RateState {
  const value: unknown = JSON.parse(data);
  if (!value || typeof value !== 'object') throw new Error('invalid state');
  const state = value as Partial<RateState>;
  if (state.version !== 1 || !Array.isArray(state.requests) || state.requests.length > 10000 ||
      !state.requests.every((t) => typeof t === 'number' && Number.isSafeInteger(t) && t >= 0) ||
      !(state.lastFinished === null || (typeof state.lastFinished === 'number' && Number.isSafeInteger(state.lastFinished) && state.lastFinished >= 0)) ||
      typeof state.blockedUntil !== 'number' || !Number.isSafeInteger(state.blockedUntil) || state.blockedUntil < 0) throw new Error('invalid state');
  return state as RateState;
}

/** Fail closed if local state or locking is unavailable; other machines/users remain uncoordinated. */
export function createSharedRateCoordinator(dir = join(homedir(), '.domain-hunter', 'public-rate-limits')): RateCoordinator {
  return {
    async run(id, descriptor, request) {
      let path: string;
      try {
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id)) return { kind: 'coordination_error' };
        await mkdir(dir, { recursive: true, mode: 0o700 });
        path = join(dir, `${id}.json`);
        try { await writeFile(path, JSON.stringify({ version: 1, requests: [], lastFinished: null, blockedUntil: 0 }), { flag: 'wx', mode: 0o600 }); }
        catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err; }
      } catch { return { kind: 'coordination_error' }; }
      let release: () => Promise<void>;
      let compromised = false;
      try {
        release = await lock(path, { realpath: false, retries: 0, stale: 30_000, update: 10_000, onCompromised: () => { compromised = true; } });
      } catch (err) {
        return { kind: (err as NodeJS.ErrnoException).code === 'ELOCKED' ? 'busy' : 'coordination_error' };
      }
      let temporary: string | null = null;
      const save = async (state: RateState) => {
        if (compromised) throw new Error('lock compromised');
        temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
        await rename(temporary, path);
        temporary = null;
      };
      try {
        const state = parseState(await readFile(path, 'utf8'));
        const now = Date.now();
        // A normal crash reservation is 15 seconds; implausible state fails closed.
        if (state.lastFinished != null && state.lastFinished > now + 60_000) return { kind: 'coordination_error' };
        if (state.blockedUntil > now) return { kind: 'rate_limited', delayMs: state.blockedUntil - now };
        state.requests = descriptor.localDailyCap == null ? [] : state.requests.filter((t) => t > now - DAY);
        if (descriptor.localDailyCap != null && state.requests.length >= descriptor.localDailyCap) return { kind: 'quota_exhausted' };
        const wait = state.lastFinished == null ? 0 : Math.max(0, descriptor.minIntervalMs - (now - state.lastFinished));
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        if (compromised) return { kind: 'coordination_error' };
        if (descriptor.localDailyCap != null) state.requests.push(Date.now());
        state.lastFinished = Date.now() + CRASH_RESERVATION_MS;
        await save(state); // reserve quota before network, even if this process crashes
        let result: ProviderRequest;
        try { result = await request(); } catch { result = { kind: 'failed' }; }
        state.lastFinished = Date.now();
        if (result.kind === 'rate_limited') state.blockedUntil = Math.min(Number.MAX_SAFE_INTEGER, Date.now() + result.delayMs);
        await save(state);
        return result;
      } catch { return { kind: 'coordination_error' }; }
      finally {
        if (temporary) await unlink(temporary).catch(() => undefined);
        await release().catch(() => undefined);
      }
    },
  };
}
