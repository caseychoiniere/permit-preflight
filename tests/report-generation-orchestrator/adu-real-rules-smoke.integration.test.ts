/**
 * ADU smoke against the REAL ACTIVE rule rows (no synthetic copies): the three ADU kinds, an unresolved zone (a
 * Major Institution Overlay parcel), a split-zone parcel and a mis-placed footprint, each generated through the real
 * pipeline; the web report and the PDF HTML are compared for the same persisted artifact.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { evidenceReportArtifacts, regulatoryRules, reportGenerationJobs, screeningRequests } from "../../src/db/schema.js";
import { createReportGenerationJob, claimQueuedJob } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType } from "../../src/screening-request/authorization.js";
import { runReportGenerationPipeline } from "../../src/report-generation-orchestrator/pipeline.js";
import { renderReportHtml } from "../../src/report-pdf-rendering/render.js";
import { ReportView } from "../../app/components/ReportView.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";
import { ADU_FIXED_ROW_IDS } from "../fixtures/adu-candidates.js";
import type { AduFeasibility } from "../../src/regulatory-rules-engine/adu-types.js";
import type { EvidenceReportArtifactRow } from "../../src/db/schema.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const HEALTH = ["king-county-parcel-polygon", "seattle-building-outlines", "seattle-eca", "seattle-zoning", "seattle-landmarks", "seattle-frequent-transit"];
const NR = "1498301270";
const HOUSE = "1270857812";
const ROLES = { method: "USER_INDICATED", status: "ASSIGNED", frontEdgeRef: "edge-3", rearEdgeRef: "edge-1", sideEdgeRefs: ["edge-0", "edge-2"], multipleFrontageAnswer: "NO" };
const BACK_YARD = { anchor: { lat: 47.586094007341046, lng: -122.3116149461082 }, orientationDeg: 0 };
const IN_STREET = { anchor: { lat: 47.58608874074506, lng: -122.3120200879064 }, orientationDeg: 0 };
const ATTACHED = { aduType: "ATTACHED_TO_HOUSE", grossFloorAreaSqFt: 600, bedrooms: 1, includesAddition: false, portionExistedBeforeJuly2023: true, existingPrincipalDwellingUnits: 1, existingAduCount: 0 };
const norm = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/[–—]/g, "-").replace(/\s+/g, " ");

describe.skipIf(!hasDb)("ADU real-rules smoke", () => {
  let db: Db;
  const created: string[] = [];
  let health: DataSourceHealthSnapshot;
  beforeAll(async () => {
    db = getDb();
    health = await snapshotDataSourceHealth(db, HEALTH);
    const active = await db.select({ id: regulatoryRules.id }).from(regulatoryRules).where(and(eq(regulatoryRules.applicableProjectType, "adu"), eq(regulatoryRules.lifecycleState, "ACTIVE")));
    expect(active.map((r) => r.id).sort()).toEqual(Object.values(ADU_FIXED_ROW_IDS).sort());
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

  async function run(pin: string, details: Record<string, unknown>) {
    const snapshot = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: pin, projectType: "adu", projectDetails: details };
    const [row] = await db.insert(screeningRequests).values({ workflowType: "EXISTING_PROPERTY", projectType: "adu", projectDetails: details, confirmedParcelId: pin, snapshot } as never).returning({ id: screeningRequests.id });
    created.push(row!.id);
    const job = await createReportGenerationJob(db, row!.id, { type: GenerationAuthorizationType.INTERNAL_PROTOTYPE, screeningRequestId: row!.id, authorizedBy: "adu-real-rules-smoke", authorizedAt: new Date().toISOString() });
    const claimed = await claimQueuedJob(db, job.id);
    await runReportGenerationPipeline(db, claimed!);
    const [finished] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
    const [artifact] = await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, finished!.evidenceReportArtifactId!));
    const feasibility = (artifact!.evidence as { factType: string; value: unknown }[]).find((e) => e.factType === "adu-feasibility")!.value as AduFeasibility;
    // Web and PDF carry the same text for the same persisted artifact.
    const report = { id: artifact!.id, findings: artifact!.findings, evidence: artifact!.evidence, explanation: null, generatedAt: new Date().toISOString() };
    const web = norm(renderToStaticMarkup(createElement(ReportView, { report: report as never })));
    const pdf = norm(renderReportHtml(artifact as unknown as EvidenceReportArtifactRow));
    for (const f of artifact!.findings as { explanationBasis: string }[]) {
      expect(web).toContain(norm(f.explanationBasis));
      expect(pdf).toContain(norm(f.explanationBasis));
    }
    for (const t of [feasibility.summary, ...feasibility.verifyBeforeDesign]) {
      expect(web).toContain(norm(t));
      expect(pdf).toContain(norm(t));
    }
    return { job: finished!, artifact: artifact!, feasibility, findings: artifact!.findings as { subject: string; classification: string; complianceOutcome?: string; explanationBasis: string }[] };
  }

  it("detached, conversion and attached ADUs complete against the real ACTIVE rules and cite only the real rows", async () => {
    const detached = await run(NR, { aduType: "DETACHED_NEW", widthFt: 16, depthFt: 20, stories: 1, bedrooms: 1, heightFt: 15, alleyAdjacent: false, existingPrincipalDwellingUnits: 1, existingAduCount: 0, proposedPlacement: BACK_YARD, lotLineRoleAssignment: ROLES, primaryDwellingSelection: { status: "SELECTED", outlineId: HOUSE, method: "USER_CONFIRMED" } });
    expect(detached.feasibility.headline).toBe("LOOKS_FEASIBLE");
    const ids = new Set(Object.values(ADU_FIXED_ROW_IDS));
    for (const id of detached.artifact.ruleVersionsUsed as string[]) expect(ids.has(id)).toBe(true);
    expect((detached.artifact.ruleVersionsUsed as string[]).length).toBe(12);
    expect(detached.findings.every((f) => !f.subject.includes("TEST-ONLY"))).toBe(true);

    const conv = await run("0523049029", { aduType: "CONVERSION_EXISTING", stories: 1, bedrooms: 1, alleyAdjacent: false, existingPrincipalDwellingUnits: 1, existingAduCount: 0, existedBeforeJuly2023: true, keepsFootprintAndHeight: true, convertedStructure: { outlineId: "1271025446", method: "USER_CONFIRMED" }, lotLineRoleAssignment: { ...ROLES, frontEdgeRef: "edge-0", rearEdgeRef: "edge-4", sideEdgeRefs: ["edge-1", "edge-2", "edge-3", "edge-5", "edge-6"] }, primaryDwellingSelection: { status: "SELECTED", outlineId: "1271025447", method: "USER_CONFIRMED" } });
    expect(["LOOKS_FEASIBLE", "LIKELY_CONSTRAINED"]).toContain(conv.feasibility.headline);
    expect(conv.findings.find((f) => f.subject === "Conversion of an existing accessory structure")).toBeDefined();

    const attached = await run(NR, ATTACHED);
    expect(attached.feasibility.headline).toBe("LOOKS_FEASIBLE");
  }, 240_000);

  it("an unresolved zone (a Major Institution Overlay parcel) and a split-zone parcel yield no ADU conclusion", async () => {
    const mio = await run("2982800005", ATTACHED);
    expect(mio.feasibility.headline).toBe("CANNOT_TELL");
    expect(mio.findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
    expect(mio.findings.find((f) => f.subject.startsWith("Zoning applicability"))!.explanationBasis).toContain("Major Institution Overlay");

    const split = await run("0148000965", ATTACHED);
    expect(split.feasibility.headline).toBe("CANNOT_TELL");
    expect(split.findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
    expect(split.findings.find((f) => f.subject.startsWith("Zoning applicability"))!.explanationBasis).toMatch(/split between zones|matched no zone/);
  }, 240_000);

  it("a mis-placed footprint yields no position-dependent finding", async () => {
    const r = await run(NR, { aduType: "DETACHED_NEW", widthFt: 16, depthFt: 20, stories: 1, bedrooms: 1, heightFt: 15, alleyAdjacent: false, existingPrincipalDwellingUnits: 1, existingAduCount: 0, proposedPlacement: IN_STREET, lotLineRoleAssignment: ROLES });
    expect(r.feasibility.headline).toBe("CANNOT_TELL");
    expect(r.findings.some((f) => /^ADU (rear|side|front)|^Separation|^Lot coverage/.test(f.subject))).toBe(false);
    expect(r.findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
  }, 120_000);
});
