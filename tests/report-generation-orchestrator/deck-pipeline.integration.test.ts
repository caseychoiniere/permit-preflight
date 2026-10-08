/**
 * Unit 8 (Decks) - live end-to-end pipeline integration against the REAL, ACTIVE governance rows
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
import type { ExistingPropertyScreeningRequestSnapshot, DeckProjectConfiguration } from "../../src/screening-request/types.js";
import { createReportGenerationJob, claimQueuedJob } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../../src/report-generation-orchestrator/pipeline.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const TEST_PARCEL_PIN = "1498301270"; // plain NR (live-verified 2026-10-08); the former fixture 3298700485 is zoned LR1
const AFFECTED_DATA_SOURCE_IDS = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca", "seattle-zoning", "seattle-landmarks"];

const DECLARED: DeckProjectConfiguration = {
  heightAboveGradeIn: 40,
  widthFt: 10,
  depthFt: 12,
  attachment: "DETACHED",
  buildingRelation: "OPEN_GROUND_BELOW",
  setbackLocations: ["FRONT_SETBACK", "SIDE_SETBACK"],
  solidFlooring: false,
  longestBeamFt: 10,
};

describe.skipIf(!hasDb)("Deck report generation pipeline - live end-to-end integration", () => {
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

  async function generate(details: DeckProjectConfiguration, parcelPin: string = TEST_PARCEL_PIN) {
    const snapshot: ExistingPropertyScreeningRequestSnapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: parcelPin, projectType: "deck", projectDetails: details };
    const [row] = await db
      .insert(screeningRequests)
      .values({ workflowType: "EXISTING_PROPERTY", projectType: "deck", projectDetails: details, confirmedParcelId: parcelPin, snapshot })
      .returning({ id: screeningRequests.id });
    screeningIds.push(row!.id);
    const authorization: GenerationAuthorization = { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "deck-pipeline.integration.test.ts", authorizedAt: new Date().toISOString() };
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
      .where(and(eq(regulatoryRules.applicableProjectType, "deck"), eq(regulatoryRules.lifecycleState, "ACTIVE"), eq(regulatoryRules.isTestOnlyFixture, false)));
    return rows.map((r) => r.id);
  }

  it(
    "REAL activated rules: all six are ACTIVE; setback findings per declared location, lot coverage, the permit aggregate as evidence only, declared inputs echoed, nothing uncovered, no shed/fence evidence",
    async () => {
      const realIds = await activeRealRuleIds();
      expect(realIds).toHaveLength(6);
      const { job, artifact } = await generate(DECLARED);
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as { subject: string; classification: string; complianceOutcome?: string }[];
      const bySubject = (n: string) => findings.find((f) => f.subject === n);
      // 40 in: above the 18 in allowance in a setback (never a FAIL), and above the 36 in lot-coverage threshold.
      expect(bySubject("Deck setback (front setback)")?.classification).toBe("REQUIRES_VERIFICATION");
      expect(bySubject("Deck setback (side setback)")?.classification).toBe("REQUIRES_VERIFICATION");
      expect(findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
      expect(bySubject("Deck and lot coverage")?.classification).toBe("REQUIRES_VERIFICATION");
      expect(bySubject("Zoning applicability (Neighborhood Residential zones)")?.classification).toBe("KNOWN"); // verified plain NR

      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      const factTypes = evidence.map((e) => e.factType);
      expect(factTypes).toEqual(expect.arrayContaining(["deck-declared-inputs", "deck-permit-requirement", "uncovered-constraint-types", "environmental-constraints"]));
      expect(factTypes).not.toContain("shed-permit-requirement");
      expect(factTypes).not.toContain("fence-permit-requirement");
      const permit = evidence.find((e) => e.factType === "deck-permit-requirement")!.value as { buildingPermit: string; reviewPath?: string };
      expect(permit.buildingPermit).toBe("REQUIRED");
      expect(permit.reviewPath).toBe("REQUIRES_VERIFICATION"); // never STFI-likely: the ECA question is open
      expect(evidence.find((e) => e.factType === "uncovered-constraint-types")!.value).toEqual([]);
      expect(JSON.stringify(findings)).not.toContain("deck-permit");
      expect((artifact!.ruleVersionsUsed as string[]).sort()).toEqual([...realIds].sort());
    },
    90_000
  );

  it(
    "REAL rules: a roof deck is REQUIRED with a full-review path, a 12 in deck over open ground turns only on ECA status, and nothing is ever LIKELY_EXEMPT",
    async () => {
      const roof = await generate({ ...DECLARED, heightAboveGradeIn: 100, attachment: "ATTACHED_TO_DWELLING", buildingRelation: "ROOF_DECK", setbackLocations: ["OUTSIDE_REQUIRED_SETBACKS"], solidFlooring: true });
      const rp = (roof.artifact!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "deck-permit-requirement")!.value as { buildingPermit: string; reviewPath?: string };
      expect(rp).toMatchObject({ buildingPermit: "REQUIRED", reviewPath: "FULL_REVIEW_LIKELY" });
      const low = await generate({ ...DECLARED, heightAboveGradeIn: 12, setbackLocations: ["SIDE_SETBACK"] });
      const lp = (low.artifact!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "deck-permit-requirement")!.value as { buildingPermit: string; turnsOnlyOnEcaStatus: boolean };
      expect(lp).toMatchObject({ buildingPermit: "REQUIRES_VERIFICATION", turnsOnlyOnEcaStatus: true });
      expect(JSON.stringify([roof.artifact!.evidence, low.artifact!.evidence])).not.toContain("LIKELY_EXEMPT");
    },
    120_000
  );

  it(
    "a parcel verified NOT to be NR (LR1) gets no NR setback/lot-coverage conclusion and keeps the building-permit determination",
    async () => {
      const { job, artifact } = await generate({ heightAboveGradeIn: 40, widthFt: 10, depthFt: 12, attachment: "DETACHED", buildingRelation: "OPEN_GROUND_BELOW", setbackLocations: ["SIDE_SETBACK"] }, "3298700485");
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as { subject: string; classification: string; explanationBasis: string }[];
      expect(findings.some((f) => f.subject.startsWith("Deck setback") || f.subject === "Deck and lot coverage")).toBe(false);
      const z = findings.find((f) => f.subject === "Zoning applicability (Neighborhood Residential zones)")!;
      expect(z.explanationBasis).toContain("LR1");
      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      expect((evidence.find((e) => e.factType === "deck-permit-requirement")!.value as { buildingPermit: string }).buildingPermit).toBe("REQUIRED");
    },
    90_000
  );
});
