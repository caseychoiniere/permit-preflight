/**
 * Citywide zoning coverage sweep: runs the REAL pipeline over real Seattle parcels in different zone families for shed, detached garage, fence and deck and
 * reports, per parcel, the zoning the engine applied, whether the report completed, the claims it settled and the ones it left for verification.
 * Rule sets that are APPROVED but not yet ACTIVE are evaluated through the pipeline's test-only seam (nothing is written to the rules table).
 *
 * Usage: SWEEP_PINS=pin1,pin2 SWEEP_RULES=lowrise npx tsx scripts/zoning-parcel-sweep.ts   (SWEEP_VERBOSE=1 prints each finding)
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { evidenceReportArtifacts, reportGenerationJobs, screeningRequests } from "../src/db/schema.js";
import { createReportGenerationJob, claimQueuedJob } from "../src/report-generation-job/repository.js";
import { GenerationAuthorizationType } from "../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../src/report-generation-orchestrator/pipeline.js";
import { fetchParcelBoundaryPolygon } from "../src/property-intelligence/king-county-parcel-geometry.js";
import { fetchBuildingFootprints } from "../src/property-intelligence/seattle-building-outlines.js";
import { draft } from "../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../src/regulatory-rule-governance/types.js";
import { MULTIFAMILY_FIXED_ROW_IDS, allMultifamilyCandidates } from "../tests/fixtures/multifamily-candidates.js";
import { ADU_MF_FIXED_ROW_IDS, aduMultifamilyCandidates } from "../tests/fixtures/multifamily-adu-candidates.js";
import { ADU_MR_HR_FIXED_ROW_IDS, aduMrHrCandidates } from "../tests/fixtures/multifamily-adu-mr-hr-candidates.js";
import { ADU_COMM_FIXED_ROW_IDS, aduCommercialCandidates } from "../tests/fixtures/commercial-adu-candidates.js";
import { COMMERCIAL_C2_FIXED_ROW_IDS, allCommercialC2Candidates } from "../tests/fixtures/commercial-c2-candidates.js";
import { COMMERCIAL_FIXED_ROW_IDS, allCommercialCandidates } from "../tests/fixtures/commercial-candidates.js";
import { GARAGE_SEPARATION_FIXED_ROW_IDS, garageSeparationCandidates } from "../tests/fixtures/garage-separation-candidates.js";

process.loadEnvFile(".env.local");

const asActiveRules = (cands: typeof allMultifamilyCandidates, ids: Record<string, string>): RegulatoryRule[] =>
  cands.map((c) => ({ ...draft(c), id: ids[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }) as RegulatoryRule);
const EXTRA_SETS: Record<string, RegulatoryRule[]> = {
  "lowrise-adu": asActiveRules(aduMultifamilyCandidates, ADU_MF_FIXED_ROW_IDS),
  "midrise-highrise-adu": asActiveRules(aduMrHrCandidates, ADU_MR_HR_FIXED_ROW_IDS),
  "commercial-adu": asActiveRules(aduCommercialCandidates, ADU_COMM_FIXED_ROW_IDS),
  "commercial-c2": asActiveRules(allCommercialC2Candidates, COMMERCIAL_C2_FIXED_ROW_IDS),
  commercial: asActiveRules(allCommercialCandidates, COMMERCIAL_FIXED_ROW_IDS),
  "garage-separation": asActiveRules(garageSeparationCandidates, GARAGE_SEPARATION_FIXED_ROW_IDS),
  "mf-hr-new": asActiveRules(allMultifamilyCandidates.filter((c) => /-hr-2026$/.test(c.id) && /separation|parking-access/.test(c.id)), MULTIFAMILY_FIXED_ROW_IDS),
  lowrise: allMultifamilyCandidates.map((c) => ({ ...draft(c), id: MULTIFAMILY_FIXED_ROW_IDS[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }) as RegulatoryRule),
};

type F = { classification: string; complianceOutcome?: string; subject: string; explanationBasis: string };

async function main() {
  const pins = (process.env["SWEEP_PINS"] ?? "").split(",").filter(Boolean);
  if (pins.length === 0) throw new Error("Set SWEEP_PINS=pin1,pin2");
  const extra = (process.env["SWEEP_RULES"] ?? "").split(",").filter(Boolean).flatMap((n) => EXTRA_SETS[n] ?? (() => { throw new Error(`Unknown rule set ${n}`); })());
  const db = getDb();
  const requestIds: string[] = [];
  const results: Record<string, unknown>[] = [];
  const verbose = Boolean(process.env["SWEEP_VERBOSE"]);

  async function generate(projectType: string, pin: string, details: Record<string, unknown>) {
    const snapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: pin, projectType, projectDetails: details };
    const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType, projectDetails: details, confirmedParcelId: pin, snapshot } as never).returning({ id: screeningRequests.id });
    requestIds.push(row!.id);
    const job = await createReportGenerationJob(db, row!.id, { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "zoning-parcel-sweep", authorizedAt: new Date().toISOString() });
    const claimed = await claimQueuedJob(db, job.id);
    if (!claimed) throw new Error("claim failed");
    await runReportGenerationPipeline(db, claimed, { testOnlyExtraActiveRules: extra });
    const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    const [artifact] = finished?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished.evidenceReportArtifactId)) : [];
    return { job: finished, artifact };
  }

  try {
    for (const pin of pins) {
      try {
        const poly = await fetchParcelBoundaryPolygon(pin);
        const n = poly.points.length;
        const mid = (i: number) => ({ x: (poly.points[i]!.x + poly.points[(i + 1) % n]!.x) / 2, y: (poly.points[i]!.y + poly.points[(i + 1) % n]!.y) / 2 });
        const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
        const front = 0;
        let rear = 1;
        for (let i = 1; i < n; i++) if (dist(mid(i), mid(front)) > dist(mid(rear), mid(front))) rear = i;
        const roles = { method: "USER_INDICATED", status: "ASSIGNED", frontEdgeRef: `edge-${front}`, rearEdgeRef: `edge-${rear}`, sideEdgeRefs: Array.from({ length: n }, (_, i) => i).filter((i) => i !== front && i !== rear).map((i) => `edge-${i}`), multipleFrontageAnswer: "NO" };
        const cx = mid(front).x + 0.82 * (mid(rear).x - mid(front).x);
        const cy = mid(front).y + 0.82 * (mid(rear).y - mid(front).y);
        const ll = await db.execute(sql`select ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lat, ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lng`);
        const { lat, lng } = ll.rows[0] as { lat: number; lng: number };
        const outlines = await fetchBuildingFootprints(pin);
        const house = [...outlines].sort((a, b) => (b.areaSqFt ?? 0) - (a.areaSqFt ?? 0))[0];
        const placement = { anchor: { lat, lng }, orientationDeg: 0 };

        const runs: [string, Record<string, unknown>][] = [
          ["shed", { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, proposedPlacement: placement, lotLineRoleAssignment: roles, ...(house ? { primaryDwellingSelection: { status: "SELECTED", outlineId: house.outlineId, method: "USER_CONFIRMED" } } : {}) }],
          ["garage", { widthFt: 12, depthFt: 20, heightFt: 10, alleyAdjacent: false, proposedPlacement: placement, lotLineRoleAssignment: roles, existingStructuresFootprintSqFt: 1200, ...(house ? { primaryDwellingSelection: { status: "SELECTED", outlineId: house.outlineId, method: "USER_CONFIRMED" } } : {}), ...(process.env["SWEEP_DRIVEWAY"] ? { drivewayOrAisleBetween: process.env["SWEEP_DRIVEWAY"] === "yes" } : {}) }],
          ["fence", { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK", "FRONT_SETBACK"], siteSlopes: false, wallRelation: "NONE", hasMasonryOrConcreteAbove6Ft: false }],
          ...(process.env["SWEEP_ADU"] ? ([["adu", { aduType: "DETACHED_NEW", widthFt: 16, depthFt: 20, stories: 1, bedrooms: 1, heightFt: 15, alleyAdjacent: false, existingPrincipalDwellingUnits: 1, existingAduCount: 0, proposedPlacement: placement, lotLineRoleAssignment: roles, ...(house ? { primaryDwellingSelection: { status: "SELECTED", outlineId: house.outlineId, method: "USER_CONFIRMED" } } : {}) }]] as [string, Record<string, unknown>][]) : []),
          ["deck", { heightAboveGradeIn: 30, widthFt: 10, depthFt: 12, attachment: "DETACHED", buildingRelation: "OPEN_GROUND_BELOW", setbackLocations: ["SIDE_SETBACK"] }],
        ];
        for (const [kind, details] of runs) {
          const r = await generate(kind, pin, details);
          const findings = (r.artifact?.findings ?? []) as F[];
          const evidence = (r.artifact?.evidence ?? []) as { factType: string; value: unknown }[];
          const zoning = evidence.find((e) => e.factType === "zoning-resolution")?.value as { status?: string; governing?: string; lotZones?: string[]; ambiguousClaims?: unknown[] } | undefined;
          if (verbose) for (const f of findings) console.log("   ", kind, f.subject.slice(0, 60), f.classification, f.complianceOutcome ?? "", f.explanationBasis.slice(0, 150));
          results.push({
            pin, kind, state: r.job?.state, failure: r.job?.state === "COMPLETE" ? undefined : (r.job as { failureReason?: string } | undefined)?.failureReason,
            zone: zoning?.governing ?? zoning?.lotZones?.join("+"), zoningStatus: zoning?.status, ambiguous: zoning?.ambiguousClaims?.length,
            outcomes: findings.filter((f) => !f.subject.startsWith("Critical area") && !f.subject.startsWith("Zoning") && !f.subject.startsWith("Overlay")).map((f) => `${f.subject.slice(0, 28)}=${f.classification[0]}${f.complianceOutcome ? "/" + f.complianceOutcome : ""}`).join("; "),
            uncovered: (evidence.find((e) => e.factType === "uncovered-constraint-types")?.value as string[] | undefined)?.join("|"),
            fail: findings.filter((f) => f.complianceOutcome === "FAIL").map((f) => `${f.subject.slice(0, 40)}: ${f.explanationBasis.slice(0, 140)}`),
          });
        }
      } catch (err) {
        results.push({ pin, kind: "ERROR", error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
      }
    }
  } finally {
    for (const id of requestIds) {
      await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
      await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
  }
  for (const r of results) console.log(JSON.stringify(r));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
