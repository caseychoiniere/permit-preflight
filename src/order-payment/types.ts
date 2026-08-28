/**
 * Order & Payment domain types (Unit 2B domain-entities.md). Owns payment/order state ONLY -
 * generation state remains ReportGenerationJob's alone, unchanged component boundary
 * (component-methods.md #14).
 */

/**
 * OrderState transitions fall into two kinds (BR-U2B-2):
 * - EXTERNALLY-CONFIRMED (require a signature-verified Stripe webhook, and only that):
 *   PENDING->PAID, PENDING->EXPIRED, REFUND_PENDING->REFUNDED, REFUND_PENDING->REFUND_FAILED.
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
  PENDING: "PENDING",
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
