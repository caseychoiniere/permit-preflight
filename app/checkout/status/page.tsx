"use client";

/**
 * Workflow 4 (business-logic-model.md): a pure status VIEW, no new authoritative source of truth.
 * Reaching this page (via the Stripe redirect) is never treated as proof of purchase - the status
 * shown always comes from a fresh poll of GET /api/checkout/status (Pattern 4), never from the
 * redirect itself (BR-U2B-2). Corrected 2026-08-25: no `session_id` in this page's own URL -
 * GET /api/checkout/status reads the Stripe Checkout Session ID from an HttpOnly cookie set by
 * POST /api/checkout, never from a query string (see that route's docstring).
 */

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 3000;

type Status =
  | "PENDING"
  | "PAYMENT_CONFIRMED"
  | "REPORT_READY"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "REFUND_REQUIRES_SUPPORT"
  | "EXPIRED"
  | "RECONCILING"
  | "NOT_FOUND";

const STATUS_COPY: Record<Status, string> = {
  PENDING: "Confirming your payment...",
  PAYMENT_CONFIRMED: "Payment received. Your report is being generated.",
  REPORT_READY: "Your report is ready - check your email for the secure link.",
  REFUND_PENDING: "We couldn't generate your report; a refund has been initiated.",
  REFUNDED: "Your refund has been completed.",
  REFUND_REQUIRES_SUPPORT: "Your refund needs manual review - please contact support.",
  EXPIRED: "This checkout session has expired.",
  RECONCILING: "Confirming your payment...",
  NOT_FOUND: "We couldn't find your checkout - please start checkout again.",
};

export default function CheckoutStatusPage() {
  const [status, setStatus] = useState<Status | "LOADING">("LOADING");

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/checkout/status", { cache: "no-store" });
        const result = (await res.json()) as { status: Status };
        if (!cancelled) setStatus(result.status);
      } catch {
        // Transient network error - the next poll tick retries; never surfaces a raw error here.
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1>Permit Preflight - Order Status</h1>
      <p role="status">{status === "LOADING" ? "Loading..." : STATUS_COPY[status]}</p>
    </main>
  );
}
