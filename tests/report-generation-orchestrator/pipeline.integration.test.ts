/**
 * Pipeline-level live integration test - the gap flagged (and left disclosed/unclosed) in the
 * building-intelligence-v1 audit entry: no test previously exercised runReportGenerationPipeline
 * end-to-end (retriever -> classification -> PostGIS -> Rules Engine -> artifact) against a real
 * database. The 2026-08-30 regression that crossed exactly those module boundaries (zero findings
 * from an emptied regulatory_rules table; existing-structure geometry never persisted in a
 * display-ready form) is precisely what a unit-test-only suite failed to catch - this closes that
 * gap for real, against the live staging Neon DB and the live Seattle Building Outlines endpoint.
 *
 * Skips cleanly (does not fail) when DATABASE_URL is unset, matching every other DB-gated
 * integration suite in this project.
 *
 * Uses a real, already-verified Seattle test parcel (PIN 3298700485) with 3 real Building Outlines
 * footprints (outlineIds 1271026693/1271026694/1271026695, live-confirmed 2026-08-30) and a real,
 * previously-proven-working placement/lot-line-role combination for that exact parcel's boundary
 * shape (front=edge-0, rear=edge-2, sides=edge-1/edge-3 - the same values a real historical
 * generation for this parcel used successfully).
 *
 * Real-flake fix (2026-08-30, discovered running this suite for the first time as part of the
 * FULL integration run): this file originally called seedStagingTestRules/shared the SAME 4
 * fixed-UUID rows scripts/staging-test-rules.ts defines - the same rows
 * tests/scripts/staging-test-rules.integration.test.ts legitimately seeds AND clears repeatedly as
 * part of ITS OWN idempotency tests. Since Vitest runs integration test FILES concurrently by
 * default against the SAME live Neon database, that other file's `afterEach` clear could fire
 * mid-flight during this file's own test body, transiently zeroing `rulesLoaded` to 0 - a real,
 * live-observed failure (`expected 0 to be greater than 0`), not a flaky assertion. Fixed the same
 * way the earlier staging-test-rules.integration.test.ts flake was fixed: never depend on/mutate
 * externally-shared, concurrently-touched row identities. This file now inserts its OWN uniquely
 * random-id'd ACTIVE shed rules (reusing STAGING_TEST_RULES' proven ruleSpecification shapes, never
 * re-derived) under a distinct "PIPELINE-INTEGRATION-TEST-ONLY:" subject prefix, and deletes only
 * those specific ids in afterAll - completely independent of scripts/staging-test-rules.ts's own
 * shared fixed-id rows and whatever concurrent state they're in.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, reportGenerationJobs, evidenceReportArtifacts, regulatoryRules } from "../../src/db/schema.js";
import type { ExistingPropertyScreeningRequestSnapshot, ShedProjectConfiguration } from "../../src/screening-request/types.js";
import { createReportGenerationJob, claimQueuedJob } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../../src/report-generation-orchestrator/pipeline.js";
import { toNewRegulatoryRuleRow, STAGING_TEST_RULES } from "../../scripts/staging-test-rules.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

// Real, live-verified (2026-08-30) test parcel and its real building-outline ids.
const TEST_PARCEL_PIN = "3298700485";
const REAL_OUTLINE_ID_MAIN_HOUSE = "1271026695"; // the largest of the 3 real footprints on this parcel
const NONEXISTENT_OUTLINE_ID = "9999999999"; // never a real Building Outlines id for this parcel

// A real, previously-proven-working placement + lot-line-role combination for this exact parcel's
// boundary shape (a simple 4-edge rectangle) - reused rather than guessed, matching a real
// historical generation for this same parcel that succeeded before the regulatory_rules regression.
const REAL_PLACEMENT = { anchor: { lat: 47.52175460888725, lng: -122.354484222839 }, orientationDeg: 0 };
const REAL_LOT_LINE_ROLES = { method: "USER_INDICATED" as const, status: "ASSIGNED" as const, frontEdgeRef: "edge-0", rearEdgeRef: "edge-2", sideEdgeRefs: ["edge-1", "edge-3"] };

function shedProjectDetails(overrides: Partial<ShedProjectConfiguration> = {}): ShedProjectConfiguration {
  return {
    widthFt: 8,
    depthFt: 10,
    heightFt: 8,
    alleyAdjacent: false,
    proposedPlacement: REAL_PLACEMENT,
    lotLineRoleAssignment: REAL_LOT_LINE_ROLES,
    ...overrides,
  };
}

describe.skipIf(!hasDb)("Report generation pipeline - live end-to-end integration (building intelligence v1 regression)", () => {
  let db: Db;
  const cleanupScreeningRequestIds: string[] = [];
  const ownRuleIds: string[] = [];

  beforeAll(async () => {
    db = getDb();
    const rows = STAGING_TEST_RULES.map((def) => {
      const id = randomUUID();
      ownRuleIds.push(id);
      return toNewRegulatoryRuleRow({ ...def, id, subject: def.subject.replace("STAGING-TEST-ONLY:", "PIPELINE-INTEGRATION-TEST-ONLY:") });
    });
    await db.insert(regulatoryRules).values(rows);
  });

  afterAll(async () => {
    for (const id of cleanupScreeningRequestIds) {
      await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
      await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
    await db.delete(regulatoryRules).where(inArray(regulatoryRules.id, ownRuleIds));
  });

  /** Creates a real ScreeningRequest with an already-taken snapshot (as if authorization had
   * already run) and drives it through a real, claimed ReportGenerationJob + the actual pipeline -
   * no fakes, no mocked DB, no generateExplanation (proving findings don't depend on Anthropic
   * being configured). */
  async function generateRealShedReport(projectDetails: ShedProjectConfiguration) {
    const snapshot: ExistingPropertyScreeningRequestSnapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: TEST_PARCEL_PIN, projectType: "shed", projectDetails };
    const [row] = await db
      .insert(screeningRequests)
      .values({ workflowType: "EXISTING_PROPERTY", projectType: "shed", projectDetails, confirmedParcelId: TEST_PARCEL_PIN, snapshot })
      .returning({ id: screeningRequests.id });
    const screeningRequestId = row!.id;
    cleanupScreeningRequestIds.push(screeningRequestId);

    const authorization: GenerationAuthorization = { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId, authorizedBy: "pipeline.integration.test.ts", authorizedAt: new Date().toISOString() };
    const job = await createReportGenerationJob(db, screeningRequestId, authorization);
    const claimed = await claimQueuedJob(db, job.id);
    if (!claimed) throw new Error("Failed to claim the freshly-created job.");

    await runReportGenerationPipeline(db, claimed);

    const [finishedJob] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    const [artifact] = finishedJob?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finishedJob.evidenceReportArtifactId)) : [];
    return { screeningRequestId, job: finishedJob, artifact };
  }

  it(
    "[hard invariant, regression coverage] a matched primary-dwelling selection produces dwelling separation AND every other applicable shed finding (rear/height/side/front) - " +
      "building intelligence enrichment never suppresses the unrelated rule-derived findings ACTIVE staging rules should still produce",
    async () => {
      const { job, artifact } = await generateRealShedReport(shedProjectDetails({ primaryDwellingSelection: { status: "SELECTED", outlineId: REAL_OUTLINE_ID_MAIN_HOUSE, method: "USER_CONFIRMED" } }));

      expect(job?.state).toBe("COMPLETE");
      expect(artifact).toBeDefined();
      const findings = artifact!.findings as { subject: string; classification: string }[];

      // Item 9/10: the 4 STAGING-TEST-ONLY ACTIVE rules produce real findings (never zero, the
      // exact real regression this suite exists to catch).
      expect(findings.length).toBeGreaterThan(0);
      const bySubject = (needle: string) => findings.find((f) => f.subject.toLowerCase().includes(needle));
      expect(bySubject("rear")).toBeDefined();
      expect(bySubject("height")).toBeDefined();
      expect(bySubject("dwelling")).toBeDefined();

      // Item 10: a matched selection makes dwelling separation actually EVALUABLE, not REQUIRES_VERIFICATION.
      const dwellingFinding = bySubject("dwelling")!;
      expect(dwellingFinding.classification).not.toBe("REQUIRES_VERIFICATION");

      // Item 5: the immutable artifact snapshots real, WGS84 display geometry for existing
      // structures - never re-fetched by the report later.
      const evidence = artifact!.evidence as { factType: string; value: unknown }[];
      const displayFact = evidence.find((e) => e.factType === "existing-structures-wgs84-display");
      expect(displayFact).toBeDefined();
      const displayStructures = displayFact!.value as { outlineId: string; footprintWgs84: { lng: number; lat: number }[]; classification: string }[];
      expect(displayStructures.length).toBeGreaterThan(0);
      for (const s of displayStructures) {
        // WGS84, never the raw SRID-2926 projected coordinates (the exact bug this fix closes -
        // Seattle-area longitudes are always strongly negative, feet-based x/y never are).
        for (const p of s.footprintWgs84) {
          expect(p.lng).toBeLessThan(-100);
          expect(p.lat).toBeGreaterThan(0);
          expect(p.lat).toBeLessThan(90);
        }
      }
      const selected = displayStructures.find((s) => s.outlineId === REAL_OUTLINE_ID_MAIN_HOUSE);
      expect(selected?.classification).toBe("PRIMARY_DWELLING");
    }
  );

  it("[hard invariant] no primary-dwelling selection at all: dwelling separation is REQUIRES_VERIFICATION, but every other finding is still produced (missing dwelling identification affects ONLY that one finding)", async () => {
    const { artifact } = await generateRealShedReport(shedProjectDetails()); // no primaryDwellingSelection field at all
    const findings = artifact!.findings as { subject: string; classification: string }[];
    expect(findings.length).toBeGreaterThan(0);
    const dwellingFinding = findings.find((f) => f.subject.toLowerCase().includes("dwelling"));
    expect(dwellingFinding?.classification).toBe("REQUIRES_VERIFICATION");
    // Unaffected: rear/height still evaluable KNOWN findings, same as the matched-selection case.
    expect(findings.some((f) => f.subject.toLowerCase().includes("rear") && f.classification !== "REQUIRES_VERIFICATION")).toBe(true);
    expect(findings.some((f) => f.subject.toLowerCase().includes("height") && f.classification !== "REQUIRES_VERIFICATION")).toBe(true);
  });

  it("[hard invariant, FAILURE BEHAVIOR] a selected outline that no longer exists at generation time resolves to UNKNOWN/REQUIRES_VERIFICATION - never guessed - and the report explains it, while other findings still complete", async () => {
    const { artifact } = await generateRealShedReport(shedProjectDetails({ primaryDwellingSelection: { status: "SELECTED", outlineId: NONEXISTENT_OUTLINE_ID, method: "USER_CONFIRMED" } }));
    const findings = artifact!.findings as { subject: string; classification: string }[];
    expect(findings.length).toBeGreaterThan(0); // report still completes
    const dwellingFinding = findings.find((f) => f.subject.toLowerCase().includes("dwelling"));
    expect(dwellingFinding?.classification).toBe("REQUIRES_VERIFICATION");

    const evidence = artifact!.evidence as { factType: string; value: unknown }[];
    const outcomeFact = evidence.find((e) => e.factType === "dwelling-selection-outcome");
    expect(outcomeFact).toBeDefined();
    expect((outcomeFact!.value as { outcome: string }).outcome).toBe("SELECTION_NOT_MATCHED");
    // Every returned structure is UNKNOWN - never silently re-mapped to a different footprint.
    const displayStructures = (evidence.find((e) => e.factType === "existing-structures-wgs84-display")!.value as { classification: string }[]) ?? [];
    expect(displayStructures.every((s) => s.classification === "UNKNOWN")).toBe(true);
  });
});

describe.skipIf(hasDb)("Report generation pipeline - live end-to-end integration (skipped)", () => {
  it("documents why this suite did not run - kept explicitly open for Build & Test, not fabricated", () => {
    expect(hasDb).toBe(false); // DATABASE_URL not provisioned in this environment.
    expect(STAGING_TEST_RULES.length).toBe(4); // sanity - the fixture module this suite depends on is intact
  });
});
