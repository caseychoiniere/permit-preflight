/**
 * The post-checkout status page's pure logic: strict interpretation of a poll response, the bounded "confirming" recovery wording, polling cadence and
 * termination, and the rendering of the payment-waiting panels. A broken response must be a poll FAILURE (counted, retried, surfaced), never a status.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AWAITING_PAYMENT_COPY,
  CHECKOUT_STATUSES,
  CONFIRMING_COPY,
  CONNECTION_TROUBLE_COPY,
  CONFIRMING_NOTICE_AFTER_MS,
  POLL_FAST_MS,
  POLL_SLOW_MS,
  SLOW_POLL_AFTER_MS,
  confirmingPhase,
  interpretStatusResponse,
  isStripeCheckoutUrl,
  isTerminalStatus,
  pollIntervalMs,
} from "../../app/checkout/status/status-helpers.js";
import { PaymentWaitingPanel } from "../../app/components/OrderStatusPanels.js";
import { GuestOrderStatus } from "../../src/order-payment/types.js";

describe("interpretStatusResponse", () => {
  it("accepts exactly the documented statuses, and the client list is the server enum", () => {
    expect([...CHECKOUT_STATUSES].sort()).toEqual(Object.values(GuestOrderStatus).sort());
    for (const status of CHECKOUT_STATUSES) expect(interpretStatusResponse(true, { status })).toEqual({ kind: "STATUS", view: { status } });
  });
  it("a non-2xx response is a failure whatever its body says (a 503 body with a status field must not be believed)", () => {
    expect(interpretStatusResponse(false, { status: "REPORT_READY" })).toEqual({ kind: "FAILURE" });
    expect(interpretStatusResponse(false, null)).toEqual({ kind: "FAILURE" });
  });
  it("null, array, string, missing or unknown status are failures, never statuses", () => {
    for (const body of [null, undefined, [], "PAYMENT_CONFIRMED", {}, { status: 3 }, { status: "PENDING" }, { status: "paid" }, { error: "x" }]) expect(interpretStatusResponse(true, body)).toEqual({ kind: "FAILURE" });
  });
  it("carries the order reference when present, and the checkout URL only for AWAITING_PAYMENT and only when it is Stripe's hosted page", () => {
    const url = "https://checkout.stripe.com/c/pay/cs_test_abc#frag";
    expect(interpretStatusResponse(true, { status: "AWAITING_PAYMENT", orderReference: "o-1", checkoutUrl: url })).toEqual({ kind: "STATUS", view: { status: "AWAITING_PAYMENT", orderReference: "o-1", checkoutUrl: url } });
    expect(interpretStatusResponse(true, { status: "CONFIRMING_PAYMENT", checkoutUrl: url })).toEqual({ kind: "STATUS", view: { status: "CONFIRMING_PAYMENT" } });
    for (const bad of ["http://checkout.stripe.com/x", "https://checkout.stripe.com.evil.example/x", "https://evil.example/checkout.stripe.com", "javascript:alert(1)", "", 5, null]) {
      expect(isStripeCheckoutUrl(bad), String(bad)).toBe(false);
      expect(interpretStatusResponse(true, { status: "AWAITING_PAYMENT", checkoutUrl: bad })).toEqual({ kind: "STATUS", view: { status: "AWAITING_PAYMENT" } });
    }
  });
});

describe("bounded recovery", () => {
  it("only terminal statuses stop polling; every payment-waiting and generating status keeps polling", () => {
    for (const s of ["AWAITING_PAYMENT", "CONFIRMING_PAYMENT", "PAYMENT_CONFIRMED", "RECONCILING", "REFUND_PENDING"] as const) expect(isTerminalStatus(s), s).toBe(false);
    for (const s of ["REPORT_READY", "REFUNDED", "REFUND_REQUIRES_SUPPORT", "EXPIRED", "NOT_FOUND"] as const) expect(isTerminalStatus(s), s).toBe(true);
  });
  it("polling gets gentler after a long wait but never stops", () => {
    expect(pollIntervalMs(0)).toBe(POLL_FAST_MS);
    expect(pollIntervalMs(SLOW_POLL_AFTER_MS - 1)).toBe(POLL_FAST_MS);
    expect(pollIntervalMs(SLOW_POLL_AFTER_MS)).toBe(POLL_SLOW_MS);
    expect(pollIntervalMs(60 * 60 * 1000)).toBe(POLL_SLOW_MS);
  });
  it("a payment that stays unconfirmed switches to the honest 'still confirming' wording, which never asks for another payment", () => {
    expect(confirmingPhase(0)).toBe("CONFIRMING");
    expect(confirmingPhase(CONFIRMING_NOTICE_AFTER_MS - 1)).toBe("CONFIRMING");
    expect(confirmingPhase(CONFIRMING_NOTICE_AFTER_MS)).toBe("TAKING_LONGER");
    expect(CONFIRMING_COPY.TAKING_LONGER).toMatch(/still confirming the payment with Stripe/);
    expect(CONFIRMING_COPY.TAKING_LONGER).toMatch(/no need to pay again/);
    // No absolute charging guarantee, and never an instruction to restart or pay.
    for (const t of [...Object.values(CONFIRMING_COPY), CONNECTION_TROUBLE_COPY]) expect(t).not.toMatch(/won't be charged|will not be charged|start over|start again|refresh/i);
    for (const t of Object.values(CONFIRMING_COPY)) expect(t).not.toMatch(/please pay|try paying/i);
  });
});

describe("payment-waiting panels", () => {
  const html = (props: Partial<Parameters<typeof PaymentWaitingPanel>[0]>) =>
    renderToStaticMarkup(createElement(PaymentWaitingPanel, { kind: "CONFIRMING_PAYMENT", takingLonger: false, onRecheck: () => undefined, ...props })).replace(/&#x27;|&#39;/g, "'");
  it("an unpaid session says no charge was made and links to the SAME Stripe checkout; with no URL it offers to start again", () => {
    const m = html({ kind: "AWAITING_PAYMENT", orderReference: "ord-123", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_abc" });
    expect(m).toContain(AWAITING_PAYMENT_COPY.headline);
    expect(m).toContain("No charge has been made");
    expect(m).toContain('href="https://checkout.stripe.com/c/pay/cs_test_abc"');
    expect(m).toContain("ord-123");
    expect(m).not.toMatch(/confirming/i);
  });
  it("an unpaid session with no validated resume link never offers a new payment path: no /configure, no Stripe link; a re-check, the reference and (when configured) support instead", () => {
    const m = html({ kind: "AWAITING_PAYMENT", orderReference: "ord-789", supportEmail: "help@example.com" });
    expect(m).toContain("couldn't reopen your checkout");
    expect(m).toContain("Check again");
    expect(m).toContain("ord-789");
    expect(m).toContain("mailto:help@example.com");
    expect(m).not.toMatch(/\/configure|checkout\.stripe\.com|Start again/);
    expect(html({ kind: "AWAITING_PAYMENT" })).not.toMatch(/mailto:|\/configure/);
  });
  it("while a payment is first being confirmed there is no extra panel and no generation animation", () => {
    const m = html({ takingLonger: false });
    expect(m).toBe("");
  });
  it("a long confirmation keeps the order reference, offers a re-check, never asks for a new payment, and still shows no report-generation scene", () => {
    const m = html({ takingLonger: true, orderReference: "ord-456" });
    expect(m).toContain("ord-456");
    expect(m).toContain("Check again");
    expect(m).toContain("won't be asked to pay again for this order");
    expect(m).not.toMatch(/is safe|won't be charged/);
    expect(m).not.toMatch(/pp-scan|pp-check|href=/);
  });
});
