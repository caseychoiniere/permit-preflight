/**
 * Deterministic (pure, no network/DB) tests for classifyExistingStructures/findPrimaryDwelling -
 * building intelligence v1's classification step. Proves classification is driven ENTIRELY by the
 * user's own explicit selection, never by footprint size/count/order ("largest building wins" is
 * explicitly excluded), and that a stale/mismatched selection resolves safely to UNKNOWN rather
 * than being guessed at.
 */

import { describe, expect, it } from "vitest";
import { classifyExistingStructures, findPrimaryDwelling, StructureClassification, ClassificationBasis, type RawBuildingFootprint } from "../../src/property-intelligence/existing-structures.js";
import type { Polygon } from "../../src/spatial-analysis/types.js";
import type { Provenance } from "../../src/property-intelligence/types.js";

const footprint = (x: number): Polygon => ({ units: "FEET", srid: 2926, points: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }] });

const provenance: Provenance = { sourceAgency: "City of Seattle Enterprise GIS", dataset: "Building_Outlines_2023", retrievalTimestamp: "2026-08-29T00:00:00.000Z" };

const smallHouse: RawBuildingFootprint = { outlineId: "1", parcelPin: "123", footprint: footprint(0), areaSqFt: 900 };
const bigGarage: RawBuildingFootprint = { outlineId: "2", parcelPin: "123", footprint: footprint(100), areaSqFt: 5000 }; // deliberately LARGER than the house

describe("classifyExistingStructures", () => {
  it("[hard invariant] the user-selected outlineId becomes PRIMARY_DWELLING/USER_CONFIRMED regardless of relative footprint size - never 'largest building wins'", () => {
    const structures = classifyExistingStructures([smallHouse, bigGarage], provenance, { status: "SELECTED", outlineId: "1" });
    const small = structures.find((s) => s.outlineId === "1")!;
    const big = structures.find((s) => s.outlineId === "2")!;
    expect(small.classification).toBe(StructureClassification.PRIMARY_DWELLING);
    expect(small.classificationBasis).toBe(ClassificationBasis.USER_CONFIRMED);
    expect(big.classification).toBe(StructureClassification.UNKNOWN);
    expect(big.classificationBasis).toBeUndefined();
  });

  it("resolves every footprint to UNKNOWN when the user explicitly could not identify one", () => {
    const structures = classifyExistingStructures([smallHouse, bigGarage], provenance, { status: "UNKNOWN" });
    expect(structures.every((s) => s.classification === StructureClassification.UNKNOWN)).toBe(true);
    expect(structures.every((s) => s.classificationBasis === undefined)).toBe(true);
  });

  it("resolves every footprint to UNKNOWN when no selection was ever made (undefined)", () => {
    const structures = classifyExistingStructures([smallHouse, bigGarage], provenance, undefined);
    expect(structures.every((s) => s.classification === StructureClassification.UNKNOWN)).toBe(true);
  });

  it("[hard invariant] a stale/mismatched selection (outlineId no longer present in this fetch) resolves to UNKNOWN for every footprint - never guessed or silently re-mapped", () => {
    const structures = classifyExistingStructures([smallHouse, bigGarage], provenance, { status: "SELECTED", outlineId: "does-not-exist" });
    expect(structures.every((s) => s.classification === StructureClassification.UNKNOWN)).toBe(true);
  });

  it("returns an empty array for zero footprints, regardless of selection", () => {
    expect(classifyExistingStructures([], provenance, { status: "SELECTED", outlineId: "1" })).toEqual([]);
  });

  it("[hard invariant] geometry provenance (City of Seattle) and classification basis (USER_CONFIRMED) stay structurally distinct - the geometry source is never represented as having identified the dwelling", () => {
    const [structure] = classifyExistingStructures([smallHouse], provenance, { status: "SELECTED", outlineId: "1" });
    expect(structure!.geometryProvenance.sourceAgency).toBe("City of Seattle Enterprise GIS");
    expect(structure!.classificationBasis).toBe("USER_CONFIRMED");
    // Never the same field, never conflated into one value.
    expect(structure!.geometryProvenance.sourceAgency).not.toBe(structure!.classificationBasis);
  });
});

describe("findPrimaryDwelling", () => {
  it("returns the classified PRIMARY_DWELLING structure when one exists", () => {
    const structures = classifyExistingStructures([smallHouse, bigGarage], provenance, { status: "SELECTED", outlineId: "1" });
    expect(findPrimaryDwelling(structures)?.outlineId).toBe("1");
  });

  it("returns undefined when no structure was classified PRIMARY_DWELLING", () => {
    const structures = classifyExistingStructures([smallHouse, bigGarage], provenance, { status: "UNKNOWN" });
    expect(findPrimaryDwelling(structures)).toBeUndefined();
  });
});
