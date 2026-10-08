/**
 * Unit 7 (Fences) - live end-to-end pipeline integration against the REAL, ACTIVE governance rows
 * (activated 2026-10-08): real DB, real parcel, real ECA retrieval, the actual
 * runReportGenerationPipeline. Since activation this is a readiness regression test of what a
 * customer would actually get, not a synthetic-rule exercise (the synthetic-row version was retired
 * because real ACTIVE rows now exist). Only the screening request/job/artifact rows it creates are
 * deleted afterward; no regulatory row is ever touched.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, reportGenerationJobs, evidenceReportArtifacts, regulatoryRules } from "../../src/db/schema.js";
import type { ExistingPropertyScreeningRequestSnapshot, FenceProjectConfiguration } from "../../src/screening-request/types.js";
import { createReportGenerationJob, claimQueuedJob } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../../src/report-generation-orchestrator/pipeline.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const TEST_PARCEL_PIN = "1498301270"; // plain NR (live-verified 2026-10-08); the former fixture 3298700485 is zoned LR1
const AFFECTED_DATA_SOURCE_IDS = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca", "seattle-zoning", "seattle-landmarks"];

const DECLARED: FenceProjectConfiguration = {
  heightFt: 5,
  locations: ["FRONT_SETBACK", "OTHER_SIDE_OR_REAR_SETBACK"],
  siteSlopes: false,
  wallRelation: "NONE",
};

describe.skipIf(!hasDb)("Fence report generation pipeline - live end-to-end integration", () => {
  let db: Db;
  const screeningIds: string[] = [];
    let healthSnapshot: DataSourceHealthSnapshot;

  beforeAll(async () => {
    db = getDb();
    healthSnapshot = await snapshotDataSourceHealth(db, AFFECTED_DATA_SOURCE_IDS);
  });

  afterAll(async () => {
    try {
      for (const id of screeningIds) {
        await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
        await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
        await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
      }
    } finally {
      await restoreDataSourceHealth(db, healthSnapshot);
    }
  });

  const factTypesOf = (a: { evidence: unknown } | undefined) => ((a?.evidence ?? []) as { factType: string }[]).map((e) => e.factType);

  async function generate(details: FenceProjectConfiguration, parcelPin: string = TEST_PARCEL_PIN) {
    const snapshot: ExistingPropertyScreeningRequestSnapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: parcelPin, projectType: "fence", projectDetails: details };
    const [row] = await db
      .insert(screeningRequests)
      .values({ workflowType: "EXISTING_PROPERTY", projectType: "fence", projectDetails: details, confirmedParcelId: parcelPin, snapshot })
      .returning({ id: screeningRequests.id });
    screeningIds.push(row!.id);
    const authorization: GenerationAuthorization = { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "fence-pipeline.integration.test.ts", authorizedAt: new Date().toISOString() };
    const job = await createReportGenerationJob(db, row!.id, authorization);
    const claimed = await claimQueuedJob(db, job.id);
    if (!claimed) throw new Error("Failed to claim the freshly-created job.");
    await runReportGenerationPipeline(db, claimed);
    const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    const [artifact] = finished?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished.evidenceReportArtifactId)) : [];
    return { job: finished, artifact };
  }


  async function activeRealRuleIds(): Promise<string[]> {
    const rows = await db
      .select({ id: regulatoryRules.id })
      .from(regulatoryRules)
      .where(and(eq(regulatoryRules.applicableProjectType, "fence"), eq(regulatoryRules.lifecycleState, "ACTIVE"), eq(regulatoryRules.isTestOnlyFixture, false)));
    return rows.map((r) => r.id);
  }

  it(
    "REAL activated rules: all eight are ACTIVE; height findings per declared location, the permit aggregate as evidence only, declared inputs echoed, nothing uncovered, no shed/deck evidence",
    async () => {
      const realIds = await activeRealRuleIds();
      expect(realIds).toHaveLength(8);
      const { job, artifact } = await generate(DECLARED);
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as { subject: string; classification: string; complianceOutcome?: string }[];
      const bySubject = (n: string) => findings.find((f) => f.subject === n);
      // 5 ft: over the 4-ft front zone, within the 6-ft side/rear zone.
      expect(bySubject("Fence height (front setback)")).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
      expect(bySubject("Fence height (side or rear setback)")).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(bySubject("Sight-distance requirements (corner lot, driveway, alley)")?.classification).toBe("REQUIRES_VERIFICATION");
      // Real zoning retrieval: this parcel is verified plain NR, so zoning is stated as a KNOWN fact (Unit 11 Slice 1).
      expect(bySubject("Zoning applicability (Neighborhood Residential zones)")?.classification).toBe("KNOWN");
      expect(factTypesOf(artifact)).toEqual(expect.arrayContaining(["zoning", "landmark-designation"]));

      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      const factTypes = evidence.map((e) => e.factType);
      expect(factTypes).toEqual(expect.arrayContaining(["fence-declared-inputs", "fence-permit-requirement", "uncovered-constraint-types", "environmental-constraints"]));
      expect(factTypes).not.toContain("shed-permit-requirement");
      expect(factTypes).not.toContain("deck-permit-requirement");
      const permit = evidence.find((e) => e.factType === "fence-permit-requirement")!.value as { buildingPermit: string; turnsOnlyOnFloodProneStatus: boolean };
      expect(permit.buildingPermit).toBe("REQUIRES_VERIFICATION");
      expect(permit.turnsOnlyOnFloodProneStatus).toBe(true);
      expect(evidence.find((e) => e.factType === "uncovered-constraint-types")!.value).toEqual([]);
      // The permit aggregate is evidence only - never in findings, so the explanation model cannot see it.
      expect(JSON.stringify(findings)).not.toContain("fence-permit");
      // The artifact records exactly the real governed rows it used.
      expect((artifact!.ruleVersionsUsed as string[]).sort()).toEqual([...realIds].sort());
    },
    90_000
  );

  it(
    "REAL rules: a 9 ft fence is REQUIRED (one conclusive disqualifier), never LIKELY_EXEMPT, and a fence on a sloping site without its tallest portion fails closed",
    async () => {
      const over = await generate({ heightFt: 9, locations: ["OUTSIDE_REQUIRED_SETBACKS"], siteSlopes: false, wallRelation: "NONE", hasMasonryOrConcreteAbove6Ft: false });
      const permit = (over.artifact!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "fence-permit-requirement")!.value as { buildingPermit: string };
      expect(permit.buildingPermit).toBe("REQUIRED");
      const slope = await generate({ heightFt: 6, locations: ["OUTSIDE_REQUIRED_SETBACKS"], siteSlopes: true, wallRelation: "NONE" });
      const f = (slope.artifact!.findings as { subject: string; classification: string }[]).find((x) => x.subject === "Fence height (outside required setbacks)");
      expect(f?.classification).toBe("REQUIRES_VERIFICATION");
      expect(JSON.stringify(slope.artifact!.evidence)).not.toContain("LIKELY_EXEMPT");
    },
    120_000
  );

  it(
    "a parcel verified NOT to be NR (LR1) gets no NR height conclusion, names its zone, and keeps the building-permit determination",
    async () => {
      const { job, artifact } = await generate({ heightFt: 9, locations: ["FRONT_SETBACK"], siteSlopes: false, wallRelation: "NONE", hasMasonryOrConcreteAbove6Ft: false }, "3298700485");
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as { subject: string; classification: string; complianceOutcome?: string; explanationBasis: string }[];
      expect(findings.some((f) => f.subject.startsWith("Fence height"))).toBe(false);
      expect(findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
      const z = findings.find((f) => f.subject === "Zoning applicability (Neighborhood Residential zones)")!;
      expect(z.classification).toBe("REQUIRES_VERIFICATION");
      expect(z.explanationBasis).toContain("LR1");
      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      expect((evidence.find((e) => e.factType === "fence-permit-requirement")!.value as { buildingPermit: string }).buildingPermit).toBe("REQUIRED");
      expect(JSON.stringify(evidence.find((e) => e.factType === "uncovered-constraint-types")!.value)).toContain("not in a Neighborhood Residential zone");
    },
    90_000
  );
});
