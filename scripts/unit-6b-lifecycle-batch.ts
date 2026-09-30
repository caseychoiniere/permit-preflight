/**
 * One-off Unit 6B governance batch (2026-09-27), executed under the founder's standing delegated
 * execution policy. Advances via the real admin lifecycle functions (never direct DB edits):
 *   14 Tier-1 rules: TRIAGED -> SOURCE_VERIFIED -> TESTED -> APPROVED
 *   C1b:             TRIAGED -> SOURCE_VERIFIED only (implementation/evidence blockers remain)
 * Never activates anything; never touches P6, C1e-director or the P2b pair. Refuses to run if any
 * target is not TRIAGED/Tier 1 (so it is safe to re-run: it stops instead of double-advancing).
 */

import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { regulatoryRules } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { sourceVerifyRule, markRuleTested, approveRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";

process.loadEnvFile(".env.local");
process.env["ADMIN_OPERATOR_ID"] ??= "caseychoiniere@gmail.com";

const SRC =
  "2021 Seattle Residential Code R105.2 (SDCI 2021SRCChapter1.pdf, fetched live 2026-09-26; item 3 = one-story detached accessory buildings used for greenhouse, tool or storage shed, playhouse or similar; 3.1 projected roof area not over 120 sq ft; 3.2 not placed on a concrete foundation other than a slab on grade; no newer SRC edition found at the same SDCI path)";
const TIP =
  "SDCI Tip 316 'Subject-to-Field-Inspection (STFI) Permits', 'Updated April 26, 2024' (fetched live 2026-09-26): STFI-eligible detached accessory structures 'up to 750 square feet in area, with structural spans of less than 14 feet (30 feet if a manufactured truss is used)'; NOT eligible: 'Detached structures accessory to single-family and duplex that are more than 750 square feet', 'structural beam spans in excess of 14 feet (30 feet span for manufactured trusses...)', 'All wood foundations and foundations using piles, including pipe piles and pin piles'";
const SMC =
  "SMC 23.44.080 / Ordinance 127376 as recorded from live Municode text in repository research (aidlc-docs/construction/unit-6b-shed-report-value-expansion/candidate-regulatory-rules.md, research dated 2026-09-13..23); a fresh live re-fetch of 23.44.080 was not possible in this pass (Municode content API unavailable) and is disclosed here";
const T_EVAL = "tests/regulatory-rules-engine/shed-permit-evaluate.test.ts";
const T_PREV = "tests/dev-preview/report-preview.test.ts (real-evaluator fixtures, web/PDF parity)";

interface RuleSpec {
  type: string;
  label: string;
  src: string;
  tests: string;
  note?: string;
}

const RULES: RuleSpec[] = [
  { type: "SHED_PERMIT_P1_ROOF_AREA", label: "P1", src: SRC, tests: `${T_EVAL} describe 'P1 / ROOF_AREA' (MET <=120, NOT_MET >120, REQUIRES_VERIFICATION undisclosed overhang, MET with overhang, [boundary] exactly 120 MET / 121 NOT_MET); declared cases 0-2 covered` },
  { type: "SHED_PERMIT_P2A_STORY_HEIGHT", label: "P2a", src: SRC, tests: `${T_EVAL} describe 'P2a / STORY_HEIGHT' (always MET); declared case 0 covered` },
  { type: "SHED_PERMIT_P3A_FOUNDATION_EXEMPTION", label: "P3a", src: SRC, tests: `${T_EVAL} describe 'P3a / FOUNDATION' (MET slab/pier/soil, NOT_MET frost footing/piles/wood, REQUIRES_VERIFICATION unanswered); declared cases 0-2 covered` },
  { type: "SHED_PERMIT_P3B_FOUNDATION_STFI_DISQUALIFIER", label: "P3b", src: TIP, tests: `${T_EVAL} describe 'P3b (foundationStfiDisqualification)' (DISQUALIFIED piles/wood, CLEAR, UNKNOWN; routes reviewPath to FULL_REVIEW_LIKELY even when size/span/ECA clear); declared cases 0-2 covered` },
  { type: "SHED_PERMIT_P4_ATTACHMENT", label: "P4", src: SRC, tests: `${T_EVAL} describe 'P4 / ATTACHMENT' (MET detached, NOT_MET attached, REQUIRES_VERIFICATION unanswered); declared cases 0-1 covered` },
  { type: "SHED_PERMIT_P5_USE", label: "P5", src: SRC, tests: `${T_EVAL} describe 'P5 / USE' (hard invariant: never NOT_MET; MET storage/greenhouse-plants); declared cases 0-2 covered` },
  { type: "SHED_PERMIT_P7A_SIZE_SPAN_FOOTPRINT", label: "P7a", src: TIP, tests: `${T_EVAL} describe 'P7a+P7b / SIZE_SPAN' ('NOT_MET when footprint exceeds 750', '[P7a boundary] exactly 750 not disqualified, 751 NOT_MET'); declared cases 0-1 covered` },
  {
    type: "SHED_PERMIT_P7B_SIZE_SPAN_STRUCTURAL",
    label: "P7b",
    src: `${TIP}. Fresh check result: Tip 316 wording 'less than 14 feet' (eligible) vs 'in excess of 14 feet' (not eligible) is consistent and leaves exactly 14.0 ft unaddressed; the implementation resolves exactly 14.0 to REQUIRES_VERIFICATION, which matches the source`,
    tests: `${T_EVAL} describe 'P7a+P7b / SIZE_SPAN' (MET <14, REQUIRES_VERIFICATION exactly 14.0, MET (14,30] with truss, NOT_MET >14 no truss, NOT_MET >30 with truss, [P7b boundary] 30.0 MET / 30.01 NOT_MET, 13.99 MET / 14.01 NOT_MET); declared cases 0-3 covered`,
  },
  {
    type: "SHED_PERMIT_P9_EXEMPTION_NOT_ZONING_COMPLIANCE",
    label: "P9",
    src: `${SRC.split(";")[0]}; R105.2 preamble: 'Exemption from the permit requirements of this code does not authorize any work to be done in any manner in violation of this code or any other laws or ordinances of the City' (2021 SRC ch.1, fetched live 2026-09-26)`,
    tests: `tests/report-pdf-rendering/render.test.ts ('renders the BR-U6B-9 exemption disclaimer only when buildingPermit is LIKELY_EXEMPT') and ${T_PREV} (disclaimer present on web AND PDF iff LIKELY_EXEMPT, every scenario); declared case 0 covered`,
    note: "P9 is a report-layer disclaimer and gates no evaluation.",
  },
  { type: "SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM", label: "C1a", src: SMC, tests: `${T_EVAL} describe 'Flow 4 (evaluateShedLotCoverage)' (CASE A exactly 50%, [C1a boundary] just over 50%, [C1b denominator + C1a] excluded area subtracted before the 50% test); ${T_PREV}; declared cases 0-1 covered` },
  { type: "SHED_LOT_COVERAGE_C1C_TRANSIT_BONUS", label: "C1c", src: SMC, tests: `${T_EVAL} ('CASE B - MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE', '[C1c/C1d boundary] exactly 60% still MAY_QUALIFY, 60.01% EXCEEDS', '[C1c/C1d] 60% is never auto-applied'); declared case 0 (applicability never auto-detected) covered`, note: "Applicability of the 60% allowance is not auto-detected; the rule surfaces only as a 'may qualify' verification band." },
  { type: "SHED_LOT_COVERAGE_C1D_STACKED_BONUS", label: "C1d", src: SMC, tests: `${T_EVAL} (same C1c/C1d tests: CASE B, 60% inclusive boundary, never auto-applied); declared case 0 covered`, note: "Applicability of the 60% allowance is not auto-detected; the rule surfaces only as a 'may qualify' verification band." },
  { type: "SHED_LOT_COVERAGE_C1E_MINIMUM_FLOOR", label: "C1e-floor", src: SMC, tests: `${T_EVAL} ('[C1e floor] on a small lot with a C1b area present, the 625 sq ft floor replaces a lower 50% allowance' incl. floor also lifting the 60% allowance); declared case 0 covered`, note: "The floor branch only fires when an ESTABLISHED lot-area adjustment exists, which is unreachable in production until C1b evidence is established; approval accepts the rule logic, not that branch's reachability." },
  { type: "SHED_LOT_COVERAGE_C2_ESTIMATE_CAVEAT", label: "C2", src: SMC, tests: `tests/property-intelligence/existing-structures.test.ts (buildExistingStructureCoverageFact: caveat always present, mentions over-counts), tests/report-pdf-rendering/render.test.ts ('Capability C existing-coverage caveat' PDF regression), ${T_PREV} (over-count caveat on web and PDF; caveat built by the production pipeline's existingStructureCoverageEvidenceEntry); declared case 0 (ESTIMATED, never precise) covered` },
];

const C1B_TYPE = "SHED_LOT_COVERAGE_C1B_ECA_LOT_AREA_EXCLUSION";
const C1B_REASON = `Source verification of RULE TEXT ONLY (2026-09-27), per the founder's 2026-09-24 disposition: SMC 23.44.080.B (riparian corridors; wetlands and buffers; submerged lands / shoreline setback; designated non-disturbance steep-slope area, defined further in 23.44.080.E) is Tier 1 regulatory text. ${SMC}. NOT tested or approved: implementation/evidence blockers remain. Correction applied 2026-09-27 (evaluateEcaLotAreaAdjustment): a mapped wetland/riparian/shoreline polygon that misses the parcel no longer yields NOT_APPLICABLE - unmodeled regulatory buffers/setbacks now fail closed to REQUIRES_VERIFICATION, and NOT_APPLICABLE is returned only when the complete exclusion area of every category is ruled out. Still open before APPROVED: (a) generic steep_slope is not equated with the designated non-disturbance area (INTERSECTS stays REQUIRES_VERIFICATION); (b) authoritative wetland-buffer, shoreline-setback/submerged-land and riparian-corridor geometry is not available, so ESTABLISHED remains unreachable. Missing data may yield REQUIRES_VERIFICATION; incorrect category mapping may not.`;

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID is not configured.");
  const db = getDb();
  const rows = await db.select().from(regulatoryRules).where(eq(regulatoryRules.isTestOnlyFixture, false));
  const byType = new Map(rows.map((r) => [(r.ruleSpecification as { ruleType: string }).ruleType, r]));
  const need = (type: string) => {
    const row = byType.get(type);
    if (!row) throw new Error(`Rule ${type} not found.`);
    if (row.lifecycleState !== "TRIAGED" || row.tier !== "TIER_1") throw new Error(`${type} is ${row.lifecycleState}/${row.tier}, expected TRIAGED/TIER_1 - refusing to advance.`);
    return row;
  };
  // Validate every target before changing anything.
  const targets = RULES.map((r) => ({ spec: r, row: need(r.type) }));
  const c1b = need(C1B_TYPE);

  for (const { spec, row } of targets) {
    const n = (row.testCases as unknown[]).length;
    const sv = await sourceVerifyRule(db, row.id, operatorId, `Delegated-policy batch (2026-09-27) source verification of ${spec.label}, Tier 1. Source: ${spec.src}. Implementation checked against the rule text in src/regulatory-rules-engine/evaluate.ts. Scope: rule validity; property/customer evidence gaps yield REQUIRES_VERIFICATION and do not change the Tier-1 classification.`, "TIER_1");
    if (sv.outcome !== "OK") throw new Error(`${spec.label} source-verify: ${JSON.stringify(sv)}`);
    const tested = await markRuleTested(db, row.id, operatorId, `Delegated-policy batch (2026-09-27): all ${n} declared test case(s) of ${spec.label} map to passing automated tests. Evidence: ${spec.tests}`, Array.from({ length: n }, (_, i) => ({ testCaseIndex: i, passed: true })));
    if (tested.outcome !== "OK") throw new Error(`${spec.label} mark-tested: ${JSON.stringify(tested)}`);
    const approved = await approveRule(
      db,
      row.id,
      operatorId,
      `Approval of ${spec.label} (2026-09-27): Tier-1 rule validity is source verified and the implementation is accepted as activation-ready. Property-specific evidence may still yield REQUIRES_VERIFICATION. APPROVED does not mean ACTIVE: the customer-facing result remains dormant until a separate founder-authorized activation of the constituent rules.${spec.note ? " Note: " + spec.note : ""} acceptedEvidenceQuality=AUTHORITATIVE only. Test evidence: see this rule's RULE_TESTED audit entry.`,
      ["AUTHORITATIVE"],
      "APPROVE RULE"
    );
    if (approved.outcome !== "OK") throw new Error(`${spec.label} approve: ${JSON.stringify(approved)}`);
    console.log(spec.label, "->", approved.rule.lifecycleState);
  }

  const c1bResult = await sourceVerifyRule(db, c1b.id, operatorId, C1B_REASON, "TIER_1");
  console.log("C1b ->", c1bResult.outcome === "OK" ? c1bResult.rule.lifecycleState : JSON.stringify(c1bResult));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
