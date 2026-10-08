/**
 * Shed and garage robustness sweep: runs the REAL pipeline against the REAL ACTIVE shed/garage rules (no copies, nothing inserted) over a sample of real
 * Seattle residential parcels with a back-yard placement and reports crashes, the distribution of outcomes, and any definite FAIL (which is then eyeballed:
 * a back-yard 8x10 shed or 12x20 garage should rarely be a definite failure, and a garage side/front shortfall must never be one).
 *
 * Usage: `npx tsx scripts/accessory-parcel-sweep.ts [parcelsPerOffset]` (loads .env.local; needs DATABASE_URL). SWEEP_PINS=a,b restricts to given pins.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { evidenceReportArtifacts, reportGenerationJobs, screeningRequests } from "../src/db/schema.js";
import { createReportGenerationJob, claimQueuedJob } from "../src/report-generation-job/repository.js";
import { GenerationAuthorizationType } from "../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../src/report-generation-orchestrator/pipeline.js";
import { fetchParcelBoundaryPolygon } from "../src/property-intelligence/king-county-parcel-geometry.js";
import { fetchBuildingFootprints } from "../src/property-intelligence/seattle-building-outlines.js";

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
  const requestIds: string[] = [];
  const results: Record<string, unknown>[] = [];
  try {
    const only = process.env["SWEEP_PINS"]?.split(",").filter(Boolean);
    const pins = only ? only.map((pin) => ({ pin, addr: "(requested)" })) : await candidatePins(perOffset);
    console.log(`Sweeping ${pins.length} parcels x shed + garage`);

    async function generate(projectType: "shed" | "garage", pin: string, details: Record<string, unknown>) {
      const snapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: pin, projectType, projectDetails: details };
      const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType, projectDetails: details, confirmedParcelId: pin, snapshot } as never).returning({ id: screeningRequests.id });
      requestIds.push(row!.id);
      const job = await createReportGenerationJob(db, row!.id, { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "accessory-parcel-sweep", authorizedAt: new Date().toISOString() });
      const claimed = await claimQueuedJob(db, job.id);
      if (!claimed) throw new Error("claim failed");
      await runReportGenerationPipeline(db, claimed);
      const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
      const [artifact] = finished?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished.evidenceReportArtifactId)) : [];
      return { job: finished, artifact };
    }
    type F = { classification: string; complianceOutcome?: string; subject: string; explanationBasis: string };
    const summarize = (kind: string, pin: string, addr: string, r: Awaited<ReturnType<typeof generate>>) => {
      const findings = (r.artifact?.findings ?? []) as F[];
      const evidence = (r.artifact?.evidence ?? []) as { factType: string; value: unknown }[];
      const positional = findings.filter((f) => /rear|\(side\)|\(front\)|dwelling|setback/i.test(f.subject) && !f.subject.startsWith("Critical") && !f.subject.startsWith("Zoning"));
      if (process.env["SWEEP_VERBOSE"]) for (const f of positional) console.log("   ", kind, f.subject.slice(0, 45), f.classification, f.complianceOutcome ?? "", f.explanationBasis.slice(0, 160));
      results.push({
        pin, addr, kind, state: r.job?.state, failure: r.job?.state === "COMPLETE" ? undefined : (r.job as { failureReason?: string } | undefined)?.failureReason,
        zoning: findings.find((f) => f.subject.startsWith("Zoning"))?.classification,
        positional: positional.map((f) => `${f.classification}${f.complianceOutcome ? "/" + f.complianceOutcome : ""}`).join(","),
        uncovered: (evidence.find((e) => e.factType === "uncovered-constraint-types")?.value as string[] | undefined)?.join("|"),
        fail: findings.filter((f) => f.complianceOutcome === "FAIL").map((f) => `${f.subject.slice(0, 40)}: ${f.explanationBasis.slice(0, 120)}`),
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
        const cx = mid(front).x + 0.82 * (mid(rear).x - mid(front).x);
        const cy = mid(front).y + 0.82 * (mid(rear).y - mid(front).y);
        const ll = await db.execute(sql`select ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lat, ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lng`);
        const { lat, lng } = ll.rows[0] as { lat: number; lng: number };
        const outlines = await fetchBuildingFootprints(pin);
        const house = [...outlines].sort((a, b) => (b.areaSqFt ?? 0) - (a.areaSqFt ?? 0))[0];
        const placement = { anchor: { lat, lng }, orientationDeg: 0 };

        summarize("shed", pin, addr, await generate("shed", pin, { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, proposedPlacement: placement, lotLineRoleAssignment: roles, ...(house ? { primaryDwellingSelection: { status: "SELECTED", outlineId: house.outlineId, method: "USER_CONFIRMED" } } : {}) }));
        summarize("garage", pin, addr, await generate("garage", pin, { widthFt: 12, depthFt: 20, heightFt: 10, alleyAdjacent: false, proposedPlacement: placement, lotLineRoleAssignment: roles, existingStructuresFootprintSqFt: 1200 }));
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
  }
  for (const r of results) console.log(JSON.stringify(r));
  const tally: Record<string, number> = {};
  for (const r of results) {
    const k = `${r["kind"]}:${r["state"] ?? "ERROR"}:${r["positional"] ?? "-"}`;
    tally[k] = (tally[k] ?? 0) + 1;
  }
  console.log("TALLY", JSON.stringify(tally, null, 1));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
