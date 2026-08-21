import { describe, expect, it } from 'vitest';
import { AimdLimiter, type LimiterClock } from '../src/core/rate-limiter';

class FakeClock implements LimiterClock {
  t = 0;
  now(): number {
    return this.t;
  }
  sleep(ms: number): Promise<void> {
    this.t += ms;
    // Yield to the macrotask queue so wait loops cannot starve real timers.
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('AimdLimiter', () => {
  it('spaces requests by minPauseMs', async () => {
    const clock = new FakeClock();
    const limiter = new AimdLimiter(100, 4, clock);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(clock.t).toBeGreaterThanOrEqual(200);
  });

  it('doubles pause on 429, honors larger Retry-After, caps at 10s', async () => {
    const clock = new FakeClock();
    const limiter = new AimdLimiter(100, 4, clock);
    await limiter.acquire();
    limiter.report429();
    expect(limiter.currentPauseMs).toBe(200);
    await limiter.acquire();
    limiter.report429(5000);
    expect(limiter.currentPauseMs).toBe(5000);
    await limiter.acquire();
    limiter.report429(50_000);
    expect(limiter.currentPauseMs).toBe(10_000);
  });

  it('recovers pause ×0.9 after 20 consecutive OKs', async () => {
    const clock = new FakeClock();
    const limiter = new AimdLimiter(100, 4, clock);
    await limiter.acquire();
    limiter.report429(); // pause → 200
    for (let i = 0; i < 20; i++) {
      await limiter.acquire();
      limiter.reportOk();
    }
    expect(limiter.currentPauseMs).toBe(180);
  });

  it('never recovers below minPauseMs', async () => {
    const clock = new FakeClock();
    const limiter = new AimdLimiter(100, 4, clock);
    await limiter.acquire();
    limiter.report429(); // 200
    for (let round = 0; round < 8; round++) {
      for (let i = 0; i < 20; i++) {
        await limiter.acquire();
        limiter.reportOk();
      }
    }
    expect(limiter.currentPauseMs).toBe(100);
  });

  it('blocks acquire beyond maxParallel until a slot is released', async () => {
    const clock = new FakeClock();
    const limiter = new AimdLimiter(0, 1, clock);
    await limiter.acquire();
    let resolved = false;
    const pending = limiter.acquire().then(() => {
      resolved = true;
    });
    await new Promise((r) => setTimeout(r, 15));
    expect(resolved).toBe(false);
    limiter.reportOk();
    await pending;
    expect(resolved).toBe(true);
  });

  it('release() on abort does not increment consecutiveOk or trigger AIMD recovery', async () => {
    // Bug: the queue abort path called reportOk(), which inflated
    // consecutiveOk and could spuriously trigger AIMD recovery for a
    // non-outcome. release() must only decrement inFlight.
    const clock = new FakeClock();
    const limiter = new AimdLimiter(100, 4, clock);
    // Back off so AIMD recovery would be observable (200 → 180 after 20 OKs).
    await limiter.acquire();
    limiter.report429();
    expect(limiter.currentPauseMs).toBe(200);
    // 20 abort cycles — release() must not reduce pauseMs.
    for (let i = 0; i < 20; i++) {
      await limiter.acquire();
      limiter.release();
    }
    expect(limiter.currentPauseMs).toBe(200);
    expect(limiter.currentInFlight).toBe(0);
  });

  it('release() does not reset consecutiveOk (a 429 after aborts still backs off)', async () => {
    const clock = new FakeClock();
    const limiter = new AimdLimiter(100, 4, clock);
    await limiter.acquire();
    limiter.report429(); // 200
    // 19 real OKs + 1 abort-release: the 20th OK would normally recover,
    // but release() must not count toward consecutiveOk.
    for (let i = 0; i < 19; i++) {
      await limiter.acquire();
      limiter.reportOk();
    }
    await limiter.acquire();
    limiter.release();
    // pauseMs still 200 — the 19 OKs are below the 20-OK recovery threshold,
    // and release() did not add a 20th.
    expect(limiter.currentPauseMs).toBe(200);
    // A real 429 now still backs off from 200 → 400.
    limiter.report429();
    expect(limiter.currentPauseMs).toBe(400);
  });
});
