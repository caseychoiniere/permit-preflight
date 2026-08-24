/**
 * Bounded-Retry Executor (NFR Design Pattern 1, unit-1 nfr-design-patterns.md).
 *
 * One shared logical contract for every external read Unit 1 performs:
 *   external read -> bounded retry where safe -> SUCCESS(data) | EXHAUSTED(failure)
 *
 * Never silent, never a default value on failure - callers must handle EXHAUSTED explicitly
 * and map it into their own domain's "unavailable" state (PropertyFact.availabilityState,
 * SpatialResult.availabilityState, or ParcelResolutionResult.status = RESOLUTION_UNAVAILABLE).
 *
 * No circuit breaker, queue, or distributed retry infrastructure - deliberately excluded per
 * NFR Requirements/Design (unjustified at Unit 1's scale).
 */

export type RetryResult<T> =
  | { outcome: "SUCCESS"; data: T }
  | { outcome: "EXHAUSTED"; attempts: number; lastError: unknown };

export interface RetryPolicy {
  /** Maximum number of attempts (including the first). Exact tuning is an NFR Design /
   * implementation concern, not a fixed product invariant - callers may override per source. */
  maxAttempts: number;
  /** Base delay in ms between attempts; executor applies simple linear backoff (attempt * baseDelayMs). */
  baseDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
};

/**
 * A predicate deciding whether a given error is worth retrying (e.g. timeout, 5xx, rate-limit)
 * vs. an error that will never succeed on retry (e.g. malformed request) and should fail fast.
 * Defaults to "retry everything" - callers with a more specific error taxonomy may override.
 */
export type IsRetryable = (error: unknown) => boolean;

const alwaysRetryable: IsRetryable = () => true;

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes `operation` under the bounded-retry contract. `operation` should itself throw on
 * failure (network error, non-OK response, etc.) - this executor does not interpret response
 * bodies, only success/failure of the attempt.
 */
export async function executeWithBoundedRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  isRetryable: IsRetryable = alwaysRetryable
): Promise<RetryResult<T>> {
  let lastError: unknown = undefined;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      const data = await operation();
      return { outcome: "SUCCESS", data };
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === policy.maxAttempts;
      if (isLastAttempt || !isRetryable(error)) {
        return { outcome: "EXHAUSTED", attempts: attempt, lastError };
      }
      await sleep(policy.baseDelayMs * attempt);
    }
  }

  // Unreachable given maxAttempts >= 1, but keeps the type checker satisfied.
  return { outcome: "EXHAUSTED", attempts: policy.maxAttempts, lastError };
}
