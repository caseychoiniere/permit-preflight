/**
 * The 19 REAL candidate Unit 6B shed rules the founder explicitly confirmed for governance-row
 * creation (aidlc-docs/aidlc-state.md's "Founder confirmation for Unit 6B Code Generation",
 * 2026-09-15): P1, P2a, P2b-1, P2b-2, P3a, P3b, P4, P5, P6, P7a, P7b, P9, C1a, C1b, C1c, C1d,
 * C1e-floor, C1e-director, C2. Tiers are NOT a new Code Generation-time decision - they are the
 * exact founder-confirmed values recorded in `candidate-regulatory-rules.md`'s "Summary table"
 * (2026-09-13 founder review). P8 (trade permits, withdrawn as a tiered rule) and C3 (superseded,
 * no current-code equivalent) are explicitly excluded per that same founder confirmation.
 *
 * Every row here mirrors Unit 4's `realGarageLotCoverageCandidate` precedent exactly: real,
 * non-fixture content (`isTestOnlyFixture: false`), progressed only through `draft()` ->
 * `triage()` in tests/regulatory-rule-governance/shed-permit-candidates.test.ts - never
 * `sourceVerify()`, `markTested()`, `approve()`, or `activate()`. Held at DRAFTED/TRIAGED only,
 * per code-generation-plan.md §5's explicit constraint.
 */

import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { ShedLotCoverageRuleType, ShedPermitRuleType } from "../../src/regulatory-rules-engine/evaluate.js";

const ORDINANCE_127376 = "127376";

export const realShedPermitCandidates: DraftedRuleInput[] = [
  {
    id: "shed-permit-p1-roof-area-2026",
    subject: "Shed building-permit exemption - projected roof area ≤ 120 sq ft",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.ROOF_AREA },
    citation: {
      smcSections: ["2021 Seattle Residential Code (SRC) R105.2, Item 3.1"],
      effectiveDateBasis: "2021 SRC, current at time of research - governs over informal SDCI web-page paraphrases of the same threshold.",
    },
    caveats: [
      {
        category: "evidence gap, not a tier issue",
        description: "Roof overhang (optional progressive input) can push projected roof area over 120 sq ft even when wall footprint alone is within it; when the overhang is disclosed but only approximate, the criterion resolves REQUIRES_VERIFICATION rather than a guessed MET/NOT_MET.",
        affectedConditionOrInterpretation: "Projected roof area near the 120 sq ft boundary",
        sourceReferences: ["SRC R105.2 Item 3.1"],
        resolutionStatus: "Resolved by design - REQUIRES_VERIFICATION is the correct terminal state for an approximate overhang measurement, not a gap to close.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "10x10 shed, no overhang", input: { widthFt: 10, depthFt: 10 }, expected: { status: "MET" } },
      { kind: "NEGATIVE", description: "12x12 shed exceeds 120 sq ft footprint alone", input: { widthFt: 12, depthFt: 12 }, expected: { status: "NOT_MET" } },
      { kind: "EXCEPTION", description: "Footprint within 120 sq ft but overhang disclosed without an exact measurement", input: { widthFt: 10, depthFt: 10, roofOverhang: { extendsBeyondWalls: true } }, expected: { status: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p2a-story-height-2026",
    subject: "Shed building-permit exemption - single-story",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.STORY_HEIGHT },
    citation: { smcSections: ["2021 Seattle Residential Code (SRC) R105.2"] },
    caveats: [
      {
        category: "no evidence gap",
        description: "This product's shed intake has no multi-story shed configuration - the criterion is always MET by construction, not by a customer answer.",
        affectedConditionOrInterpretation: "Whether the criterion could ever resolve NOT_MET or REQUIRES_VERIFICATION",
        sourceReferences: ["SRC R105.2"],
        resolutionStatus: "Not applicable - no open question.",
      },
    ],
    testCases: [{ kind: "POSITIVE", description: "Always MET for any shed evaluated by this product", input: {}, expected: { status: "MET" } }],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p2b1-accessory-height-in-setback-2026",
    subject: "Accessory structure height limit - in a required setback (12 ft)",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_IN_SETBACK },
    citation: { smcSections: ["SMC 23.44.070"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "unresolved narrow item (external-verification item 24)",
        description: "The exact current SMC 23.44.070 subsection numbering and the precise wording of its own roof/height-exception interaction for setback-located accessory structures has not been independently re-verified against the full current statutory text.",
        affectedConditionOrInterpretation: "Whether an unenumerated exception could excuse a height that otherwise exceeds the 12ft limit",
        sourceReferences: ["SMC 23.44.070"],
        resolutionStatus: "Open - item 24. Until resolved, exceeding the limit resolves REQUIRES_VERIFICATION, never an unconditional FAIL.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "In setback, height 10ft", input: { isInRequiredSetback: true, heightFt: 10 }, expected: { compliesWithLimit: true } },
      { kind: "EXCEPTION", description: "In setback, height 14ft - exceeds 12ft limit but item 24 unresolved", input: { isInRequiredSetback: true, heightFt: 14 }, expected: { classification: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p2b2-accessory-height-outside-setback-2026",
    subject: "Accessory structure height limit - outside every required setback (32 ft)",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK },
    citation: { smcSections: ["SMC 23.44.070"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "unresolved narrow item (external-verification item 24)",
        description: "Same unresolved roof/height-exception question as P2b-1, applied to the general 32ft NR-zone limit rather than the 12ft setback limit.",
        affectedConditionOrInterpretation: "Whether an unenumerated exception could excuse a height that otherwise exceeds the 32ft limit",
        sourceReferences: ["SMC 23.44.070"],
        resolutionStatus: "Open - item 24.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "Outside setback, height 20ft", input: { isInRequiredSetback: false, heightFt: 20 }, expected: { compliesWithLimit: true } },
      { kind: "EXCEPTION", description: "Outside setback, height 35ft - exceeds 32ft limit but item 24 unresolved", input: { isInRequiredSetback: false, heightFt: 35 }, expected: { classification: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p3a-foundation-exemption-2026",
    subject: "Shed building-permit exemption - foundation type",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.FOUNDATION_EXEMPTION },
    citation: { smcSections: ["2021 Seattle Residential Code (SRC) R105.2, Item 3.2"] },
    caveats: [
      {
        category: "evidence gap, not a tier issue",
        description: "foundationType is a customer input; unanswered resolves REQUIRES_VERIFICATION, never a guessed MET/NOT_MET.",
        affectedConditionOrInterpretation: "Whether the exemption criterion can be evaluated at all",
        sourceReferences: ["SRC R105.2 Item 3.2"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "Slab on grade", input: { foundationType: "SLAB_ON_GRADE" }, expected: { status: "MET" } },
      { kind: "NEGATIVE", description: "Pile foundation", input: { foundationType: "PILES" }, expected: { status: "NOT_MET" } },
      { kind: "EXCEPTION", description: "Foundation type unanswered", input: { foundationType: undefined }, expected: { status: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p3b-foundation-stfi-disqualifier-2026",
    subject: "Foundation type disqualifying STFI eligibility (pile or all-wood foundations)",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.FOUNDATION_STFI_DISQUALIFIER },
    citation: { smcSections: ["SDCI Tip 316 (04/26/2024 revision)"] },
    caveats: [
      {
        category: "independent of P3a - not a duplicate",
        description: "This rule governs reviewPath (STFI eligibility), a different regulatory question from P3a's buildingPermit exemption criterion, even though both read the same foundationType fact. A pile or wood foundation disqualifies STFI regardless of whether P3a has also already failed the exemption on the same fact.",
        affectedConditionOrInterpretation: "reviewPath derivation (business-logic-model.md Flow 3)",
        sourceReferences: ["SDCI Tip 316"],
        resolutionStatus: "Resolved - wired into deriveBuildingPermitState per the 2026-09-15 review correction.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "Slab foundation does not disqualify STFI", input: { foundationType: "SLAB_ON_GRADE" }, expected: { disqualifiesStfi: false } },
      { kind: "NEGATIVE", description: "Pile foundation disqualifies STFI even when size/span/ECA are all otherwise clear", input: { foundationType: "PILES" }, expected: { disqualifiesStfi: true } },
      { kind: "EXCEPTION", description: "Foundation type unanswered", input: { foundationType: undefined }, expected: { disqualification: "UNKNOWN" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p4-attachment-2026",
    subject: "Shed building-permit exemption - detached from any dwelling",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.ATTACHMENT },
    citation: { smcSections: ["SDCI \"Sheds\" guidance"] },
    caveats: [
      {
        category: "evidence gap, not a tier issue",
        description: "attachment is a customer input; unanswered resolves REQUIRES_VERIFICATION.",
        affectedConditionOrInterpretation: "Whether the shed is properly a shed vs. an addition",
        sourceReferences: ["SDCI \"Sheds\" guidance"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "Detached", input: { attachment: "DETACHED" }, expected: { status: "MET" } },
      { kind: "NEGATIVE", description: "Attached - redirects to the addition path", input: { attachment: "ATTACHED" }, expected: { status: "NOT_MET" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p5-use-2026",
    subject: "Shed building-permit exemption - use (storage or growing plants only)",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.USE },
    citation: { smcSections: ["SDCI \"Sheds\" guidance"] },
    caveats: [
      {
        category: "hard invariant - no automated NOT_MET (BR-U6B-10)",
        description: "Founder instruction: this criterion never resolves NOT_MET, even for an explicitly occupiable use. Everything outside the two explicit categories resolves REQUIRES_VERIFICATION, since Unit 6B does not attempt to classify \"similar generally unoccupied uses.\"",
        affectedConditionOrInterpretation: "USE criterion outcome space",
        sourceReferences: ["SDCI \"Sheds\" guidance"],
        resolutionStatus: "Resolved by design - a future rule automating the \"similar uses\" catch-all would itself be Tier 2, not built in Unit 6B.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "Storage", input: { intendedUse: "STORAGE" }, expected: { status: "MET" } },
      { kind: "EXCEPTION", description: "Occupiable use never resolves NOT_MET", input: { intendedUse: "OCCUPIABLE" }, expected: { status: "REQUIRES_VERIFICATION" } },
      { kind: "EXCEPTION", description: "Unanswered", input: { intendedUse: undefined }, expected: { status: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p6-eca-criterion-2026",
    subject: "Shed building-permit exemption - not in or near a mapped environmentally critical area",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.ECA_CRITERION },
    citation: { smcSections: ["SDCI \"Sheds\" guidance", "SDCI Tip 316", "SMC 25.09"] },
    caveats: [
      {
        category: "genuine Tier 2 driver - discretionary/textual ambiguity, not an evidence gap",
        description: "\"In or near\" carries no code-defined distance, and SDCI retains discretion to route any ECA-adjacent project to full review regardless of size - a real, unresolved interpretive question distinguishing this from the Tier 1 rules in this set.",
        affectedConditionOrInterpretation: "The distance/proximity threshold for \"near\" an ECA",
        sourceReferences: ["SDCI \"Sheds\" guidance", "SMC 25.09"],
        resolutionStatus: "Unresolved - genuinely Tier 2, per the governing principle distinguishing rule ambiguity from missing per-parcel evidence.",
      },
    ],
    testCases: [
      { kind: "NEGATIVE", description: "Confirmed map-dispositive intersection", input: { mappedIntersectionResult: "INTERSECTS", advisoryStatus: "MAP_DISPOSITIVE" }, expected: { status: "NOT_MET" } },
      { kind: "EXCEPTION", description: "Advisory-only hazard, any mapped result", input: { advisoryStatus: "ADVISORY_ONLY" }, expected: { status: "REQUIRES_VERIFICATION" } },
      { kind: "POSITIVE", description: "No hazard findings at all", input: { ecaFindings: [] }, expected: { status: "MET" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p7a-size-span-footprint-2026",
    subject: "STFI-vs-full-review - 750 sq ft footprint threshold",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.SIZE_SPAN_FOOTPRINT },
    citation: { smcSections: ["SDCI Tip 316"] },
    caveats: [
      {
        category: "not sufficient alone",
        description: "Footprint ≤750 sq ft is a necessary but not sufficient STFI condition - P7b's span condition must also resolve MET before reviewPath can reach STFI_LIKELY.",
        affectedConditionOrInterpretation: "SIZE_SPAN combined criterion",
        sourceReferences: ["SDCI Tip 316"],
        resolutionStatus: "Resolved - evaluateSizeSpan requires both.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "500 sq ft footprint", input: { footprintSqFt: 500 }, expected: { p7aMet: true } },
      { kind: "NEGATIVE", description: "900 sq ft footprint", input: { footprintSqFt: 900 }, expected: { p7aMet: false } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p7b-size-span-structural-2026",
    subject: "STFI-vs-full-review - structural span threshold",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.SIZE_SPAN_STRUCTURAL },
    citation: { smcSections: ["SDCI Tip 316 (04/26/2024 revision)"] },
    caveats: [
      {
        category: "unresolved narrow item (external-verification item 25)",
        description: "Tip 316's \"less than 14 feet\" eligibility wording and the SDCI shed guidance's \"more than 14 feet\" full-review framing do not textually reconcile at exactly 14.0 ft.",
        affectedConditionOrInterpretation: "structuralSpanFt === 14.0 boundary",
        sourceReferences: ["SDCI Tip 316"],
        resolutionStatus: "Open - item 25. Resolves REQUIRES_VERIFICATION at exactly 14.0ft rather than fabricating an operator.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "Span under 14ft", input: { structuralSpanFt: 10 }, expected: { status: "MET" } },
      { kind: "BOUNDARY", description: "Span exactly 14ft - unresolved operator", input: { structuralSpanFt: 14 }, expected: { status: "REQUIRES_VERIFICATION" } },
      { kind: "POSITIVE", description: "Span 25ft with manufactured truss", input: { structuralSpanFt: 25, usesManufacturedTruss: true }, expected: { status: "MET" } },
      { kind: "NEGATIVE", description: "Span 35ft even with truss", input: { structuralSpanFt: 35, usesManufacturedTruss: true }, expected: { status: "NOT_MET" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-permit-p9-exemption-not-zoning-compliance-2026",
    subject: "Permit exemption does not waive zoning-code compliance (framing/disclaimer rule)",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE },
    citation: { smcSections: ["SDCI \"Do You Need a Permit?\" guidance"] },
    caveats: [
      {
        category: "report-layer constant, not a computed Finding",
        description: "This rule's specification is a fixed disclaimer rendered whenever buildingPermit === LIKELY_EXEMPT (BR-U6B-9) - it has no evaluate.ts function of its own and does not gate PermitRequirementFinding's own aggregation (§4.14).",
        affectedConditionOrInterpretation: "Report rendering of a LIKELY_EXEMPT result",
        sourceReferences: ["SDCI \"Do You Need a Permit?\" guidance"],
        resolutionStatus: "Deferred to Report Generation (code-generation-plan.md §6) - governance row created now for provenance/auditability, per the founder's explicit confirmation.",
      },
    ],
    testCases: [{ kind: "POSITIVE", description: "Always shown alongside a LIKELY_EXEMPT result", input: { buildingPermit: "LIKELY_EXEMPT" }, expected: { disclaimerShown: true } }],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-lot-coverage-c1a-base-maximum-2026",
    subject: "Base maximum lot coverage (50%) - Seattle NR zone",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedLotCoverageRuleType.BASE_MAXIMUM },
    citation: { smcSections: ["SMC 23.44.080.A"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "explicit statutory exception not modeled by this rule alone",
        description: "The 50% default is subject to C1c/C1d's potential 60% figure - which of them governs a given parcel is not detected in this slice (founder-directed CASE A/B/C banding, domain-entities.md §3c) rather than resolved here.",
        affectedConditionOrInterpretation: "Whether 50% or 60% is the actually-applicable maximum",
        sourceReferences: ["SMC 23.44.080.A", "SMC 23.44.080.F", "SMC 23.44.080.G"],
        resolutionStatus: "Resolved by design via bounded banding, not per-parcel detection.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "Estimated coverage at 40% of adjusted lot area", input: { estimatedCoverageSqFt: 2000, adjustedLotAreaSqFt: 5000 }, expected: { status: "WITHIN_STANDARD_ALLOWANCE" } },
      { kind: "BOUNDARY", description: "Estimated coverage exactly at 50%", input: { estimatedCoverageSqFt: 2500, adjustedLotAreaSqFt: 5000 }, expected: { status: "WITHIN_STANDARD_ALLOWANCE" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-lot-coverage-c1b-eca-exclusion-2026",
    subject: "ECA lot-area exclusions - riparian corridor, wetland/buffer, submerged land/shoreline setback, steep-slope non-disturbance area",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedLotCoverageRuleType.ECA_LOT_AREA_EXCLUSION },
    citation: { smcSections: ["SMC 23.44.080.B"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "data/legal-derivation limitation (external-verification item 26), not a rule-tier issue",
        description: "The submerged-land/shoreline-setback sub-category has no dedicated exclusion-geometry dataset (only a zoning-overlay/environment-designation layer, an unconfirmed proxy), and the wetland-buffer sub-category's applicable buffer width depends on a habitat-function field absent from the available layer. Both resolve REQUIRES_VERIFICATION rather than a guessed excluded area.",
        affectedConditionOrInterpretation: "excludedAreaSqFt computation for 2 of the 4 named categories",
        sourceReferences: ["SMC 23.44.080.B", "SMC 25.09.160"],
        resolutionStatus: "Open (item 26) - the rule text itself remains T1; this is an evidence/data limitation.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "No named category intersects the parcel", input: { intersectingCategories: [] }, expected: { status: "NOT_APPLICABLE" } },
      { kind: "EXCEPTION", description: "Riparian corridor intersects but exact excluded area is not computed in this pass", input: { intersectingCategories: ["RIPARIAN_CORRIDOR"] }, expected: { status: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-lot-coverage-c1c-transit-bonus-2026",
    subject: "60% lot coverage allowance - frequent-transit common-amenity development",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedLotCoverageRuleType.TRANSIT_BONUS },
    citation: { smcSections: ["SMC 23.44.080.F"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "detection deliberately deferred (founder scope decision, 2026-09-13)",
        description: "No automatic per-parcel applicability detection is built for this rule - no new GIS adapter, assessor integration, or customer question. The rule text itself is fully deterministic (T1); its 60% figure participates only as a known ceiling in the CASE A/B/C banding, never as a confirmed per-parcel fact.",
        affectedConditionOrInterpretation: "Whether a given parcel actually qualifies for the 60% figure",
        sourceReferences: ["SMC 23.44.080.F"],
        resolutionStatus: "Deferred by explicit founder decision - not scheduled.",
      },
    ],
    testCases: [{ kind: "EXCEPTION", description: "Applicability to a given parcel is never automatically detected", input: {}, expected: { applicabilityDetected: false } }],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-lot-coverage-c1d-stacked-bonus-2026",
    subject: "60% lot coverage allowance - stacked dwelling units",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedLotCoverageRuleType.STACKED_BONUS },
    citation: { smcSections: ["SMC 23.44.080.G"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "detection deliberately deferred (founder scope decision, 2026-09-13)",
        description: "Same treatment as C1c: no automatic stacked-dwelling-unit detection is built; the rule stays T1 and participates only as a known ceiling in the CASE A/B/C banding.",
        affectedConditionOrInterpretation: "Whether a given parcel's development actually includes stacked dwelling units",
        sourceReferences: ["SMC 23.44.080.G"],
        resolutionStatus: "Deferred by explicit founder decision - not scheduled.",
      },
    ],
    testCases: [{ kind: "EXCEPTION", description: "Stacked-unit status is never automatically detected", input: {}, expected: { applicabilityDetected: false } }],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-lot-coverage-c1e-floor-2026",
    subject: "Minimum lot coverage floor (625 sq ft) on lots containing SMC 23.44.080.B areas",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedLotCoverageRuleType.MINIMUM_FLOOR },
    citation: { smcSections: ["SMC 23.44.080.D"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "conditional on C1b",
        description: "This 625 sq ft deterministic floor applies only when C1b areas are present on the lot; it is meaningless in isolation from C1b's own ESTABLISHED/REQUIRES_VERIFICATION status.",
        affectedConditionOrInterpretation: "minimumCoverageFloor within EcaLotAreaAdjustment",
        sourceReferences: ["SMC 23.44.080.D"],
        resolutionStatus: "Resolved - the deterministic floor itself is T1.",
      },
    ],
    testCases: [{ kind: "POSITIVE", description: "625 sq ft floor applies when a C1b area is present and no Director alternative is on file", input: { c1bAreaPresent: true }, expected: { floorSqFt: 625 } }],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-lot-coverage-c1e-director-alternative-2026",
    subject: "Director-approved alternative minimum coverage amount",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedLotCoverageRuleType.DIRECTOR_ALTERNATIVE },
    citation: { smcSections: ["SMC 23.44.080.D"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "genuine Tier 2 driver - discretionary administrative determination",
        description: "A case-by-case SDCI Director determination, not merely an evidence gap - Permit Preflight has no channel to obtain actual Director-approval data for a specific parcel and never guesses one.",
        affectedConditionOrInterpretation: "Whether a Director-approved amount higher than 625 sq ft applies to this parcel",
        sourceReferences: ["SMC 23.44.080.D"],
        resolutionStatus: "Unresolved by design - always REQUIRES_VERIFICATION unless actual Director-approval data is supplied (never in this pass).",
      },
    ],
    testCases: [{ kind: "EXCEPTION", description: "No channel exists to confirm or rule out a Director-approved alternative", input: {}, expected: { status: "REQUIRES_VERIFICATION" } }],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-lot-coverage-c2-estimate-caveat-2026",
    subject: "What counts toward lot coverage - current SMC 23.44.080.C exclusions",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedLotCoverageRuleType.ESTIMATE_CAVEAT },
    citation: { smcSections: ["SMC 23.44.080.C"], ordinanceNumber: ORDINANCE_127376 },
    caveats: [
      {
        category: "absorbed into an existing fact's caveat, not consumed by any evaluator",
        description: "The Building Outlines dataset cannot identify most of the current code's explicit exclusions (underground structures, qualifying projections, decks, porches) per-parcel. This reduces existingMappedCoverageSqFt's reliability (an ESTIMATED-label/evidence matter) via the existing-structure-coverage fact's own overCountCaveat (domain-entities.md §1b) - it is not separately typed or computed in Regulatory Rules Engine code, and does not gate evaluateShedLotCoverage's own aggregation.",
        affectedConditionOrInterpretation: "Reliability of existingMappedCoverageSqFt",
        sourceReferences: ["SMC 23.44.080.C"],
        resolutionStatus: "Resolved - governance row exists for provenance/auditability; the rule itself does not participate in evaluateShedLotCoverage's constituent-rule gating.",
      },
    ],
    testCases: [{ kind: "EXCEPTION", description: "Existing coverage is always ESTIMATED, never KNOWN-precise, regardless of this rule's own activation status", input: {}, expected: { qualityLabel: "ESTIMATED" } }],
    isTestOnlyFixture: false,
  },
];

/**
 * Founder-confirmed tiers (candidate-regulatory-rules.md's "Summary table", 2026-09-13 founder
 * review) - only P6 and C1e's Director-alternative branch are genuinely Tier 2 (discretionary/
 * textual ambiguity); every other row is Tier 1 (a fully deterministic rule text, even where the
 * per-parcel/customer fact needed to apply it is unknown - the project's governing principle
 * distinguishing rule ambiguity from missing evidence). Exported as this module's single source
 * of truth (2026-09-24) - both the governance test below and the real bootstrap script
 * (`scripts/bootstrap-unit-6b-governance.ts`) import this rather than each re-deriving it.
 */
export const TIER_2_CANDIDATE_IDS = new Set(["shed-permit-p6-eca-criterion-2026", "shed-lot-coverage-c1e-director-alternative-2026"]);

export function tierForRealShedPermitCandidate(candidateId: string): "TIER_1" | "TIER_2" {
  return TIER_2_CANDIDATE_IDS.has(candidateId) ? "TIER_2" : "TIER_1";
}
