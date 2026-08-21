/**
 * Per-infra AIMD rate limiter (SPEC §8).
 * Token spacing with adaptive pause: on 429 → pause ×2 (cap 10s, Retry-After honored);
 * after 20 consecutive OK outcomes → pause ×0.9 (floor minPauseMs).
 */
export interface LimiterClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const systemClock: LimiterClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const MAX_PAUSE_MS = 10_000;
const OKS_TO_RECOVER = 20;

export class AimdLimiter {
  private pauseMs: number;
  private consecutiveOk = 0;
  private inFlight = 0;
  private nextSlotAt = 0;

  constructor(
    private readonly minPauseMs: number,
    private readonly maxParallel: number,
    private readonly clock: LimiterClock = systemClock,
  ) {
    this.pauseMs = minPauseMs;
  }

  get currentPauseMs(): number {
    return this.pauseMs;
  }

  get currentInFlight(): number {
    return this.inFlight;
  }

  /** Resolves once a slot is reserved AND the per-infra spacing has elapsed. */
  async acquire(): Promise<void> {
    while (this.inFlight >= this.maxParallel) {
      await this.clock.sleep(Math.min(10, Math.max(1, Math.floor(this.pauseMs / 10))));
    }
    // Reserve the slot synchronously (single-threaded event loop → no race).
    this.inFlight += 1;
    const startAt = Math.max(this.clock.now(), this.nextSlotAt);
    this.nextSlotAt = startAt + this.pauseMs;
    const waitMs = startAt - this.clock.now();
    if (waitMs > 0) await this.clock.sleep(waitMs);
  }

  /** Release the slot after any non-429 outcome. */
  reportOk(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.consecutiveOk += 1;
    if (this.consecutiveOk >= OKS_TO_RECOVER) {
      this.pauseMs = Math.max(this.minPauseMs, Math.floor(this.pauseMs * 0.9));
      this.consecutiveOk = 0;
    }
  }

  /** Release a reserved slot without recording an outcome (e.g. abort before
   *  the request actually ran — must not inflate consecutiveOk or back off). */
  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  /** Release the slot and back off multiplicatively. */
  report429(retryAfterMs?: number): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.consecutiveOk = 0;
    const doubled = Math.min(MAX_PAUSE_MS, this.pauseMs * 2);
    this.pauseMs =
      retryAfterMs != null && retryAfterMs > doubled
        ? Math.min(MAX_PAUSE_MS, retryAfterMs)
        : doubled;
  }
}
