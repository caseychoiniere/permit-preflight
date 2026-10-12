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
import { GenerationPanel, PaymentWaitingPanel, RefundPanel } from "../../components/OrderStatusPanels.js";
import { CONNECTION_TROUBLE_COPY, CONFIRMING_COPY, POLL_FAILURES_BEFORE_NOTICE, confirmingPhase, interpretStatusResponse, isTerminalStatus, pollIntervalMs, type CheckoutStatus } from "./status-helpers.js";

type EmailDeliveryStatus = "EMAIL_PENDING" | "EMAIL_SENT" | "EMAIL_FAILED";

const EMAIL_STATUS_COPY: Record<EmailDeliveryStatus | "UNKNOWN", { text: string; tone: "info" | "warning" }> = {
  EMAIL_SENT: { text: "We've also emailed you a secure link so you can access this report later.", tone: "info" },
  EMAIL_PENDING: { text: "We're also emailing you a secure link so you can access this report later.", tone: "info" },
  UNKNOWN: { text: "We're also emailing you a secure link so you can access this report later.", tone: "info" },
  EMAIL_FAILED: { text: "We generated your report successfully, but weren't able to email you a copy. Bookmark this page or download the PDF below to keep access to it.", tone: "warning" },
};

type Status = CheckoutStatus;

const STATUS_COPY: Record<Status, string> = {
  AWAITING_PAYMENT: "Waiting for your payment.",
  // The wording of this state changes with how long it has lasted - see confirmingPhase; this is the first-seconds text.
  CONFIRMING_PAYMENT: CONFIRMING_COPY.CONFIRMING,
  PAYMENT_CONFIRMED: "Payment received. Your report is being generated.",
  // Shown only as a brief fallback while the report itself is being fetched, or in the rare case
  // it can't be loaded here - the report content below is the primary REPORT_READY experience now.
  REPORT_READY: "Report ready.",
  REFUND_PENDING: "We couldn't generate your report; a refund has been initiated.",
  REFUNDED: "Your refund has been completed.",
  REFUND_REQUIRES_SUPPORT: "Your refund needs manual review - please contact support.",
  EXPIRED: "This checkout session has expired.",
  RECONCILING: CONFIRMING_COPY.CONFIRMING,
  NOT_FOUND: "We couldn't find your checkout - please start checkout again.",
};

const STATUS_TONE: Record<Status, BadgeTone> = {
  AWAITING_PAYMENT: "warning",
  CONFIRMING_PAYMENT: "info",
  PAYMENT_CONFIRMED: "info",
  REPORT_READY: "success",
  REFUND_PENDING: "warning",
  REFUNDED: "neutral",
  REFUND_REQUIRES_SUPPORT: "danger",
  EXPIRED: "warning",
  RECONCILING: "info",
  NOT_FOUND: "danger",
};

type ReportFetchState = "IDLE" | "LOADING" | "NOT_FOUND" | (Report & { emailDeliveryStatus?: EmailDeliveryStatus; orderReference?: string });

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
  // The order reference the status API returns only for a failed (refund) order - the report page normally carries it, but a failed order has no report.
  const [orderRef, setOrderRef] = useState<string | undefined>(undefined);
  const [checkoutUrl, setCheckoutUrl] = useState<string | undefined>(undefined);
  // How long the order has been waiting on a payment (not yet confirmed), and how many polls in a row have failed.
  const [waitingMs, setWaitingMs] = useState(0);
  const [pollFailures, setPollFailures] = useState(0);
  const [report, setReport] = useState<ReportFetchState>("IDLE");
  // Whether the report fetch has already been kicked off - a ref, not the `report` state itself,
  // deliberately: see the bug this fixed (2026-08-28) below.
  const hasFetchedReportRef = useRef(false);

  // The status poll: a chain of timeouts (never overlapping requests), gentler the longer a non-terminal wait lasts, stopping at a terminal status. A failed poll
  // (network error, non-2xx, malformed body) is counted and retried, never treated as a status; after a few in a row the page says it is having trouble.
  const pollNowRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const startedAt = Date.now();
    let waitingSince: number | null = null;

    async function poll() {
      if (inFlight || cancelled) return;
      inFlight = true;
      let outcome: ReturnType<typeof interpretStatusResponse> = { kind: "FAILURE" };
      try {
        const res = await fetch("/api/checkout/status", { cache: "no-store" });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        outcome = interpretStatusResponse(res.ok, body);
      } catch {
        outcome = { kind: "FAILURE" };
      }
      inFlight = false;
      if (cancelled) return;
      if (outcome.kind === "FAILURE") {
        setPollFailures((n) => n + 1);
      } else {
        const { view } = outcome;
        setPollFailures(0);
        setStatus(view.status);
        setOrderRef(view.orderReference);
        setCheckoutUrl(view.checkoutUrl);
        const waiting = view.status === "CONFIRMING_PAYMENT" || view.status === "RECONCILING" || view.status === "AWAITING_PAYMENT";
        if (waiting) {
          waitingSince ??= Date.now();
          setWaitingMs(Date.now() - waitingSince);
        } else {
          waitingSince = null;
          setWaitingMs(0);
        }
        if (isTerminalStatus(view.status)) return;
      }
      timer = setTimeout(() => void poll(), pollIntervalMs(Date.now() - startedAt));
    }

    pollNowRef.current = () => {
      if (timer) clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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
  const orderReference = loadedReport && "orderReference" in loadedReport ? loadedReport.orderReference : undefined;

  // The report is being built: show the generation experience from payment received until the report itself has loaded. (Failure is its own state below: the
  // animation stops and the order's existing refund recovery is explained - the customer is never asked to pay again.)
  const generating = status === "PAYMENT_CONFIRMED" || (status === "REPORT_READY" && !loadedReport && report !== "NOT_FOUND");
  // Payment not yet recorded: the report-generation animation must not appear until the payment is actually confirmed (it stays tied to PAYMENT_CONFIRMED).
  const confirming = status === "CONFIRMING_PAYMENT" || status === "RECONCILING";
  const failedAndRefunding = status === "REFUND_PENDING" || status === "REFUNDED" || status === "REFUND_REQUIRES_SUPPORT";

  return (
    <Container>
      <Card>
        <h1 className="text-lg font-semibold text-slate-900">Order Status</h1>
        <div className="mt-4 flex items-center gap-3">
          {status !== "LOADING" && <Badge tone={STATUS_TONE[status]}>{status.replace(/_/g, " ")}</Badge>}
          <p role="status" className="text-sm text-slate-600">
            {status === "LOADING" ? "Loading..." : loadedReport ? "Report ready." : confirming ? CONFIRMING_COPY[confirmingPhase(waitingMs)] : STATUS_COPY[status]}
          </p>
        </div>
        {(confirming || status === "AWAITING_PAYMENT") && (
          <PaymentWaitingPanel
            kind={status === "AWAITING_PAYMENT" ? "AWAITING_PAYMENT" : "CONFIRMING_PAYMENT"}
            takingLonger={confirming && confirmingPhase(waitingMs) === "TAKING_LONGER"}
            orderReference={orderRef}
            checkoutUrl={checkoutUrl}
            supportEmail={process.env["NEXT_PUBLIC_SUPPORT_EMAIL"]}
            onRecheck={() => pollNowRef.current()}
          />
        )}
        {pollFailures >= POLL_FAILURES_BEFORE_NOTICE && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {CONNECTION_TROUBLE_COPY}
          </p>
        )}
        {generating && <GenerationPanel ready={status === "REPORT_READY"} />}
        {failedAndRefunding && <RefundPanel status={status as "REFUND_PENDING" | "REFUNDED" | "REFUND_REQUIRES_SUPPORT"} orderReference={orderRef} supportEmail={process.env["NEXT_PUBLIC_SUPPORT_EMAIL"]} />}
      </Card>

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
          {orderReference && (
            <p className="mt-2 text-sm text-slate-500">
              Order reference: <code className="text-slate-700">{orderReference}</code>
              <br />
              Keep this if you ever want to add this purchase to a Permit Preflight account.
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
