/**
 * Detached-garage separation from the principal structure - live pipeline on real parcels (DB-gated; zone-aware expected-constraint fix, 2026-10-09).
 *   NR 1498301270 | LR1 (M) 1931300060 | LR2 (M) 7960100315 | MR (M1) 2784600070 | HR (M) 8590900490 | NC2-40 (M) 7625701280 | split NR + LR2 0148000965
 * The separation rows are activated 2026-10-09; any candidate row that is not ACTIVE in the connected database (a fresh environment) is evaluated through the
 * pipeline's test-only seam instead (nothing is written to the rules table). A row that IS active is never injected too (two active rows for one claim conflict).
 * The expected outcome of every placement is computed here from the MEASURED distance by an independent oracle of the code's thresholds, so each placement
 * checks the whole path: building outline -> PostGIS distance -> zone-resolved rule -> finding.
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
import { MULTIFAMILY_FIXED_ROW_IDS, allMultifamilyCandidates } from "../fixtures/multifamily-candidates.js";
import { GARAGE_SEPARATION_FIXED_ROW_IDS, garageSeparationCandidates } from "../fixtures/garage-separation-candidates.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const AFFECTED = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca", "seattle-zoning", "seattle-landmarks", "seattle-frequent-transit"];
const SUBJECT = "Detached garage separation from the principal structure";
const act = (c: { id: string } & Record<string, unknown>, ids: Record<string, string>): RegulatoryRule =>
  ({ ...draft(c as never), id: ids[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }) as RegulatoryRule;
const EXTRA: RegulatoryRule[] = [
  ...garageSeparationCandidates.map((c) => act(c as never, GARAGE_SEPARATION_FIXED_ROW_IDS)),
  ...allMultifamilyCandidates.filter((c) => /-hr-2026$/.test(c.id) && /separation|parking-access/.test(c.id)).map((c) => act(c as never, MULTIFAMILY_FIXED_ROW_IDS)),
];
const EXTRA_IDS = EXTRA.map((r) => r.id);
let extraNotActive: RegulatoryRule[] = EXTRA;

type F = { subject: string; classification: string; complianceOutcome?: string; supportingEvidence: string[]; explanationBasis: string; appliedRule?: { id: string } };

/** The code's thresholds, written out independently of the evaluator (3 ft in a setback, 5 ft between structures, 24 ft cap with a driveway, 2 ft tolerance). */
function oracle(d: number, family: "TWO" | "HR", driveway: boolean | undefined, inSetback: boolean | undefined): string {
  const tol = 2;
  if (family === "HR") {
    if (d >= 3 + tol) return "KNOWN/PASS";
    if (d < 3 - tol && inSetback === true) return "KNOWN/FAIL";
    return "REQUIRES_VERIFICATION";
  }
  if (d < 3 - tol) return "KNOWN/FAIL";
  if (d >= 24 + tol) return "KNOWN/PASS";
  if (d >= 5 + tol) return driveway === false ? "KNOWN/PASS" : "REQUIRES_VERIFICATION";
  return "REQUIRES_VERIFICATION";
}
const oc = (f: F) => `${f.classification}${f.complianceOutcome ? "/" + f.complianceOutcome : ""}`;

describe.skipIf(!hasDb)("garage separation from the principal structure - real parcels across zone families", () => {
  let db: Db;
  let health: DataSourceHealthSnapshot;
  const requestIds: string[] = [];
  beforeAll(async () => {
    db = getDb();
    health = await snapshotDataSourceHealth(db, AFFECTED);
    const active = await db.select({ id: regulatoryRules.id }).from(regulatoryRules).where(and(inArray(regulatoryRules.id, EXTRA_IDS), eq(regulatoryRules.lifecycleState, "ACTIVE")));
    const activeIds = new Set(active.map((r) => r.id));
    extraNotActive = EXTRA.filter((r) => !activeIds.has(r.id));
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

  async function generate(pin: string, details: Record<string, unknown>) {
    const snapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: pin, projectType: "garage", projectDetails: details };
    const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType: "garage", projectDetails: details, confirmedParcelId: pin, snapshot } as never).returning({ id: screeningRequests.id });
    requestIds.push(row!.id);
    const job = await createReportGenerationJob(db, row!.id, { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "garage-separation.integration.test.ts", authorizedAt: new Date().toISOString() });
    const claimed = await claimQueuedJob(db, job.id);
    if (!claimed) throw new Error("claim failed");
    await runReportGenerationPipeline(db, claimed, { testOnlyExtraActiveRules: extraNotActive });
    const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    const [artifact] = finished?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished.evidenceReportArtifactId)) : [];
    return { job: finished, artifact };
  }

  /** A garage 12 x 20 ft placed `t` of the way from the middle of the front edge to the middle of the rear edge, with the house (largest mapped outline) confirmed. */
  async function garageAt(pin: string, t: number, extra: Record<string, unknown> = {}, opts: { selectHouse?: boolean; shiftOutFt?: number } = {}) {
    const poly = await fetchParcelBoundaryPolygon(pin);
    const n = poly.points.length;
    const mid = (i: number) => ({ x: (poly.points[i]!.x + poly.points[(i + 1) % n]!.x) / 2, y: (poly.points[i]!.y + poly.points[(i + 1) % n]!.y) / 2 });
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    let rear = 1;
    for (let i = 1; i < n; i++) if (dist(mid(i), mid(0)) > dist(mid(rear), mid(0))) rear = i;
    const roles = { method: "USER_INDICATED", status: "ASSIGNED", frontEdgeRef: "edge-0", rearEdgeRef: `edge-${rear}`, sideEdgeRefs: Array.from({ length: n }, (_, i) => i).filter((i) => i !== 0 && i !== rear).map((i) => `edge-${i}`), multipleFrontageAnswer: "NO" };
    const shift = opts.shiftOutFt ?? 0;
    const cx = mid(0).x + t * (mid(rear).x - mid(0).x) + shift;
    const cy = mid(0).y + t * (mid(rear).y - mid(0).y) + shift;
    const ll = await db.execute(sql`select ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lat, ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lng`);
    const { lat, lng } = ll.rows[0] as { lat: number; lng: number };
    const house = [...(await fetchBuildingFootprints(pin))].sort((a, b) => (b.areaSqFt ?? 0) - (a.areaSqFt ?? 0))[0];
    return {
      widthFt: 12,
      depthFt: 20,
      heightFt: 10,
      alleyAdjacent: false,
      proposedPlacement: { anchor: { lat, lng }, orientationDeg: 0 },
      lotLineRoleAssignment: roles,
      existingStructuresFootprintSqFt: 1200,
      ...(house && opts.selectHouse !== false ? { primaryDwellingSelection: { status: "SELECTED", outlineId: house.outlineId, method: "USER_CONFIRMED" } } : {}),
      ...extra,
    };
  }

  const separationFinding = (a: { findings: unknown } | undefined) => (a!.findings as F[]).find((f) => f.subject === SUBJECT);
  const uncovered = (a: { evidence: unknown } | undefined) => ((a!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "uncovered-constraint-types")?.value ?? []) as string[];
  const measured = (f: F) => Number(f.supportingEvidence.find((e) => e.startsWith("distanceToDwellingFt="))!.split("=")[1]);

  const PARCELS: { pin: string; label: string; family: "TWO" | "HR"; rowScope: string }[] = [
    { pin: "1498301270", label: "NR", family: "TWO", rowScope: "garage-nr-separation-2026" },
    { pin: "1931300060", label: "LR1 (M)", family: "TWO", rowScope: "garage-mf-separation-lr-mr-2026" },
    { pin: "7960100315", label: "LR2 (M)", family: "TWO", rowScope: "garage-mf-separation-lr-mr-2026" },
    { pin: "2784600070", label: "MR (M1)", family: "TWO", rowScope: "garage-mf-separation-lr-mr-2026" },
  ];

  for (const p of PARCELS) {
    it(`${p.label} (${p.pin}): the separation finding matches the code's thresholds for every measured distance, cites the zone's own row, and is never listed as not screenable`, async () => {
      let sawAny = false;
      for (const t of [0.3, 0.6, 0.82]) {
        for (const driveway of [undefined, false] as const) {
          const { job, artifact } = await generate(p.pin, await garageAt(p.pin, t, driveway === undefined ? {} : { drivewayOrAisleBetween: driveway }));
          expect(job?.state).toBe("COMPLETE");
          const f = separationFinding(artifact);
          expect(f, `${p.label} t=${t}: separation finding`).toBeDefined();
          if (f!.classification === "REQUIRES_VERIFICATION" && !f!.supportingEvidence.some((e) => e.startsWith("distanceToDwellingFt="))) continue; // no measurable house on this parcel
          sawAny = true;
          const d = measured(f!);
          const inSetback = f!.supportingEvidence.includes("isInRequiredSetback=true") ? true : f!.supportingEvidence.includes("isInRequiredSetback=false") ? false : undefined;
          expect(oc(f!), `${p.label} t=${t} d=${d} driveway=${String(driveway)}`).toBe(oracle(d, p.family, driveway, inSetback));
          expect(f!.appliedRule?.id).toBe(GARAGE_SEPARATION_FIXED_ROW_IDS[p.rowScope]);
          expect(uncovered(artifact).join("|")).not.toMatch(/separation/);
          // Only the NR row cites Chapter 23.44; the multifamily rows cite 23.45 and never another family's chapter.
          if (p.label === "NR") {
            expect(f!.explanationBasis).toMatch(/23\.44/);
            expect(f!.explanationBasis).not.toMatch(/23\.45/);
          } else {
            expect(f!.explanationBasis).toMatch(/23\.45/);
            expect(f!.explanationBasis).not.toMatch(/23\.44/);
          }
          // The persisted zoning evidence lists exactly the rule that was applied for this claim.
          const zr = (artifact!.evidence as { factType: string; value: { appliedRules: { id: string }[] } }[]).find((e) => e.factType === "zoning-resolution")!.value;
          expect(zr.appliedRules.map((r) => r.id)).toContain(GARAGE_SEPARATION_FIXED_ROW_IDS[p.rowScope]);
        }
      }
      expect(sawAny, `${p.label}: at least one placement measured a distance to the confirmed house`).toBe(true);
    }, 240_000);
  }

  it("a garage with no building confirmed as the main house: the separation is REQUIRES_VERIFICATION saying why - not 'not yet screenable', not a PASS or FAIL", async () => {
    const { job, artifact } = await generate("1931300060", await garageAt("1931300060", 0.6, {}, { selectHouse: false }));
    expect(job?.state).toBe("COMPLETE");
    const f = separationFinding(artifact)!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.complianceOutcome).toBeUndefined();
    expect(f.explanationBasis).toMatch(/primary dwelling was selected|No building was confirmed|main house/i);
    expect(uncovered(artifact).join("|")).not.toMatch(/separation/);
  }, 120_000);

  it("a garage placed off the parcel (in the street) is a mis-placement: the separation and every position-dependent claim stay verification items, never a PASS or FAIL", async () => {
    const { job, artifact } = await generate("1931300060", await garageAt("1931300060", -0.25));
    expect(job?.state).toBe("COMPLETE");
    const f = separationFinding(artifact)!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toMatch(/could not be evaluated|outside the property boundary|Move it fully inside/i);
    const positionFindings = (artifact!.findings as F[]).filter((x) => /setback|separation/i.test(x.subject) && !/Zoning applied/.test(x.subject));
    expect(positionFindings.length).toBeGreaterThan(0);
    for (const x of positionFindings) expect(x.complianceOutcome, x.subject).toBeUndefined();
  }, 120_000);

  it("a Neighborhood Commercial lot: there is no garage-to-principal-structure separation in Chapter 23.47A, so no separation finding and no 'not yet screenable' notice", async () => {
    const { job, artifact } = await generate("7625701280", await garageAt("7625701280", 0.6));
    expect(job?.state).toBe("COMPLETE");
    expect((artifact!.findings as F[]).some((f) => /principal structure|separation from the house/i.test(f.subject))).toBe(false);
    expect(uncovered(artifact).join("|")).not.toMatch(/separation/);
    expect((artifact!.findings as F[]).some((f) => /Garage access/.test(f.subject))).toBe(true); // the commercial rows still apply
  }, 120_000);

  it("a Highrise lot: only the in-setback 3 ft exists, and no 5 ft rule or 'not yet screenable' notice is produced; garage access is governed", async () => {
    const { job, artifact } = await generate("8590900490", await garageAt("8590900490", 0.6));
    expect(job?.state).toBe("COMPLETE");
    const f = separationFinding(artifact);
    if (f && f.supportingEvidence.some((e) => e.startsWith("distanceToDwellingFt="))) {
      const inSetback = f.supportingEvidence.includes("isInRequiredSetback=true") ? true : f.supportingEvidence.includes("isInRequiredSetback=false") ? false : undefined;
      expect(oc(f)).toBe(oracle(measured(f), "HR", undefined, inSetback));
      expect(f.explanationBasis).not.toMatch(/23\.45\.519/);
    }
    expect(uncovered(artifact).join("|")).not.toMatch(/separation|garage access/);
    expect((artifact!.findings as F[]).some((x) => /Garage access/.test(x.subject))).toBe(true);
  }, 120_000);

  it("a lot split between NR and Lowrise: the separation claim is settled by exactly one zone's row (the footprint's) or reported as an ambiguous claim - never both, never a majority-zone answer, never 'not yet screenable'", async () => {
    const { job, artifact } = await generate("0148000965", await garageAt("0148000965", 0.6));
    expect(job?.state).toBe("COMPLETE");
    const zr = (artifact!.evidence as { factType: string; value: { status: string; appliedRules: { ruleType: string; id: string }[]; ambiguousClaims: { ruleType: string }[] } }[]).find((e) => e.factType === "zoning-resolution")!.value;
    const applied = zr.appliedRules.filter((r) => r.ruleType === "GARAGE_SEPARATION");
    const ambiguous = zr.ambiguousClaims.filter((c) => c.ruleType === "GARAGE_SEPARATION");
    expect(applied.length + ambiguous.length, "settled or ambiguous").toBeGreaterThan(0);
    expect(applied.length > 0 && ambiguous.length > 0).toBe(false);
    expect(applied.length).toBeLessThanOrEqual(1);
    expect(uncovered(artifact).join("|")).not.toMatch(/separation/);
  }, 120_000);
});
