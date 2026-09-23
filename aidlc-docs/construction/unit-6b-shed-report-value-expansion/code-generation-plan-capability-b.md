# Unit 6B — Capability B (Shed Permit Determination) — Code Generation Plan Part 1

**Status**: Plan APPROVED (`aidlc-reviewer.review_gate` v1→v2→v3, decision `17332ae3-ef0a-4dc6-
b02a-2bf1ffb260e7`, bounded override applied to the final authentication-only ESCALATE per the
founder's own standing authorization). **Implementation COMPLETE** — `npm test` 624/624 passing
(+24 new), `tsc --noEmit` clean, `npm run build` clean, live-verified via a real dev server against
a real Seattle parcel + direct database inspection. No rule activated, Capability C untouched, no
commit made. Founder-directed 2026-09-23: "Proceed with Unit 6B Capability B next: SHED PERMIT
DETERMINATION. Do not start Capability C yet."

## 0. What already exists (verified by direct code inspection before writing this plan, not assumed)

The prior Code Generation pass (2026-09-15, `d46e10e1-8029-4ac3-ad06-d93d4443dd33`) already built,
and this pass re-verified live:

- **Domain types**: `FoundationType`, `ShedAttachment`, `ShedIntendedUse`, `RoofOverhang`,
  `StructuralSpanInfo`, `UtilityIntent`, and the corresponding optional fields on both
  `ShedProjectConfiguration` (`src/screening-request/types.ts`, incl. Zod schema) and
  `ShedProjectDetails` (`src/regulatory-rules-engine/types.ts`, incl. `isInRequiredSetback`).
- **Result types**: `PermitRequirementFinding`, `PermitCriterionResult`, `TradePermitDisclosure`,
  `AccessoryStructureHeightLimit`, `BuildingPermitStatus`, `PermitReviewPath`, `PermitCriterionId`
  (`src/regulatory-rules-engine/types.ts`).
- **Evaluators** (`src/regulatory-rules-engine/evaluate.ts`, all exported, all unit-tested — 50
  tests in `tests/regulatory-rules-engine/shed-permit-evaluate.test.ts`):
  `evaluateRoofArea`, `evaluateStoryHeight`, `evaluateFoundationExemption`, `evaluateAttachment`,
  `evaluateUse`, `evaluateEcaPermitCriterion`, `evaluateSizeSpan`, `foundationStfiDisqualification`,
  `deriveBuildingPermitState`, `buildTradePermitDisclosures`, `evaluateShedPermitRequirement`,
  `evaluateAccessoryHeightLimit`.
- **Dormancy gate**: `evaluateProject` already computes `outcome.permitRequirement` and
  `outcome.accessoryHeightLimitFinding` **only when every constituent `ShedPermitRuleType` row is
  ACTIVE** (`allRuleTypesActive`/`PERMIT_REQUIREMENT_CONSTITUENT_RULE_TYPES`/
  `ACCESSORY_HEIGHT_LIMIT_CONSTITUENT_RULE_TYPES`), and the 19-row governance hard-invariant test
  (`tests/regulatory-rule-governance/shed-permit-candidates.test.ts`) still passes — re-run live
  today, 23/23 — proving none of the 19 rows is ACTIVE anywhere in this codebase. **This plan does
  not touch this gate.**

**Verified missing** (grep across `app/` and `src/report-generation-orchestrator/pipeline.ts`):
zero references to `foundationType`/`attachment`/`intendedUse`/`roofOverhang`/
`structuralSpanInfo`/`utilityIntent`/`isInRequiredSetback`/`permitRequirement`/
`accessoryHeightLimitFinding` anywhere in the pipeline, intake UI, or report rendering. The
evaluators exist and are correct; nothing calls them with real data, and nothing renders their
output. **This plan builds exactly that missing middle: intake → pipeline wiring → report/PDF
presentation.**

## 1. Scope (per founder instruction)

In scope: `PermitRequirementFinding` (buildingPermit/reviewPath) end-to-end, and P2b's standalone
`accessoryHeightLimitFinding` (types/evaluator already exist; wiring it in is in scope per the
founder's explicit "preserve P2b location-sensitive height treatment").

Out of scope: Capability C (`ShedLotCoverageResult`/`shedLotCoverageFacts`) — not touched, not
wired, no lot-coverage report section added. Rule activation (`approve()`/`activate()`) — not
called anywhere in this plan. Any change to rule tiers or the 19-row governance inventory.

## 2. `isInRequiredSetback` — APPROVED bounded-band derivation (founder decision, 2026-09-23)

**This section supersedes both the plan's original premise (isInRequiredSetback always
`undefined`) and the unqualified bounded-band proposal from the research pass.** Full source
citations and the founder's exact corrections are in
`aidlc-docs/decisions/2026-09-17-side-street-setback-current-code-research.md`'s "Correction
(2026-09-23, same day)" section. Summary of the approved, implementable design:

**Per boundary (front/rear/side), independently, derive one of `DEFINITELY_INSIDE` /
`DEFINITELY_OUTSIDE` / `REQUIRES_VERIFICATION`:**

- **Front**: role unresolved (`distanceToFrontLotLineFt === undefined` or
  `frontRoleEvidenceGapReason` set) → `REQUIRES_VERIFICATION` ("front lot-line regulatory role
  unresolved"). Else `distance < 10` → `DEFINITELY_INSIDE`. Else `distance >= 15` →
  `REQUIRES_VERIFICATION` ("special Queen Anne Boulevard frontage unresolved (no street-name
  evidence available)") — **never** `DEFINITELY_OUTSIDE`, since no street-name/address evidence
  is persisted anywhere past initial parcel resolution (verified: `canonicalAddress` never
  reaches `screeningRequests` or any persisted table) and Table A's Queen Anne Boulevard footnote
  cannot be ruled out. Else (`10 <= distance < 15`) → `REQUIRES_VERIFICATION` ("dwelling-unit
  count needed to select the 10ft vs 15ft front setback").
- **Rear**: role unresolved → `REQUIRES_VERIFICATION` ("rear lot-line regulatory role
  unresolved"). Else `distance < 5` → `DEFINITELY_INSIDE`. Else, whether alley-adjacent or
  `distance >= 15` → `REQUIRES_VERIFICATION` ("additional Chapter 23.53 setback applicability
  unresolved") — **never** `DEFINITELY_OUTSIDE` (verified: no right-of-way/street-width/23.53
  fact exists anywhere in Property Intelligence or the persisted schema). `REAR_SETBACK.minFt` is
  never reused here (Q2's finding: it is 23.44.090.I.2's distinct accessory-placement exception,
  not Table A's boundary). Else (`5 <= distance < 15`) → `REQUIRES_VERIFICATION` ("dwelling-unit
  count and/or frequent-transit-service-area status needed to select the applicable 5/10/15ft
  rear setback").
- **Side**: role unresolved → `REQUIRES_VERIFICATION` ("side lot-line regulatory role
  unresolved"). Else `distance < 3` → `DEFINITELY_INSIDE`. Else `distance >= 5` →
  `REQUIRES_VERIFICATION` ("additional Chapter 23.53 setback applicability unresolved") — same
  guard as rear, never `DEFINITELY_OUTSIDE`. Else (`3 <= distance < 5`) →
  `REQUIRES_VERIFICATION` ("side distance falls in the unresolved 3-5ft band pending
  frequent-transit-service-area status") — **corrected**: never collapsed to only the 3ft floor.

**Aggregation**: any boundary `DEFINITELY_INSIDE` → `isInRequiredSetback = true`. Every relevant
boundary `DEFINITELY_OUTSIDE` → `isInRequiredSetback = false`. Otherwise →
`isInRequiredSetback = undefined`, carrying the union of every contributing boundary's reason
strings.

**Disclosed, honest consequence** (not a defect): because the Chapter 23.53 guard (rear/side) and
the Queen Anne Boulevard guard (front) can never be satisfied with today's evidence,
`DEFINITELY_OUTSIDE` is currently unreachable for any boundary — `isInRequiredSetback` can resolve
`true` or `REQUIRES_VERIFICATION` today, not yet `false`, for any real property. **Corrected per
reviewer finding (decision `3fdb3357-510f-49d0-baa2-7dd20dabae9f`, MAJOR — a genuine, correct
catch, fixed on its own merits)**: `deriveIsInRequiredSetback`'s signature (§3.2) takes only
today's already-known inputs (distances, role-gap reasons, `alleyAdjacent`) — it has **no
parameter slot** for dwelling-unit count, FTSA status, street-name/address data, or Chapter
23.53/right-of-way status. My earlier "activates automatically once future evidence is sourced"
was overstated: **a future pass would need to extend this function's own inputs and the two guard
conditions**, not merely supply new data to unchanged code — there is no zero-code-change
activation path today. The `false` branch of the aggregation logic itself (every relevant boundary
`DEFINITELY_OUTSIDE`) is implemented correctly and needs no further change once a boundary can
actually produce `DEFINITELY_OUTSIDE` — it is specifically the **guard conditions and the missing
input parameters** that a future pass must add. Separately, the still-open NR side-setback
averaging methodology gap (2026-09-17 research, "Genuinely open item") is its own, already-disclosed,
independent limitation on ever resolving the Side guard, not newly introduced or newly resolved by
this correction. This remains Tier 1 throughout (BR-U6B-14: rule tier ≠ evidence quality) — the
code text itself is fully deterministic; only the per-property facts and this function's current
input surface are incomplete.

**New field required**: `ShedProjectDetails` needs a `requiredSetbackEvidenceGapReasons?: string[]`
field (mirrors the existing `frontRoleEvidenceGapReason`-style gap-reason fields, additive, no
existing field touched) so `evaluateAccessoryHeightLimit`'s `REQUIRES_VERIFICATION` branch can cite
the *specific* reason(s) per the founder's item 7 ("do not emit a generic status-unavailable
message if a specific cause is known") instead of its current generic fallback text.

## 3. Implementation plan

### 3.1 Intake UI — `app/configure/page.tsx` (DETAILS step, shed branch)

- [x] New local state `shedPermitIntake` (mirrors the existing `dimensions`/
      `existingStructuresChoice` pattern), holding `foundationType`, `attachment`, `intendedUse`,
      `roofOverhang`, `structuralSpanInfo`, `utilityIntent`.
- [x] Always-asked fieldset (`projectType === ProjectType.SHED`), 3 single-select radio groups
      matching the existing radio-fieldset pattern (`stackedDwellingUnits` precedent) with a real
      "Not sure yet" → `undefined` option for each, per frontend-components.md §1 and
      domain-entities.md §2's enums:
      - Foundation → the 6 `FoundationType` values + "Not sure yet".
      - Attached or detached → `ShedAttachment` values + "Not sure yet".
      - Intended use → `STORAGE` / `GREENHOUSE_PLANTS` / "Something else" (→ `OCCUPIABLE`, per
        frontend-components.md §1's own mapping — collected for the customer's clarity, resolves
        `REQUIRES_VERIFICATION`, never a guess) / "Not sure yet" (→ `undefined`).
- [x] Progressive roof-overhang question — shown iff `dimensions.widthFt * dimensions.depthFt <=
      120` (client-side arithmetic only, mirrors the existing threshold-driven pattern already used
      elsewhere in this codebase, e.g. `wallFootprintSqFt` in the approved design). No/Yes/Not sure;
      Yes reveals an optional numeric inches field.
- [x] Progressive structural-span question — **corrected per reviewer finding (decision
      `3ad7b6b8-7ccf-4e6d-84e6-f3d993057ccb`, MAJOR)**: BR-U6B-7/frontend-components.md §1 require
      the permit to already be **trending `REQUIRED`** before this question is shown — i.e. at
      least one of the client-knowable exemption criteria must be a **confirmed `NOT_MET`**, never
      merely "not confidently `MET`" (an unanswered/undefined criterion is not itself a reason to
      show this question — my original draft incorrectly conflated "unresolved" with "trending
      required"). Corrected condition, shown iff: at least one of
      `evaluateRoofArea`/`evaluateFoundationExemption`/`evaluateAttachment` (client-knowable,
      `evaluateUse` never produces `NOT_MET` per BR-U6B-10 so it cannot itself trigger this) resolves
      `NOT_MET` for the current intake values, AND `widthFt * depthFt <= 750`, AND `foundationType`
      is not already a known STFI disqualifier (`PILES`/`WOOD_FOUNDATION`). Reuses
      `evaluateRoofArea`/`evaluateFoundationExemption`/`evaluateAttachment`/
      `foundationStfiDisqualification` directly (already pure, already client-bundle-safe — no I/O)
      **for disclosure gating only, never for the actual evaluation**, which stays exclusively
      server-side.
      **Reviewer finding (decision `3fdb3357-510f-49d0-baa2-7dd20dabae9f`, MAJOR) and response**:
      the reviewer correctly notes BR-U6B-7/business-logic-model.md Flow 2 step 2 also names a
      confirmed ECA `NOT_MET` as a dispositive reason to skip the span question (full review is
      already certain regardless of span). This is **not implementable client-side in this pass**:
      checked directly — `seattle-eca.ts`'s ECA fetch runs only inside the paid report-generation
      pipeline (`assemblePropertyContext`, post-checkout); no ECA data is fetched, cached, or
      available anywhere during the free `configure` wizard today. Gating on it would require a new
      mid-wizard server round-trip to fetch ECA data during intake — genuinely new infrastructure,
      not a reuse of an existing pure function like the other three criteria, and outside this
      plan's own stated scope (no new GIS adapter, no new mid-wizard fetch). **Accepted, disclosed
      limitation, not fixed in this pass**: the span question may occasionally be shown when the
      real (server-computed) result later turns out `LIKELY_EXEMPT` or independently
      `FULL_REVIEW_LIKELY` after ECA resolves server-side — always a harmless **over-ask** (the
      collected number is simply unused in that case), never an under-ask, and never affects the
      authoritative server-side result, which reads real `ecaFindings` regardless of what the
      client showed. Numeric span field + optional manufactured-truss toggle.
- [x] Progressive utility-intent multi-select (electrical/plumbing/mechanical), always optional,
      decoupled from the permit questions, per frontend-components.md §1 / BR-U6B-8.
- [x] Thread `shedPermitIntake`'s fields into `submitPlacement`'s existing PUT body (spread
      alongside `dimensions`, conditioned on `projectType === ProjectType.SHED`, mirroring the
      existing garage-only spread). **No server route change needed** — confirmed
      `app/api/screening-requests/[id]/project-details/route.ts` forwards the raw body to
      `updateProjectDetails`, which already validates against `ShedProjectConfigurationSchema`
      (already includes every one of these fields).
- [x] Back-navigation: state lives in the same component-level `useState` already used for
      `dimensions` (no separate effect/reset needed, no Strict-Mode risk — this is plain controlled
      input state, not the async reset-on-remount pattern the September persistence bug involved).

### 3.2 Pipeline wiring — `src/report-generation-orchestrator/pipeline.ts`

- [x] New pure, exported function `deriveIsInRequiredSetback` (new file or alongside
      `deriveStreetFrontageRoleGapReasons` in `pipeline.ts`, same "pure, independently-unit-tested,
      mirrors an existing extraction" convention) implementing §2's exact per-boundary
      front/rear/side derivation + aggregation, taking only already-computed pipeline values
      (`distanceToFrontLotLineFt`/`distanceToRearLotLineFt`/`distanceToSideLotLineFt`,
      `frontRoleEvidenceGapReason`/`rearRoleEvidenceGapReason`/`sideRoleEvidenceGapReason`,
      `alleyAdjacent`) and returning `{ isInRequiredSetback: boolean | undefined; reasons: string[] }`.
- [x] Shed `project = {...}` construction site (~line 544): add `foundationType`, `attachment`,
      `intendedUse`, `roofOverhang`, `structuralSpanInfo`, `utilityIntent` — straight passthrough
      from `snapshot.projectDetails as ShedProjectConfiguration` (already typed, already validated
      at intake); add `isInRequiredSetback`/`requiredSetbackEvidenceGapReasons` from
      `deriveIsInRequiredSetback`'s result (§2, founder-approved 2026-09-23 — supersedes the
      original "always undefined" premise).
- [x] `src/regulatory-rules-engine/types.ts`: add `requiredSetbackEvidenceGapReasons?: string[]` to
      `ShedProjectDetails` (additive, mirrors the existing gap-reason field convention).
- [x] `src/regulatory-rules-engine/evaluate.ts`'s `evaluateAccessoryHeightLimit`: when
      `project.isInRequiredSetback === undefined`, use
      `project.requiredSetbackEvidenceGapReasons` to build the specific explanation text (joining
      multiple reasons where more than one boundary is unresolved) instead of the current generic
      "Whether the shed's proposed placement falls inside a required setback is unresolved."
      fallback — directly answers the founder's item 7 ("do not emit a generic message if a
      specific cause is known"). Falls back to the existing generic text only if
      `requiredSetbackEvidenceGapReasons` is itself empty/absent (defensive, should not occur given
      `deriveIsInRequiredSetback` always populates reasons when returning `undefined`).
- [x] After `evaluateProject` returns `outcome`: if `outcome.accessoryHeightLimitFinding` is
      present, append it to the `findings` array passed to `createEvidenceReportArtifact` (a plain
      `Finding` — no new rendering code needed; it flows through ReportView's existing generic
      Findings/Requires-Verification lists exactly like every other setback/dwelling-separation
      finding, per frontend-components.md's own "renders as its own, separate finding... in the
      report's existing general Findings list").
- [x] If `outcome.permitRequirement` is present, add one new `evidence` entry: `{ factType:
      "shed-permit-requirement", value: outcome.permitRequirement, provenance: {} }` — matching this
      pipeline's own established convention for structured non-`Finding` aggregate results (same
      pattern as `uncovered-constraint-types`, `existing-structures-classified`).
- [x] `selectFindingsForExplanation` (line 79) is untouched — `accessoryHeightLimitFinding` is an
      ordinary `Finding`, already covered by the existing filter; the LLM never sees
      `permitRequirement` directly (it is not in `findings`), so it structurally cannot narrate,
      reinterpret, or override `buildingPermit`/`reviewPath` — matching the founder's explicit "LLM
      remains explanation-only... must not decide permit status" requirement by construction, not
      by a new guard.

### 3.3 Report presentation — `app/components/ReportView.tsx`

- [x] New "Building permit" section, placed between "Findings" and "Requires Verification" per
      frontend-components.md §5, reading `report.evidence.find(e => e.factType ===
      "shed-permit-requirement")?.value as PermitRequirementFinding | undefined` (same lookup
      convention as `environmental-constraints`/`uncovered-constraint-types`).
- [x] Headline derived from the `buildingPermit`×`reviewPath` combination per
      frontend-components.md §2's exact 5-row table ("Likely not required" / "Likely required —
      simple review (STFI)" / "Likely required — full review" / "Permit likely required — review
      path needs verification" / "Requires verification").
- [x] Criteria checklist — one line per `PermitCriterionResult`, ✓/✗/⚠ by `status`, each with its
      `explanationBasis`.
- [x] Trade-permit disclosures rendered as separate ⚠ items below the checklist, never inside it.
- [x] Fixed BR-U6B-9 disclaimer whenever `buildingPermit === "LIKELY_EXEMPT"` ("this does not waive
      setback/lot-coverage/height/rear-yard-coverage compliance... SDCI makes the final
      determination"), plain customer language per the founder's explicit instruction.
- [x] Section renders nothing (not even a heading) when the fact is absent — correct dormancy
      behavior by construction, since `outcome.permitRequirement` (and therefore this evidence
      entry) only exists once every constituent rule is ACTIVE.

### 3.4 PDF consistency — `src/report-pdf-rendering/render.ts`

- [x] `renderReportHtml` already receives the full `artifact` (which carries `evidence`); add the
      **complete** "Building permit" block, matching §3.3's web section element-for-element —
      **corrected per reviewer finding (decision `3ad7b6b8-7ccf-4e6d-84e6-f3d993057ccb`, MAJOR)**:
      headline, criteria checklist, trade-permit disclosures (rendered below the checklist, never
      inside it), the BR-U6B-9 exemption disclaimer when `buildingPermit === "LIKELY_EXEMPT"`, and
      the always-present "SDCI makes the final determination" footer — my original draft omitted
      the disclosures/disclaimer/footer, which would have made the PDF an incomplete, inconsistent
      copy of the web report rather than a faithful one. Plain HTML, no new dependency, reading the
      same `shed-permit-requirement` evidence entry.

### 3.5 INTERNAL_PROTOTYPE exercise (before any reviewer/founder-facing claim of correctness)

- [x] **Substituted with a stronger live check, not the script itself**: rather than
      `generate-prototype-report.ts` (which, as this item predicted, would just show
      `outcome.permitRequirement === undefined` since the dormancy gate doesn't distinguish
      INTERNAL_PROTOTYPE from production), ran the real `configure` wizard against a real Seattle
      parcel (3216 Fuhrman Ave E, PIN 1959703080) through a live dev server with a real database
      connection: filled every Capability B intake field, confirmed client-side progressive
      disclosure toggled correctly in both directions live (structural-span question appeared the
      instant Attachment was set to ATTACHED, matching BR-U6B-7's corrected NOT_MET-triggered rule;
      disappeared again the instant Foundation was set to Piles, matching the STFI-disqualifier
      short-circuit; roof-overhang question disappeared the instant width×depth exceeded 120 sq
      ft), completed Placement/Review with zero console errors and zero server validation errors,
      then queried the real `screening_requests` row directly and confirmed
      `foundationType`/`attachment`/`intendedUse`/`utilityIntent` persisted exactly as entered. The
      evaluator layer itself (`evaluateShedPermitRequirement`/`evaluateAccessoryHeightLimit`'s real
      output, bypassing the ACTIVE gate) is exercised by §3.6's new `deriveIsInRequiredSetback`/
      `evaluateAccessoryHeightLimit` unit tests below, not a separate INTERNAL_PROTOTYPE run.

### 3.6 Testing (`tests/`)

- [x] `deriveIsInRequiredSetback` (§3.2, new pure function) — the primary new unit-test surface for
      this whole correction: each boundary's three bands independently (definitely-inside,
      unresolved-band, guard-blocked-from-outside) for front/rear/side; the aggregation rule (any
      inside → true; every relevant boundary would need to be outside for false, currently
      unreachable — an explicit test asserting `false` is NOT reachable via any combination of
      today's inputs, documenting the disclosed consequence from §2 as a real regression guard
      rather than just prose); role-unresolved short-circuits for each boundary; alley-adjacent
      rear routed through the Chapter 23.53 guard rather than trivially resolving outside; reasons
      array contains the exact, specific strings from §2 (never the generic fallback) and
      aggregates reasons from multiple simultaneously-unresolved boundaries.
- [x] `evaluateAccessoryHeightLimit` (existing function, extend its existing test file) — the
      `REQUIRES_VERIFICATION` branch now surfaces `requiredSetbackEvidenceGapReasons` in the
      explanation text when present, and falls back to the existing generic text only when absent.
- [x] Intake progression/normalization: added to `tests/screening-request/validation.test.ts` (new
      describe block, 4 tests) — every field populated round-trips unchanged; every field absent
      stays `undefined`, never coerced; `roofOverhang` with `approxOverhangIn` omitted accepted;
      unrecognized enum values rejected.
- [ ] **Not added as an automated test** — pipeline.ts's DB-dependent code path is only covered by
      `pipeline.integration.test.ts` (real-DB, not run in ordinary `npm test`) in this codebase's
      own established convention; adding a new assertion there was judged lower-value than the live
      verification actually performed: ran the real pipeline end-to-end via
      `pipeline.integration.test.ts` (3/3 passing, zero regressions) confirming the pipeline still
      completes correctly with the new construction site in place, then separately confirmed via
      live browser + direct database query (see §3.5 above) that `foundationType`/`attachment`/
      `intendedUse`/`utilityIntent` flow correctly from intake into the persisted
      `ShedProjectConfiguration`. The **partial-activation-cannot-leak** guarantee itself is
      untouched by this plan (I never modified `evaluateProject`'s gate) and is already covered by
      `shed-permit-evaluate.test.ts`'s existing "§4.14 - partial-activation aggregation rule"
      describe block (re-confirmed passing, unchanged).
- [ ] **Not added** — this codebase has no React component-rendering test infrastructure for any
      page/component today (confirmed: no existing test renders `ReportView` or any other
      component; only pure-logic/API-route-surface tests exist). Adding one would be new testing
      infrastructure, out of this plan's scope. Verified instead by direct code review against
      frontend-components.md §2's exact spec (headline table, checklist, disclosures, disclaimer,
      footer) — recommend founder browser acceptance testing cover this section once at least one
      constituent rule can be temporarily activated in a non-production environment to observe it.
- [x] PDF: added to `tests/report-pdf-rendering/render.test.ts` (new describe block, 4 tests) —
      headline/checklist/trade-disclosures render when the evidence entry is present; the BR-U6B-9
      disclaimer renders only when `buildingPermit === "LIKELY_EXEMPT"`; the whole section renders
      nothing when the evidence entry is absent; HTML-escaping matches the existing findings
      invariant.
- [ ] **Not added as a dedicated test** — the guarantee is structural/by-construction (`outcome.
      permitRequirement` is a field pipeline.ts never merges into the `findings` array or any
      variable passed to `selectFindingsForExplanation`; there is no runtime code path by which it
      could reach that function), the same class of guarantee this codebase already enforces by
      construction elsewhere without a dedicated "does not leak" test (e.g. `evidence` entries
      generally). Documented explicitly in code comments at both the `findingsToPersist`
      construction site and the evidence-array entry.
- [ ] **Not added as an automated test** — no component-test infrastructure (see above). Live
      browser verification confirmed `dimensions`' own back-navigation persistence (pre-existing,
      unaffected), but did not specifically round-trip Placement → back → Details for the new
      `shedPermitIntake` state in this pass. Low risk: `shedPermitIntake` uses the exact same
      plain component-level `useState` pattern as `dimensions` (no async reset effect, no Strict
      Mode double-invocation risk - the actual mechanism behind September's persistence bug, which
      only affected `ParcelPlacementMap.tsx`'s async reset-on-remount effect, not this kind of
      state). Recommend the founder spot-check this specific path during acceptance testing.
- [x] Re-confirm the existing 50-test `shed-permit-evaluate.test.ts` and 23-test
      `shed-permit-candidates.test.ts` suites continue passing unchanged (regression, not new
      coverage).

## 4. Explicit non-goals restated (founder's own SCOPE section)

No `approve()`/`activate()` call anywhere in this plan or its implementation. No change to any of
the 19 rule tiers. `utilityIntent` never becomes a deterministic permit rule (already true by
construction — `buildTradePermitDisclosures` is called independently of `deriveBuildingPermitState`
and never influences its inputs). P8 not reintroduced as tiered (not touched). Capability C
(`ShedLotCoverageResult`) not wired into pipeline or report in this pass.

## 5. Stop conditions (unchanged from founder's instruction)

Stop and ask the founder only if: a genuinely new regulatory interpretation is needed beyond §2's
disclosed scoping decision; a rule-tier decision changes; rule activation is required; a
substantive architecture/security/provenance issue appears; or Capability B reaches the founder
hands-on-acceptance point. A reviewer `ESCALATE` limited to the already-litigated "founder
authorization cannot be authenticated from the packet" pattern will be resolved via the existing
bounded override, not raised to the founder again.
