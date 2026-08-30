"use client";

/** AdminOrderDetail + RefundActionForm (ADM-5/ADM-6, frontend-components.md). The refund reason
 * is a closed CUSTOMER_REQUEST/GOODWILL choice, never a raw text dropdown - and is kept
 * structurally separate from the required free-text justification (2026-08-25 correction). */

import { use, useState } from "react";
import type { AdminOrderView } from "../../../../src/order-payment/admin-view.js";
import { RefundReason } from "../../../../src/order-payment/types.js";
import type { AccessCredentialSummary } from "../../../../src/report-access/repository.js";
import { WideContainer } from "../../../components/ui/Container.js";
import { Card } from "../../../components/ui/Card.js";
import { Button } from "../../../components/ui/Button.js";
import { Badge, type BadgeTone } from "../../../components/ui/Badge.js";

const ORDER_STATE_TONE: Record<string, BadgeTone> = {
  PENDING: "info",
  PAID: "success",
  REFUND_PENDING: "warning",
  REFUNDED: "neutral",
  REFUND_FAILED: "danger",
  EXPIRED: "neutral",
};

interface JobWithCredentials {
  id: string;
  state: string;
  failureReasons: string[] | null;
  evidenceReportArtifactId?: string;
  accessCredentials: AccessCredentialSummary[];
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<AdminOrderView | null>(null);
  const [jobs, setJobs] = useState<JobWithCredentials[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [refundReason, setRefundReason] = useState<RefundReason>(RefundReason.CUSTOMER_REQUEST);
  const [justification, setJustification] = useState("");
  const [refundStatus, setRefundStatus] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch(`/api/admin/orders/${orderId}`);
    if (!res.ok) {
      setNotFound(true);
      setLoaded(true);
      return;
    }
    const data = (await res.json()) as { order: AdminOrderView; reportGenerationJobs: JobWithCredentials[] };
    setOrder(data.order);
    setJobs(data.reportGenerationJobs);
    setLoaded(true);
  }

  if (!loaded) {
    void load();
    return (
      <WideContainer>
        <p className="text-sm text-slate-500">Loading...</p>
      </WideContainer>
    );
  }
  if (notFound || !order) {
    return (
      <WideContainer>
        <p className="text-sm text-slate-600">Order not found.</p>
      </WideContainer>
    );
  }

  // Mirrors order-payment/repository.ts's decideRefundAction(order.state) exactly - never a
  // second, independently-maintained copy of Unit 2B's state machine. PAID = a genuinely new
  // refund command; REFUND_PENDING = resuming the SAME logical refund already in flight, never a
  // new one; every other state = no refund command available here (REFUND_FAILED in particular
  // stays manual/support-resolution only, never auto-reopened).
  const refundMode = order.state === "PAID" ? "NEW" : order.state === "REFUND_PENDING" ? "RESUME" : "NONE";

  async function submitRefund() {
    setRefundError(null);
    setRefundStatus(null);
    if (!justification.trim()) {
      setRefundError("A justification is required.");
      return;
    }
    setSubmitting(true);
    try {
      const body: { justification: string; refundReason?: RefundReason } = { justification };
      if (refundMode === "NEW") {
        body.refundReason = refundReason;
      }
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = (await res.json()) as { error?: string; issues?: string[] };
      if (!res.ok) {
        setRefundError(responseBody.error ?? `Refund request failed (${res.status}).`);
        return;
      }
      // Command accepted - not proof of a completed refund. Only a verified Stripe webhook
      // produces the confirmed terminal state; reload the authoritative Order rather than
      // fabricating REFUNDED here. The Order may still read PAID/REFUND_PENDING briefly.
      setRefundStatus("Refund command accepted; confirmation is pending.");
      setJustification("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <WideContainer>
      <a href="/admin/orders" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Order search
      </a>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Order {order.id}</h1>

      <Card className="mt-4">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-slate-100 pb-2 sm:border-0 sm:pb-0">
            <dt className="font-medium text-slate-500">State</dt>
            <dd>
              <Badge tone={ORDER_STATE_TONE[order.state] ?? "neutral"}>{order.state}</Badge>
            </dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2 sm:border-0 sm:pb-0">
            <dt className="font-medium text-slate-500">Price</dt>
            <dd className="text-slate-900">
              {(order.priceCents / 100).toFixed(2)} {order.currency.toUpperCase()}
            </dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2 sm:border-0 sm:pb-0">
            <dt className="font-medium text-slate-500">Customer Email</dt>
            <dd className="text-slate-900">{order.customerEmail ?? "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2 sm:border-0 sm:pb-0">
            <dt className="font-medium text-slate-500">Paid At</dt>
            <dd className="text-slate-900">{order.paidAt ?? "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2 sm:border-0 sm:pb-0">
            <dt className="font-medium text-slate-500">Refund Reason</dt>
            <dd className="text-slate-900">{order.refundReason ?? "—"}</dd>
          </div>
          <div className="flex justify-between pb-2">
            <dt className="font-medium text-slate-500">Refund Confirmed At</dt>
            <dd className="text-slate-900">{order.refundConfirmedAt ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">Report Generation Jobs</h2>
      {jobs.length === 0 && <p className="text-sm text-slate-500">None.</p>}
      <div className="flex flex-col gap-3">
        {jobs.map((job) => (
          <Card key={job.id}>
            <p className="text-sm text-slate-900">
              Job {job.id} - <Badge tone="neutral">{job.state}</Badge>
            </p>
            {job.evidenceReportArtifactId && (
              <p className="mt-2">
                <a
                  href={`/api/admin/reports/${job.evidenceReportArtifactId}/provenance`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  View provenance (JSON)
                </a>
              </p>
            )}
            {job.accessCredentials.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Active</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">Revoked</th>
                      <th className="px-3 py-2">Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.accessCredentials.map((c, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2">{c.active ? "yes" : "no"}</td>
                        <td className="px-3 py-2 text-slate-500">{c.createdAt}</td>
                        <td className="px-3 py-2 text-slate-500">{c.revokedAt ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-500">{c.deliveryStatus ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">Refund</h2>
      {refundMode === "NONE" && (
        <p className="text-sm text-slate-500">
          No refund command is available in state {order.state}
          {order.state === "REFUND_FAILED" ? " - manual/support resolution only, never automatically reopened here." : "."}
        </p>
      )}
      {refundMode === "NEW" && (
        <Card className="max-w-md">
          <label className="block text-sm font-medium text-slate-700">
            Reason
            <select
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value as RefundReason)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={RefundReason.CUSTOMER_REQUEST}>Customer request</option>
              <option value={RefundReason.GOODWILL}>Goodwill</option>
            </select>
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Justification (required)
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <Button variant="danger" className="mt-3" onClick={submitRefund} disabled={submitting}>
            {submitting ? "Submitting..." : "Initiate Refund"}
          </Button>
          {refundError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{refundError}</p>}
          {refundStatus && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{refundStatus}</p>}
        </Card>
      )}
      {refundMode === "RESUME" && (
        <Card className="max-w-md">
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Refund pending. This is not a new refund - it resumes the same logical refund attempt already in flight, using its existing
            persisted reason and idempotency key.
          </p>
          <p className="mt-3 text-sm text-slate-700">
            <strong>Existing reason:</strong> {order.refundReason ?? "—"} (read-only - not selectable here)
          </p>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Retry justification (required)
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Why are you manually resuming this refund submission?"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <Button variant="danger" className="mt-3" onClick={submitRefund} disabled={submitting}>
            {submitting ? "Submitting..." : "Resume Refund Submission"}
          </Button>
          {refundError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{refundError}</p>}
          {refundStatus && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{refundStatus}</p>}
        </Card>
      )}
    </WideContainer>
  );
}
