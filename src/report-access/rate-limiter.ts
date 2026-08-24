/**
 * Failed-Lookup Rate Limiter - NFR Design Pattern 2. In-process memory, appropriate given Unit 2
 * deploys exactly one Railway replica (Infrastructure Design). Only failed/invalid lookups count
 * against a source; a rate-limited rejection and an ordinary NOT_FOUND must be indistinguishable
 * to the caller (both return REJECTED-shaped results with no differentiating detail).
 */

export interface RateLimiterOptions {
  /** Failed attempts allowed within the window before further lookups from that source are
   * rejected. */
  maxFailuresPerWindow: number;
  windowMs: number;
  /** Cooldown applied once the threshold is hit - separate from the counting window so a burst
   * doesn't immediately reopen the moment the window rolls. */
  cooldownMs: number;
}

export const DEFAULT_RATE_LIMITER_OPTIONS: RateLimiterOptions = {
  maxFailuresPerWindow: 10,
  windowMs: 60_000,
  cooldownMs: 60_000,
};

interface SourceState {
  failureTimestamps: number[];
  limitedUntil?: number;
}

/** A small, bounded, self-cleaning in-memory limiter - never grows unboundedly, since stale
 * source entries are pruned on access. */
export class FailedLookupRateLimiter {
  private readonly sources = new Map<string, SourceState>();
  private readonly options: RateLimiterOptions;

  constructor(options: RateLimiterOptions = DEFAULT_RATE_LIMITER_OPTIONS) {
    this.options = options;
  }

  /** True if this source is currently in cooldown and must be rejected before attempting a
   * lookup at all. */
  isLimited(sourceKey: string, now: number = Date.now()): boolean {
    const state = this.sources.get(sourceKey);
    if (!state?.limitedUntil) return false;
    if (state.limitedUntil > now) return true;
    // Cooldown expired - clear it so this source isn't limited forever.
    state.limitedUntil = undefined;
    return false;
  }

  /** Records a failed lookup attempt. Never called for a successful lookup (Pattern 2's "only
   * failed/invalid attempts increment the counter" requirement). */
  recordFailure(sourceKey: string, now: number = Date.now()): void {
    const state = this.sources.get(sourceKey) ?? { failureTimestamps: [] };
    const windowStart = now - this.options.windowMs;
    state.failureTimestamps = [...state.failureTimestamps.filter((t) => t > windowStart), now];
    if (state.failureTimestamps.length >= this.options.maxFailuresPerWindow) {
      state.limitedUntil = now + this.options.cooldownMs;
    }
    this.sources.set(sourceKey, state);
  }

  /** Bounded-memory cleanup - removes sources with no recent activity. Call periodically (e.g.
   * alongside the job poller's own interval) rather than on every request. */
  pruneStale(now: number = Date.now()): void {
    const windowStart = now - this.options.windowMs;
    for (const [key, state] of this.sources) {
      const stillRecent = state.failureTimestamps.some((t) => t > windowStart);
      const stillLimited = state.limitedUntil !== undefined && state.limitedUntil > now;
      if (!stillRecent && !stillLimited) this.sources.delete(key);
    }
  }

  /** Test/diagnostic only - not used by production request handling. */
  size(): number {
    return this.sources.size;
  }
}
