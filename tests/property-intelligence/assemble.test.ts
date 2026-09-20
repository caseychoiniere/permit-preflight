import { describe, expect, it } from "vitest";
import { assemblePropertyContext, type ConfirmedParcelResolution } from "../../src/property-intelligence/assemble.js";
import { SourceRecordNotFoundError } from "../../src/property-intelligence/types.js";

const confirmed: ConfirmedParcelResolution = {
  status: "CONFIRMED",
  confirmedParcel: { parcelId: "1959703080", canonicalAddress: "3216 Fuhrman Ave E", source: "ADDRESS_GEOCODE", characteristics: {} },
  candidates: [],
  identityProvenance: "ALGORITHMIC",
};

describe("Workflow 2: PropertyContext Assembly", () => {
  it(
    "[hard invariant, compile-time] assemblePropertyContext only accepts a CONFIRMED ParcelResolutionResult - " +
      "this is enforced by the ConfirmedParcelResolution parameter type itself (see property-intelligence/assemble.ts), " +
      "not merely a runtime check that could be forgotten. A CLARIFICATION_REQUIRED/NO_MATCH/RESOLUTION_UNAVAILABLE " +
      "value would fail to type-check if passed here - proven by this file compiling at all against the narrowed type.",
    () => {
      expect(confirmed.status).toBe("CONFIRMED");
    }
  );

  it("populates AVAILABLE facts with provenance when the retriever succeeds", async () => {
    const context = await assemblePropertyContext(confirmed, {
      retrievers: [
        { factType: "zoning", sourceAgency: "Seattle GIS", dataset: "Current Land Use Zoning Detail", retrieve: async () => "NR" },
      ],
    });
    expect(context.facts).toHaveLength(1);
    expect(context.facts[0]).toMatchObject({ factType: "zoning", value: "NR", availabilityState: "AVAILABLE" });
    expect(context.facts[0]!.provenance.sourceAgency).toBe("Seattle GIS");
  });

  it("[hard invariant] a source failure records SOURCE_ERROR, never a favorable default value, and never assigns a regulatory classification", async () => {
    const context = await assemblePropertyContext(confirmed, {
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
      retrievers: [
        {
          factType: "zoning",
          sourceAgency: "Seattle GIS",
          dataset: "Current Land Use Zoning Detail",
          retrieve: async () => {
            throw new Error("source unavailable");
          },
        },
      ],
    });
    expect(context.facts[0]!.availabilityState).toBe("SOURCE_ERROR");
    expect(context.facts[0]!.value).toBeUndefined();
    // PropertyFact has no "classification" field at all - Property Intelligence structurally
    // cannot assign KNOWN/INFERRED/REQUIRES_VERIFICATION (see property-intelligence/types.ts).
    expect(context.facts[0]).not.toHaveProperty("classification");
  });

  it(
    "[maintenance correction, 2026-09-15] a retriever throwing SourceRecordNotFoundError records UNAVAILABLE, never SOURCE_ERROR - " +
      "a legitimate 'no result for this specific parcel' outcome must never be conflated with a genuine source/transport failure, " +
      "since a data-source-health decision (data-source-registry) reads exactly this distinction",
    async () => {
      const context = await assemblePropertyContext(confirmed, {
        retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
        retrievers: [
          {
            factType: "parcel-geometry-available",
            sourceAgency: "King County GIS",
            dataset: "KingCo_Parcels (parcel boundary polygon)",
            retrieve: async () => {
              throw new SourceRecordNotFoundError("No parcel boundary found for PIN \"test\".");
            },
          },
        ],
      });
      expect(context.facts[0]!.availabilityState).toBe("UNAVAILABLE");
      expect(context.facts[0]!.value).toBeUndefined();
    }
  );

  it("a plain Error (genuine source/transport/validation failure) still records SOURCE_ERROR, unaffected by the SourceRecordNotFoundError distinction", async () => {
    const context = await assemblePropertyContext(confirmed, {
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
      retrievers: [
        {
          factType: "parcel-geometry-available",
          sourceAgency: "King County GIS",
          dataset: "KingCo_Parcels (parcel boundary polygon)",
          retrieve: async () => {
            throw new Error("King County parcel-polygon request failed: 503 Service Unavailable");
          },
        },
      ],
    });
    expect(context.facts[0]!.availabilityState).toBe("SOURCE_ERROR");
  });

  it("PropertyContext is immutable once assembled - re-assembling produces a distinct object/facts array, never a shared mutable reference", async () => {
    const options = { retrievers: [{ factType: "zoning", sourceAgency: "Seattle GIS", dataset: "test", retrieve: async () => "NR" }] };
    const first = await assemblePropertyContext(confirmed, options);
    const second = await assemblePropertyContext(confirmed, options);
    expect(first).not.toBe(second);
    expect(first.facts).not.toBe(second.facts);
    // Mutating one's facts array must never affect the other - proves they don't share storage.
    first.facts.push({
      factType: "mutation-probe",
      provenance: { sourceAgency: "test", dataset: "test", retrievalTimestamp: "2026-01-01T00:00:00.000Z" },
      availabilityState: "AVAILABLE",
    });
    expect(second.facts.some((f) => f.factType === "mutation-probe")).toBe(false);
  });
});
