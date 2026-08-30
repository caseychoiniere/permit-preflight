"use client";

/**
 * Workflow 4 (business-logic-model.md): a pure status VIEW, no new authoritative source of truth.
 * Reaching this page (via the Stripe redirect) is never treated as proof of purchase - the status
 * shown always comes from a fresh poll of GET /api/checkout/status (Pattern 4), never from the
 * redirect itself (BR-U2B-2). Corrected 2026-08-25: no `session_id` in this page's own URL -
 * GET /api/checkout/status reads the Stripe Checkout Session ID from an HttpOnly cookie set by
 * POST /api/checkout, never from a query string (see that route's docstring).
 *
 * Product-correctness correction (2026-08-28, real end-to-end browser test): reaching REPORT_READY
 * previously only ever said "check your email for the secure link" - the actual report was never
 * shown here, making email delivery a hard dependency for a successful purchase to be usable at
 * all. Once status reads REPORT_READY, this now also fetches GET /api/checkout/report (the SAME
 * EvidenceReportArtifact GET /api/reports serves, via getGuestReport -> getReportById - never a
 * second report-generation/rendering path) and renders it inline with the shared ReportView
 * component, authorized by the same HttpOnly checkout-session cookie already gating the status
 * poll itself - never the emailed report-access token, which this browser has no way to have yet.
 * Email delivery remains fully in place as a SECOND, independent delivery channel (still sent by
 * the exact same handleGenerationOutcome/deliverGuestReportAccess call as before, untouched) - this
 * page just no longer requires it to have arrived, or succeeded, for the customer to see their
 * report.
 */

import { useEffect, useRef, useState } from "react";
import { Container } from "../../components/ui/Container.js";
import { Card } from "../../components/ui/Card.js";
import { Badge, type BadgeTone } from "../../components/ui/Badge.js";
import { ReportView, type Report } from "../../components/ReportView.js";

const POLL_INTERVAL_MS = 3000;

type EmailDeliveryStatus = "EMAIL_PENDING" | "EMAIL_SENT" | "EMAIL_FAILED";

const EMAIL_STATUS_COPY: Record<EmailDeliveryStatus | "UNKNOWN", { text: string; tone: "info" | "warning" }> = {
  EMAIL_SENT: { text: "We've also emailed you a secure link so you can access this report later.", tone: "info" },
  EMAIL_PENDING: { text: "We're also emailing you a secure link so you can access this report later.", tone: "info" },
  UNKNOWN: { text: "We're also emailing you a secure link so you can access this report later.", tone: "info" },
  EMAIL_FAILED: { text: "We generated your report successfully, but weren't able to email you a copy. Bookmark this page or download the PDF below to keep access to it.", tone: "warning" },
};

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
  // Shown only as a brief fallback while the report itself is being fetched, or in the rare case
  // it can't be loaded here - the report content below is the primary REPORT_READY experience now.
  REPORT_READY: "Report ready.",
  REFUND_PENDING: "We couldn't generate your report; a refund has been initiated.",
  REFUNDED: "Your refund has been completed.",
  REFUND_REQUIRES_SUPPORT: "Your refund needs manual review - please contact support.",
  EXPIRED: "This checkout session has expired.",
  RECONCILING: "Confirming your payment...",
  NOT_FOUND: "We couldn't find your checkout - please start checkout again.",
};

const STATUS_TONE: Record<Status, BadgeTone> = {
  PENDING: "info",
  PAYMENT_CONFIRMED: "info",
  REPORT_READY: "success",
  REFUND_PENDING: "warning",
  REFUNDED: "neutral",
  REFUND_REQUIRES_SUPPORT: "danger",
  EXPIRED: "warning",
  RECONCILING: "info",
  NOT_FOUND: "danger",
};

type ReportFetchState = "IDLE" | "LOADING" | "NOT_FOUND" | (Report & { emailDeliveryStatus?: EmailDeliveryStatus });

/** Requirement 6 (2026-08-28 bug report): a 200 response with an unparseable, empty, or
 * unexpectedly-shaped body must be treated the same as a real failure - explicitly, never left to
 * silently do nothing while the page stays on "Loading your report..." forever. Checked before
 * trusting anything from GET /api/checkout/report as a real Report. */
function isReportPayload(value: unknown): value is Report & { emailDeliveryStatus?: EmailDeliveryStatus } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["id"] === "string" && Array.isArray(v["findings"]) && Array.isArray(v["evidence"]) && typeof v["generatedAt"] === "string";
}

export default function CheckoutStatusPage() {
  const [status, setStatus] = useState<Status | "LOADING">("LOADING");
  const [report, setReport] = useState<ReportFetchState>("IDLE");
  // Whether the report fetch has already been kicked off - a ref, not the `report` state itself,
  // deliberately: see the bug this fixed (2026-08-28) below.
  const hasFetchedReportRef = useRef(false);

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

  // Fetches the actual report exactly once, the moment status first reads REPORT_READY - never
  // re-fetches on every subsequent status poll tick. Deliberately independent of email delivery:
  // this succeeds or fails purely on whether the report itself is ready, per GET /api/checkout/
  // report's own authorization (the checkout-session cookie, not the emailed token).
  //
  // Root-caused a real bug here (2026-08-28, real browser test): this effect's dependency array
  // used to include `report`, and its own body called setReport("LOADING") synchronously - which
  // changes `report`, which is a dependency, so React tears the effect down (running its cleanup,
  // which sets this closure's own `cancelled = true`) and immediately re-runs it on the very next
  // render. The re-run's own guard correctly no-ops (report is now "LOADING", not "IDLE") - but
  // the ORIGINAL fetch's `.then` callback had already captured that now-poisoned `cancelled` flag,
  // so when the real network response actually arrived, `if (cancelled) return;` silently dropped
  // it. setReport(...) never fired, and the page stayed on "Loading your report..." forever,
  // regardless of what GET /api/checkout/report actually returned - explaining why the response
  // itself looked fine in isolation while the page never moved past loading. Fixed by tracking
  // "has a fetch already been started" in a ref instead of via `report` state, and dropping
  // `report` from the dependency array entirely - this effect now only ever re-runs when `status`
  // itself changes value, which happens exactly once (LOADING -> ... -> REPORT_READY).
  useEffect(() => {
    if (status !== "REPORT_READY" || hasFetchedReportRef.current) return;
    hasFetchedReportRef.current = true;
    let cancelled = false;
    setReport("LOADING");
    fetch("/api/checkout/report", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setReport("NOT_FOUND");
          return;
        }
        let parsed: unknown;
        try {
          parsed = await res.json();
        } catch {
          // A 200 with an empty or non-JSON body - requirement 6: never leave the page stuck on
          // "Loading your report..." because of this, treat it the same as NOT_FOUND.
          setReport("NOT_FOUND");
          return;
        }
        if (!isReportPayload(parsed)) {
          setReport("NOT_FOUND");
          return;
        }
        setReport(parsed);
      })
      .catch(() => {
        if (!cancelled) setReport("NOT_FOUND");
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const loadedReport = typeof report === "object" ? report : null;
  const emailStatusCopy = loadedReport ? EMAIL_STATUS_COPY[loadedReport.emailDeliveryStatus ?? "UNKNOWN"] : null;

  return (
    <Container>
      <Card>
        <h1 className="text-lg font-semibold text-slate-900">Order Status</h1>
        <div className="mt-4 flex items-center gap-3">
          {status !== "LOADING" && <Badge tone={STATUS_TONE[status]}>{status.replace(/_/g, " ")}</Badge>}
          <p role="status" className="text-sm text-slate-600">
            {status === "LOADING" ? "Loading..." : loadedReport ? "Report ready." : STATUS_COPY[status]}
          </p>
        </div>
      </Card>

      {status === "REPORT_READY" && (report === "LOADING" || report === "IDLE") && (
        <p className="mt-4 text-sm text-slate-500">Loading your report...</p>
      )}

      {status === "REPORT_READY" && report === "NOT_FOUND" && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your report is ready, but we couldn&apos;t load it here right now. Check your email for the secure link, or refresh this page.
        </p>
      )}

      {loadedReport && (
        <>
          {emailStatusCopy && (
            <p
              className={
                emailStatusCopy.tone === "warning"
                  ? "mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  : "mt-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800"
              }
            >
              {emailStatusCopy.text}
            </p>
          )}
          <div className="mt-6">
            <ReportView report={loadedReport} pdfHref="/api/checkout/report/pdf" />
          </div>
        </>
      )}
    </Container>
  );
}
