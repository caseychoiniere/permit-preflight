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
  | "RATE_LIMIT_TRIGGERED";

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
