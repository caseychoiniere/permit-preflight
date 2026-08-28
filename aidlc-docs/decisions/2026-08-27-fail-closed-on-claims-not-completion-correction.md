# Product-Correctness Amendment — Fail Closed on Claims, Not on Completion

**2026-08-27. Founder-directed correction, discovered through real local testing (26 real Seattle
addresses, 26/26 dead ends), not a new AI-DLC unit or a reopening of any completed Construction
stage.** Recorded here per the founder's own explicit instruction to document this as a bounded
product-correctness amendment, matching the precedent already established by the Next.js 15→16
platform-maintenance amendment (`aidlc-docs/aidlc-state.md`'s "PLATFORM MAINTENANCE" section).

## The governing rule

> **Uncertainty is ordinarily represented in the result rather than used as a workflow blocker.**
> Hard blocking is reserved for unresolved property/project identity (when the user cannot
> clarify it), actual runtime/infrastructure failure, security/payment/data-integrity
> requirements, or cases where continuing would knowingly produce a materially false evaluation.

Restated as the three conceptual workflow outcomes the founder specified: **CONTINUE**, **ASK
USER**, **STOP** — STOP is rare, reserved for exactly the 5 conditions the founder enumerated
(property/project identity genuinely unresolvable; a knowingly-wrong evaluation; real
infrastructure failure; security/payment/data-integrity requirements).

## What was actually wrong (the real defect, found by reading the built pipeline)

Only **one** genuine defect existed, not several: **Parcel Resolution's `CLARIFICATION_REQUIRED`
result was treated as a dead end by every frontend caller** (`app/configure/page.tsx`,
`app/vacant-land/page.tsx`) — any non-`CONFIRMED` status rendered a static "could not confirm this
address" message with no path forward, even when `CLARIFICATION_REQUIRED` carried one or more real,
identifiable candidate parcels. Because this is the very first step of the customer journey, it
explains the reported 26/26 dead-end pattern directly — the rest of the pipeline was never even
reached in that testing.

**Everything downstream of parcel resolution was already correct against this rule** (verified by
direct code inspection, not assumed):
- `property-intelligence/assemble.ts` already records `AvailabilityState.SOURCE_ERROR` per-fact on
  a retriever failure and continues — it never blocks context assembly on a missing fact.
- `report-generation-orchestrator/pipeline.ts` only routes to `JOB_FAILED` from a caught exception
  (a genuine runtime failure) — Anthropic's `explanationResult.outcome !== "AVAILABLE"` already
  degrades gracefully (`explanation: undefined`), the deterministic report still completes.
- The Regulatory Rules Engine's existing `KNOWN`/`INFERRED`/`REQUIRES_VERIFICATION` classification,
  `NO_ACTIVE_COVERAGE` disclosure, and the Vacant Land module's 3-state spatial result split
  (`SUCCESS`/`DATA_QUALITY_UNRESOLVED`/`COMPUTATION_FAILURE`, Unit 5) already implement exactly the
  "evidence uncertainty reduces certainty of the result, never blocks the workflow" principle this
  amendment restates — these predate this correction and required no change.
- `screening-request/validation.ts` does not block project-detail submission on lot-line-role
  insufficiency (`LotLineRoleStatus.INSUFFICIENT` flows through to a `REQUIRES_VERIFICATION`-style
  finding later, never a submission rejection).

## The fix

1. **`src/parcel-resolution/types.ts`** — added `ParcelIdentityProvenance` (`ALGORITHMIC` |
   `USER_CONFIRMED`) to the `CONFIRMED` result variant, so a user-confirmed match is never silently
   indistinguishable from (never "pretends to be") an independently-corroborated one.
2. **`src/parcel-resolution/resolve.ts`** — added `confirmCandidate(chosen, candidates)`, the
   smallest concrete confirmation mechanism: given the candidates a `CLARIFICATION_REQUIRED` result
   already returned, produces a real `CONFIRMED` result labeled `USER_CONFIRMED`. The two existing
   decision functions (`decideAddressResolution`/`decideIdentifierResolution`) are **unchanged** in
   their own classification logic — their `CLARIFICATION_REQUIRED`/`NO_MATCH`/
   `RESOLUTION_UNAVAILABLE` outputs remain exactly as accurate and valuable as before; independent
   corroboration (or its absence, or a conflict) is preserved as evidence metadata via the existing
   `clarificationReason` field, never re-derived or discarded.
3. **`app/configure/page.tsx`, `app/vacant-land/page.tsx`** — real UI change: a `CLARIFICATION_
   REQUIRED` result with one or more candidates now renders a confirmation prompt (one candidate:
   "Is this the property you want to evaluate?"; multiple/conflicting: pick which one) instead of a
   dead-end error. `NO_MATCH` and a candidate-less `CLARIFICATION_REQUIRED` (no parcel to confirm)
   still prompt the user to revise their search — a legitimate, non-hard block. `RESOLUTION_
   UNAVAILABLE` remains a real infrastructure-failure message — a legitimate hard stop (condition
   4).
4. **`src/report-generation-orchestrator/pipeline.ts`** — a disclosed, inert consequence: the
   report-generation pipeline reconstructs a `ConfirmedParcelResolution` from the persisted
   `confirmedParcelId` alone (the original resolution result's provenance is not retained past
   checkout — only the ID is stored on `ScreeningRequest`, unchanged by this amendment). The
   reconstructed value's `identityProvenance` is set to `ALGORITHMIC` as a placeholder — the only
   consumer of this value (`assemblePropertyContext`) never reads that field, so this carries no
   functional consequence; it exists purely to satisfy the type. **Deliberately not persisted
   further** (would require a new column/migration) — out of scope for this bounded correction, not
   silently deferred.

## What was deliberately NOT changed (per explicit instruction)

- No new uncertainty framework, state-machine architecture, generalized clarification engine, or
  evidence tier was introduced — `confirmCandidate` reuses the existing `ParcelResolutionResult`
  union's own `CONFIRMED` variant; `ParcelIdentityProvenance` is a 2-member enum, not a new
  framework.
- No readiness gate (`BR-U4-9`/`BR-U5-9` commercial/public-advertisement readiness) was loosened —
  those gate whether a project type can be **sold**, never whether an otherwise-supported evaluation
  can produce a partial/useful result. Unaffected by this amendment.
- No provenance/`KNOWN`/`INFERRED`/`REQUIRES_VERIFICATION`/`NO_ACTIVE_COVERAGE`/ACTIVE-rule
  governance/deterministic evaluation/report immutability/runtime-failure-handling/payment-security
  control was weakened.
- `resolveByIdentifier`'s parcel-identifier path (no frontend entry point exists for it today) was
  **not** given a UI fix in this pass — it has the identical structural defect (`corroboration` is
  always `"NOT_AVAILABLE"` today, so every identifier-path resolution always requires clarification)
  but no customer-facing route reaches it yet; recorded here so it isn't silently rediscovered later
  as if new.

## Acceptance testing

**Deterministic** (run in this sandbox, all passing — `npm test`, 326/326): `confirmCandidate`'s
own behavior (one candidate + confirmation → `CONFIRMED`/`USER_CONFIRMED`; multiple candidates +
selection → the specific chosen candidate, not any/first; the full candidate list preserved as
evidence metadata, never discarded) — `tests/parcel-resolution/resolve.test.ts`. Every existing
`decide*Resolution` test (classification correctness, unchanged) remains green.

**Real local product acceptance testing against live Seattle addresses (the founder's own §7
requirement) was NOT re-run in this session** — no live King County/geocoding credentials in this
sandbox, matching this project's own established discipline of never fabricating a live-verification
result. This is the one open item: the founder's own local environment is what originally surfaced
the 26/26 regression, and re-running that same local test against this fix is the real acceptance
proof, tracked here rather than asserted.

## Addendum (same day) — a second real bug found via live testing of the fix itself

After presenting the fix above, the founder reported "nothing happens at all" clicking Find Parcel
against their own local dev server. This session's Browser tool was attached directly to that real
running server and the click was reproduced live. The parcel-resolution fix itself worked correctly
— `POST /api/parcels/resolve` for a real Seattle address returned live King County geocode data and
the new confirmation UI rendered — but was **functionally invisible**: `app/layout.tsx`'s `<body>`
had never declared a background color anywhere in this app's history, so a dark-mode browser/OS
painted a black canvas behind the page's existing `#1a1a1a` (near-black) text, making every page in
this app — not only the new confirmation UI — look blank/unresponsive, which is what the founder
was actually seeing. **Fixed**: `app/layout.tsx` now declares `color-scheme: light` and an explicit
white `<body>` background, matching the light-theme styling (`#1a1a1a` text, `#ddd` borders) every
page already assumed but never enforced. Re-verified live in the same browser session: the
confirmation UI is now clearly legible; clicking "Yes, this is the property" correctly proceeds to
the boundary fetch, which then fails only on the separate, explicitly out-of-scope
`DATABASE_URL is not set` condition (no database configured in this local environment — untouched,
per the founder's own instruction). See `external-verification-tracker.md` item 18 for the full
verification record.
