/**
 * Pure logic for the post-checkout status page: how a poll response is interpreted, how long a payment may sit in "confirming" before the page says so honestly, and
 * when the page tells the customer it is having trouble. Anything that is not exactly the documented shape - a non-2xx status, a non-object body, an unknown status -
 * is a poll FAILURE, never a status, so a broken response cannot freeze the page on a stale one. Unit-tested without a DOM.
 */

export const CHECKOUT_STATUSES = [
  "AWAITING_PAYMENT",
  "CONFIRMING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "REPORT_READY",
  "REFUND_PENDING",
  "REFUNDED",
  "REFUND_REQUIRES_SUPPORT",
  "EXPIRED",
  "RECONCILING",
  "NOT_FOUND",
] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export interface StatusView {
  status: CheckoutStatus;
  orderReference?: string;
  /** Only ever Stripe's own hosted checkout URL (validated), only for AWAITING_PAYMENT. */
  checkoutUrl?: string;
}

export type StatusPollOutcome = { kind: "STATUS"; view: StatusView } | { kind: "FAILURE" };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const KNOWN: ReadonlySet<string> = new Set(CHECKOUT_STATUSES);

/** The resume link is shown only if it is Stripe's hosted page - the page never navigates a customer to a URL the server did not get from Stripe. */
export function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

export function interpretStatusResponse(httpOk: boolean, body: unknown): StatusPollOutcome {
  if (!httpOk || !isObject(body)) return { kind: "FAILURE" };
  const status = body["status"];
  if (typeof status !== "string" || !KNOWN.has(status)) return { kind: "FAILURE" };
  const view: StatusView = { status: status as CheckoutStatus };
  if (typeof body["orderReference"] === "string" && body["orderReference"] !== "") view.orderReference = body["orderReference"];
  if (status === "AWAITING_PAYMENT" && isStripeCheckoutUrl(body["checkoutUrl"])) view.checkoutUrl = body["checkoutUrl"];
  return { kind: "STATUS", view };
}

/** Polling cadence: steady while a result is likely soon, then gentler - never stops while the status is non-terminal. */
export const POLL_FAST_MS = 3000;
export const POLL_SLOW_MS = 8000;
/** A payment that Stripe reports but the app has not yet recorded normally resolves in seconds. */
export const CONFIRMING_NOTICE_AFTER_MS = 30_000;
export const SLOW_POLL_AFTER_MS = 90_000;
/** Consecutive failed polls before the page admits it cannot reach the server. */
export const POLL_FAILURES_BEFORE_NOTICE = 3;

export function pollIntervalMs(waitingMs: number): number {
  return waitingMs >= SLOW_POLL_AFTER_MS ? POLL_SLOW_MS : POLL_FAST_MS;
}

/** Terminal statuses stop polling: nothing further will change them without a customer action. */
export function isTerminalStatus(status: CheckoutStatus): boolean {
  return status === "REPORT_READY" || status === "REFUNDED" || status === "REFUND_REQUIRES_SUPPORT" || status === "EXPIRED" || status === "NOT_FOUND";
}

export type ConfirmingPhase = "CONFIRMING" | "TAKING_LONGER";
export function confirmingPhase(waitingMs: number): ConfirmingPhase {
  return waitingMs >= CONFIRMING_NOTICE_AFTER_MS ? "TAKING_LONGER" : "CONFIRMING";
}

export const CONFIRMING_COPY = {
  CONFIRMING: "Confirming your payment...",
  TAKING_LONGER: "We're still confirming the payment with Stripe. There's no need to pay again.",
} as const;

export const AWAITING_PAYMENT_COPY = {
  headline: "Your payment hasn't been completed.",
  body: "No charge has been made for this order. You can return to secure checkout to finish paying; the report is only built once the payment goes through.",
} as const;

export const CONNECTION_TROUBLE_COPY = "We're having trouble reaching Permit Preflight, and we'll keep trying. If you already paid, there's no need to pay again.";

/** AWAITING_PAYMENT but the server could not give a validated resume link for the same Checkout Session: the page never offers a new payment path, only a re-check and support. */
export const AWAITING_NO_LINK_COPY = "We couldn't reopen your checkout automatically. Check again in a moment, or contact support with your order reference.";
