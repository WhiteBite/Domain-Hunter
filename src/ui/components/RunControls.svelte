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
  import { t } from '../../i18n';

  let ignoreCache = $state(false);
  let resumeSnapshot = $state<RunSnapshot | null>(null);
  let showResume = $state(false);

  let engine: EngineHandle | null = null;
  let engineCandidates: string[] = [];
  let completedByEngine: Set<string> = new Set();
  let cacheHitsCount = 0;
  let cacheAvailable = 0;
  let cacheErrors = 0;
  let lastSnapshotDone = 0;

  let unsubShare: (() => void) | null = null;

  onMount(() => {
    const snap = readJson<RunSnapshot>(KEYS.run);
    if (snap && Array.isArray(snap.pending) && snap.pending.length > 0) {
      resumeSnapshot = snap;
      showResume = true;
    } else {
      // No interrupted run — honor a share link with run:true.
      unsubShare = pendingShareRun.subscribe((pending) => {
        if (pending && get(runState).phase === 'idle') {
          pendingShareRun.set(false);
          startFromInput();
        }
      });
    }
  });

  onDestroy(() => {
    unsubShare?.();
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
    (options as EngineOptions & { concurrency?: number }).concurrency =
      settingsVal.concurrency;
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
    showResume = false;
    const snap = resumeSnapshot;
    resumeSnapshot = null;
    startRun(snap.pending, snap.tlds, snap.ignoreCache);
  }

  function discardResume() {
    showResume = false;
    resumeSnapshot = null;
    removeKey(KEYS.run);
  }

  const isRunning = $derived($runState.phase === 'running');
</script>

<div class="run-controls">
  {#if showResume && resumeSnapshot}
    <div class="resume-banner" role="alert">
      <div class="resume-text">
        <strong>{t('check.run.resume.title')}</strong>
        <span>{t('check.run.resume.body', { n: resumeSnapshot.pending.length })}</span>
      </div>
      <div class="resume-actions">
        <button class="btn primary" onclick={resume} type="button">
          {t('check.run.resume.yes')}
        </button>
        <button class="btn ghost" onclick={discardResume} type="button">
          {t('check.run.resume.no')}
        </button>
      </div>
    </div>
  {/if}

  <div class="controls-row">
    {#if isRunning}
      <button class="btn stop" onclick={stopRun} type="button">
        <svg class="stop-icon" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
        </svg>
        {t('check.run.stop')}
      </button>
    {:else}
      <button class="btn primary" onclick={startFromInput} type="button">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5 3l8 5-8 5V3z" fill="currentColor" />
        </svg>
        {t('check.run.start')}
      </button>
    {/if}

    <label class="checkbox">
      <input type="checkbox" bind:checked={ignoreCache} />
      <span>{t('check.run.ignoreCache')}</span>
    </label>
  </div>
</div>

<style>
  .run-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .resume-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid color-mix(in srgb, var(--amber) 30%, transparent);
    background: var(--amber-soft);
    border-radius: var(--radius-md);
  }
  .resume-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--text-sm);
  }
  .resume-text strong {
    color: var(--amber);
    font-size: var(--text-sm);
  }
  .resume-text span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }
  .resume-actions {
    display: flex;
    gap: var(--space-2);
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
  .btn.ghost {
    background: transparent;
    border-color: var(--border);
    color: var(--text-secondary);
  }
  .btn.ghost:hover {
    background: var(--bg-sunken);
    color: var(--text);
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
