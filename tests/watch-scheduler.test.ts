import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settings } from '../src/ui/store';
import { watchChanges, type WatchChange } from '../src/ui/watchlist';
import {
  intervalMsFor,
  startWatchScheduler,
  summarizeChanges,
} from '../src/ui/watch-scheduler';
import { DEFAULT_SETTINGS } from '../src/types';
import type { CheckStatus } from '../src/types';

function change(ts: number, to: CheckStatus, kind?: 'price_drop'): WatchChange {
  return { domain: 'ex.com', from: 'taken', to, ts, kind };
}

beforeEach(() => {
  vi.useFakeTimers();
  settings.set({ ...DEFAULT_SETTINGS, watchIntervalMin: 0, watchNotify: false });
  watchChanges.set([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('intervalMsFor', () => {
  it('maps minutes to ms with a 1-minute floor', () => {
    expect(intervalMsFor(5)).toBe(300_000);
    expect(intervalMsFor(0.4)).toBe(60_000);
    expect(intervalMsFor(2.6)).toBe(180_000);
  });

  it('returns null for disabled or invalid values', () => {
    expect(intervalMsFor(0)).toBeNull();
    expect(intervalMsFor(-5)).toBeNull();
    expect(intervalMsFor(NaN)).toBeNull();
    expect(intervalMsFor(Infinity)).toBeNull();
  });
});

describe('summarizeChanges', () => {
  it('counts freed, taken, and price drops', () => {
    const s = summarizeChanges([
      change(1, 'available'),
      change(2, 'probably_available'),
      change(3, 'taken'),
      change(4, 'taken', 'price_drop'),
      change(5, 'unknown'),
    ]);
    expect(s).toEqual({ freed: 2, taken: 1, priceDrops: 1 });
  });

  it('returns zeros for an empty list', () => {
    expect(summarizeChanges([])).toEqual({ freed: 0, taken: 0, priceDrops: 0 });
  });
});

describe('startWatchScheduler', () => {
  interface TestDeps {
    refresh: ReturnType<typeof vi.fn>;
    visibility: ReturnType<typeof vi.fn>;
    notify: ReturnType<typeof vi.fn>;
  }

  function deps(overrides: Partial<TestDeps> = {}): TestDeps {
    return {
      refresh: vi.fn().mockResolvedValue(undefined),
      visibility: vi.fn().mockReturnValue('visible' as DocumentVisibilityState),
      notify: vi.fn(),
      ...overrides,
    };
  }

  it('polls on the configured interval and stops on cleanup', async () => {
    settings.update((s) => ({ ...s, watchIntervalMin: 5 }));
    const d = deps();
    const stop = startWatchScheduler(d);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(d.refresh).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(d.refresh).toHaveBeenCalledTimes(2);
  });

  it('never starts a timer when the interval is off', async () => {
    const d = deps();
    const stop = startWatchScheduler(d);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(d.refresh).not.toHaveBeenCalled();
    stop();
  });

  it('skips ticks while the tab is hidden', async () => {
    settings.update((s) => ({ ...s, watchIntervalMin: 1 }));
    const d = deps({ visibility: vi.fn().mockReturnValue('hidden' as DocumentVisibilityState) });
    const stop = startWatchScheduler(d);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(d.refresh).not.toHaveBeenCalled();
    stop();
  });

  it('reschedules when the interval setting changes', async () => {
    const d = deps();
    const stop = startWatchScheduler(d);

    settings.update((s) => ({ ...s, watchIntervalMin: 1 }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.refresh).toHaveBeenCalledTimes(1);

    settings.update((s) => ({ ...s, watchIntervalMin: 0 }));
    await vi.advanceTimersByTimeAsync(300_000);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it('notifies once for new changes when watchNotify is on', async () => {
    settings.update((s) => ({ ...s, watchIntervalMin: 1, watchNotify: true }));
    const d = deps({
      refresh: vi.fn().mockImplementation(async () => {
        watchChanges.set([change(1000, 'available')]);
      }),
    });
    const stop = startWatchScheduler(d);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(d.notify.mock.calls[0]?.[0]).toBe('Domain Hunter watchlist');
    expect(d.notify.mock.calls[0]?.[1]).toContain('1 freed');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.notify).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not notify for changes present at scheduler start', async () => {
    watchChanges.set([change(500, 'taken')]);
    settings.update((s) => ({ ...s, watchIntervalMin: 1, watchNotify: true }));
    const d = deps();
    const stop = startWatchScheduler(d);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(d.notify).not.toHaveBeenCalled();
    stop();
  });

  it('stays silent when watchNotify is off', async () => {
    settings.update((s) => ({ ...s, watchIntervalMin: 1 }));
    const d = deps({
      refresh: vi.fn().mockImplementation(async () => {
        watchChanges.set([change(1000, 'taken')]);
      }),
    });
    const stop = startWatchScheduler(d);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.notify).not.toHaveBeenCalled();
    stop();
  });

  it('ignores overlapping ticks', async () => {
    settings.update((s) => ({ ...s, watchIntervalMin: 1 }));
    let releaseFirst = (): void => {};
    const d = deps({
      refresh: vi
        .fn()
        .mockImplementationOnce(
          () => new Promise<void>((r) => (releaseFirst = r)),
        )
        .mockResolvedValue(undefined),
    });
    const stop = startWatchScheduler(d);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.refresh).toHaveBeenCalledTimes(1);

    releaseFirst();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.refresh).toHaveBeenCalledTimes(2);
    stop();
  });
});
