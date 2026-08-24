/** Process-wide FailedLookupRateLimiter singleton - in-process memory, single-replica deployment
 * (Infrastructure Design). A restart clearing this state is an accepted prototype trade-off. */
import { FailedLookupRateLimiter } from "../report-access/rate-limiter.js";

export const reportLookupLimiter = new FailedLookupRateLimiter();
