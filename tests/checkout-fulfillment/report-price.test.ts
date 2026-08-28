/**
 * BR-U2B-12: price is always server-determined, never client-supplied. Corrected 2026-08-25 -
 * the founder-approved current price is $9.99 (999 cents), not the earlier $49.00 placeholder.
 * A misconfigured REPORT_PRICE_CENTS must fail closed (throw), never silently fall back to the
 * default or coerce a malformed string into an unintended amount.
 */

import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_REPORT_PRICE_CENTS, getReportPrice } from "../../src/checkout-fulfillment/types.js";

const ORIGINAL_PRICE_ENV = process.env["REPORT_PRICE_CENTS"];
const ORIGINAL_CURRENCY_ENV = process.env["REPORT_CURRENCY"];

afterEach(() => {
  if (ORIGINAL_PRICE_ENV === undefined) delete process.env["REPORT_PRICE_CENTS"];
  else process.env["REPORT_PRICE_CENTS"] = ORIGINAL_PRICE_ENV;
  if (ORIGINAL_CURRENCY_ENV === undefined) delete process.env["REPORT_CURRENCY"];
  else process.env["REPORT_CURRENCY"] = ORIGINAL_CURRENCY_ENV;
});

describe("getReportPrice", () => {
  it("[hard invariant] defaults to 999 cents ($9.99) - the founder-approved current price", () => {
    delete process.env["REPORT_PRICE_CENTS"];
    expect(DEFAULT_REPORT_PRICE_CENTS).toBe(999);
    expect(getReportPrice()).toEqual({ priceCents: 999, currency: "usd" });
  });

  it("a valid server-side override (REPORT_PRICE_CENTS) is honored", () => {
    process.env["REPORT_PRICE_CENTS"] = "1500";
    expect(getReportPrice().priceCents).toBe(1500);
  });

  it("REPORT_CURRENCY overrides the default currency", () => {
    process.env["REPORT_CURRENCY"] = "CAD";
    expect(getReportPrice().currency).toBe("cad");
  });

  it.each(["abc", "-100", "0", "9.99", "999abc", " 999", "999 ", "1e3", ""])(
    "[hard invariant] fails closed (throws) rather than silently falling back for invalid REPORT_PRICE_CENTS=%j",
    (invalid) => {
      process.env["REPORT_PRICE_CENTS"] = invalid;
      expect(() => getReportPrice()).toThrow();
    }
  );
});
