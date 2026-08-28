"use client";

/** AdminOrderDetail + RefundActionForm (ADM-5/ADM-6, frontend-components.md). The refund reason
 * is a closed CUSTOMER_REQUEST/GOODWILL choice, never a raw text dropdown - and is kept
 * structurally separate from the required free-text justification (2026-08-25 correction). */

import { use, useState } from "react";
import type { AdminOrderView } from "../../../../src/order-payment/admin-view.js";
import { RefundReason } from "../../../../src/order-payment/types.js";
import type { AccessCredentialSummary } from "../../../../src/report-access/repository.js";

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
    return <div style={{ padding: 24 }}>Loading...</div>;
  }
  if (notFound || !order) {
    return (
      <div style={{ padding: 24 }}>
        <p>Order not found.</p>
      </div>
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
    <div style={{ padding: 24, maxWidth: 960 }}>
      <p>
        <a href="/admin/orders">&larr; Order search</a>
      </p>
      <h1>Order {order.id}</h1>
      <table style={{ borderCollapse: "collapse", marginBottom: 24 }}>
        <tbody>
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>State</td>
            <td style={{ padding: 4 }}>{order.state}</td>
          </tr>
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>Price</td>
            <td style={{ padding: 4 }}>
              {(order.priceCents / 100).toFixed(2)} {order.currency.toUpperCase()}
            </td>
          </tr>
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>Customer Email</td>
            <td style={{ padding: 4 }}>{order.customerEmail ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>Paid At</td>
            <td style={{ padding: 4 }}>{order.paidAt ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>Refund Reason</td>
            <td style={{ padding: 4 }}>{order.refundReason ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>Refund Confirmed At</td>
            <td style={{ padding: 4 }}>{order.refundConfirmedAt ?? "—"}</td>
          </tr>
        </tbody>
      </table>

      <h2>Report Generation Jobs</h2>
      {jobs.length === 0 && <p>None.</p>}
      {jobs.map((job) => (
        <div key={job.id} style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}>
          <p>
            Job {job.id} - {job.state}
          </p>
          {job.evidenceReportArtifactId && (
            <p>
              <a href={`/api/admin/reports/${job.evidenceReportArtifactId}/provenance`}>View provenance (JSON)</a>
            </p>
          )}
          {job.accessCredentials.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: 4, textAlign: "left" }}>Active</th>
                    <th style={{ padding: 4, textAlign: "left" }}>Created</th>
                    <th style={{ padding: 4, textAlign: "left" }}>Revoked</th>
                    <th style={{ padding: 4, textAlign: "left" }}>Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {job.accessCredentials.map((c, i) => (
                    <tr key={i}>
                      <td style={{ padding: 4 }}>{c.active ? "yes" : "no"}</td>
                      <td style={{ padding: 4 }}>{c.createdAt}</td>
                      <td style={{ padding: 4 }}>{c.revokedAt ?? "—"}</td>
                      <td style={{ padding: 4 }}>{c.deliveryStatus ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <h2>Refund</h2>
      {refundMode === "NONE" && (
        <p style={{ color: "#555" }}>
          No refund command is available in state {order.state}
          {order.state === "REFUND_FAILED" ? " - manual/support resolution only, never automatically reopened here." : "."}
        </p>
      )}
      {refundMode === "NEW" && (
        <div style={{ maxWidth: 480 }}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Reason
            <select value={refundReason} onChange={(e) => setRefundReason(e.target.value as RefundReason)} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}>
              <option value={RefundReason.CUSTOMER_REQUEST}>Customer request</option>
              <option value={RefundReason.GOODWILL}>Goodwill</option>
            </select>
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Justification (required)
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <button onClick={submitRefund} disabled={submitting}>
            {submitting ? "Submitting..." : "Initiate Refund"}
          </button>
          {refundError && <p style={{ color: "#a00" }}>{refundError}</p>}
          {refundStatus && <p style={{ color: "#070" }}>{refundStatus}</p>}
        </div>
      )}
      {refundMode === "RESUME" && (
        <div style={{ maxWidth: 480 }}>
          <p style={{ color: "#a60", border: "1px solid #a60", padding: 8 }}>
            Refund pending. This is not a new refund - it resumes the same logical refund attempt already in flight, using its existing
            persisted reason and idempotency key.
          </p>
          <p>
            <strong>Existing reason:</strong> {order.refundReason ?? "—"} (read-only - not selectable here)
          </p>
          <label style={{ display: "block", marginBottom: 8 }}>
            Retry justification (required)
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
              placeholder="Why are you manually resuming this refund submission?"
            />
          </label>
          <button onClick={submitRefund} disabled={submitting}>
            {submitting ? "Submitting..." : "Resume Refund Submission"}
          </button>
          {refundError && <p style={{ color: "#a00" }}>{refundError}</p>}
          {refundStatus && <p style={{ color: "#070" }}>{refundStatus}</p>}
        </div>
      )}
    </div>
  );
}
