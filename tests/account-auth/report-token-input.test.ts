/**
 * normalizeReportTokenInput - Unit 6 Code Generation Part 2 review, correction 2. Deterministic:
 * the helper is pure (no DB, no network, no logging). Covers exactly the six shapes the founder's
 * review enumerated: raw token, full report URL, percent-encoded token, malformed URL, URL with
 * no access_token fragment, unrelated URL.
 */

import { describe, expect, it } from "vitest";
import { normalizeReportTokenInput } from "../../src/account-auth/report-token-input.js";

// A realistic base64url token shape (32 random bytes -> 43 chars, alphabet A-Za-z0-9-_).
const RAW_TOKEN = "Xy9_Az-01BcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";

describe("normalizeReportTokenInput (Unit 6 correction 2 - 'link OR token' must actually accept both)", () => {
  it("returns a bare raw token unchanged (just trimmed)", () => {
    expect(normalizeReportTokenInput(RAW_TOKEN)).toBe(RAW_TOKEN);
    expect(normalizeReportTokenInput(`   ${RAW_TOKEN}   `)).toBe(RAW_TOKEN);
  });

  it("extracts the token from a full Permit Preflight report-access link (the exact shape the guest email issues)", () => {
    const url = `https://permitpreflight.example/report#access_token=${RAW_TOKEN}`;
    expect(normalizeReportTokenInput(url)).toBe(RAW_TOKEN);
  });

  it("extracts and decodes a percent-encoded token from a report-access link", () => {
    // '-' -> %2D, '_' -> %5F: a copy/paste chain or email client may percent-encode the fragment.
    const encoded = "abc%2Ddef%5Fghi";
    const url = `https://permitpreflight.example/report#access_token=${encoded}`;
    expect(normalizeReportTokenInput(url)).toBe("abc-def_ghi");
  });

  it("[fail-closed] returns null for a malformed URL - never throws", () => {
    expect(normalizeReportTokenInput("https://")).toBeNull();
    expect(normalizeReportTokenInput("http://[not-a-real-host")).toBeNull();
  });

  it("[fail-closed] returns null for a URL with no access_token fragment (wrong link pasted)", () => {
    expect(normalizeReportTokenInput("https://permitpreflight.example/report")).toBeNull();
    expect(normalizeReportTokenInput("https://permitpreflight.example/report#something_else=1")).toBeNull();
  });

  it("[fail-closed] returns null for an unrelated URL", () => {
    expect(normalizeReportTokenInput("https://example.com/anything#access_token=")).toBeNull();
    expect(normalizeReportTokenInput("https://google.com/")).toBeNull();
  });

  it("returns null for empty / whitespace-only input", () => {
    expect(normalizeReportTokenInput("")).toBeNull();
    expect(normalizeReportTokenInput("    ")).toBeNull();
  });

  it("[hard invariant] does not treat a query-string access_token as valid - the token lives in the FRAGMENT only (that is the whole point of the transport design)", () => {
    // A query param is sent to the server; the fragment is not. Accepting a ?access_token= here
    // would quietly undermine the reason the link uses a fragment at all.
    expect(normalizeReportTokenInput(`https://permitpreflight.example/report?access_token=${RAW_TOKEN}`)).toBeNull();
  });
});
