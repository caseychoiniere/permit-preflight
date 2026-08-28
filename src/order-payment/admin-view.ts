/**
 * Admin-facing Order view (2026-08-25, full-repository review correction). The full `Order`
 * domain object carries values the admin browser must never receive:
 * `checkoutCreationIdempotencyKey`, `refundIdempotencyKey`, and `stripeCheckoutSessionId` (already
 * treated elsewhere in this application as a low-scope bearer capability - Unit 2B moved it out of
 * URLs/logs for exactly this reason, and sending it to the admin UI would reintroduce the same
 * exposure this app already went out of its way to close). This module is the ONLY place an
 * `Order` is narrowed for the admin surface - every `app/api/admin/orders/*` route must go
 * through it rather than returning a raw `Order`.
 */

import type { Order, OrderState, RefundReason } from "./types.js";

export interface AdminOrderView {
  id: string;
  screeningRequestId: string;
  state: OrderState;
  priceCents: number;
  currency: string;
  customerEmail?: string;
  paidAt?: string;
  refundReason?: RefundReason;
  /** Included because it is genuinely useful for Stripe support diagnosis (looking an order up
   * in the Stripe dashboard) - not included merely because it exists on the domain object. */
  stripePaymentIntentId?: string;
  stripeRefundId?: string;
  refundConfirmedAt?: string;
}

export function toAdminOrderView(order: Order): AdminOrderView {
  return {
    id: order.id,
    screeningRequestId: order.screeningRequestId,
    state: order.state,
    priceCents: order.priceCents,
    currency: order.currency,
    ...(order.customerEmail ? { customerEmail: order.customerEmail } : {}),
    ...(order.paidAt ? { paidAt: order.paidAt } : {}),
    ...(order.refundReason ? { refundReason: order.refundReason } : {}),
    ...(order.stripePaymentIntentId ? { stripePaymentIntentId: order.stripePaymentIntentId } : {}),
    ...(order.stripeRefundId ? { stripeRefundId: order.stripeRefundId } : {}),
    ...(order.refundConfirmedAt ? { refundConfirmedAt: order.refundConfirmedAt } : {}),
  };
}
