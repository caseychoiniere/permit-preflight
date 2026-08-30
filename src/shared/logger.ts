/**
 * Structured dev-time logging (Infrastructure Design: "structured console/log output only,
 * no monitoring stack"). Secrets/credentials must never be passed into `detail` - callers are
 * responsible for that (NFR-5); this module does not attempt to redact, since silent redaction
 * could hide a real bug - the discipline is "don't put secrets in here" at the call site.
 */

export type LogEvent =
  | "SOURCE_FAILURE"
  | "RETRY_EXHAUSTED"
  | "RESOLUTION_UNAVAILABLE"
  | "VALIDATION_FAILURE"
  | "RULE_LIFECYCLE_TRANSITION"
  | "EVALUATION_FAILURE"
  | "EVALUATION_DEFERRED"
  // Unit 2 additions (NFR Design Pattern 4 / Infrastructure Design's required event list). Never
  // include a raw access token, tokenHash, or any credential value in `detail` for these events.
  | "STAGE_TIMING"
  | "JOB_CLAIMED"
  | "JOB_STALE_RECOVERY"
  | "JOB_COMPLETE"
  | "JOB_FAILED"
  | "PDF_RENDER_FAILURE"
  | "CREDENTIAL_REVOKED"
  | "CREDENTIAL_ROTATED"
  | "RATE_LIMIT_TRIGGERED"
  // Unit 2B additions (BR-U2B-1/4/10, Infrastructure Design's Cron backstop). Never include a raw
  // Stripe secret, webhook signature, refundIdempotencyKey, or full Stripe Checkout Session ID
  // value in `detail` for these events (Pattern 4/8's logging-hygiene discipline).
  | "DUPLICATE_PAYMENT_ANOMALY"
  | "GUEST_DELIVERY_NO_EMAIL"
  | "GUEST_DELIVERY_FAILED"
  | "GUEST_DELIVERY_RECONCILIATION_FAILED"
  | "RECONCILIATION_COMPLETE"
  | "STRIPE_WEBHOOK_SIGNATURE_INVALID"
  | "INTERNAL_PROTOTYPE_AUTHORIZED"
  // Unit 3 addition - never include AdminActionLog.reason, ADMIN_OPERATOR_ID, or Basic Auth
  // credential material in `detail` for this event.
  | "DATA_SOURCE_HEALTH_RECORDING_FAILED"
  // Unit 6 additions - never include a raw magic-link token, tokenHash, AccountSession token, or
  // Account email in `detail` for any of these events (matches the report-access credential
  // events' own discipline above - only sourceKeyHash-style non-reversible markers are logged).
  | "LOGIN_LINK_REQUEST_FAILED"
  // 2026-08-28 addition (report-explanation/anthropic-wiring.ts) - never include
  // ANTHROPIC_API_KEY or any request header value in `detail`; `reason` here is always
  // createAnthropicCompletionClient's or explainFindings' own human-readable failure message,
  // neither of which ever echoes back credential material by construction.
  | "REPORT_EXPLANATION_DEGRADED"
  // Building intelligence v1 (2026-08-29) - never include raw parcel PIN in a way that couples
  // this to PII (PINs are public tax-parcel identifiers, not personal data, same treatment the
  // existing SOURCE_FAILURE event already gives parcelId elsewhere).
  | "BUILDING_OUTLINES_DISPLAY_FETCH_FAILED"
  // Regression diagnostics (2026-08-30) - counts/booleans only, see pipeline.ts's own comment at
  // the call site for exactly what is (and isn't) included.
  | "SHED_REPORT_DIAGNOSTICS";

export interface LogDetail {
  [key: string]: string | number | boolean | undefined;
}

function emit(level: "info" | "warn" | "error", event: LogEvent, detail: LogDetail): void {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...detail,
  };
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(line));
}

export const logger = {
  info: (event: LogEvent, detail: LogDetail = {}) => emit("info", event, detail),
  warn: (event: LogEvent, detail: LogDetail = {}) => emit("warn", event, detail),
  error: (event: LogEvent, detail: LogDetail = {}) => emit("error", event, detail),
};
