<script lang="ts">
  import { get } from 'svelte/store';
  import { runState } from '../store';
  import { t } from '../../i18n';

  let elapsedSec = $state(0);
  let timerId: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    const phase = $runState.phase;
    if (phase === 'running') {
      timerId = setInterval(() => {
        const rs = get(runState);
        elapsedSec = rs.startedAt > 0 ? Math.floor((Date.now() - rs.startedAt) / 1000) : 0;
      }, 1000);
      return () => {
        if (timerId != null) clearInterval(timerId);
        timerId = null;
      };
    }
    if (phase === 'done') {
      const rs = get(runState);
      elapsedSec = rs.startedAt > 0 ? Math.floor((Date.now() - rs.startedAt) / 1000) : 0;
    }
    if (phase === 'idle') {
      elapsedSec = 0;
    }
  });

  const pct = $derived(
    $runState.total > 0 ? Math.min(100, ($runState.done / $runState.total) * 100) : 0,
  );
</script>

{#if $runState.phase !== 'idle' && $runState.total > 0}
  <div class="progress" id="run-progress" tabindex="-1" role="status" aria-live="polite" aria-atomic="true" data-testid="check-bar-progress">
    <div class="bar" role="progressbar" aria-valuenow={$runState.done} aria-valuemin="0" aria-valuemax={$runState.total}>
      <div class="fill" style="width: {pct}%"></div>
    </div>
    <div class="stats">
      <span class="stat">{t('check.progress.checked', { done: $runState.done, total: $runState.total })}</span>
      <span class="sep" aria-hidden="true">·</span>
      <span class="stat avail">{t('check.progress.available', { n: $runState.available })}</span>
      {#if $runState.errors > 0}
        <span class="sep" aria-hidden="true">·</span>
        <span class="stat err">{t('check.progress.errors', { n: $runState.errors })}</span>
      {/if}
      <span class="sep" aria-hidden="true">·</span>
      <span class="stat time">{t('check.progress.elapsed', { s: elapsedSec })}</span>
    </div>
  </div>
{/if}

<style>
  .progress {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) 0;
  }
  .bar {
    height: 6px;
    background: var(--bg-sunken);
    border-radius: var(--radius-full);
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: var(--radius-full);
    transition: width 200ms var(--ease);
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }
  .stat {
    white-space: nowrap;
  }
  .avail {
    color: var(--green);
    font-weight: 500;
  }
  .err {
    color: var(--red);
    font-weight: 500;
  }
  .time {
    color: var(--text-tertiary);
  }
  .sep {
    color: var(--text-tertiary);
    margin: 0 2px;
  }
</style>
