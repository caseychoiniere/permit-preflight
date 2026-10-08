/**
 * Shed and garage smoke against the REAL ACTIVE rule rows (no synthetic copies), through the real pipeline: real setback / separation /
 * height / coverage findings, no "Not yet automatically screenable" for constraints now covered, unresolved cases stay REQUIRES_VERIFICATION,
 * a mis-placed footprint yields no position-dependent conclusion, and the web report and PDF HTML carry the same finding text.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { and, eq, inArray, like } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { evidenceReportArtifacts, regulatoryRules, reportGenerationJobs, screeningRequests } from "../../src/db/schema.js";
import type { EvidenceReportArtifactRow } from "../../src/db/schema.js";
import { createReportGenerationJob, claimQueuedJob } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType } from "../../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../../src/report-generation-orchestrator/pipeline.js";
import { renderReportHtml } from "../../src/report-pdf-rendering/render.js";
import { ReportView } from "../../app/components/ReportView.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";
import { ACCESSORY_FIXED_ROW_IDS } from "../fixtures/accessory-candidates.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const HEALTH = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca", "seattle-zoning", "seattle-landmarks", "seattle-frequent-transit"];
const NR = "1498301270";
const HOUSE = "1270857812";
const ROLES = { method: "USER_INDICATED", status: "ASSIGNED", frontEdgeRef: "edge-3", rearEdgeRef: "edge-1", sideEdgeRefs: ["edge-0", "edge-2"], multipleFrontageAnswer: "NO" };
const BACK_YARD = { anchor: { lat: 47.586094007341046, lng: -122.3116149461082 }, orientationDeg: 0 };
const IN_STREET = { anchor: { lat: 47.58608874074506, lng: -122.3120200879064 }, orientationDeg: 0 };
const norm = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/[–—]/g, "-").replace(/\s+/g, " ");
type F = { subject: string; classification: string; complianceOutcome?: string; explanationBasis: string };

describe.skipIf(!hasDb)("Shed and garage real-rules smoke", () => {
  let db: Db;
  const created: string[] = [];
  let health: DataSourceHealthSnapshot;
  beforeAll(async () => {
    db = getDb();
    health = await snapshotDataSourceHealth(db, HEALTH);
    const rows = await db.select({ id: regulatoryRules.id, state: regulatoryRules.lifecycleState }).from(regulatoryRules).where(inArray(regulatoryRules.id, Object.values(ACCESSORY_FIXED_ROW_IDS)));
    expect(rows.length).toBe(8);
    expect(rows.every((r) => r.state === "ACTIVE")).toBe(true);
    const staging = await db.select({ id: regulatoryRules.id }).from(regulatoryRules).where(and(like(regulatoryRules.subject, "STAGING-TEST-ONLY:%"), eq(regulatoryRules.lifecycleState, "ACTIVE")));
    expect(staging).toEqual([]);
  });
  afterAll(async () => {
    try {
      for (const id of created) {
        await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
        await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
        await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
      }
    } finally {
      await restoreDataSourceHealth(db, health);
    }
  });

  async function run(projectType: "shed" | "garage", details: Record<string, unknown>) {
    const snapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: NR, projectType, projectDetails: details };
    const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType, projectDetails: details, confirmedParcelId: NR, snapshot } as never).returning({ id: screeningRequests.id });
    created.push(row!.id);
    const job = await createReportGenerationJob(db, row!.id, { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "accessory-real-rules-smoke", authorizedAt: new Date().toISOString() });
    const claimed = await claimQueuedJob(db, job.id);
    await runReportGenerationPipeline(db, claimed!);
    const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    expect(finished!.state).toBe("COMPLETE");
    const [artifact] = await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished!.evidenceReportArtifactId!));
    const report = { id: artifact!.id, findings: artifact!.findings, evidence: artifact!.evidence, explanation: null, generatedAt: new Date().toISOString() };
    const web = norm(renderToStaticMarkup(createElement(ReportView, { report: report as never })));
    const pdf = norm(renderReportHtml(artifact as unknown as EvidenceReportArtifactRow));
    const findings = artifact!.findings as F[];
    for (const f of findings) {
      // Critical-area findings are re-worded by their own report section (web and PDF); every other finding carries its text verbatim.
      if (f.subject.startsWith("Critical area")) continue;
      expect(web).toContain(norm(f.explanationBasis));
      expect(pdf).toContain(norm(f.explanationBasis));
    }
    const uncovered = (artifact!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "uncovered-constraint-types")?.value as string[] | undefined;
    return { artifact: artifact!, findings, uncovered: uncovered ?? [], web, pdf };
  }
  const shed = (over: Record<string, unknown> = {}) => ({ widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, proposedPlacement: BACK_YARD, lotLineRoleAssignment: ROLES, primaryDwellingSelection: { status: "SELECTED", outlineId: HOUSE, method: "USER_CONFIRMED" }, ...over });
  const garage = (over: Record<string, unknown> = {}) => ({ widthFt: 12, depthFt: 20, heightFt: 10, alleyAdjacent: false, proposedPlacement: BACK_YARD, lotLineRoleAssignment: ROLES, existingStructuresFootprintSqFt: 1200, ...over });

  it("a real shed report: real setback and separation findings, nothing falsely uncovered, nothing from a fixture", async () => {
    const r = await run("shed", shed());
    const ids = new Set(Object.values(ACCESSORY_FIXED_ROW_IDS));
    const used = r.artifact.ruleVersionsUsed as string[];
    for (const id of ["shed-s1-rear-setback-2026", "shed-s2-side-front-setback-2026", "shed-s3-dwelling-separation-2026"]) expect(used).toContain(ACCESSORY_FIXED_ROW_IDS[id]);
    expect(used.some((id) => ids.has(id) && !Object.entries(ACCESSORY_FIXED_ROW_IDS).some(([k, v]) => v === id && k.startsWith("shed")))).toBe(false);
    expect(r.findings.some((f) => /rear/i.test(f.subject))).toBe(true);
    expect(r.findings.some((f) => /dwelling/i.test(f.subject))).toBe(true);
    expect(r.findings.some((f) => /\(side\)/.test(f.subject))).toBe(true);
    expect(r.findings.some((f) => /\(front\)/.test(f.subject))).toBe(true);
    expect(r.uncovered.join(" ")).not.toMatch(/setback|separation|height/i);
    expect(r.web).not.toContain("Not yet automatically screenable");
    expect(r.findings.filter((f) => f.subject.startsWith("Shed") && f.classification === "KNOWN").every((f) => f.complianceOutcome === "PASS" || f.complianceOutcome === "FAIL")).toBe(true);
  }, 180_000);

  it("a real shed placed in the street yields no position-dependent conclusion", async () => {
    const r = await run("shed", shed({ proposedPlacement: IN_STREET }));
    const positional = r.findings.filter((f) => /rear|side|front|dwelling/i.test(f.subject) && !f.subject.startsWith("Zoning") && !f.subject.startsWith("Critical area"));
    expect(positional.length).toBeGreaterThan(0);
    for (const f of positional) expect(f.classification, f.subject).toBe("REQUIRES_VERIFICATION");
    expect(r.findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
  }, 180_000);

  it("a real garage report: rear, side/front, both height rows' claim, lot coverage; exception-dependent shortfalls stay unresolved", async () => {
    const r = await run("garage", garage());
    const used = r.artifact.ruleVersionsUsed as string[];
    for (const k of Object.keys(ACCESSORY_FIXED_ROW_IDS).filter((k) => k.startsWith("garage"))) expect(used).toContain(ACCESSORY_FIXED_ROW_IDS[k]);
    expect(r.findings.some((f) => /rear/i.test(f.subject))).toBe(true);
    expect(r.findings.some((f) => /\(side\)/.test(f.subject))).toBe(true);
    expect(r.findings.some((f) => /\(front\)/.test(f.subject))).toBe(true);
    expect(r.findings.some((f) => /height/i.test(f.subject))).toBe(true);
    expect(r.findings.some((f) => /lot coverage/i.test(f.subject))).toBe(true);
    // The 5 ft separation between structures (SMC 23.44.100.A) is not governed for a garage, and the report must say so.
    expect(r.uncovered).toEqual(["separation from the house"]);
    expect(r.web).toContain("Not Yet Automatically Screenable");
    expect(r.pdf).toContain("Not Yet Automatically Screenable");
    // A shortfall cannot be placed from the map here; the exception-dependent REQUIRES_VERIFICATION is proven by the evaluator tests (G2 cases), and no side/front garage finding is ever a FAIL.
    expect(r.findings.filter((f) => /\((side|front)\)/.test(f.subject)).every((f) => f.complianceOutcome !== "FAIL")).toBe(true);
  }, 180_000);

  it("a real garage almost on a side lot line: the shortfall is exception-dependent, so REQUIRES_VERIFICATION and never a definite FAIL; a few percent over the line is a mis-placement with no conclusion", async () => {
    const shifted = (dLat: number) => garage({ proposedPlacement: { anchor: { lat: BACK_YARD.anchor.lat + dLat, lng: BACK_YARD.anchor.lng }, orientationDeg: 0 } });
    for (const dLat of [3.6e-5, -4.1e-5]) {
      const r = await run("garage", shifted(dLat));
      const side = r.findings.find((f) => /\(side\)/.test(f.subject))!;
      expect(side.classification).toBe("REQUIRES_VERIFICATION");
      expect(side.complianceOutcome).toBeUndefined();
      expect(side.explanationBasis).toMatch(/Side setback \d+(\.\d)?ft/);
      expect(side.explanationBasis).toContain("SMC 23.44.090.G");
      expect(r.findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
      // Clearly inside the side setback: the 12 ft accessory limit applies and 10 ft meets it.
      expect(r.findings.find((f) => /height/i.test(f.subject))!.explanationBasis).toContain("12ft limit");
    }
    const over = await run("garage", shifted(4.1e-5));
    const positional = over.findings.filter((f) => /rear|side|front|height/i.test(f.subject) && !f.subject.startsWith("Zoning") && !f.subject.startsWith("Critical area"));
    for (const f of positional) expect(f.classification, f.subject).toBe("REQUIRES_VERIFICATION");
    expect(over.findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
  }, 300_000);

  it("a real garage placed in the street yields no position-dependent conclusion", async () => {
    const r = await run("garage", garage({ proposedPlacement: IN_STREET }));
    const positional = r.findings.filter((f) => /rear|side|front|height/i.test(f.subject) && !f.subject.startsWith("Zoning") && !f.subject.startsWith("Critical area"));
    expect(positional.length).toBeGreaterThan(0);
    for (const f of positional) {
      expect(f.classification, f.subject).toBe("REQUIRES_VERIFICATION");
      expect(f.complianceOutcome, f.subject).toBeUndefined();
    }
  }, 180_000);
});
