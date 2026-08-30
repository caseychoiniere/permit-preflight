/**
 * Deterministic (no real network) tests for generateReportExplanation - the product-correctness
 * correction (2026-08-28) that made "construct the real Anthropic client, call explainFindings,
 * return only the serializable ExplanationResult" one self-contained operation, and added the
 * diagnostic logging that was previously missing entirely (see anthropic-wiring.ts's own
 * docstring for why that gap mattered). The real live-Anthropic happy path is covered separately
 * in report-explanation/research-explanation.integration.test.ts (gated on a real
 * ANTHROPIC_API_KEY, never run here) - this file only ever fakes fetch, never calls the real API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateReportExplanation } from "../../src/report-explanation/anthropic-wiring.js";
import type { Finding } from "../../src/regulatory-rules-engine/types.js";
import { logger } from "../../src/shared/logger.js";

const sampleFindings: Finding[] = [
  {
    classification: "KNOWN",
    subject: "Rear setback",
    complianceOutcome: "PASS",
    supportingEvidence: ["distanceToRearLotLineFt=10"],
    explanationBasis: "Rear setback 10ft meets the required 5ft minimum.",
  },
];

describe("generateReportExplanation (deterministic, no real network)", () => {
  let savedApiKey: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env["ANTHROPIC_API_KEY"];
  });

  afterEach(() => {
    if (savedApiKey === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = savedApiKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("[hard invariant] degrades gracefully (UNAVAILABLE, never throws) when ANTHROPIC_API_KEY is not set - never fails the caller", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const result = await generateReportExplanation(sampleFindings);
    expect(result.outcome).toBe("UNAVAILABLE");
    if (result.outcome === "UNAVAILABLE") {
      expect(result.reason).toMatch(/ANTHROPIC_API_KEY is not set/);
    }
  });

  it("logs the specific degradation reason (REPORT_EXPLANATION_DEGRADED) - the diagnostic gap this correction closes - without ever including the API key or a request header value", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const warnSpy = vi.spyOn(logger, "warn");

    await generateReportExplanation(sampleFindings);

    expect(warnSpy).toHaveBeenCalledWith("REPORT_EXPLANATION_DEGRADED", expect.objectContaining({ reason: expect.stringContaining("ANTHROPIC_API_KEY is not set") }));
    // The logged detail must never contain a raw key value, an Authorization/x-api-key header, or
    // anything that looks like a real Anthropic key (sk-ant-... format).
    const loggedDetail = JSON.stringify(warnSpy.mock.calls[0]?.[1] ?? {});
    expect(loggedDetail).not.toMatch(/sk-ant-/);
    expect(loggedDetail.toLowerCase()).not.toContain("x-api-key");
    expect(loggedDetail.toLowerCase()).not.toContain("authorization");
  });

  it("[hard invariant] with a configured client (real construction, faked network), returns AVAILABLE and never logs a degradation event", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-only-not-a-real-key";
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(
        JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ text: "Plain-language explanation.", referencedFindingIds: ["0"] }) }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fakeFetch);
    const warnSpy = vi.spyOn(logger, "warn");

    const result = await generateReportExplanation(sampleFindings);

    expect(result.outcome).toBe("AVAILABLE");
    if (result.outcome === "AVAILABLE") {
      expect(result.explanation.text).toBe("Plain-language explanation.");
    }
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    // The request itself carries the key (as it must, to authenticate to Anthropic) - confirming
    // that without asserting on it, then confirming nothing about it was EVER logged.
    const [, requestInit] = fakeFetch.mock.calls[0]!;
    expect(requestInit?.headers).toMatchObject({ "x-api-key": "sk-ant-test-only-not-a-real-key" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("degrades gracefully (UNAVAILABLE) when the configured client's request fails, without throwing or exposing the key in the logged reason", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-only-not-a-real-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429, statusText: "Too Many Requests" }))
    );
    const warnSpy = vi.spyOn(logger, "warn");

    const result = await generateReportExplanation(sampleFindings);

    expect(result.outcome).toBe("UNAVAILABLE");
    if (result.outcome === "UNAVAILABLE") {
      expect(result.reason).toMatch(/429/);
      expect(result.reason).not.toContain("sk-ant-test-only-not-a-real-key");
    }
    expect(warnSpy).toHaveBeenCalledWith("REPORT_EXPLANATION_DEGRADED", expect.objectContaining({ reason: expect.stringContaining("429") }));
  });
});
