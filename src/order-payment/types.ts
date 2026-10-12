/**
 * Order & Payment domain types (Unit 2B domain-entities.md). Owns payment/order state ONLY -
 * generation state remains ReportGenerationJob's alone, unchanged component boundary
 * (component-methods.md #14).
 */

/**
 * OrderState transitions fall into two kinds (BR-U2B-2):
 * - EXTERNALLY-CONFIRMED (require Stripe-authenticated evidence, never a browser redirect or client-supplied status): either a
 *   signature-verified Stripe webhook, or - for PENDING->PAID and PENDING->EXPIRED only - an authenticated retrieval of the Order's OWN Checkout Session from Stripe's API
 *   (reconcileOrderWithStripe: status read, cron check 6, checkout resumption). For PENDING->PAID that retrieval runs the same shared transaction a webhook runs
 *   (handleVerifiedWebhook, with a synthetic ledger id), and the paid Checkout Session must be the one stored on the Order. PENDING->EXPIRED from a retrieval is a separate
 *   conditional update (WHERE state = PENDING; it records no ledger entry). REFUND_PENDING->REFUNDED and REFUND_PENDING->REFUND_FAILED remain webhook-only.
 * - LOCAL COMMAND (server-initiated, never by a browser redirect or client-supplied status):
 *   (creation)->PENDING, PAID->REFUND_PENDING, REFUND_FAILED->REFUND_PENDING (modeled, not
 *   exercised by any Unit 2B code path - see BR-U2B-5's manual-resolution-only scope decision).
 */
export const OrderState = {
  PENDING: "PENDING",
  PAID: "PAID",
  REFUND_PENDING: "REFUND_PENDING",
  REFUNDED: "REFUNDED",
  REFUND_FAILED: "REFUND_FAILED",
  EXPIRED: "EXPIRED",
} as const;
export type OrderState = (typeof OrderState)[keyof typeof OrderState];

export const RefundReason = {
  GENERATION_FAILURE: "GENERATION_FAILURE",
  CUSTOMER_REQUEST: "CUSTOMER_REQUEST",
  GOODWILL: "GOODWILL",
  DUPLICATE_PAYMENT: "DUPLICATE_PAYMENT",
} as const;
export type RefundReason = (typeof RefundReason)[keyof typeof RefundReason];

export interface Order {
  id: string;
  screeningRequestId: string;
  state: OrderState;
  priceCents: number;
  currency: string;
  checkoutCreationIdempotencyKey: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  customerEmail?: string;
  paidAt?: string;
  refundReason?: RefundReason;
  refundIdempotencyKey?: string;
  stripeRefundId?: string;
  refundConfirmedAt?: string;
}

export interface ProcessedStripeEvent {
  stripeEventId: string;
  eventType: string;
  stripeObjectId: string;
  processedAt: string;
}

/** Minimized, purpose-built status for the unauthenticated guest status-read capability
 * (NFR Design Pattern 4). Possession of the Stripe Checkout Session ID that resolves to this
 * status permits READS ONLY - never a PAID transition, generation, refund, or report access. */
export const GuestOrderStatus = {
  /** Stripe says the Checkout Session is still open and unpaid: the customer reached the status page without completing payment. Never described as "confirming". */
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  /** Stripe reports the payment (or could not be asked yet) but the Order is not yet PAID locally: the webhook is delayed or the live check failed. */
  CONFIRMING_PAYMENT: "CONFIRMING_PAYMENT",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
  REPORT_READY: "REPORT_READY",
  REFUND_PENDING: "REFUND_PENDING",
  REFUNDED: "REFUNDED",
  REFUND_REQUIRES_SUPPORT: "REFUND_REQUIRES_SUPPORT",
  EXPIRED: "EXPIRED",
  RECONCILING: "RECONCILING",
  NOT_FOUND: "NOT_FOUND",
} as const;
export type GuestOrderStatus = (typeof GuestOrderStatus)[keyof typeof GuestOrderStatus];
