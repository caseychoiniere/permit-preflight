/**
 * ADU robustness sweep (Unit 11): runs the REAL ADU pipeline - live King County parcel geometry, Seattle zoning,
 * building outlines and critical-area layers, real PostGIS, the real evaluator and artifact persistence - over a
 * sample of real Seattle residential parcels, for each of the three ADU kinds, and reports crashes and the
 * distribution of headlines. It exists to find robustness problems (odd parcel shapes, no outlines, multi-polygon
 * data, missing layers) before customers do. It inserts its OWN random-id ACTIVE copies of the ADU rule candidates
 * (never touching the real APPROVED rows) and deletes them and every request it created in a `finally`.
 *
 * Usage: `npx tsx scripts/adu-parcel-sweep.ts [parcelsPerOffset]` (loads .env.local; needs DATABASE_URL).
 */

import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { evidenceReportArtifacts, regulatoryRules, reportGenerationJobs, screeningRequests } from "../src/db/schema.js";
import { createReportGenerationJob, claimQueuedJob } from "../src/report-generation-job/repository.js";
import { GenerationAuthorizationType } from "../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../src/report-generation-orchestrator/pipeline.js";
import { fetchParcelBoundaryPolygon } from "../src/property-intelligence/king-county-parcel-geometry.js";
import { fetchBuildingFootprints } from "../src/property-intelligence/seattle-building-outlines.js";
import { realAduCandidates, tierForRealAduCandidate } from "../tests/fixtures/adu-candidates.js";
import type { AduFeasibility } from "../src/regulatory-rules-engine/adu-types.js";

process.loadEnvFile(".env.local");

const OFFSETS = [3000, 12000, 21000, 30000, 39000, 48000, 57000, 66000];
const KC = "https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_PropertyInfo/MapServer/2/query";

async function candidatePins(perOffset: number): Promise<{ pin: string; addr: string }[]> {
  const out: { pin: string; addr: string }[] = [];
  for (const offset of OFFSETS) {
    const url = `${KC}?where=${encodeURIComponent("CTYNAME='SEATTLE' AND PROPTYPE='R' AND LOTSQFT>2500")}&outFields=PIN,ADDR_FULL&returnGeometry=false&resultOffset=${offset}&resultRecordCount=${perOffset * 7}&f=json`;
    const json = (await (await fetch(url)).json()) as { features?: { attributes: { PIN: string; ADDR_FULL: string | null } }[] };
    const feats = json.features ?? [];
    for (let i = 0; i < feats.length && out.length < (OFFSETS.indexOf(offset) + 1) * perOffset; i += 7) out.push({ pin: feats[i]!.attributes.PIN, addr: feats[i]!.attributes.ADDR_FULL ?? "(no address)" });
  }
  return out;
}

async function main() {
  const perOffset = Number(process.argv[2] ?? "2");
  const db = getDb();
  const ruleIds: string[] = [];
  const requestIds: string[] = [];
  const results: Record<string, unknown>[] = [];
  try {
    const rows = realAduCandidates.map((c) => {
      const id = randomUUID();
      ruleIds.push(id);
      return {
        id,
        subject: `ADU-SWEEP-ONLY: ${c.subject}`,
        applicableProjectType: "adu",
        applicableWorkflowType: "EXISTING_PROPERTY",
        applicableZone: "NR",
        ruleSpecification: c.ruleSpecification,
        citation: c.citation,
        lifecycleState: "ACTIVE",
        tier: tierForRealAduCandidate(c.id),
        caveats: c.caveats,
        testCases: c.testCases,
        verificationHistory: [{ tier: "TIER_1", founderIdentity: "adu-sweep@example.com", founderVerifiedAt: "2026-01-01T00:00:00.000Z" }],
        isTestOnlyFixture: true,
        acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
      };
    });
    await db.insert(regulatoryRules).values(rows as never);

    const only = process.env["SWEEP_PINS"]?.split(",").filter(Boolean);
    const pins = only ? only.map((pin) => ({ pin, addr: "(requested)" })) : await candidatePins(perOffset);
    console.log(`Sweeping ${pins.length} parcels x 3 ADU kinds`);

    async function generate(pin: string, details: Record<string, unknown>) {
      const snapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: pin, projectType: "adu", projectDetails: details };
      const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType: "adu", projectDetails: details, confirmedParcelId: pin, snapshot } as never).returning({ id: screeningRequests.id });
      requestIds.push(row!.id);
      const job = await createReportGenerationJob(db, row!.id, { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "adu-parcel-sweep", authorizedAt: new Date().toISOString() });
      const claimed = await claimQueuedJob(db, job.id);
      if (!claimed) throw new Error("claim failed");
      await runReportGenerationPipeline(db, claimed);
      const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
      const [artifact] = finished?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished.evidenceReportArtifactId)) : [];
      return { job: finished, artifact };
    }
    const summarize = (kind: string, pin: string, addr: string, r: Awaited<ReturnType<typeof generate>>) => {
      const feas = r.artifact ? ((r.artifact.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "adu-feasibility")?.value as AduFeasibility | undefined) : undefined;
      const findings = (r.artifact?.findings ?? []) as { classification: string; complianceOutcome?: string; subject: string }[];
      if (process.env["SWEEP_VERBOSE"]) for (const f of findings.filter((x) => /setback|Separation|Lot coverage/.test(x.subject))) console.log("   ", kind, f.subject, f.classification, f.complianceOutcome ?? "", (f as unknown as { explanationBasis: string }).explanationBasis.slice(0, 190));
      results.push({
        pin, addr, kind, state: r.job?.state, failure: r.job?.state === "COMPLETE" ? undefined : (r.job as { failureReason?: string } | undefined)?.failureReason,
        headline: feas?.headline, blockers: feas?.blockers.length, constraints: feas?.constraints.length, verify: feas?.verifyBeforeDesign.length,
        known: findings.filter((f) => f.classification === "KNOWN").length, fail: findings.filter((f) => f.complianceOutcome === "FAIL").map((f) => f.subject),
      });
    };

    for (const { pin, addr } of pins) {
      try {
        const poly = await fetchParcelBoundaryPolygon(pin);
        const n = poly.points.length;
        const mid = (i: number) => ({ x: (poly.points[i]!.x + poly.points[(i + 1) % n]!.x) / 2, y: (poly.points[i]!.y + poly.points[(i + 1) % n]!.y) / 2 });
        const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
        const front = 0;
        let rear = 1;
        for (let i = 1; i < n; i++) if (dist(mid(i), mid(front)) > dist(mid(rear), mid(front))) rear = i;
        const roles = { method: "USER_INDICATED", status: "ASSIGNED", frontEdgeRef: `edge-${front}`, rearEdgeRef: `edge-${rear}`, sideEdgeRefs: Array.from({ length: n }, (_, i) => i).filter((i) => i !== front && i !== rear).map((i) => `edge-${i}`), multipleFrontageAnswer: "NO" };
        // A back-yard position: 82% of the way from the front edge's midpoint toward the rear edge's midpoint (the centroid is usually where the house is).
        const cx = mid(front).x + 0.82 * (mid(rear).x - mid(front).x);
        const cy = mid(front).y + 0.82 * (mid(rear).y - mid(front).y);
        const ll = await db.execute(sql`select ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lat, ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lng`);
        const { lat, lng } = ll.rows[0] as { lat: number; lng: number };
        const outlines = await fetchBuildingFootprints(pin);
        const sorted = [...outlines].sort((a, b) => (b.areaSqFt ?? 0) - (a.areaSqFt ?? 0));
        const house = sorted[0];
        const common = { stories: 1, bedrooms: 1, existingPrincipalDwellingUnits: 1, existingAduCount: 0 };

        summarize("attached", pin, addr, await generate(pin, { aduType: "ATTACHED_TO_HOUSE", grossFloorAreaSqFt: 600, includesAddition: false, portionExistedBeforeJuly2023: true, bedrooms: 1, existingPrincipalDwellingUnits: 1, existingAduCount: 0 }));
        summarize("detached", pin, addr, await generate(pin, { aduType: "DETACHED_NEW", ...common, widthFt: 14, depthFt: 20, heightFt: 16, alleyAdjacent: false, proposedPlacement: { anchor: { lat, lng }, orientationDeg: 0 }, lotLineRoleAssignment: roles, ...(house ? { primaryDwellingSelection: { status: "SELECTED", outlineId: house.outlineId, method: "USER_CONFIRMED" } } : {}) }));
        if (sorted.length >= 2) {
          summarize("conversion", pin, addr, await generate(pin, { aduType: "CONVERSION_EXISTING", ...common, alleyAdjacent: false, existedBeforeJuly2023: true, keepsFootprintAndHeight: true, convertedStructure: { outlineId: sorted[sorted.length - 1]!.outlineId, method: "USER_CONFIRMED" }, lotLineRoleAssignment: roles, primaryDwellingSelection: { status: "SELECTED", outlineId: house!.outlineId, method: "USER_CONFIRMED" } }));
        }
      } catch (err) {
        results.push({ pin, addr, kind: "ERROR", error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
      }
    }
  } finally {
    for (const id of requestIds) {
      await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
      await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
    if (ruleIds.length) await db.delete(regulatoryRules).where(inArray(regulatoryRules.id, ruleIds));
  }
  for (const r of results) console.log(JSON.stringify(r));
  const tally: Record<string, number> = {};
  for (const r of results) tally[`${r["kind"]}:${r["state"] ?? "ERROR"}:${r["headline"] ?? "-"}`] = (tally[`${r["kind"]}:${r["state"] ?? "ERROR"}:${r["headline"] ?? "-"}`] ?? 0) + 1;
  console.log("TALLY", JSON.stringify(tally, null, 1));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
