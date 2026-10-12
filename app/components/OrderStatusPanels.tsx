import { ReportGenerationProgress } from "./ReportGenerationProgress.js";
import { AWAITING_NO_LINK_COPY, AWAITING_PAYMENT_COPY } from "../checkout/status/status-helpers.js";

/**
 * The two non-report panels of the post-payment status page, kept presentational (no data fetching) so they can be tested by rendering.
 * GenerationPanel: the report is being built (or has just become ready and is loading). RefundPanel: generation failed and the order's own refund recovery
 * is under way - the animation is gone, the order reference is shown, and the wording is scoped to THIS order (nothing implies a new screening is free).
 */

export function GenerationPanel({ ready }: { ready: boolean }) {
  return (
    <div className="mt-6 border-t border-slate-100 pt-6">
      <ReportGenerationProgress done={ready} />
      {ready && <p className="mt-1 text-center text-sm text-slate-500">Loading your report...</p>}
    </div>
  );
}

export type RefundPanelStatus = "REFUND_PENDING" | "REFUNDED" | "REFUND_REQUIRES_SUPPORT";

export function refundPanelCopy(status: RefundPanelStatus): string {
  switch (status) {
    case "REFUND_REQUIRES_SUPPORT":
      return "Your order is saved, but the automatic refund for this order needs a manual review. Please contact support and quote the order reference below. You will not be charged again for this order.";
    case "REFUNDED":
      return "The payment for this order has been refunded. You will not be charged again for this order.";
    case "REFUND_PENDING":
      return "The payment for this order is being refunded automatically. You will not be charged again for this order.";
  }
}

export function RefundPanel({ status, orderReference, supportEmail }: { status: RefundPanelStatus; orderReference?: string; supportEmail?: string }) {
  return (
    <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">We weren&apos;t able to build your report.</p>
      <p className="mt-1">{refundPanelCopy(status)}</p>
      {orderReference && (
        <p className="mt-2">
          Order reference: <code className="break-all text-amber-950">{orderReference}</code>
        </p>
      )}
      {status === "REFUND_REQUIRES_SUPPORT" &&
        (supportEmail ? (
          <p className="mt-2">
            <a className="font-medium underline" href={`mailto:${supportEmail}?subject=${encodeURIComponent("Permit Preflight order refund")}&body=${encodeURIComponent(`Order reference: ${orderReference ?? "(not shown)"}`)}`}>
              Email support about this order
            </a>
          </p>
        ) : (
          <p className="mt-2">Contact support with the reference above.</p>
        ))}
    </div>
  );
}

/**
 * Before the payment is recorded. AWAITING_PAYMENT: Stripe says the session was never paid - say so, and offer the same session's own checkout (no second charge).
 * CONFIRMING_PAYMENT: Stripe has (or may have) the payment and the order is catching up - after a while say so, show the reference, and offer a re-check; the
 * customer is never asked to pay again here, and no report-generation animation appears (that is only for a confirmed payment).
 */
export function PaymentWaitingPanel({
  kind,
  takingLonger,
  orderReference,
  checkoutUrl,
  supportEmail,
  onRecheck,
}: {
  kind: "AWAITING_PAYMENT" | "CONFIRMING_PAYMENT";
  takingLonger: boolean;
  orderReference?: string;
  checkoutUrl?: string;
  supportEmail?: string;
  onRecheck: () => void;
}) {
  if (kind === "AWAITING_PAYMENT") {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">{AWAITING_PAYMENT_COPY.headline}</p>
        <p className="mt-1">{AWAITING_PAYMENT_COPY.body}</p>
        {checkoutUrl ? (
          <p className="mt-3">
            <a className="inline-block rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white" href={checkoutUrl}>
              Return to secure checkout
            </a>
          </p>
        ) : (
          <>
            <p className="mt-3">{AWAITING_NO_LINK_COPY}</p>
            <p className="mt-3">
              <button type="button" onClick={onRecheck} className="rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900">
                Check again
              </button>
              {supportEmail && (
                <a className="ml-3 font-medium underline" href={`mailto:${supportEmail}?subject=${encodeURIComponent("Permit Preflight checkout")}&body=${encodeURIComponent(`Order reference: ${orderReference ?? "(not shown)"}`)}`}>
                  Email support
                </a>
              )}
            </p>
          </>
        )}
        {orderReference && (
          <p className="mt-3">
            Order reference: <code className="break-all text-amber-950">{orderReference}</code>
          </p>
        )}
      </div>
    );
  }
  if (!takingLonger) return null;
  return (
    <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
      <p>If you completed the payment, there&apos;s nothing more to do here, and you won&apos;t be asked to pay again for this order.</p>
      {orderReference && (
        <p className="mt-2">
          Order reference: <code className="break-all text-sky-950">{orderReference}</code>
        </p>
      )}
      <p className="mt-3">
        <button type="button" onClick={onRecheck} className="rounded-md border border-sky-300 bg-white px-3 py-1.5 font-medium text-sky-900">
          Check again
        </button>
      </p>
    </div>
  );
}
