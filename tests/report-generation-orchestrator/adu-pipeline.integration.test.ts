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
import type { AduProjectConfiguration, ExistingPropertyScreeningRequestSnapshot } from "../../src/screening-request/types.js";
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

function adu(over: Partial<AduProjectConfiguration> = {}): AduProjectConfiguration {
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

  async function generate(details: AduProjectConfiguration, parcelPin: string = NR_PIN) {
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
      expect((artifact!.ruleVersionsUsed as string[]).sort()).toEqual([...ruleIds].sort());
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
});

describe.skipIf(hasDb)("ADU pipeline integration (skipped)", () => {
  it("documents why this suite did not run - DATABASE_URL is not provisioned", () => {
    expect(hasDb).toBe(false);
    expect(realAduCandidates).toHaveLength(10);
  });
});
