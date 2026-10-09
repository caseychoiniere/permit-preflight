/**
 * ADU screening across zone families - live pipeline on real parcels (DB-gated; 2026-10-09): Midrise and Highrise (and, below, commercial) use their own rows, name the
 * real zoning, state each zone's own standards, and never carry Neighborhood Residential or Lowrise text. Candidate rows that are not ACTIVE in the connected database (a fresh
 * environment) are evaluated through the pipeline's test-only seam; a row that IS active is never injected too (two active rows for one claim conflict).
 *   MR (M1) 2784600070 | HR (M) 8590900490 | NC2-40 (M) 7625701280 (no residential neighbor) | NC2P-55 (M) 1794501135 (residential neighbor) | C1-55 (M) 1972206390 | LR1 (M) 1931300060 (control)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { evidenceReportArtifacts, regulatoryRules, reportGenerationJobs, screeningRequests } from "../../src/db/schema.js";
import { claimQueuedJob, createReportGenerationJob } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType } from "../../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../../src/report-generation-orchestrator/pipeline.js";
import { fetchParcelBoundaryPolygon } from "../../src/property-intelligence/king-county-parcel-geometry.js";
import { fetchBuildingFootprints } from "../../src/property-intelligence/seattle-building-outlines.js";
import { draft } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { ADU_MR_HR_FIXED_ROW_IDS, aduMrHrCandidates } from "../fixtures/multifamily-adu-mr-hr-candidates.js";
import { ADU_COMM_FIXED_ROW_IDS, aduCommercialCandidates } from "../fixtures/commercial-adu-candidates.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const AFFECTED = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca", "seattle-zoning", "seattle-landmarks", "seattle-frequent-transit"];
const act = (c: { id: string } & Record<string, unknown>, ids: Record<string, string>): RegulatoryRule =>
  ({ ...draft(c as never), id: ids[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }) as RegulatoryRule;
const EXTRA: RegulatoryRule[] = [...aduMrHrCandidates.map((c) => act(c as never, ADU_MR_HR_FIXED_ROW_IDS)), ...aduCommercialCandidates.map((c) => act(c as never, ADU_COMM_FIXED_ROW_IDS))];
let extraNotActive: RegulatoryRule[] = EXTRA;

type F = { subject: string; classification: string; complianceOutcome?: string; explanationBasis: string; appliedRule?: { id: string } };

describe.skipIf(!hasDb)("ADU across zone families - real parcels", () => {
  let db: Db;
  let health: DataSourceHealthSnapshot;
  const requestIds: string[] = [];
  beforeAll(async () => {
    db = getDb();
    health = await snapshotDataSourceHealth(db, AFFECTED);
    const active = await db.select({ id: regulatoryRules.id }).from(regulatoryRules).where(and(inArray(regulatoryRules.id, EXTRA.map((r) => r.id)), eq(regulatoryRules.lifecycleState, "ACTIVE")));
    const ids = new Set(active.map((r) => r.id));
    extraNotActive = EXTRA.filter((r) => !ids.has(r.id));
  });
  afterAll(async () => {
    try {
      for (const id of requestIds) {
        await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
        await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
        await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
      }
    } finally {
      await restoreDataSourceHealth(db, health);
    }
  });

  async function generateAdu(pin: string, over: Record<string, unknown> = {}) {
    const poly = await fetchParcelBoundaryPolygon(pin);
    const n = poly.points.length;
    const mid = (i: number) => ({ x: (poly.points[i]!.x + poly.points[(i + 1) % n]!.x) / 2, y: (poly.points[i]!.y + poly.points[(i + 1) % n]!.y) / 2 });
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    let rear = 1;
    for (let i = 1; i < n; i++) if (dist(mid(i), mid(0)) > dist(mid(rear), mid(0))) rear = i;
    const roles = { method: "USER_INDICATED", status: "ASSIGNED", frontEdgeRef: "edge-0", rearEdgeRef: `edge-${rear}`, sideEdgeRefs: Array.from({ length: n }, (_, i) => i).filter((i) => i !== 0 && i !== rear).map((i) => `edge-${i}`), multipleFrontageAnswer: "NO" };
    const cx = mid(0).x + 0.6 * (mid(rear).x - mid(0).x);
    const cy = mid(0).y + 0.6 * (mid(rear).y - mid(0).y);
    const ll = await db.execute(sql`select ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lat, ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lng`);
    const { lat, lng } = ll.rows[0] as { lat: number; lng: number };
    const house = [...(await fetchBuildingFootprints(pin))].sort((a, b) => (b.areaSqFt ?? 0) - (a.areaSqFt ?? 0))[0];
    const details = {
      aduType: "DETACHED_NEW", widthFt: 16, depthFt: 20, stories: 1, bedrooms: 1, heightFt: 15, alleyAdjacent: false, existingPrincipalDwellingUnits: 1, existingAduCount: 0,
      proposedPlacement: { anchor: { lat, lng }, orientationDeg: 0 }, lotLineRoleAssignment: roles,
      ...(house ? { primaryDwellingSelection: { status: "SELECTED", outlineId: house.outlineId, method: "USER_CONFIRMED" } } : {}),
      ...over,
    };
    const snapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: pin, projectType: "adu", projectDetails: details };
    const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType: "adu", projectDetails: details, confirmedParcelId: pin, snapshot } as never).returning({ id: screeningRequests.id });
    requestIds.push(row!.id);
    const job = await createReportGenerationJob(db, row!.id, { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "adu-zone-families.integration.test.ts", authorizedAt: new Date().toISOString() });
    const claimed = await claimQueuedJob(db, job.id);
    if (!claimed) throw new Error("claim failed");
    await runReportGenerationPipeline(db, claimed, { testOnlyExtraActiveRules: extraNotActive });
    const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    const [artifact] = finished?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished.evidenceReportArtifactId)) : [];
    return { job: finished, artifact };
  }
  const findings = (a: { findings: unknown } | undefined) => a!.findings as F[];
  const uncovered = (a: { evidence: unknown } | undefined) => ((a!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "uncovered-constraint-types")?.value ?? []) as string[];
  const zoning = (a: { evidence: unknown } | undefined) => (a!.evidence as { factType: string; value: { status: string; governing: string; appliedRules: { id: string }[] } }[]).find((e) => e.factType === "zoning-resolution")!.value;

  it("Midrise (MR M1): completes with Midrise standards - 15 ft rear, Table B, a 5 ft separation, 80 ft height, 4.5 FAR, floor-area amenity basis - and nothing uncovered", async () => {
    const { job, artifact } = await generateAdu("2784600070");
    expect(job?.state).toBe("COMPLETE");
    const z = zoning(artifact);
    expect(z.status).toBe("RESOLVED");
    expect(z.governing).toBe("MR (M1)");
    expect(uncovered(artifact)).toEqual([]);
    const f = findings(artifact);
    const by = (s: string) => f.find((x) => x.subject === s);
    expect(by("ADU rear setback")?.explanationBasis).toMatch(/15 ft/);
    expect(by("Separation from the existing dwelling")?.explanationBasis).toMatch(/5 ft apart/);
    expect(by("ADU height")?.explanationBasis).toMatch(/80 ft/);
    expect(by("Floor area ratio (FAR)")?.explanationBasis).toMatch(/4\.5 times/);
    expect(by("Amenity area")?.explanationBasis).toMatch(/5% of the total gross floor area/);
    expect(by("Zoning applied to this screening")?.explanationBasis).toContain("Midrise");
    for (const x of f) expect(x.explanationBasis, x.subject).not.toMatch(/23\.44\.|Neighborhood Residential|Lowrise/);
    // The rules applied are Midrise/Highrise rows (never a Lowrise, NR or commercial row), and the set includes this zone's setback, height and FAR rows.
    const applied = new Set(z.appliedRules.map((r) => r.id));
    const mrhr = new Set(Object.values(ADU_MR_HR_FIXED_ROW_IDS));
    expect(z.appliedRules.length).toBeGreaterThan(5);
    for (const id of applied) expect(mrhr.has(id), `applied rule ${id} is a Midrise/Highrise row`).toBe(true);
    for (const wanted of ["adu-mrhr-setbacks-2026", "adu-mr-separation-2026", "adu-mrhr-height-mr-mha-2026", "adu-mrhr-far-mr-mha-2026"]) expect(applied.has(ADU_MR_HR_FIXED_ROW_IDS[wanted]!), wanted).toBe(true);
  }, 240_000);

  it("Highrise (HR M): completes with Highrise standards - the separation claim is answered (no separation requirement in Highrise), 440 ft height, base FAR 7 - and nothing uncovered", async () => {
    const { job, artifact } = await generateAdu("8590900490");
    expect(job?.state).toBe("COMPLETE");
    const z = zoning(artifact);
    expect(z.governing).toBe("HR (M)");
    expect(uncovered(artifact)).toEqual([]);
    const f = findings(artifact);
    const sep = f.find((x) => x.subject === "Separation from the existing dwelling");
    expect(sep?.explanationBasis).toMatch(/no required separation between structures/);
    expect(sep?.complianceOutcome).toBe("PASS");
    expect(f.find((x) => x.subject === "ADU height")?.explanationBasis).toMatch(/440 ft/);
    expect(f.find((x) => x.subject === "Floor area ratio (FAR)")?.explanationBasis).toMatch(/7 times/);
    for (const x of f) expect(x.explanationBasis, x.subject).not.toMatch(/23\.44\.|Neighborhood Residential|Lowrise/);
  }, 240_000);

  it("Midrise: an ADU taller than 42 ft gets verification (not a definite setback result), because the table changes for taller portions", async () => {
    const tall = await generateAdu("2784600070", { heightFt: 55 });
    expect(tall.job?.state, JSON.stringify(tall.job?.failureReasons)).toBe("COMPLETE");
    const rear = findings(tall.artifact).find((x) => x.subject === "ADU rear setback");
    expect(rear?.classification).toBe("REQUIRES_VERIFICATION");
    expect(rear?.explanationBasis).toMatch(/taller than 42 ft/);
  }, 240_000);

  it("NC2-40 (M), no residential neighbor: completes with Chapter 23.47A standards - no setback requirement, mapped 40 ft height, no separation or lot-coverage limit - and nothing uncovered", async () => {
    const { job, artifact } = await generateAdu("7625701280");
    expect(job?.state).toBe("COMPLETE");
    const z = zoning(artifact);
    expect(z.status).toBe("RESOLVED");
    expect(z.governing).toBe("NC2-40 (M)");
    expect(uncovered(artifact)).toEqual([]);
    const f = findings(artifact);
    const setbacks = f.find((x) => x.subject === "ADU setbacks in a commercial zone");
    expect(setbacks?.classification).toBe("KNOWN");
    expect(setbacks?.complianceOutcome).toBe("PASS");
    expect(f.find((x) => x.subject === "ADU height")?.explanationBasis).toMatch(/30 ft at the lowest/);
    expect(f.find((x) => x.subject === "Separation from the existing dwelling")?.explanationBasis).toMatch(/no required separation/);
    expect(f.find((x) => x.subject === "Floor area ratio (FAR)")?.explanationBasis).toContain("SMC 23.47A.013");
    for (const x of f) expect(x.explanationBasis, x.subject).not.toMatch(/23\.44\.|23\.45\.|Neighborhood Residential|Lowrise|Midrise|Highrise/);
  }, 240_000);

  it("NC2P-55 (M) next to residential zoning: the setback claim names the abutting-zone rules and is REQUIRES_VERIFICATION; the neighboring zoning read is persisted as evidence", async () => {
    const { job, artifact } = await generateAdu("1794501135");
    expect(job?.state).toBe("COMPLETE");
    expect(uncovered(artifact)).toEqual([]);
    const setbacks = findings(artifact).find((x) => x.subject === "ADU setbacks in a commercial zone");
    expect(setbacks?.classification).toBe("REQUIRES_VERIFICATION");
    expect(setbacks?.explanationBasis).toMatch(/upper-level setback/);
    expect((artifact!.evidence as { factType: string }[]).some((e) => e.factType === "zoning-adjacent")).toBe(true);
  }, 240_000);

  it("C1-55 (M): completes with Commercial 1 standards and nothing uncovered", async () => {
    const { job, artifact } = await generateAdu("1972206390");
    expect(job?.state).toBe("COMPLETE");
    expect(zoning(artifact).governing).toBe("C1-55 (M)");
    expect(uncovered(artifact)).toEqual([]);
    expect(findings(artifact).find((x) => x.subject === "Zoning applied to this screening")?.explanationBasis).toContain("Commercial (C1)");
  }, 240_000);

  it("control - Lowrise (LR1 M) is unchanged: Lowrise text, nothing uncovered", async () => {
    const { job, artifact } = await generateAdu("1931300060");
    expect(job?.state).toBe("COMPLETE");
    expect(zoning(artifact).governing).toBe("LR1 (M)");
    expect(uncovered(artifact)).toEqual([]);
    expect(findings(artifact).find((x) => x.subject === "ADU height")?.explanationBasis).toMatch(/32 ft/);
  }, 240_000);
});
