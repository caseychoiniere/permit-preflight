import { describe, expect, it } from "vitest";
import { decideAddressResolution, decideIdentifierResolution } from "../../src/parcel-resolution/resolve.js";
import {
  adversarialFalseConfidence,
  cleanMatch,
  genuineNoMatch,
  noPinGap,
  sourceOutage,
} from "../fixtures/unit-0b-parcel-cases.js";

describe("Parcel Resolution - BR-1a/BR-2 (address input)", () => {
  it("confirms a clean match when both sources agree and reverse-validation passes", () => {
    const result = decideAddressResolution(cleanMatch.input, cleanMatch.outcome);
    expect(result.status).toBe("CONFIRMED");
  });

  it("returns CLARIFICATION_REQUIRED/NO_PIN for the real Unit 0B interpolated-only case, never CONFIRMED", () => {
    const result = decideAddressResolution(noPinGap.input, noPinGap.outcome);
    expect(result.status).toBe("CLARIFICATION_REQUIRED");
    if (result.status === "CLARIFICATION_REQUIRED") {
      expect(result.clarificationReason).toBe("NO_PIN");
    }
  });

  it("returns a genuine NO_MATCH only when both sources completed and found nothing", () => {
    const result = decideAddressResolution(genuineNoMatch.input, genuineNoMatch.outcome);
    expect(result.status).toBe("NO_MATCH");
  });

  it("[hard invariant] never confirms the adversarial false-confidence case - a single high-confidence geocode result alone is never sufficient", () => {
    const result = decideAddressResolution(adversarialFalseConfidence.input, adversarialFalseConfidence.outcome);
    expect(result.status).not.toBe("CONFIRMED");
    expect(result.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("[hard invariant] a source outage produces RESOLUTION_UNAVAILABLE, never NO_MATCH", () => {
    const result = decideAddressResolution(sourceOutage.input, sourceOutage.outcome);
    expect(result.status).toBe("RESOLUTION_UNAVAILABLE");
    expect(result.status).not.toBe("NO_MATCH");
    if (result.status === "RESOLUTION_UNAVAILABLE") {
      expect(result.unavailabilityDetail.failedSource).toBeTruthy();
    }
  });

  it("[hard invariant] material disagreement between sources is never resolved by majority vote - CONFLICTING_SOURCES wins over any vote count", () => {
    const result = decideAddressResolution("100 Test St", {
      geocode: { outcome: "SUCCESS", data: { candidates: [{ parcelId: "AAA", canonicalAddress: "100 Test St", source: "ADDRESS_GEOCODE", characteristics: {} }], approximateOnly: false } },
      independentLookup: { outcome: "SUCCESS", data: [{ parcelId: "BBB", canonicalAddress: "100 Test St", source: "INDEPENDENT_PARCEL_LOOKUP", characteristics: {} }] },
    });
    expect(result.status).toBe("CLARIFICATION_REQUIRED");
    if (result.status === "CLARIFICATION_REQUIRED") {
      expect(result.clarificationReason).toBe("CONFLICTING_SOURCES");
    }
  });
});

describe("Parcel Resolution - BR-1b/BR-2 (identifier input)", () => {
  it("confirms a vacant/addressless parcel via identifier without requiring a canonical address", () => {
    const result = decideIdentifierResolution({
      lookup: { outcome: "SUCCESS", data: [{ parcelId: "9830200356", source: "IDENTIFIER_LOOKUP", characteristics: { vacant: true, addressless: true } }] },
      corroboration: "NOT_AVAILABLE",
    });
    // Per BR-1b, when no second path exists corroboration is NOT_AVAILABLE -> CLARIFICATION_REQUIRED,
    // not an automatic CONFIRMED - an identifier is never treated as self-confirming.
    expect(result.status).toBe("CLARIFICATION_REQUIRED");
    if (result.status === "CLARIFICATION_REQUIRED") {
      expect(result.clarificationReason).toBe("INSUFFICIENT_CORROBORATION");
    }
  });

  it("confirms when independent corroboration agrees on the same addressless parcel", () => {
    const candidate = { parcelId: "9830200356", source: "IDENTIFIER_LOOKUP" as const, characteristics: { vacant: true, addressless: true } };
    const result = decideIdentifierResolution({
      lookup: { outcome: "SUCCESS", data: [candidate] },
      corroboration: { outcome: "SUCCESS", data: [candidate] },
    });
    expect(result.status).toBe("CONFIRMED");
  });

  it("[hard invariant] an identifier is never self-confirming merely because it looks precise", () => {
    const result = decideIdentifierResolution({
      lookup: { outcome: "SUCCESS", data: [{ parcelId: "0000000001", source: "IDENTIFIER_LOOKUP", characteristics: {} }] },
      corroboration: "NOT_AVAILABLE",
    });
    expect(result.status).not.toBe("CONFIRMED");
  });

  it("[hard invariant] identifier-path source failure produces RESOLUTION_UNAVAILABLE, never NO_MATCH", () => {
    const result = decideIdentifierResolution({
      lookup: { outcome: "EXHAUSTED", attempts: 3, lastError: new Error("timeout") },
      corroboration: "NOT_AVAILABLE",
    });
    expect(result.status).toBe("RESOLUTION_UNAVAILABLE");
  });
});
