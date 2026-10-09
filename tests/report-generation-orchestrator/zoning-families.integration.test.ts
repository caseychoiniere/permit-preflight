/**
 * Citywide zoning coverage - live pipeline across zone families (DB-gated). Real parcels (found 2026-10-09 from Seattle's zoning layer):
 *   NR 1498301270 | LR1 (M) 1931300060, 3298700485 | LR2 (M) 7960100315 | LR3 (M) 9412900005 | MR (M1) 2784600070 | HR (M) 8590900490
 *   NC2-40 (M) 7625701280 (no residential neighbor) | NC2P-55 (M) 1794501135 (residential neighbor) | C1-55 (M) 1972206390
 *   0148000965 (split NR + LR2) | 2982800005 (Major Institution Overlay)
 * The multifamily, commercial and Lowrise ADU rule sets were activated 2026-10-09 and are used as the real ACTIVE rows. Any candidate row that is not ACTIVE in
 * the connected database (a fresh environment) is evaluated through the pipeline's test-only seam instead (nothing is written to the rules table); a row that
 * IS active is never injected too, because two active rows for one claim are an authoring conflict.
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
import { COMMERCIAL_FIXED_ROW_IDS, allCommercialCandidates } from "../fixtures/commercial-candidates.js";
import { MULTIFAMILY_FIXED_ROW_IDS, allMultifamilyCandidates } from "../fixtures/multifamily-candidates.js";
import { ADU_MF_FIXED_ROW_IDS, aduMultifamilyCandidates } from "../fixtures/multifamily-adu-candidates.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const act = (cands: typeof allMultifamilyCandidates, ids: Record<string, string>): RegulatoryRule[] => cands.map((c) => ({ ...draft(c), id: ids[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }) as RegulatoryRule);
const EXTRA: RegulatoryRule[] = [...act(allMultifamilyCandidates, MULTIFAMILY_FIXED_ROW_IDS), ...act(allCommercialCandidates, COMMERCIAL_FIXED_ROW_IDS), ...act(aduMultifamilyCandidates, ADU_MF_FIXED_ROW_IDS)];
const EXTRA_IDS = new Set(EXTRA.map((r) => r.id));
let extraNotActive: RegulatoryRule[] = EXTRA;
const AFFECTED = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca", "seattle-zoning", "seattle-landmarks", "seattle-frequent-transit"];

const PARCELS: { pin: string; label: string; family: string; code?: string }[] = [
  { pin: "1498301270", label: "NR", family: "NR" },
  { pin: "1931300060", label: "LR1 (M)", family: "LR", code: "LR1" },
  { pin: "7960100315", label: "LR2 (M)", family: "LR", code: "LR2" },
  { pin: "9412900005", label: "LR3 (M)", family: "LR", code: "LR3" },
  { pin: "2784600070", label: "MR (M1)", family: "MR" },
  { pin: "8590900490", label: "HR (M)", family: "HR" },
  { pin: "7625701280", label: "NC2-40 (M)", family: "NC", code: "NC2" },
  { pin: "1794501135", label: "NC2P-55 (M)", family: "NC", code: "NC2" },
  { pin: "1972206390", label: "C1-55 (M)", family: "C", code: "C1" },
];

describe.skipIf(!hasDb)("citywide zoning - real parcels across zone families", () => {
  let db: Db;
  let health: DataSourceHealthSnapshot;
  const requestIds: string[] = [];
  beforeAll(async () => {
    db = getDb();
    health = await snapshotDataSourceHealth(db, AFFECTED);
    const active = await db.select({ id: regulatoryRules.id }).from(regulatoryRules).where(and(inArray(regulatoryRules.id, [...EXTRA_IDS]), eq(regulatoryRules.lifecycleState, "ACTIVE")));
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

  async function generate(projectType: string, pin: string, details: Record<string, unknown>) {
    const snapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: pin, projectType, projectDetails: details };
    const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType, projectDetails: details, confirmedParcelId: pin, snapshot } as never).returning({ id: screeningRequests.id });
    requestIds.push(row!.id);
    const job = await createReportGenerationJob(db, row!.id, { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "zoning-families.integration.test.ts", authorizedAt: new Date().toISOString() });
    const claimed = await claimQueuedJob(db, job.id);
    if (!claimed) throw new Error("claim failed");
    await runReportGenerationPipeline(db, claimed, { testOnlyExtraActiveRules: extraNotActive });
    const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    const [artifact] = finished?.evidenceReportArtifactId ? await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished.evidenceReportArtifactId)) : [];
    return { job: finished, artifact };
  }

  async function projectsFor(pin: string): Promise<[string, Record<string, unknown>][]> {
    const poly = await fetchParcelBoundaryPolygon(pin);
    const n = poly.points.length;
    const mid = (i: number) => ({ x: (poly.points[i]!.x + poly.points[(i + 1) % n]!.x) / 2, y: (poly.points[i]!.y + poly.points[(i + 1) % n]!.y) / 2 });
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    let rear = 1;
    for (let i = 1; i < n; i++) if (dist(mid(i), mid(0)) > dist(mid(rear), mid(0))) rear = i;
    const roles = { method: "USER_INDICATED", status: "ASSIGNED", frontEdgeRef: "edge-0", rearEdgeRef: `edge-${rear}`, sideEdgeRefs: Array.from({ length: n }, (_, i) => i).filter((i) => i !== 0 && i !== rear).map((i) => `edge-${i}`), multipleFrontageAnswer: "NO" };
    const cx = mid(0).x + 0.82 * (mid(rear).x - mid(0).x);
    const cy = mid(0).y + 0.82 * (mid(rear).y - mid(0).y);
    const ll = await db.execute(sql`select ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lat, ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(${cx},${cy}),2926),4326)) as lng`);
    const { lat, lng } = ll.rows[0] as { lat: number; lng: number };
    const house = [...(await fetchBuildingFootprints(pin))].sort((a, b) => (b.areaSqFt ?? 0) - (a.areaSqFt ?? 0))[0];
    const placement = { anchor: { lat, lng }, orientationDeg: 0 };
    return [
      ["shed", { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, proposedPlacement: placement, lotLineRoleAssignment: roles, ...(house ? { primaryDwellingSelection: { status: "SELECTED", outlineId: house.outlineId, method: "USER_CONFIRMED" } } : {}) }],
      ["garage", { widthFt: 12, depthFt: 20, heightFt: 10, alleyAdjacent: false, proposedPlacement: placement, lotLineRoleAssignment: roles, existingStructuresFootprintSqFt: 1200 }],
      ["fence", { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK", "FRONT_SETBACK"], siteSlopes: false, wallRelation: "NONE", hasMasonryOrConcreteAbove6Ft: false }],
      ["deck", { heightAboveGradeIn: 30, widthFt: 10, depthFt: 12, attachment: "DETACHED", buildingRelation: "OPEN_GROUND_BELOW", setbackLocations: ["SIDE_SETBACK"] }],
    ];
  }

  type F = { subject: string; classification: string; complianceOutcome?: string; explanationBasis: string; appliedRule?: { citation: { smcSections: string[] } } };
  type Zr = { status: string; governing?: string; governingFamily?: string; appliedRules: { id: string; ruleType: string }[]; ambiguousClaims: unknown[] };

  for (const p of PARCELS) {
    it(
      `${p.label} (${p.pin}): shed, garage, fence and deck complete under ${p.family} standards, name the real designation and never cite another family's chapter`,
      async () => {
        for (const [type, details] of await projectsFor(p.pin)) {
          const { job, artifact } = await generate(type, p.pin, details);
          expect(job?.state, `${type} ${p.pin}`).toBe("COMPLETE");
          const findings = artifact!.findings as F[];
          const evidence = artifact!.evidence as { factType: string; value: unknown }[];
          const zr = evidence.find((e) => e.factType === "zoning-resolution")!.value as Zr;
          expect(zr.governingFamily, `${type} ${p.pin}`).toBe(p.family);
          const zoning = findings.find((f) => f.subject.startsWith("Zoning applied"))!;
          expect(zoning.explanationBasis).toContain(zr.governing!);
          // Provenance: the rules recorded are exactly those the resolver applied.
          expect((artifact!.ruleVersionsUsed as string[]).sort()).toEqual(zr.appliedRules.map((r) => r.id).sort());
          // No other family's chapter reaches the customer text.
          const text = findings.filter((f) => !f.subject.startsWith("Critical area")).map((f) => `${f.subject} ${f.explanationBasis} ${(f.appliedRule?.citation.smcSections ?? []).join(" ")}`).join("\n");
          if (p.family === "NR") expect(text).not.toMatch(/23\.45|23\.47A/);
          else expect(text).not.toMatch(/23\.44\.\d/);
          if (p.family === "NC" || p.family === "C") expect(text).not.toMatch(/23\.45\.\d/);
          if (p.family === "LR" || p.family === "MR" || p.family === "HR") expect(text).not.toMatch(/23\.47A/);
          // Every applied non-NR rule is an injected multifamily/commercial row, never a leftover NR row (except zone-independent permit rows).
          if (p.family !== "NR") {
            for (const r of zr.appliedRules) {
              if (!EXTRA_IDS.has(r.id)) expect(r.ruleType, `${type} ${p.pin}`).toMatch(/_PERMIT_|_F5_|_F6_|_F7_|_F8_|_D3_|_D4_|_D5_|_D6_|SHED_PERMIT/);
            }
          }
        }
      },
      240_000
    );
  }

  it("commercial zones: a residential neighbor makes the setback claim a verification item; none makes it a definite result", async () => {
    const abut = await generate("shed", "1794501135", (await projectsFor("1794501135"))[0]![1]);
    const clear = await generate("shed", "7625701280", (await projectsFor("7625701280"))[0]![1]);
    const f = (a: typeof abut) => (a.artifact!.findings as F[]).find((x) => x.subject.startsWith("Shed setbacks in a commercial zone"))!;
    expect(f(abut).classification).toBe("REQUIRES_VERIFICATION");
    expect(f(clear)).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
    expect((clear.artifact!.evidence as { factType: string }[]).some((e) => e.factType === "zoning-adjacent")).toBe(true);
  }, 240_000);

  it("a lot split between NR and Lowrise: a shed footprint in one part settles the location claims; lot-wide claims and a fence/deck needing the lot are verification items, never a majority-zone answer", async () => {
    const [shed, , fence, deck] = await projectsFor("0148000965");
    const s = await generate("shed", "0148000965", shed![1]);
    const zr = (s.artifact!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "zoning-resolution")!.value as Zr & { lotZones: string[] };
    expect(zr.status).toBe("AMBIGUOUS");
    expect(zr.lotZones.length).toBeGreaterThan(1);
    expect(zr.governing).toBeDefined();
    const f = await generate("fence", "0148000965", fence![1]);
    const fz = (f.artifact!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "zoning-resolution")!.value as Zr;
    expect(fz.status).toBe("AMBIGUOUS");
    expect((f.artifact!.findings as F[]).some((x) => x.subject.startsWith("Fence height") && x.complianceOutcome !== undefined)).toBe(false);
    const d = await generate("deck", "0148000965", deck![1]);
    expect((d.artifact!.findings as F[]).some((x) => x.subject.startsWith("Deck setback") && x.complianceOutcome !== undefined)).toBe(false);
  }, 240_000);

  it("a Major Institution Overlay parcel gets no zone-specific conclusion for any project type but still completes", async () => {
    for (const [type, details] of await projectsFor("2982800005")) {
      const { job, artifact } = await generate(type, "2982800005", details);
      expect(job?.state).toBe("COMPLETE");
      expect((artifact!.findings as F[]).some((x) => x.complianceOutcome !== undefined && !x.subject.startsWith("Critical area") && !/permit|exempt/i.test(x.subject))).toBe(false);
      const z = (artifact!.findings as F[]).find((x) => x.subject.startsWith("Zoning applied"))!;
      expect(z.classification).toBe("REQUIRES_VERIFICATION");
      expect(z.explanationBasis).toContain("Major Institution Overlay");
    }
  }, 240_000);
});
