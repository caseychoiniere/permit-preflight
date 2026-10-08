/**
 * Unit 8 (Decks) - live end-to-end pipeline integration: real DB, real parcel, real ECA retrieval,
 * the actual runReportGenerationPipeline. Uses SYNTHETIC, randomly-id'd, isTestOnlyFixture ACTIVE
 * deck rows built from the real candidates' specifications and deletes only those ids afterward -
 * never the real deck governance rows (which stay APPROVED, not ACTIVE) and never touching shared
 * fixed-id rows (same discipline as pipeline.integration.test.ts's 2026-08-30 flake fix).
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, reportGenerationJobs, evidenceReportArtifacts, regulatoryRules } from "../../src/db/schema.js";
import type { ExistingPropertyScreeningRequestSnapshot, DeckProjectConfiguration } from "../../src/screening-request/types.js";
import { createReportGenerationJob, claimQueuedJob } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../../src/report-generation-orchestrator/pipeline.js";
import { realDeckCandidates } from "../fixtures/deck-candidates.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const TEST_PARCEL_PIN = "3298700485";
const AFFECTED_DATA_SOURCE_IDS = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca"];

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
  const ownRuleIds: string[] = [];
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
      if (ownRuleIds.length > 0) await db.delete(regulatoryRules).where(inArray(regulatoryRules.id, ownRuleIds));
    } finally {
      await restoreDataSourceHealth(db, healthSnapshot);
    }
  });

  async function insertSyntheticActiveDeckRules(): Promise<string[]> {
    const ids: string[] = [];
    const rows = realDeckCandidates.map((c) => {
      const id = randomUUID();
      ids.push(id);
      ownRuleIds.push(id);
      return {
        id,
        subject: `DECK-PIPELINE-INTEGRATION-TEST-ONLY: ${c.subject}`,
        applicableProjectType: "deck",
        applicableWorkflowType: "EXISTING_PROPERTY" as const,
        applicableZone: c.applicableZone,
        ruleSpecification: c.ruleSpecification,
        citation: c.citation,
        lifecycleState: "ACTIVE" as const,
        tier: "TIER_1" as const,
        caveats: c.caveats,
        testCases: c.testCases,
        verificationHistory: [],
        isTestOnlyFixture: true,
        acceptedEvidenceQuality: ["AUTHORITATIVE" as const],
      };
    });
    await db.insert(regulatoryRules).values(rows);
    return ids;
  }

  async function removeOwnRules() {
    if (ownRuleIds.length > 0) await db.delete(regulatoryRules).where(inArray(regulatoryRules.id, ownRuleIds));
    ownRuleIds.length = 0;
  }

  async function generate(details: DeckProjectConfiguration) {
    const snapshot: ExistingPropertyScreeningRequestSnapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: TEST_PARCEL_PIN, projectType: "deck", projectDetails: details };
    const [row] = await db
      .insert(screeningRequests)
      .values({ workflowType: "EXISTING_PROPERTY", projectType: "deck", projectDetails: details, confirmedParcelId: TEST_PARCEL_PIN, snapshot })
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

  it(
    "with the six deck rules ACTIVE: setback findings per declared location, lot coverage, the permit aggregate as evidence only, declared inputs echoed, no shed/fence evidence",
    async () => {
      const ruleIds = await insertSyntheticActiveDeckRules();
      try {
        const { job, artifact } = await generate(DECLARED);
        expect(job?.state).toBe("COMPLETE");
        const findings = artifact!.findings as { subject: string; classification: string; complianceOutcome?: string }[];
        const bySubject = (n: string) => findings.find((f) => f.subject === n);
        // 40 in: above the 18 in allowance in a setback (never a FAIL), and above the 36 in lot-coverage threshold.
        expect(bySubject("Deck setback (front setback)")?.classification).toBe("REQUIRES_VERIFICATION");
        expect(bySubject("Deck setback (side setback)")?.classification).toBe("REQUIRES_VERIFICATION");
        expect(findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
        expect(bySubject("Deck and lot coverage")?.classification).toBe("REQUIRES_VERIFICATION");
        expect(bySubject("Zoning applicability (Neighborhood Residential zones)")?.classification).toBe("REQUIRES_VERIFICATION");

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
        expect((artifact!.ruleVersionsUsed as string[]).sort()).toEqual([...ruleIds].sort());
      } finally {
        await removeOwnRules();
      }
    },
    90_000
  );

  it(
    "with NO deck rules ACTIVE the report still completes, with no setback/permit claims and every claim listed as uncovered",
    async () => {
      const { job, artifact } = await generate(DECLARED);
      expect(job?.state).toBe("COMPLETE");
      const findings = artifact!.findings as { subject: string }[];
      expect(findings.map((f) => f.subject)).toEqual(["Zoning applicability (Neighborhood Residential zones)"]);
      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      expect(evidence.some((e) => e.factType === "deck-permit-requirement")).toBe(false);
      expect(evidence.find((e) => e.factType === "uncovered-constraint-types")!.value).toEqual([
        "deck setback (front setback)",
        "deck setback (side setback)",
        "deck lot coverage",
        "deck building permit",
      ]);
      expect(artifact!.ruleVersionsUsed).toEqual([]);
    },
    90_000
  );
});
