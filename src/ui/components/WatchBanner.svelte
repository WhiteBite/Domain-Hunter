<script lang="ts">
  import { t } from '../../i18n';
  import { requestFavoritesView } from '../store';
  import { watchChanges } from '../watchlist';

  let dismissed = $state(false);

  const watchCounts = $derived.by(() => {
    let freed = 0;
    let taken = 0;
    for (const c of $watchChanges) {
      if (c.to === 'available' || c.to === 'probably_available') freed++;
      else if (c.to === 'taken') taken++;
    }
    return { freed, taken };
  });

  const showWatchBanner = $derived($watchChanges.length > 0 && !dismissed);
</script>

{#if showWatchBanner}
  <div class="watch-banner" role="status" data-testid="check-watch-banner">
    <span class="watch-text">
      {t('watch.banner', { freed: watchCounts.freed, taken: watchCounts.taken })}
    </span>
    <div class="watch-actions">
      <button class="btn primary" type="button" onclick={() => requestFavoritesView.set(true)} data-testid="check-watch-show">
        {t('watch.showFavs')}
      </button>
      <button class="btn ghost" type="button" onclick={() => (dismissed = true)} aria-label={t('watch.banner.dismiss')} data-testid="check-watch-dismiss">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .watch-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border: 1px solid color-mix(in srgb, var(--green) 30%, transparent);
    background: var(--green-soft);
    border-radius: var(--radius-md);
  }

  .watch-text {
    font-size: var(--text-sm);
    color: var(--text);
  }

  .watch-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .watch-actions .btn {
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .watch-actions .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .watch-actions .btn.ghost {
    background: transparent;
    color: var(--text-secondary);
    padding: 0 var(--space-2);
    min-width: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .watch-actions .btn.ghost svg {
    width: 14px;
    height: 14px;
  }
</style>
