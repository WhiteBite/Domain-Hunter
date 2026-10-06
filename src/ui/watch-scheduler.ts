/**
 * Scheduled watchlist re-checks (SPEC §5): silently re-runs refreshWatchlist
 * on a user-configured interval while the tab is visible, and optionally
 * raises a browser notification when new changes appear.
 */
import { get } from 'svelte/store';
import { t } from '../i18n';
import { settings } from './store';
import { refreshWatchlist, watchChanges, type WatchChange } from './watchlist';

export interface WatchSchedulerDeps {
  refresh?: () => Promise<void>;
  visibility?: () => DocumentVisibilityState;
  notify?: (title: string, body: string) => void;
}

/** Pure: minutes -> ms, or null when disabled/invalid. Floor is 1 minute. */
export function intervalMsFor(minutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.max(1, Math.round(minutes)) * 60_000;
}

export function summarizeChanges(changes: WatchChange[]): {
  freed: number;
  taken: number;
  priceDrops: number;
} {
  let freed = 0;
  let taken = 0;
  let priceDrops = 0;
  for (const c of changes) {
    if (c.kind === 'price_drop') {
      priceDrops += 1;
    } else if (c.to === 'available' || c.to === 'probably_available') {
      freed += 1;
    } else if (c.to === 'taken') {
      taken += 1;
    }
  }
  return { freed, taken, priceDrops };
}

function browserNotify(title: string, body: string): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // notifications unsupported or blocked — non-fatal
  }
}

/**
 * Start the scheduler; returns a stop function. Restarts the timer whenever
 * watchIntervalMin changes and skips ticks while the tab is hidden.
 */
export function startWatchScheduler(deps: WatchSchedulerDeps = {}): () => void {
  const refresh = deps.refresh ?? ((): Promise<void> => refreshWatchlist());
  const visibility = deps.visibility ?? ((): DocumentVisibilityState => document.visibilityState);
  const notify = deps.notify ?? browserNotify;

  let timer: ReturnType<typeof setInterval> | null = null;
  let currentMs: number | null = null;
  let ticking = false;
  let lastNotifiedTs = 0;
  for (const c of get(watchChanges)) lastNotifiedTs = Math.max(lastNotifiedTs, c.ts);

  async function tick(): Promise<void> {
    if (ticking) return;
    if (visibility() !== 'visible') return;
    ticking = true;
    try {
      await refresh();
      if (!get(settings).watchNotify) return;
      const fresh = get(watchChanges).filter((c) => c.ts > lastNotifiedTs);
      if (fresh.length === 0) return;
      for (const c of fresh) lastNotifiedTs = Math.max(lastNotifiedTs, c.ts);
      const s = summarizeChanges(fresh);
      notify(t('watch.notify.title'), t('watch.banner', s));
    } finally {
      ticking = false;
    }
  }

  function apply(minutes: number): void {
    const ms = intervalMsFor(minutes);
    if (ms === currentMs) return;
    currentMs = ms;
    if (timer != null) clearInterval(timer);
    timer = ms == null ? null : setInterval((): void => void tick(), ms);
  }

  const unsub = settings.subscribe((s) => apply(s.watchIntervalMin));

  return () => {
    unsub();
    if (timer != null) clearInterval(timer);
    timer = null;
    currentMs = null;
  };
}
