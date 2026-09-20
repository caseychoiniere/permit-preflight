# Unit 6B — Infrastructure Design (Shed Report Value Expansion)

**Status**: NFR Design is complete (founder-approved by direct override 2026-09-15, after the
delegated reviewer's independent review corrected several real design gaps — see
`../nfr-design/nfr-design.md` and `aidlc-state.md`'s Unit 6B section for the full record). This
document is the explicit Infrastructure Design assessment for the current per-unit AI-DLC loop —
verified against the actual codebase and NFR Design's own conclusions, not assumed.

**Conclusion: no new infrastructure is required. This stage is satisfied entirely by explicit
reuse/no-change confirmation — no infrastructure artifact beyond this one is manufactured.**

## Verification, point by point

| Question | Answer | Evidence |
|---|---|---|
| New external service/vendor? | No | The Seattle ECA adapter (`seattle-eca.ts`) queries the **same** ArcGIS Online organization (`services.arcgis.com/ZOyb2t4B0UYuYNYH`) already integrated for Building Outlines — same no-API-key public REST convention, confirmed at `src/property-intelligence/seattle-building-outlines.ts:27`. |
| New secret/credential? | No | Direct consequence of the above — no API key is used by this org's public REST endpoints today, and Unit 6B introduces none. |
| New database, extension, or schema migration? | No | PostGIS remains the sole spatial source of truth; the two new spatial functions (`computeExistingStructureCoverageSqFt`, `computeFootprintEcaIntersection`) are new *functions* on the existing PostGIS adapter module, not a new database or extension. **Zero schema migration**: the new shed-intake fields persist in the already-`jsonb` `project_details` column (`src/db/schema.ts:129`), and the new finding/result types persist in the already-`jsonb` `evidenceReportArtifacts.findings`/`.evidence` columns (`src/db/schema.ts:185-186`) — both confirmed by direct read, not assumed. |
| New queue, cache, or async job? | No | Unit 6B's evaluation is synchronous request/response, exactly like the existing shed pipeline — no new Vercel Workflow, Cron job, or queue is introduced. |
| New auth/payment surface? | No | Unit 6B adds no new customer-facing authentication or payment flow — it extends the existing shed report's findings/sections only. |
| New deployment configuration (Vercel/Neon/CI)? | No | No new environment variable, no new build step, no new CI workflow. `.github/workflows/ci.yml`/`integration.yml` require no changes for Unit 6B's scope. |
| New external-verification-tracker infrastructure item? | No | Item 19 (ECA endpoint live-query verification) already exists from the original Unit 6B research pass and covers this adapter's live-network gap — no new tracker item needed. |

## Relationship to NFR Design

NFR Design's own one new pattern (the `seattle-eca.ts`-internal settled fan-out + per-request
timeout) is **application code**, not infrastructure — it runs on the existing Vercel/Node.js
runtime with no new platform capability, matching the precedent every other `FactRetriever` in
this codebase already sets. Nothing in NFR Design implies an infrastructure decision this
document hasn't already accounted for.

## Precedent

This mirrors Unit 4's and Unit 5's own Infrastructure Design outcome — both were skipped with an
explicit no-new-infrastructure confirmation rather than producing a full infrastructure-design.md,
since the per-unit workflow's own skip condition ("no infrastructure changes; infrastructure
already defined") applied cleanly in both cases, exactly as it does here.
