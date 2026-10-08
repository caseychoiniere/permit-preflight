/**
 * Unit 11 ADU pipeline - live end-to-end integration (DB-gated like every other pipeline suite).
 * Real parcel 1498301270 (plain NR, 120 x 50 ft, one house, in the frequent transit service area, verified
 * 2026-10-08) and the former fixture 3298700485 (LR1). The ADU rules are inserted here as this suite's OWN
 * random-id ACTIVE copies of the real candidates (the real rows are only APPROVED) and deleted afterward.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, reportGenerationJobs, evidenceReportArtifacts, regulatoryRules } from "../../src/db/schema.js";
import type { AduAttachedConfiguration, AduConversionConfiguration, AduNewDetachedConfiguration, ExistingPropertyScreeningRequestSnapshot } from "../../src/screening-request/types.js";
import { createReportGenerationJob, claimQueuedJob } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../../src/report-generation-orchestrator/pipeline.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";
import { realAduCandidates, tierForRealAduCandidate } from "../fixtures/adu-candidates.js";
import type { AduFeasibility } from "../../src/regulatory-rules-engine/adu-types.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const NR_PIN = "1498301270";
const HOUSE_OUTLINE_ID = "1270857812";
const AFFECTED = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca", "seattle-zoning", "seattle-landmarks", "seattle-frequent-transit"];

// West = front, east = rear, north/south = sides (parcel edges: 0 north, 1 east, 2 south, 3 west).
const ROLES = { method: "USER_INDICATED" as const, status: "ASSIGNED" as const, frontEdgeRef: "edge-3", rearEdgeRef: "edge-1", sideEdgeRefs: ["edge-0", "edge-2"], multipleFrontageAnswer: "NO" as const };
const MID_BACK_YARD = { anchor: { lat: 47.586094007341046, lng: -122.3116149461082 }, orientationDeg: 0 }; // SRID-2926 (1275630, 217291)
const NEXT_TO_HOUSE = { anchor: { lat: 47.5860921325983, lng: -122.31175917659773 }, orientationDeg: 0 }; // (1275594.4, 217291): ~1 ft from the house (16 ft wide)

function adu(over: Partial<AduNewDetachedConfiguration> = {}): AduNewDetachedConfiguration {
  return {
    aduType: "DETACHED_NEW",
    widthFt: 16,
    depthFt: 20,
    stories: 1,
    bedrooms: 1,
    heightFt: 15,
    alleyAdjacent: false,
    existingPrincipalDwellingUnits: 1,
    existingAduCount: 0,
    proposedPlacement: MID_BACK_YARD,
    lotLineRoleAssignment: ROLES,
    primaryDwellingSelection: { status: "SELECTED", outlineId: HOUSE_OUTLINE_ID, method: "USER_CONFIRMED" },
    ...over,
  };
}

// Parcel 0523049029 (plain NR, verified 2026-10-08): a 1,337 sq ft house (outline 1271025447) and a 206 sq ft shed (outline 1271025446) ~6 ft apart.
const CONVERSION_PIN = "0523049029";
const HOUSE_2 = "1271025447";
const SHED_2 = "1271025446";
const CONVERSION_ROLES = { method: "USER_INDICATED" as const, status: "ASSIGNED" as const, frontEdgeRef: "edge-0", rearEdgeRef: "edge-4", sideEdgeRefs: ["edge-1", "edge-2", "edge-3", "edge-5", "edge-6"], multipleFrontageAnswer: "NO" as const };
function conversion(over: Partial<AduConversionConfiguration> = {}): AduConversionConfiguration {
  return {
    aduType: "CONVERSION_EXISTING",
    stories: 1,
    bedrooms: 1,
    alleyAdjacent: false,
    existingPrincipalDwellingUnits: 1,
    existingAduCount: 0,
    existedBeforeJuly2023: true,
    keepsFootprintAndHeight: true,
    convertedStructure: { outlineId: SHED_2, method: "USER_CONFIRMED" },
    lotLineRoleAssignment: CONVERSION_ROLES,
    primaryDwellingSelection: { status: "SELECTED", outlineId: HOUSE_2, method: "USER_CONFIRMED" },
    ...over,
  };
}

describe.skipIf(!hasDb)("ADU report generation pipeline - live end-to-end integration", () => {
  let db: Db;
  const screeningIds: string[] = [];
  const ruleIds: string[] = [];
  let healthSnapshot: DataSourceHealthSnapshot;

  beforeAll(async () => {
    db = getDb();
    healthSnapshot = await snapshotDataSourceHealth(db, AFFECTED);
    const rows = realAduCandidates.map((c) => {
      const id = randomUUID();
      ruleIds.push(id);
      return {
        id,
        subject: `ADU-PIPELINE-INTEGRATION-TEST-ONLY: ${c.subject}`,
        applicableProjectType: "adu",
        applicableWorkflowType: "EXISTING_PROPERTY",
        applicableZone: "NR",
        ruleSpecification: c.ruleSpecification,
        citation: c.citation,
        lifecycleState: "ACTIVE",
        tier: tierForRealAduCandidate(c.id),
        caveats: c.caveats,
        testCases: c.testCases,
        verificationHistory: [{ tier: "TIER_1", founderIdentity: "adu-pipeline-integration-test@example.com", founderVerifiedAt: "2026-01-01T00:00:00.000Z" }],
        isTestOnlyFixture: true,
        acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
      };
    });
    await db.insert(regulatoryRules).values(rows as never);
  });

  afterAll(async () => {
    try {
      for (const id of screeningIds) {
        await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
        await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
        await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
      }
      await db.delete(regulatoryRules).where(inArray(regulatoryRules.id, ruleIds));
    } finally {
      await restoreDataSourceHealth(db, healthSnapshot);
    }
  });

  async function generate(details: AduNewDetachedConfiguration | AduConversionConfiguration | AduAttachedConfiguration, parcelPin: string = NR_PIN) {
    const snapshot: ExistingPropertyScreeningRequestSnapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: parcelPin, projectType: "adu", projectDetails: details };
    const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType: "adu", projectDetails: details, confirmedParcelId: parcelPin, snapshot }).returning({ id: screeningRequests.id });
    screeningIds.push(row!.id);
    const authorization: GenerationAuthorization = { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "adu-pipeline.integration.test.ts", authorizedAt: new Date().toISOString() };
    const job = await createReportGenerationJob(db, row!.id, authorization);
    const claimed = await claimQueuedJob(db, job.id);
    if (!claimed) throw new Error("Failed to claim the freshly-created job.");
    await runReportGenerationPipeline(db, claimed);
    const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    const [artifact] = finished?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished.evidenceReportArtifactId)) : [];
    return { job: finished, artifact };
  }
  type F = { subject: string; classification: string; complianceOutcome?: string; explanationBasis: string };
  const feasibilityOf = (a: { evidence: unknown } | undefined) => ((a!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "adu-feasibility")!.value as AduFeasibility);

  it(
    "an ordinary placement on a verified-NR parcel: zoning KNOWN, setbacks and separation measured and PASS, size within, headline LOOKS_FEASIBLE, evidence complete",
    async () => {
      const { job, artifact } = await generate(adu());
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as F[];
      const by = (s: string) => findings.find((f) => f.subject === s);
      expect(by("Zoning applicability (Neighborhood Residential zones)")?.classification).toBe("KNOWN");
      expect(by("ADU rear setback")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(by("ADU side setback")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(by("ADU front setback")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(by("Separation from the existing dwelling")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(by("ADU size limit")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(by("Number of ADUs on the lot")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(by("Lot coverage")?.classification).toBe("REQUIRES_VERIFICATION"); // denominator unresolved by design
      expect(by("Environmentally critical areas")?.classification).toBe("REQUIRES_VERIFICATION");

      const feasibility = feasibilityOf(artifact);
      expect(feasibility.headline).toBe("LOOKS_FEASIBLE");
      expect(feasibility.blockers).toEqual([]);

      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      const types = evidence.map((e) => e.factType);
      expect(types).toEqual(expect.arrayContaining(["adu-declared-inputs", "adu-feasibility", "uncovered-constraint-types", "zoning", "frequent-transit-service-area", "landmark-designation", "environmental-constraints", "existing-structures-wgs84-display", "proposed-footprint-wgs84-display", "parcel-boundary-wgs84-display"]));
      expect(evidence.find((e) => e.factType === "uncovered-constraint-types")!.value).toEqual([]);
      expect((evidence.find((e) => e.factType === "frequent-transit-service-area")!.value as { inFrequentTransitServiceArea: boolean }).inFrequentTransitServiceArea).toBe(true);
      expect(JSON.stringify(findings)).not.toContain("adu-feasibility");
      // The real ADU rules are ACTIVE too (activated 2026-10-08), so the artifact lists them alongside this test's own copies.
      expect(artifact!.ruleVersionsUsed as string[]).toEqual(expect.arrayContaining(ruleIds));
    },
    120_000
  );

  it(
    "an ADU about 1 ft from the existing house is a KNOWN separation FAIL and the headline is BLOCKED with the number involved",
    async () => {
      const { artifact } = await generate(adu({ proposedPlacement: NEXT_TO_HOUSE }));
      const findings = artifact!.findings as F[];
      const sep = findings.find((f) => f.subject === "Separation from the existing dwelling")!;
      expect(sep).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
      const feasibility = feasibilityOf(artifact);
      expect(feasibility.headline).toBe("BLOCKED");
      expect(feasibility.blockers.join(" ")).toMatch(/from the existing house; 5 ft is required/);
    },
    120_000
  );

  it(
    "an oversize two-story ADU on this parcel is a KNOWN size FAIL; a missing dwelling selection makes only the separation finding REQUIRES_VERIFICATION",
    async () => {
      const big = await generate(adu({ widthFt: 28, depthFt: 24, stories: 2, bedrooms: 2 }));
      expect((big.artifact!.findings as F[]).find((f) => f.subject === "ADU size limit")).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
      const noDwelling = await generate(adu({ primaryDwellingSelection: undefined }));
      const findings = noDwelling.artifact!.findings as F[];
      expect(findings.find((f) => f.subject === "Separation from the existing dwelling")?.classification).toBe("REQUIRES_VERIFICATION");
      expect(findings.find((f) => f.subject === "ADU rear setback")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
    },
    180_000
  );

  it(
    "a footprint placed in the street, or straddling the rear lot line, is a mis-placement: no 0 ft setback FAIL, CANNOT_TELL with the reason, placement-independent claims still made",
    async () => {
      const inStreet = { anchor: { lat: 47.58608874074506, lng: -122.3120200879064 }, orientationDeg: 0 };
      const straddle = { anchor: { lat: 47.58609585030874, lng: -122.31147314645942 }, orientationDeg: 0 };
      for (const [name, placement] of [["in the street", inStreet], ["straddling the rear lot line", straddle]] as const) {
        const { job, artifact } = await generate(adu({ proposedPlacement: placement }));
        expect(job?.state, name).toBe("COMPLETE");
        const findings = artifact!.findings as F[];
        const by = (s: string) => findings.find((f) => f.subject === s);
        expect(by("ADU position on the lot")?.classification, name).toBe("REQUIRES_VERIFICATION");
        expect(by("ADU position on the lot")!.explanationBasis, name).toContain("outside the property boundary");
        for (const s of ["ADU rear setback", "ADU side setback", "ADU front setback", "Separation from the existing dwelling", "Lot coverage"]) expect(by(s), `${name}: ${s}`).toBeUndefined();
        expect(by("ADU size limit"), name).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
        expect(findings.some((f) => f.complianceOutcome === "FAIL"), name).toBe(false);
        const feasibility = feasibilityOf(artifact);
        expect(feasibility.headline, name).toBe("CANNOT_TELL");
        expect(feasibility.summary, name).toContain("outside the property boundary");
      }
    },
    180_000
  );

  it(
    "a parcel verified NOT to be NR (LR1) gets no ADU zoning conclusion: CANNOT_TELL, zone named, nothing passes or fails",
    async () => {
      const lr1Roles = { ...ROLES, frontEdgeRef: "edge-0", rearEdgeRef: "edge-2", sideEdgeRefs: ["edge-1", "edge-3"] };
      const lr1Placement = { anchor: { lat: 47.52175460888725, lng: -122.354484222839 }, orientationDeg: 0 };
      const { job, artifact } = await generate(adu({ proposedPlacement: lr1Placement, lotLineRoleAssignment: lr1Roles, primaryDwellingSelection: undefined }), "3298700485");
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as F[];
      expect(findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
      expect(findings.find((f) => f.subject === "Zoning applicability (Neighborhood Residential zones)")!.explanationBasis).toContain("LR1");
      const feasibility = feasibilityOf(artifact);
      expect(feasibility.headline).toBe("CANNOT_TELL");
      expect(feasibility.summary).toContain("LR1");
    },
    120_000
  );

  it(
    "Slice 4: converting the real 206 sq ft shed on a verified-NR parcel - the footprint is the mapped outline, the allowance is stated from the declarations, the separation to the house is never a KNOWN failure, and the converted building is drawn",
    async () => {
      const { job, artifact } = await generate(conversion(), CONVERSION_PIN);
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as F[];
      const by = (s: string) => findings.find((f) => f.subject === s);
      expect(by("Zoning applicability (Neighborhood Residential zones)")?.classification).toBe("KNOWN");
      expect(by("Conversion of an existing accessory structure")?.classification).toBe("REQUIRES_VERIFICATION");
      expect(by("Setbacks and lot coverage (conversion)")?.classification).toBe("REQUIRES_VERIFICATION"); // described from the declarations, never a KNOWN fact
      expect(by("ADU rear setback")).toBeUndefined();
      expect(by("Lot coverage")).toBeUndefined();
      const sep = by("Separation from the existing dwelling")!;
      expect(sep.complianceOutcome).not.toBe("FAIL"); // never a known failure for a conversion (PASS only when clearly beyond the 5 ft)
      expect(sep.explanationBasis).toMatch(/\d+(\.\d)? ft from the existing dwelling/);
      expect(by("Minimum housing standards for the converted building")?.classification).toBe("REQUIRES_VERIFICATION");
      expect(by("Height of the converted building")?.classification).toBe("REQUIRES_VERIFICATION");
      expect(findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
      // 206 sq ft x 1 story is within the size cap, from the mapped outline.
      expect(by("ADU size limit")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(by("ADU size limit")!.explanationBasis).toContain("mapped 206 sq ft footprint");
      const feasibility = feasibilityOf(artifact);
      expect(["LOOKS_FEASIBLE", "LIKELY_CONSTRAINED"]).toContain(feasibility.headline);
      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      expect(evidence.map((e) => e.factType)).toEqual(expect.arrayContaining(["proposed-footprint-wgs84-display", "adu-declared-inputs", "adu-feasibility"]));
      const rows = evidence.find((e) => e.factType === "adu-declared-inputs")!.value as { label: string; value: string }[];
      expect(rows.find((r) => r.label === "Existing building's footprint")?.value).toContain("206 sq ft");
    },
    120_000
  );

  it(
    "Slice 4: a declared 'no' to existing before July 23, 2023 applies the new-ADU setback standards to the real building's measured distances",
    async () => {
      const { artifact } = await generate(conversion({ existedBeforeJuly2023: false }), CONVERSION_PIN);
      const findings = artifact!.findings as F[];
      expect(findings.find((f) => f.subject === "Setbacks and lot coverage (conversion)")).toBeUndefined();
      const rear = findings.find((f) => f.subject === "ADU rear setback")!;
      expect(rear.explanationBasis).toMatch(/ft from the rear lot line|ft to the rear lot line/);
      expect(findings.find((f) => f.subject === "Lot coverage")).toBeDefined();
      expect(feasibilityOf(artifact).constraints.join(" ")).toContain("conversion allowances do not apply");
    },
    120_000
  );

  it(
    "Slice 4: a building that is no longer mapped on the parcel cannot be evaluated (CANNOT_TELL with the reason), and choosing the main house fails closed at the boundary",
    async () => {
      const missing = await generate(conversion({ convertedStructure: { outlineId: "9999999999", method: "USER_CONFIRMED" } }), CONVERSION_PIN);
      expect(missing.job?.state, JSON.stringify(missing.job)).toBe("COMPLETE");
      expect(feasibilityOf(missing.artifact).headline).toBe("CANNOT_TELL");
      expect((missing.artifact!.findings as F[]).find((f) => f.subject === "Building to convert")!.explanationBasis).toContain("no longer among the mapped buildings");
      // The main house chosen as the building to convert is rejected at the shared boundary (the schema) before any evaluation: the
      // snapshot fails hydration and the job fails closed rather than producing a report; the intake UI never lets a customer submit it.
      const house = await generate(conversion({ convertedStructure: { outlineId: HOUSE_2, method: "USER_CONFIRMED" } }), CONVERSION_PIN);
      expect(house.job?.state).toBe("FAILED");
      expect(house.artifact).toBeUndefined();
    },
    180_000
  );

  it(
    "Slice 5: an ADU inside the existing house is declared only - evaluated on the real parcel's area, with no placement, outlines or lot-line roles, and the parcel drawn",
    async () => {
      const attached: AduAttachedConfiguration = { aduType: "ATTACHED_TO_HOUSE", grossFloorAreaSqFt: 700, bedrooms: 1, includesAddition: false, portionExistedBeforeJuly2023: true, existingPrincipalDwellingUnits: 1, existingAduCount: 0, existingHouseBuiltBefore1982: true };
      const { job, artifact } = await generate(attached);
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as F[];
      const by = (s: string) => findings.find((f) => f.subject === s);
      expect(by("Zoning applicability (Neighborhood Residential zones)")?.classification).toBe("KNOWN");
      expect(by("Number of ADUs on the lot")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      // Density is KNOWN/PASS, or REQUIRES_VERIFICATION when the live critical-area map indicates possible excluded land - never a FAIL here.
      expect(by("Dwelling units allowed on the lot (density)")?.complianceOutcome).not.toBe("FAIL");
      expect(by("ADU size limit")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(by("Amenity area")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" }); // single new unit on a pre-1982 house
      expect(by("Setbacks, height and lot coverage (attached ADU)")?.classification).toBe("REQUIRES_VERIFICATION");
      expect(findings.some((f) => /^ADU (rear|side|front)|^Separation|^Lot coverage|^ADU height/.test(f.subject))).toBe(false);
      expect(feasibilityOf(artifact).headline).toBe("LOOKS_FEASIBLE");
      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      expect(evidence.map((e) => e.factType)).toEqual(expect.arrayContaining(["adu-declared-inputs", "adu-feasibility", "parcel-boundary-wgs84-display", "zoning"]));
      expect(evidence.map((e) => e.factType)).not.toContain("existing-structures-wgs84-display");
      expect(evidence.map((e) => e.factType)).not.toContain("proposed-footprint-wgs84-display");
    },
    120_000
  );
});

describe.skipIf(hasDb)("ADU pipeline integration (skipped)", () => {
  it("documents why this suite did not run - DATABASE_URL is not provisioned", () => {
    expect(hasDb).toBe(false);
    expect(realAduCandidates).toHaveLength(12);
  });
});
