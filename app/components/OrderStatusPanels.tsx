import { ReportGenerationProgress } from "./ReportGenerationProgress.js";

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
