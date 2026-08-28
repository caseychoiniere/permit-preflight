/**
 * Checkout & Fulfillment Service - Unit 2B's thin coordination layer (business-logic-model.md
 * Workflow 2/3/4). Owns no persisted state of its own; every mutation happens through
 * order-payment, report-access, or report-generation-job's existing repositories.
 */

/** BR-U2B-12: server-determined, immutable per Order once set. $9.99 is the founder-approved
 * current Permit Preflight report price (corrected 2026-08-25 - an earlier $49.00 placeholder was
 * never a real pricing decision). Overridable via REPORT_PRICE_CENTS so a future price change
 * needs no code change - but the override is validated and FAILS CLOSED (throws) on anything that
 * isn't a clean positive integer string, rather than silently falling back to this default or to
 * some other unintended amount. Never sourced from client input. */
export const DEFAULT_REPORT_PRICE_CENTS = 999;
export const DEFAULT_REPORT_CURRENCY = "usd";

export function getReportPrice(): { priceCents: number; currency: string } {
  const priceCentsEnv = process.env["REPORT_PRICE_CENTS"];
  let priceCents = DEFAULT_REPORT_PRICE_CENTS;
  if (priceCentsEnv !== undefined) {
    // A strict digits-only match - Number()/parseInt() would silently accept "999abc" (parseInt
    // truncates trailing garbage) or " 999 "/"9.99e2" (Number coerces surprisingly) as valid,
    // which is exactly the "silently falls back to an unintended amount" failure mode this must
    // avoid. Anything that doesn't match is a misconfiguration and must throw, not degrade.
    if (!/^[1-9][0-9]*$/.test(priceCentsEnv)) {
      throw new Error(`REPORT_PRICE_CENTS must be a positive integer string (e.g. "999"); got "${priceCentsEnv}".`);
    }
    priceCents = Number(priceCentsEnv);
  }
  const currency = process.env["REPORT_CURRENCY"]?.toLowerCase() || DEFAULT_REPORT_CURRENCY;
  return { priceCents, currency };
}
