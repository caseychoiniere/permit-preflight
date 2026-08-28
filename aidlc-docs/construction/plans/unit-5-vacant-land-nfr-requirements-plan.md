# Unit 5: Vacant Land — NFR Requirements Plan

**Status: COMPLETE 2026-08-27 — founder-directed, targeted, delta-only.** No `[Answer]:` question
round was needed — the founder's own review message (logged verbatim in `audit.md`,
`2026-08-27T04:30:00Z`) fully specified scope and content after rejecting this project's initial
SKIPPED recommendation as too broad a dismissal. This plan records that scope decision rather than
posing open questions.

## Why NFR Requirements executes for Unit 5 (reversing the initial skip recommendation)

The initial assessment (`aidlc-docs/aidlc-state.md`, prior section) reasoned Unit 5 needed no new
NFR surface. The founder correctly identified two genuinely new surfaces that assessment
under-weighted, both real and load-bearing:
1. **A persistence/schema generalization** (`domain-entities.md`'s Correction 6 — nullable
   `project_type`/`project_details`, new nullable `screening_intent`/`vacant_land_details`, a
   database-level `CHECK` constraint) — confirmed against the real current schema
   (`src/db/schema.ts`: `projectType`/`projectDetails` are `NOT NULL` today) — this is a genuine
   migration-safety question Unit 4 never had (Unit 4 added no new discriminant to `screening_requests`
   itself, only to `project_details`' own `jsonb` shape).
2. **New PostGIS buildable-envelope geometry operations** (`ST_Difference`-class subtraction,
   per-scenario) — materially different in kind from Unit 1/4's existing `computeSetbackDistances`/
   `computeParcelAreaSqFt` (distance/area measurement against a *given* footprint, not envelope
   derivation) — confirmed against the real Spatial Analysis code
   (`src/spatial-analysis/postgis-adapter.ts`).

**Scope discipline, per explicit instruction**: this is a **targeted, delta-only** pass — not a
full boilerplate NFR rewrite. Six areas are addressed (data integrity/migration safety; regulatory-
rule scope backward compatibility; PostGIS geometry correctness/reliability; performance/bounded
work; failure/degradation behavior; explicit inheritance of the unaffected baseline). No new tech
stack, GIS library, service, or migration mechanism is prescribed unless the requirement itself
demands one.

## What This Stage Produces
- [x] `aidlc-docs/construction/unit-5-vacant-land/nfr-requirements/nfr-requirements.md` — the 6
  targeted requirement areas the founder specified, each grounded in the real current schema/code
  where applicable, plus the explicit inheritance statement for everything unaffected.
- [x] `aidlc-docs/construction/unit-5-vacant-land/nfr-requirements/tech-stack-decisions.md` — records
  that no new tech stack, library, or service is introduced; the two new surfaces are addressed
  entirely within the existing Postgres/PostGIS/Next.js/Vercel/Neon stack.

Not proceeding to NFR Design until this document is reviewed and approved.

## Founder Review — Approved in Substance, Two Localized Consistency Corrections Applied
**2026-08-27**. Two internal inconsistencies fixed: (1) NFR-U5-11/NFR-U5-14/NFR-U5-24 previously
conflated an `ST_IsValid` rejection of successfully-evaluated invalid geometry (a data-quality/
evidence condition → `REQUIRES_VERIFICATION`, does not fail the job) with a genuine PostGIS
execution failure (a runtime/infrastructure condition → the existing job failure/retry path) —
now kept as two explicitly distinct conditions throughout; (2) NFR-U5-27 previously listed "no
`ACTIVE` rule coverage" as a cause of `REQUIRES_VERIFICATION` — withdrawn; no-`ACTIVE`-coverage is
a separate concept (`uncoveredConstraintTypes`-style disclosure), never a `FindingClassification`,
kept distinct from both evidence uncertainty and computation failure as a third state. Everything
else (§1-§2 in full, §3's remaining points, §4, §6, `tech-stack-decisions.md`) approved unchanged.

**Unit 5 NFR Requirements is now APPROVED/COMPLETE.** No further NFR Requirements review gate is
held, per explicit instruction — proceeding directly to NFR Design.
