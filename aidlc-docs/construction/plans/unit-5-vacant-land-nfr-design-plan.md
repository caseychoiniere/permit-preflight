# Unit 5: Vacant Land — NFR Design Plan

**Status: COMPLETE 2026-08-27 — founder-directed, targeted, delta-only.** No `[Answer]:` question
round was needed. This project's own assessment (`aidlc-docs/aidlc-state.md`) recommended a
targeted 2-item scope (safe workflow/schema migration rollout; reusable spatial-computation result
semantics), approved by the founder, who then supplied the complete design content for both items
directly (logged verbatim in `audit.md`, `2026-08-27T05:20:00Z`).

## Scope

Exactly 2 new design patterns, per approved assessment + founder content:
1. **Migration design pattern**: a staged EXPAND → MIGRATE → APPLICATION ROLLOUT → ACTIVATE →
   CONTRACT/ENFORCE rollout for the `workflowType`-discriminated `screening_requests` schema
   (Correction 6, NFR-U5-1 through NFR-U5-4) — binding invariant: database capability and
   `VACANT_LAND` write activation are separate events.
2. **Spatial computation result pattern**: one reusable 3-state result boundary
   (`SUCCESS` / `DATA_QUALITY_UNRESOLVED` / `COMPUTATION_FAILURE`) for the new PostGIS
   buildable-envelope operations, formalizing NFR-U5-11/-14/-24's distinction as a named,
   reusable shape rather than a set of separately-stated requirements.

Plus explicit logical-component responsibility boundaries (persistence/migration layer; Spatial
Analysis/PostGIS adapter; report-generation orchestrator; regulatory evaluator) and an explicit
inheritance list for every other NFR Design category.

## What This Stage Produces
- [x] `aidlc-docs/construction/unit-5-vacant-land/nfr-design/nfr-design-patterns.md`
- [x] `aidlc-docs/construction/unit-5-vacant-land/nfr-design/logical-components.md`

Not proceeding past NFR Design until this document is reviewed and approved.

## Founder Review — Approved in Substance, One Migration-Ordering Correction Applied
**2026-08-27**. The migration pattern's write-activation phase was sequenced *before* the database
`CHECK` constraint's finalization — creating a real interval where a `VACANT_LAND` row could be
written while the database was not yet the authoritative enforcer of the workflow-shape invariant.
Corrected to a 6-phase sequence (EXPAND → MIGRATE → APPLICATION ROLLOUT → **PRE-ACTIVATION
ENFORCEMENT** [new phase — apply/verify the `CHECK` constraint] → ACTIVATE → CONTRACT/CLEANUP),
enforcing the constraint strictly before write activation. The spatial-computation-result pattern,
logical-component boundaries, and every inherited-unchanged category are approved as written.

**Unit 5 NFR Design is now APPROVED/COMPLETE.** No further NFR Design review gate is held, per
explicit instruction — proceeding directly to Infrastructure Design.
