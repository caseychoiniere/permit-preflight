/** Process-wide FailedLookupRateLimiter singleton - in-process memory, single-replica deployment
 * (Infrastructure Design). A restart clearing this state is an accepted prototype trade-off. */
import { FailedLookupRateLimiter } from "../report-access/rate-limiter.js";

export const reportLookupLimiter = new FailedLookupRateLimiter();

/** Unit 6 addition (NFR Design Pattern 5, Layer 2) - a SEPARATE instance from reportLookupLimiter,
 * so a burst against account-auth endpoints cannot consume rate-limit budget intended for
 * report-access lookups, or vice versa. Application-local defense-in-depth ONLY - the Vercel
 * Firewall rule (infrastructure-design.md, deployment configuration, not code) is the authoritative
 * deployment-wide control; this instance is never described as sufficient on its own. Used in its
 * existing failure-counting mode for verify-login/verify-claim, and in an every-attempt-counts mode
 * (callers invoke recordFailure unconditionally) for request-login-link/claim's email-trigger
 * endpoint, since those always return the same generic response by design and have no separate
 * "failure" signal to count instead. */
export const accountAuthLocalLimiter = new FailedLookupRateLimiter();
