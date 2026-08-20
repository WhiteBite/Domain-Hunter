<script module lang="ts">
  // Module-scope consumed-marker for startRequest dedupe. Survives tab-switch
  // remounts so a stale counter never re-fires the last run (the per-instance
  // `let` reset to 0 on every remount, re-running the previous query).
  let lastConsumed = 0;
</script>

<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  import {
    checkInput,
    selectedTlds,
    settings,
    registry,
    runState,
    results,
    pendingShareRun,
    resumePrompt,
    resumeAction,
    startRequest,
  } from '../store';
  import type {
    CheckResult,
    EngineEvent,
    EngineOptions,
    RunSnapshot,
  } from '../../types';
  import { normalizeDomainInput, parseCandidate } from '../../core/idn';
  import { createEngine } from '../../core/engine';
  import type { EngineHandle } from '../../core/engine';
  import { getFresh as cacheGetFresh, put as cachePut } from '../../core/cache';
  import { KEYS, readJson, writeJson, removeKey } from '../settings';
  import { stopWatchlist } from '../watchlist';
  import { t } from '../../i18n';
  import Tooltip from './Tooltip.svelte';

  let ignoreCache = $state(false);
  let resumeSnapshot = $state<RunSnapshot | null>(null);
  let engine: EngineHandle | null = null;
  let engineCandidates: string[] = [];
  let allCandidates: string[] = [];
  let completedByEngine: Set<string> = new Set();
  let cacheHitsCount = 0;
  let cacheAvailable = 0;
  let cacheErrors = 0;
  let lastSnapshotDone = 0;

  let unsubShare: (() => void) | null = null;
  let unsubResume: (() => void) | null = null;
  let unsubStart: (() => void) | null = null;

  onMount(() => {
    const snap = readJson<RunSnapshot>(KEYS.run);
    if (snap && Array.isArray(snap.pending) && snap.pending.length > 0) {
      resumeSnapshot = snap;
      resumePrompt.set(snap);
    }

    // Lastrun restore (lowest priority: resume prompt > pendingShareRun > lastrun).
    // Runs only when there's no resume prompt, no share-link hash, and results
    // are empty. Share-link runs override via the pendingShareRun subscription
    // (which clears results and starts a fresh run). Cache-only — no network.
    if (
      !resumeSnapshot &&
      !window.location.hash.startsWith('#s=') &&
      get(results).size === 0
    ) {
      const lastrun = readJson<{
        input: string;
        tlds: string[];
        candidates: string[];
        ts: number;
      }>(KEYS.lastrun);
      if (lastrun && Array.isArray(lastrun.candidates) && lastrun.candidates.length > 0) {
        checkInput.set(lastrun.input);
        selectedTlds.set(lastrun.tlds);
        const settingsVal = get(settings);
        const ttlMs = settingsVal.cacheTtlHours * 3_600_000;
        const hits: CheckResult[] = [];
        for (const c of lastrun.candidates) {
          const entry = cacheGetFresh(c, ttlMs);
          if (entry) {
            hits.push({
              domain: c,
              tld: entry.tld,
              status: entry.status,
              source: 'cache',
              checkedAt: entry.ts,
            });
          }
        }
        if (hits.length > 0) {
          const map = new Map<string, CheckResult>();
          for (const r of hits) map.set(r.domain, r);
          results.set(map);
          const available = hits.filter(
            (r) => r.status === 'available' || r.status === 'probably_available',
          ).length;
          const errors = hits.filter((r) => r.status === 'error').length;
          runState.set({
            phase: 'done',
            done: hits.length,
            total: lastrun.candidates.length,
            available,
            errors,
            startedAt: lastrun.ts,
            elapsedMs: 0,
          });
        }
      }
    }

    // Always listen: a fresh run request (share link run:true, Generators
    // "Check now", Drops "To check") supersedes the resume prompt. Accept it
    // when idle OR after a finished run ('done'); never interrupt 'running'.
    unsubShare = pendingShareRun.subscribe((pending) => {
      if (pending && get(runState).phase !== 'running') {
        pendingShareRun.set(false);
        resumeSnapshot = null;
        resumePrompt.set(null);
        removeKey(KEYS.run);
        startFromInput();
      }
    });

    unsubResume = resumeAction.subscribe((a) => {
      if (a === 'resume') resume();
      else if (a === 'discard') discardResume();
      if (a) resumeAction.set(null);
    });

    unsubStart = startRequest.subscribe((n) => {
      if (n !== lastConsumed) {
        lastConsumed = n;
        startFromInput();
      }
    });
  });

  onDestroy(() => {
    unsubShare?.();
    unsubResume?.();
    unsubStart?.();
    // Leaving the tab mid-run: persist a resume snapshot and settle the UI,
    // otherwise the progress bar would spin forever with a dead engine.
    if (get(runState).phase === 'running') {
      const pending = engineCandidates.filter((c) => !completedByEngine.has(c));
      if (pending.length > 0) {
        writeJson(KEYS.run, {
          pending,
          tlds: get(selectedTlds),
          ignoreCache,
          ts: Date.now(),
        } satisfies RunSnapshot);
      }
      runState.update((rs) => ({
        ...rs,
        phase: 'done',
        elapsedMs: Date.now() - rs.startedAt,
        aborted: true,
      }));
    }
    engine?.destroy();
    engine = null;
  });

  function handleEvent(event: EngineEvent) {
    switch (event.type) {
      case 'result': {
        results.update((map) => {
          const next = new Map(map);
          next.set(event.result.domain, event.result);
          return next;
        });
        cachePut(event.result.domain, {
          status: event.result.status,
          source: event.result.source,
          ts: event.result.checkedAt,
          tld: event.result.tld,
        });
        completedByEngine.add(event.result.domain);
        const totalDone = cacheHitsCount + completedByEngine.size;
        if (totalDone - lastSnapshotDone >= 25) {
          lastSnapshotDone = totalDone;
          const pending = engineCandidates.filter((c) => !completedByEngine.has(c));
          writeJson(KEYS.run, {
            pending,
            tlds: get(selectedTlds),
            ignoreCache,
            ts: Date.now(),
          } satisfies RunSnapshot);
        }
        break;
      }
      case 'batch': {
        results.update((map) => {
          const next = new Map(map);
          for (const r of event.results) next.set(r.domain, r);
          return next;
        });
        for (const r of event.results) {
          cachePut(r.domain, {
            status: r.status,
            source: r.source,
            ts: r.checkedAt,
            tld: r.tld,
          });
          completedByEngine.add(r.domain);
        }
        {
          const totalDone = cacheHitsCount + completedByEngine.size;
          if (totalDone - lastSnapshotDone >= 25) {
            lastSnapshotDone = totalDone;
            const pending = engineCandidates.filter((c) => !completedByEngine.has(c));
            writeJson(KEYS.run, {
              pending,
              tlds: get(selectedTlds),
              ignoreCache,
              ts: Date.now(),
            } satisfies RunSnapshot);
          }
        }
        break;
      }
      case 'progress': {
        runState.update((rs) => ({
          ...rs,
          done: cacheHitsCount + event.done,
          total: cacheHitsCount + event.total,
          available: cacheAvailable + event.available,
          errors: cacheErrors + event.errors,
        }));
        break;
      }
      case 'finished': {
        runState.update((rs) => ({
          ...rs,
          phase: 'done',
          done: cacheHitsCount + event.done,
          total: cacheHitsCount + event.total,
          available: cacheAvailable + event.available,
          errors: cacheErrors + event.errors,
          elapsedMs: Date.now() - rs.startedAt,
        }));
        removeKey(KEYS.run);
        // Persist lastrun snapshot for restore on next visit (cache-only).
        const lastrunCandidates = allCandidates.slice(0, 3000);
        if (lastrunCandidates.length > 0) {
          writeJson(KEYS.lastrun, {
            input: get(checkInput),
            tlds: get(selectedTlds),
            candidates: lastrunCandidates,
            ts: Date.now(),
          });
        }
        engine?.destroy();
        engine = null;
        break;
      }
      case 'log': {
        if (event.level === 'warn') console.warn(event.message);
        break;
      }
    }
  }

  function startRun(candidates: string[], tlds: string[], ignore: boolean) {
    // Stop any in-flight watchlist re-check so user runs and the background
    // watch never hit registries concurrently (SPEC §5 watch + §8 politeness).
    stopWatchlist();
    results.set(new Map());
    const settingsVal = get(settings);
    const registryVal = get(registry);
    const ttlMs = settingsVal.cacheTtlHours * 3_600_000;

    const remaining: string[] = [];
    const cacheHits: CheckResult[] = [];

    for (const c of candidates) {
      if (ignore) {
        remaining.push(c);
        continue;
      }
      const entry = cacheGetFresh(c, ttlMs);
      if (entry) {
        cacheHits.push({
          domain: c,
          tld: entry.tld,
          status: entry.status,
          source: 'cache',
          checkedAt: entry.ts,
        });
      } else {
        remaining.push(c);
      }
    }

    if (cacheHits.length > 0) {
      results.update((map) => {
        const next = new Map(map);
        for (const r of cacheHits) next.set(r.domain, r);
        return next;
      });
    }

    engineCandidates = remaining;
    allCandidates = candidates;
    completedByEngine = new Set();
    cacheHitsCount = cacheHits.length;
    cacheAvailable = cacheHits.filter(
      (r) => r.status === 'available' || r.status === 'probably_available',
    ).length;
    cacheErrors = cacheHits.filter((r) => r.status === 'error').length;
    lastSnapshotDone = cacheHitsCount;

    runState.set({
      phase: 'running',
      done: cacheHitsCount,
      total: candidates.length,
      available: cacheAvailable,
      errors: cacheErrors,
      startedAt: Date.now(),
      elapsedMs: 0,
    });
    requestAnimationFrame(() => document.getElementById('run-progress')?.focus());

    if (remaining.length === 0) {
      runState.update((rs) => ({ ...rs, phase: 'done', elapsedMs: 0 }));
      removeKey(KEYS.run);
      return;
    }

    engine = createEngine(handleEvent);
    const options: EngineOptions = {
      registry: registryVal,
      proxyUrl: settingsVal.proxyUrl || undefined,
      fetchTimeoutMs: 10000,
      maxRetries: 3,
    };
    options.concurrency = settingsVal.concurrency;
    engine.start(remaining, options);
  }

  function startFromInput() {
    const input = get(checkInput);
    const tlds = get(selectedTlds);
    const parsed = normalizeDomainInput(input);
    const candidates: string[] = [];
    for (const name of parsed.names) {
      candidates.push(...parseCandidate(name, tlds));
    }
    if (candidates.length === 0) return;
    startRun(candidates, tlds, ignoreCache);
  }

  function stopRun() {
    engine?.stop();
  }

  function resume() {
    if (!resumeSnapshot) return;
    selectedTlds.set(resumeSnapshot.tlds);
    ignoreCache = resumeSnapshot.ignoreCache;
    resumePrompt.set(null);
    const snap = resumeSnapshot;
    resumeSnapshot = null;
    startRun(snap.pending, snap.tlds, snap.ignoreCache);
  }

  function discardResume() {
    resumePrompt.set(null);
    resumeSnapshot = null;
    removeKey(KEYS.run);
  }

  const isRunning = $derived($runState.phase === 'running');

  const canStart = $derived.by(() => {
    const names = normalizeDomainInput($checkInput).names;
    return names.length > 0 && $selectedTlds.length > 0;
  });
</script>

<div class="run-controls">
  <div class="controls-row">
    {#if isRunning}
      <button class="btn stop" onclick={stopRun} type="button" data-testid="check-button-stop">
        <svg class="stop-icon" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
        </svg>
        {t('check.run.stop')}
      </button>
    {:else}
      <button
        class="btn primary"
        onclick={startFromInput}
        type="button"
        disabled={!canStart}
        title={canStart ? undefined : t('check.start.disabled')}
        data-testid="check-button-start"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5 3l8 5-8 5V3z" fill="currentColor" />
        </svg>
        {t('check.run.start')}
      </button>
    {/if}

    <label class="checkbox">
      <input type="checkbox" bind:checked={ignoreCache} data-testid="check-toggle-ignore-cache" />
      <Tooltip text={t('check.run.ignoreCache.tooltip')}>
        <span>{t('check.run.ignoreCache')}</span>
      </Tooltip>
    </label>
  </div>
</div>

<style>
  .run-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .controls-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-4);
    min-height: 40px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--dur) var(--ease);
  }
  .btn:hover {
    border-color: var(--border-strong);
    background: var(--bg-sunken);
  }
  .btn svg {
    width: 14px;
    height: 14px;
  }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .btn.primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .btn.stop {
    background: var(--red);
    border-color: var(--red);
    color: var(--on-accent);
  }
  .btn.stop:hover {
    background: color-mix(in srgb, var(--red) 88%, black);
    border-color: var(--red);
  }
  .checkbox {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    min-height: 40px;
  }
  .checkbox input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .checkbox span {
    user-select: none;
  }
</style>
