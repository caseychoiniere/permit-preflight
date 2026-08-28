# AI-DLC State Tracking

## Project Information
- **Project Name**: Permit Preflight
- **Project Type**: Greenfield
- **Start Date**: 2026-08-19T15:06:23Z
- **Current Stage**: CONSTRUCTION - **Unit 4: Detached Garages — ✅ COMPLETE 2026-08-27** (all 7
  stages approved: Functional Design, NFR Requirements [skipped], NFR Design [skipped],
  Infrastructure Design [skipped, no new infrastructure], Code Generation, Build & Test,
  Operations). **Unit 5: Vacant Land — Functional Design ✅ APPROVED/COMPLETE 2026-08-27** (two
  founder correction rounds applied) — **NFR Requirements ✅ APPROVED/COMPLETE 2026-08-27**
  (targeted, delta-only pass, one founder correction round applied) — **NFR Design ✅
  APPROVED/COMPLETE 2026-08-27** (targeted, delta-only pass, one founder correction round applied)
  — **Infrastructure Design ✅ SKIPPED/APPROVED 2026-08-27** (no new infrastructure) — **Code
  Generation ✅ APPROVED/COMPLETE 2026-08-27** (Part 1 grounded plan + two founder corrections;
  Part 2 generation + six founder corrections — typecheck 0 errors, 312/312 tests, clean build) —
  **Build & Test ✅ COMPLETE 2026-08-27** (all 5 shared build-and-test docs updated with real Unit
  5 results; 2 new external-verification-tracker items disclosed) — **Operations ✅ COMPLETE
  2026-08-27** (delta-only 7-section runbook). **Unit 5 (Vacant Land) is fully COMPLETE — all 7
  Construction stages approved.** **Unit 6 (Optional Accounts) — Functional Design Part 2 COMPLETE
  2026-08-27, presented for founder review** (founder answered all 5 Part 1 questions: Q1=A
  magic-link/passwordless auth reusing `report-access/credential.ts`'s existing token primitives;
  Q2=C dual-path guest-purchase-claim proof-of-control [email-verification via a purpose-specific
  magic-link to the Order's own `customerEmail`, OR possession of the existing report-access
  bearer token — email-text-equality alone never sufficient, idempotent same-account relink, no
  silent cross-account transfer]; Q3 immediate-deletion retention policy [no soft-delete;
  Account/AccountSession/MagicLinkToken/AccountOrderLink deleted, Order/EvidenceReportArtifact/
  commercial-audit records retained unmutated per RGD-4]; Q4=B PC-3 deferred; Q5 confirmed Unit
  3's real dependency surface is the existing admin-action-log only, no new dispute-case system).
  Four artifacts produced in
  `aidlc-docs/construction/unit-6-optional-accounts/functional-design/` (domain-entities.md:
  `Account`/`MagicLinkToken`/`AccountSession`/`AccountOrderLink` + new Drizzle tables incl. a
  discriminated-shape CHECK constraint on `magic_link_tokens` mirroring Unit 5's own pattern, and
  the real report-access-token→orderId join path; business-rules.md: BR-U6-1 through BR-U6-6;
  business-logic-model.md: 5 workflows covering the authentication/session lifecycle, the
  guest-purchase claim lifecycle [both paths], report-history authorization, and account
  deletion/unlinking; frontend-components.md: 4 minimal views, explicit avoid-list honored).
  **Founder review round 1: REQUEST CHANGES — four localized corrections, approved in substance
  2026-08-27**: (1) magic-link tokens (LOGIN and CLAIM_PURCHASE) must never appear in a URL
  query/path — corrected to a fragment-to-POST-body exchange, matching this project's own
  established no-raw-bearer-token-in-a-URL discipline; (2) BR-U6-4 rewritten from an
  underspecified "reuses existing report-access" reference into two fully independent
  authorization modes for the same immutable report — Mode A Guest Access (unchanged) and Mode B
  Account Access (new: session + `AccountOrderLink` + server-side `orders → 
  evidenceReportArtifacts` resolution, never reconstructing/minting a guest token), with workflow
  4 split into 4a (list) / 4b (per-report authorization+resolution); (3) account deletion
  corrected to also delete outstanding `LOGIN` tokens by the account's own captured normalized
  email (they carry no `accountId` by BR-U6-1's own discriminated shape, so a pre-deletion
  unclicked login link could otherwise recreate the account) — plus an `HttpOnly`-cookie mechanics
  correction (server clears `ACCOUNT_SESSION_COOKIE` via `Set-Cookie`, never client JS) applied to
  both logout and deletion; (4) token consumption specified as a real atomic conditional
  `UPDATE ... WHERE consumedAt IS NULL AND expiresAt > now() RETURNING ...` primitive (not a
  narrative claim), LOGIN verification wrapped in one DB transaction with rollback-on-failure, and
  `AccountOrderLink` creation corrected from a pre-check to an insert-then-resolve-conflict
  sequence for real race safety. All four applied to all four artifacts; re-presented for final
  review. **Founder review round 2: APPROVED/COMPLETE 2026-08-27** — all ten do-not-reopen items
  held unchanged; Unit 6 Functional Design is fully approved. **NFR Requirements ✅ COMPLETE
  2026-08-27** (targeted, delta-only, founder-fully-specified 9-area pass covering magic-link/
  bearer-token security, customer session security, authorization/IDOR resistance, concurrency/
  transactional integrity, privacy/deletion, auth-endpoint abuse resistance [reusing the existing
  `FailedLookupRateLimiter` in both its existing failure-counting mode and one small additive
  every-attempt-counts variant, no new rate-limiting service/Redis/CAPTCHA], email-delivery honesty
  [reusing Unit 2B's own established `EMAIL_SENT`-≠-delivered posture], modest performance/
  retention, and an explicit inherited-baseline list). 50 numbered requirements (NFR-U6-1 through
  NFR-U6-50), zero new tech stack/library/service — every requirement satisfied by reusing
  existing, already-reviewed primitives (`report-access/credential.ts`'s token functions,
  `shared/cookies.ts`'s cookie conventions, Unit 2B's interactive-transaction pattern, the existing
  rate limiter, the existing Resend adapter). **Founder review: APPROVED IN SUBSTANCE, four
  targeted corrections applied 2026-08-27** — (1) new §2b adds CSRF protection for
  `AccountSession`-authenticated mutating routes (NFR-U6-51 through NFR-U6-55), reusing Unit 3's
  existing same-origin CSRF pattern, not admin credentials; (2) §6 corrected from a stale
  in-process-only/single-replica rate-limiting model to a Vercel-Firewall-primary (existing Pro
  plan capability, no new vendor) / `FailedLookupRateLimiter`-local-defense-in-depth model, with new
  external-verification-tracker item 17; (3) §4's `Account`/`AccountOrderLink` uniqueness-conflict
  handling corrected from an unreliable catch-a-raw-violation-and-continue description to an
  explicit transaction-safe strategy (`ON CONFLICT ... RETURNING` + `SELECT`, or `SAVEPOINT`); (4)
  new NFR-U6-57 requires a B-tree index on `account_order_links(account_id)`, closing a real
  omission NFR-U6-47's own query shape assumed. **Unit 6 NFR Requirements ✅ COMPLETE 2026-08-27.**
  No further NFR Requirements review gate held, per explicit instruction — proceeding directly to
  NFR Design. **NFR Design produced 2026-08-27** (no question round needed — NFR Requirements'
  own correction round already specified every open design point). 5 patterns: (1) Shared
  Bearer-Credential Token Pattern — the canonical atomic conditional-consumption SQL statement,
  one implementation for both `LOGIN`/`CLAIM_PURCHASE`; (2) Fragment-to-POST Transport Pattern —
  concrete client/server mechanics; (3) Shared Same-Origin CSRF Core, Two Callers — extracts
  `admin-auth/csrf.ts`'s origin-agnostic logic into `src/shared/same-origin.ts`, admin and account
  routes each supply their own trusted-origin resolver, pattern reuse never credential reuse; (4)
  Transaction-Safe Conflict Resolution Pattern — chose `INSERT ... ON CONFLICT DO NOTHING
  RETURNING ...` + fallback `SELECT` over `SAVEPOINT` for both `accounts.email` and
  `account_order_links.order_id`; (5) Two-Layer Rate Limiting Pattern — Vercel Firewall rule
  (outer, authoritative, platform config) + a second, independently-scoped
  `FailedLookupRateLimiter` instance (`accountAuthLocalLimiter`, inner defense-in-depth only).
  Logical components: one new component (`src/account-auth/`), one new shared extraction
  (`src/shared/same-origin.ts`), one extended shared singleton file
  (`src/shared/rate-limiter-instance.ts`), Report Access gains a second independent caller
  (`getAccountReport`) with zero code change required to `report-access/repository.ts` itself.
  Recommends (not executes) that Unit 6's Infrastructure Design stage **run** — unlike Unit 5 —
  to formally specify the Vercel Firewall rule as deployment configuration. **Founder review:
  APPROVED, one security correction applied 2026-08-27** — `completeClaimByEmail` corrected to
  require BOTH a valid `CLAIM_PURCHASE` token AND a matching `AccountSession` (the token alone
  proved control of the purchase email, not control of the Account originating the claim); Pattern
  1's consumption statement made account-bound for `CLAIM_PURCHASE`, the claim-completion sequence
  wrapped in one transaction, Pattern 3's CSRF set gained `completeClaimByEmail`; two small
  disclosed opportunistic consistency corrections applied to `business-rules.md`/
  `business-logic-model.md`/`frontend-components.md` (claim-verify landing page fail-closed
  messaging, no cross-device claim-transfer built) and `nfr-requirements.md` NFR-U6-26. **Unit 6
  NFR Design ✅ COMPLETE 2026-08-27.** No further NFR Design review gate held — proceeding directly
  to Infrastructure Design, which executes (not skipped) per explicit instruction. **Infrastructure
  Design produced 2026-08-27** (no question round needed — NFR Design's own Pattern 5 already fully
  specifies the one real new infrastructure decision). Component-to-infrastructure mapping table
  confirms every Unit 6 component except one deploys as ordinary application code onto existing
  Vercel/Neon/Resend infrastructure, zero new secrets; the one real new decision is the **Vercel
  Firewall rate-limiting rule**'s concrete configuration (scope: `/api/account/request-login-link`,
  `/api/account/claim/*`, verification endpoints; initial threshold reuses the existing 10-per-60s
  shape; source key is Vercel's own platform-derived client identifier, independent of the
  application-local `sourceKeyFor` helper). Updated running-system diagram shows the Firewall layer
  in front of the existing Vercel application and confirms Unit 6 introduces no new Workflow/Cron
  job (every account-auth operation is synchronous request/response). **Founder review:
  APPROVED/COMPLETE 2026-08-27**, one non-blocking note recorded (Vercel Firewall's normal 429
  response need not be byte-identical to the application's own generic responses — the binding
  invariant is narrower: no Account/Order-existence disclosure, which a volume/IP-based 429
  satisfies by construction). **Unit 6 Infrastructure Design ✅ COMPLETE 2026-08-27.** Proceeding
  to Code Generation. **Code Generation Part 1 produced 2026-08-27** — real, grounded read-only
  repository audit (10 findings, incl.: no account module exists yet; two existing Pool-scoped
  transaction helpers found, planning a third `withAccountTransaction` mirroring them; the
  fragment-to-POST pattern already exists in production code at `app/report/page.tsx`/`app/api/
  reports/access/route.ts` and is copied, not invented; the Path B join is already exercised by
  `listStaleGuestDeliveries`; `admin-auth/csrf.ts`'s extraction is mechanical; a real architectural
  decision that account CSRF is checked per-route, not via `proxy.ts`'s matcher; CHECK constraints
  on brand-new tables need no staged EXPAND/ENFORCE rollout, confirmed against Unit 3's own
  `admin_action_log` precedent; repository-layer DB behavior is integration-test-only per this
  project's own established convention; and a **live-verified** (WebFetch against current Vercel
  docs, 2026-08-27) finding that no `vercel.json` declarative Firewall syntax exists — the real,
  current, scriptable mechanism is the `vercel firewall rules add`/`publish` CLI, with the exact
  command specified). Full directory/file plan and a 15-point checkboxed implementation plan
  produced, covering all founder-specified categories plus an honest, layered test plan
  (deterministic/integration/explicitly-not-covered). Zero genuine incompatibilities found; no
  earlier Unit 6 stage reopened. **Founder review: APPROVED IN SUBSTANCE, three bounded
  corrections applied 2026-08-27** — (1) Path B's join corrected to require `orders.state =
  'PAID'`; (2) Firewall scope narrowed to an exact-4-path `inc`-operator rule, requiring
  `claimPurchase` to split into two separate routes (`claim/email`/`claim/token`); (3) explicit FK
  constraints added (`CASCADE` on `accountId`, `RESTRICT` on `orderId`) — this schema's first real
  foreign keys, a disclosed first-time architectural decision. **Part 1 APPROVED, no further
  review gate. Part 2 (implementation) ✅ COMPLETE 2026-08-27** — `npm run typecheck` 0 errors;
  `npm test` **323/323 passing** (312 pre-existing + 11 new, zero regressions,
  `tests/admin-auth/csrf.test.ts` unmodified and green proving the CSRF extraction is behavior-
  preserving); `npm run build` clean, all 14 new routes registered. A real migration-generation
  defect was caught and fixed (drizzle-kit bundled two unrelated, already-applied Unit 5 CHECK
  constraints into the generated `0006_*.sql`; hand-corrected with a full inline explanation,
  mirroring Unit 5's own precedent for the same class of drizzle-kit generation issue). All three
  Part 1 corrections implemented and covered by real integration tests (not run in this sandbox —
  no `DATABASE_URL`). Repository context packaged (`permit-preflight-chatgpt-context.zip`) at the
  implementation-review handoff. Presented for founder review.
  (`aidlc-docs/construction/plans/unit-4-detached-garages-functional-design-plan.md`; artifacts in
  `aidlc-docs/construction/unit-4-detached-garages/functional-design/`). Both Part 2 founder
  decisions (Q1 fallback, Q2 resourcing) are resolved, the regulatory inventory is 13 candidates
  (H1/H2 height, S1-S5 setback, L1-L6 lot coverage — 8 Tier 2, 5 Tier 1, Tier separated from
  per-parcel evidence availability — see the final-correction section below), and professional
  review is explicitly deferred to a post-POC "Regulatory Professional Review / Commercialization
  Gate" project-level milestone (see that section below) — Unit 4 Construction completion does not
  wait on it. Unit 3 (below) is fully ✅ COMPLETE — all 7
  stages approved: Functional Design, NFR Requirements, NFR Design, Infrastructure Design [skipped,
  approved, no new infrastructure], Code Generation, Build & Test, Operations. Functional Design had 2 material corrections applied post-review,
  both re-applied to all 3 affected artifacts: (1) **`AdminActionLog` atomicity corrected** — for the 4 purely-local
  mutations (`RULE_DISABLED`/`RULE_REENABLED`/`DATA_SOURCE_MARKED_UNHEALTHY`/
  `DATA_SOURCE_OVERRIDE_CLEARED`), the domain write and its audit entry now commit in one DB
  transaction (either both succeed or both roll back) — the original "log write may fail without
  blocking the mutation" framing wrongly treated "explanatory" as meaning "optional to persist";
  `REFUND_INITIATED` (which crosses the DB/Vercel-Workflow boundary and can't share one
  transaction) is corrected to audit-write-committed-before-`start()`-is-ever-called sequencing
  instead, so no admin refund command can appear to succeed without a durable audit record already
  existing; every mutating action now also fails closed if `ADMIN_OPERATOR_ID` is absent/blank,
  independent of Basic Auth passing. (2) **`DataSourceHealth` split into observed vs. override
  state** — the original single `healthState` + `manualOverride: boolean` shape made "clear
  override" semantically wrong (the override's last value would silently keep governing readiness
  indefinitely). Corrected to separate `observedHealthState` (automated-only) and
  `manualOverrideState` (admin-only, nullable) fields, with `effectiveHealthState =
  manualOverrideState ?? observedHealthState` as what `checkReadiness` actually consumes — clearing
  an override now takes effect immediately, reverting to the current observed value, never waiting
  for a future ingestion result. Also added: a known-source-initialization requirement (a
  `DataSourceHealth` row must exist for every known source id before any touch, so an operator can
  override a never-yet-queried source) and an NFR-Requirements carry-forward note (HTTPS/strong
  password/never-logged/fail-closed, already stated, plus CSRF protection for mutating admin
  routes and proportional brute-force-protection consideration — Basic Auth alone is not a CSRF
  defense). Artifacts:
  `aidlc-docs/construction/unit-3-minimum-paid-product-operations/functional-design/{domain-entities,business-rules,business-logic-model,frontend-components}.md`.
  8 ADM stories fully covered (ADM-1 through ADM-8); ADM-9/Support Case remain deferred to Unit 9,
  unchanged. No further Functional Design review gate held, per explicit instruction.

  **NFR Requirements COMPLETE 2026-08-25, awaiting review.** CSRF = same-origin `Origin`/`Referer`
  validation (exact-match, server-config-sourced expected origin, `Sec-Fetch-Site` as
  defense-in-depth) for mutating `/api/admin/*` routes; admin UI is desktop-focused (resilient
  layout, no dedicated mobile design); no database-backed brute-force protection built (high-entropy
  password + low volume deemed sufficient, platform-level restriction optionally documented as
  defense-in-depth). Artifacts:
  `aidlc-docs/construction/unit-3-minimum-paid-product-operations/nfr-requirements/{nfr-requirements,tech-stack-decisions}.md`.
  **Zero new npm dependencies** — Basic Auth (Node's `crypto.timingSafeEqual`) and CSRF checks are
  both plain Next.js `middleware.ts` capability; the atomic-mutation pattern generalizes Unit 2B's
  existing `withFulfillmentTransaction`-style Pool-scoped-transaction approach; the admin UI reuses
  the existing plain-Next.js-forms style, no new UI library. NFR Requirements **APPROVED
  2026-08-25**, with one narrow tech-stack correction: `middleware.ts` is not treated as a fixed
  requirement — the project's actually-installed Next.js version was checked directly (`node -e
  "console.log(require('next/package.json').version)"` → `15.5.23`), confirming `middleware.ts`
  (not `proxy.ts`, a Next.js 16+ convention) is the correct, currently-supported choice as-is.

  **NFR Design COMPLETE 2026-08-25, awaiting review.** No open questions raised — the founder's own
  NFR Requirements approval message already specified every NFR Design category (Resilience,
  Scalability, Performance, Security, Logical Components) at or past normal NFR-Design-level
  concreteness; each category's "why no question is needed" justification is recorded in the plan
  file. Produced 6 concrete patterns: (1) Pre-Route Admin Authentication Gate — `middleware.ts`,
  matcher `["/admin","/admin/:path*","/api/admin","/api/admin/:path*"]`, fails closed if
  credentials aren't configured; (2) Constant-Time Credential Comparison — fixed-length digest
  (SHA-256) of each credential component before `crypto.timingSafeEqual`, uniform failure response,
  malformed headers never logged; (3) Same-Origin CSRF Validation — new `resolveExpectedAdminOrigin()`
  extending `src/shared/app-url.ts`'s `resolveAppBaseUrl()`, exact-match `Origin`/`Referer`,
  `Sec-Fetch-Site` defense-in-depth, Development-only `localhost` carve-out; (4) Atomic Local Admin
  Mutation + Audit — generalizes `withFulfillmentTransaction` into a shared Pool-scoped-transaction
  helper for the 4 local mutations; (5) Audit-Before-Workflow-Start Refund Sequencing — the
  `AdminActionLog` `REFUND_INITIATED` entry is committed before `start(processRefundWorkflow, ...)`
  is ever called, and records only that the operator requested/initiated the refund, never that
  Stripe's refund succeeded; (6) Observed/Override/Effective Data-Source Health — restates the
  Functional-Design-corrected model unchanged. Logical components identified: the `proxy.ts`
  auth/CSRF gate itself (corrected 2026-08-25 from `middleware.ts` — see the Platform Maintenance
  section below), a small credential-comparison helper, `resolveExpectedAdminOrigin()`, a
  generalized `withAdminTransaction`, new `AdminActionLog`/`DataSourceHealth` repositories, extended
  `lifecycle.ts` `disable`/`reenable` functions, and the admin frontend — no new infrastructure
  (queue, cache, external service, CSRF-token framework, DB-backed rate limiting) introduced.
  Artifacts:
  `aidlc-docs/construction/unit-3-minimum-paid-product-operations/nfr-design/{nfr-design-patterns,logical-components}.md`.
  Awaiting explicit user approval to proceed to the next Construction stage. Unit 2B is ✅ COMPLETE
  (see its own section near the end of this file) and was not reopened for this work.

## PRODUCT-CORRECTNESS AMENDMENT — Fail Closed on Claims, Not on Completion — ✅ COMPLETE 2026-08-27

**Founder-directed, discovered through real local testing (26 real Seattle addresses, 26/26 dead
ends), not a new AI-DLC unit and not a reopening of any completed Construction stage.** Full
record: `aidlc-docs/decisions/2026-08-27-fail-closed-on-claims-not-completion-correction.md`.
**Unit 6 (Optional Accounts) work was paused for this correction** — Unit 6 itself is unaffected
and unmodified; resume point is presenting the already-completed Code Generation for founder
review (see the Unit 6 section above), unchanged by this amendment.

**The governing rule**: uncertainty is ordinarily represented in the result, never used as a
workflow blocker. Hard blocking ("STOP") is reserved for unresolved property/project identity, real
infrastructure/runtime failure, security/payment/data-integrity requirements, or a case where
continuing would knowingly produce a materially false evaluation — restated as the three
conceptual workflow outcomes CONTINUE / ASK USER / STOP, STOP being rare.

**The real defect, found by reading the built pipeline (only one, not several)**: Parcel
Resolution's `CLARIFICATION_REQUIRED` result — which already carries real, identifiable candidate
parcels and an honest reason (`NO_PIN`/`INSUFFICIENT_CORROBORATION`/`CONFLICTING_SOURCES`/
`ADDRESS_MISMATCH`/`MULTIPLE_CANDIDATES`) — was treated as a dead end by every frontend caller
(`app/configure/page.tsx`, `app/vacant-land/page.tsx`), rendering a static error with no path
forward. Since this is the first step of the customer journey, it explains the reported 26/26
dead-end pattern directly. **Everything downstream was already correct against this rule**,
verified by direct code inspection: `property-intelligence/assemble.ts` already records
`SOURCE_ERROR` per-fact and continues; the pipeline only fails on a genuine caught exception
(Anthropic-unavailable already degrades gracefully); the Regulatory Rules Engine's existing
`KNOWN`/`INFERRED`/`REQUIRES_VERIFICATION`/`NO_ACTIVE_COVERAGE` classification and Unit 5's 3-state
spatial-result split already implement the "uncertainty reduces certainty, never blocks" principle
this amendment restates — none of that required any change.

**The fix**: (1) `src/parcel-resolution/types.ts` — added `ParcelIdentityProvenance`
(`ALGORITHMIC`/`USER_CONFIRMED`) to the `CONFIRMED` result variant, so a user-confirmed match is
never silently indistinguishable from an independently-corroborated one; (2)
`src/parcel-resolution/resolve.ts` — added `confirmCandidate(chosen, candidates)`, the smallest
concrete confirmation mechanism, reusing the existing `CONFIRMED` variant (no new framework, no new
state machine); the two existing decision functions' own classification logic is **unchanged**;
(3) `app/configure/page.tsx`/`app/vacant-land/page.tsx` — real UI change: one or more candidates
now render a confirm/pick prompt instead of a dead end; a candidate-less `CLARIFICATION_REQUIRED`/
`NO_MATCH` still prompts the user to revise (legitimate, not a hard block);
`RESOLUTION_UNAVAILABLE` remains a real, legitimate infrastructure-failure stop; (4)
`report-generation-orchestrator/pipeline.ts` — a disclosed, functionally inert placeholder
(`identityProvenance: ALGORITHMIC`) where a `ConfirmedParcelResolution` is reconstructed from the
persisted `confirmedParcelId` alone, since the original provenance isn't retained past checkout and
the sole consumer of that field never reads it — not persisted further, out of scope for this
bounded correction.

**Deliberately unchanged, per explicit instruction**: no new uncertainty framework, evidence tier,
or generalized clarification engine; `BR-U4-9`/`BR-U5-9` commercial/public-readiness gates
untouched (they gate whether a project type can be sold, never whether an evaluation can produce a
partial result); provenance/`KNOWN`/`INFERRED`/`REQUIRES_VERIFICATION`/`NO_ACTIVE_COVERAGE`/
ACTIVE-rule governance/deterministic evaluation/report immutability/payment-security controls
untouched. `resolveByIdentifier`'s parcel-identifier path has the identical structural gap (its
`corroboration` is always `"NOT_AVAILABLE"` today) but has no customer-facing entry point yet —
explicitly recorded as not fixed in this pass, not silently missed.

**Verification**: `npm run typecheck` clean; `npm test` **326/326 passing** (323 pre-existing + 3
new `confirmCandidate` tests, zero regressions — every existing `decide*Resolution` classification
test remains green unchanged, since the classification logic itself was never the defect);
`npm run build` clean. **Real local product acceptance testing against live Seattle addresses (the
founder's own requirement) was explicitly NOT re-run in this session** — no live King County/
geocoding credentials in this sandbox; this is the one open item, tracked honestly rather than
fabricated, requiring the founder's own local re-test (the same method that originally surfaced the
26/26 regression) as the real acceptance proof.

## Workspace State
- **Existing Code**: No
- **Reverse Engineering Needed**: No
- **Workspace Root**: /Users/choiniere/Documents/CODE/permit-preflight
- **Governing Brief**: docs/product/permit-preflight-inception-brief.md

## Code Location Rules
- **Application Code**: Workspace root (NEVER in aidlc-docs/)
- **Documentation**: aidlc-docs/ only
- **Structure patterns**: See code-generation.md Critical Rules

## Extension Configuration
| Extension | Enabled | Decided At |
|---|---|---|
| Security Baseline | Yes | Requirements Analysis |
| Resiliency Baseline | Yes (proportionate/directional, per user) | Requirements Analysis |
| Property-Based Testing | Yes (targeted scope: spatial/geometry/rule primitives/parsers/serialization; fixture-based for full scenarios and rule behavior) | Requirements Analysis |

## Stage Progress
### 🔵 INCEPTION PHASE
- [x] Workspace Detection
- [ ] Reverse Engineering (N/A - greenfield)
- [x] Requirements Analysis (COMPLETE & APPROVED 2026-08-19 - persona, project-type order (revised: vacant-land moved to position 3), and risk-based rule-review model all approved; see requirements.md)
- [x] User Stories (APPROVED 2026-08-19 - stories.md 54 stories across 8 epics [PR 5, PC 3, SRE 13, RGD 6, PO 6, ACC 4, RRAG 8, ADM 9], personas.md 4 personas)
- [x] Workflow Planning (APPROVED 2026-08-19, with Unit 0/GO-PIVOT-NO-GO clarification recorded in execution-plan.md)
- [x] Application Design (APPROVED 2026-08-19 - 16 components, 6 services, baseline for Units Generation)
- [x] Units Generation (APPROVED 2026-08-19 - 12 units [0-11], all 54 stories mapped exactly once, Unit 0=GO gates all production units, Unit 3 gates Units 4-11, no project-type unit depends on another, approved sequence preserved)

## FINAL INCEPTION GATE — APPROVED 2026-08-19
Inception formally complete and approved (all artifacts, including inception-summary.md, approved
after two accuracy-correction passes). Authorized to proceed to Unit 0 only. Units 1-11 / production
Construction remain NOT authorized until Unit 0 produces GO and that is separately approved.

### 🟢 CONSTRUCTION PHASE
- [x] Unit 0: Pre-Construction Validation — PIVOT (accepted by user 2026-08-19)
## PRAGMATIC CONSTRUCTION STANDARD (adopted 2026-08-19 — standing guidance for all remaining stages)
Approved architecture/requirements remain authoritative, but approval gates should focus on
*material* issues: regulatory correctness, violation of core architectural invariants,
security/privacy problems, loss of auditability/provenance, major irreversible architectural
decisions, direct contradictions with approved requirements, unjustified scope expansion. Minor
refinements, naming decisions, tunable parameters, implementation details, and reversible design
choices are NOT reasons to stop progress — capture them as implementation decisions/follow-up items
and move on. Artifacts are living documents, amendable later as implementation/testing provides
evidence.

## TWO-GATE MODEL (adopted 2026-08-19 — see execution-plan.md for full detail)
Single Unit 0 gate replaced by two independent gates:
- **TECHNICAL FEASIBILITY GATE**: Unit 0 -> Unit 0B -> **TECHNICAL GO (ACCEPTED 2026-08-19)**.
  Authorizes Unit 1 (full) and Unit 2 (report generation/presentation only, no live payment).
- **COMMERCIAL VALUE GATE**: Unit 0C, open, runs in PARALLEL with technical Construction (does not
  block it). Originally gated Unit 2B (live payment) onward: Unit 3, and Units 4-11 (additional
  project types, Optional Accounts). **Amended by founder decision 2026-08-24 — see FOUNDER
  DECISION section immediately below: the Commercial Value Gate no longer blocks Construction.**
  Not yet satisfied (no interviews conducted) — status is DEFERRED, not GO/NO-GO/PASS/FAIL.

## FOUNDER DECISION — COMMERCIAL VALIDATION GATE REMOVED AS A CONSTRUCTION BLOCKER (2026-08-24)

**Decision**: Permit Preflight continues product Construction without requiring Unit 0C customer
interviews first. This is an explicit founder decision, not an AI-derived recommendation.

**Unit 0C status**: **DEFERRED — OPTIONAL COMMERCIAL VALIDATION**. Not COMPLETE, not PASSED, not
FAILED, not GO, not NO-GO. No interviews have been conducted. The correct historical record: the
interview protocol was designed
(`aidlc-docs/construction/unit-0-pre-construction-validation/unit-0c-customer-value-interview-protocol.md`),
but the founder elected to continue building before conducting it. All Unit 0C materials
(protocol, sample reports, decision framework) are preserved unchanged for possible later use.

**What changes**: Commercial validation (Unit 0C GO) is no longer a prerequisite for continuing
Construction. Technical GO alone now authorizes Unit 2B onward. Future units must not stop or
refuse to proceed merely because Unit 0C interviews have not occurred, willingness-to-pay has not
been empirically established, or a separate "Commercial GO" has not been declared. Unit 3 (Minimum
Paid-Product Operations) remains its own, separate hard operational gate before substantial
expansion into additional project types (Units 4-11) — that gate is unaffected by this decision.

**What does NOT change — uncertainty is preserved honestly, not converted into validated fact**:
- Willingness to pay: **UNVALIDATED**
- $9.99 or any other specific price point: **HYPOTHESIS / configurable**, not evidenced
- Repeat-professional demand: **UNVALIDATED**
- Market size / conversion assumptions: **UNVALIDATED**
- Direct paid-customer demand: **UNVALIDATED**

No customer validation is to be fabricated merely because development is continuing.

**Operating model from this point forward**: **BUILD → TEST → SHIP → OBSERVE → AMEND**. Real
product usage, attempted purchases, completed purchases, abandonment, support feedback, and repeat
usage may become genuine commercial-validation evidence once the product reaches real users — a
different, later evidentiary source than Unit 0C interviews, not something already in hand.

**Historical record (preserved, not rewritten)**:
- **Originally (2026-08-19)**: Technical GO / Commercial Validation two-gate split adopted; Unit 0C
  opened as the Commercial Value Gate, blocking Unit 2B onward until GO.
- **Founder decision (2026-08-24)**: Continue Construction without requiring Unit 0C interviews;
  commercial validation deferred and no longer a Construction gate. Unit 1 and Unit 2 remain
  COMPLETE and are not reopened. Proceeding to Unit 2B.

- [x] Unit 0: Pre-Construction Validation — COMPLETE -> PIVOT
- [x] Unit 0B: Pivot Validation — COMPLETE -> **TECHNICAL GO** (accepted). Parcel resolution,
      ECA precedence, source-access workflow, and rule-authoring feasibility all evidenced
      sufficient.
- [ ] Unit 0C: Customer Value Validation — **DEFERRED — OPTIONAL COMMERCIAL VALIDATION** (founder
      decision, 2026-08-24; see FOUNDER DECISION section above). Protocol/template prepared
      (unit-0c-customer-value-interview-protocol.md) and preserved for possible later use. No
      interviews conducted. No longer gates any unit — commercial validation is optional, pursued
      opportunistically (e.g. real usage signals once the product reaches users), not a
      Construction blocker.
- [x] Unit 1: Deterministic Evaluation Foundation (Sheds) — **✅ COMPLETE 2026-08-22** (all 7 stages
      approved: Functional Design, NFR Requirements, NFR Design, Infrastructure Design, Code
      Generation, Build & Test, Operations. Not to be reopened for minor refinements. 2 tracked
      non-blocking external-verification items remain open — see
      aidlc-docs/operations/external-verification-tracker.md.)
- [ ] Unit 2: Report Generation & Presentation Prototype ("Purchasable Shed Report") — AUTHORIZED,
      **IN PROGRESS** (started 2026-08-22). Preserves the Two-Gate Model: Unit 0C remains OPEN,
      runs in parallel, does not block continued engineering. Planning will distinguish reusable
      product/report foundation (Screening Request, orchestration of Unit 1's deterministic
      capabilities, PostGIS production spatial-analysis wiring, evidence/report artifact
      generation, report presentation/explanation, immutable/versioned snapshot behavior,
      failure/degradation handling) from explicitly commercial/customer-commitment work (payment/
      paywall, production deployment, customer-facing purchase flow, commercial polish) — the
      latter is not forbidden, but investment stays proportional while Commercial GO is unmet.
  - [x] Functional Design — **APPROVED 2026-08-22** (business-logic-model.md, business-rules.md,
        domain-entities.md, frontend-components.md; 1 targeted correction applied post-review, see
        below). Key decisions: explicit `authorizeReportGeneration` internal-trigger action
        (swappable for real PAID in Unit 2B); on-demand King County parcel-polygon geometry fetch
        with a mandatory, propagated source-quality caveat (general-location, not survey/legal
        boundary — never dropped through Spatial Analysis into the report); minimal map-based
        approximate-placement UI (not manual distance entry, not a CAD tool); Report Explanation
        reuses Unit 1's AiCompletionClient pattern as a structurally distinct instance; report
        access via an opaque bearer `reportAccessToken`, never a bare `reportId` (report identity ≠
        report authorization); PDF and web are two renderings of one immutable snapshot, tech
        deferred to NFR stage; real, usable (not commercially polished) Next.js frontend for
        PC-1/PC-2/RGD-2/3/6.
        **Post-review correction (2026-08-22, BR-U2-9/BR-U2-10)**: (1) added `LotLineRoleAssignment`
        — front/rear/side lot-line roles are never inferred from `boundaryPolygon` shape alone;
        captured via explicit user indication during placement, fail-closed (`INSUFFICIENT`, not
        guessed) for corner lots/irregular parcels/multiple frontages, feeding Unit 1's existing
        missing-evidence path rather than a new mechanism; (2) evidence quality now gates KNOWN
        classification, not just report-copy disclosure — added `evidenceQuality` to `Provenance`
        and an additive `acceptedEvidenceQuality` field to Unit 1's `RegulatoryRule` (a human
        governance decision at rule-approval time), so a `GENERAL_LOCATION_ONLY`-sourced finding can
        only be KNOWN if the applied ACTIVE rule's governance record explicitly accepts that
        evidence quality — still no fabricated numeric tolerance (BR-U2-4 point 5's prohibition
        unchanged).
  - [x] NFR Requirements — **APPROVED 2026-08-22** (nfr-requirements.md, tech-stack-decisions.md;
        2 non-blocking wording corrections applied post-approval: hash-only token persistence
        stated as a hard requirement not "where practical"; ReportGenerationJob's queuing described
        accurately as "a durable place to queue," not an automatic concurrency guarantee). Key
        decisions: 256-bit hashed, revocable bearer report-access token with lightweight rate
        limiting; MapLibre GL JS (basemap source deferred to Infrastructure Design); server-side
        headless-browser PDF sharing the web report's data templates (not a literal page render);
        soft performance sanity targets with per-stage timing instrumentation (not an SLA); Unit 1's
        Boundary Validator pattern applied to 3 new trust boundaries; Unit 1's DEFAULT_RETRY_POLICY
        reused unchanged; 3-layer UI testing (deterministic component tests + a small Playwright
        smoke suite + manual verification).
  - [x] NFR Design — **APPROVED 2026-08-22** (nfr-design-patterns.md, logical-components.md; 1
        non-blocking wording correction applied post-approval: Pattern 6's PDF request is
        authorized by `reportAccessToken`, never a client-supplied `reportArtifactId`). 8 patterns
        (report access credential, failed-lookup rate limiter, ReportGenerationJob atomic claim +
        stale-claim recovery, STAGE_TIMING logger extension, PostGIS adapter boundary,
        EvidenceReportArtifact/ReportPdfRendering split, map-input validation reuse, UI test
        pyramid reaffirmed), all explicitly justified as needing no new infrastructure. Applied a
        small opportunistic Functional Design correction (domain-entities.md, BR-U2-6): PDF is a
        disposable `ReportPdfRendering` derivative, not a field on the immutable
        `EvidenceReportArtifact` — resolves a latent tension between BR-U2-6's lazy-PDF allowance
        and the artifact's immutability.
  - [x] Infrastructure Design — **APPROVED 2026-08-22** (infrastructure-design.md,
        deployment-architecture.md; shared-infrastructure.md updated; 1 non-blocking wording
        correction applied post-approval: King County parcel-polygon fetch ownership corrected to
        Property Intelligence, never the PostGIS adapter). Key decisions: Railway Hobby, one
        persistent Service, no serverless/app-sleeping, in-process ReportGenerationJob poller (no
        queue/worker/cron); one dedicated Neon branch for the deployed prototype with automated
        pre-deploy migrations; in-process rate limiter (single-replica assumption, explicit revisit
        trigger); MapTiler Cloud free tier for MapLibre's basemap (explicit Commercial-GO
        checkpoint, browser key treated as public/origin-restricted not secret); in-process
        containerized headless-Chromium PDF rendering with ReportPdfRendering stored as Postgres
        bytea; Railway native secrets with an explicit server-secret-vs-public-client-config
        distinction; GitHub Actions on a branch-protected main as a real blocking CI gate
        (deterministic+component tests, typecheck, build, Playwright smoke — live-integration suite
        non-blocking); Railway-native logs with an extended, explicit event vocabulary and a
        never-log list. 8 carry-forward implementation requirements recorded verbatim for Code
        Generation. Explicitly no Redis, queue, distributed lock, object storage, PDF/GIS
        microservice, APM platform, load balancer, multi-replica, or Kubernetes.
  - [x] Code Generation — **APPROVED 2026-08-23** (2 targeted post-review corrections applied,
        no further Code Generation gate per explicit user instruction). Full backend (5 new
        persisted entities, real PostGIS adapter, real King County parcel-polygon retrieval,
        BR-U2-9/BR-U2-10 evidence-quality gating, report-access token lifecycle, atomic job
        claim/recovery, real headless-Chromium PDF rendering) + a real Next.js frontend (MapLibre
        map placement, token-based report retrieval, ReportMap) + CI workflows (`ci.yml` blocking
        gate, `integration.yml` non-blocking live suite). 125/125 deterministic tests, typecheck
        clean, production build succeeds, 14/14 executable live-integration tests pass (King
        County incl. the parcel-polygon endpoint with verified `outSR=2926`, Legistar, real PDF
        rendering), 2/2 executable Playwright smoke tests pass against a real running server (17+2
        tests correctly skip — no Neon/Anthropic credentials in this sandbox).
        **Post-review corrections (2026-08-23)**: (1) replaced a flat-earth coordinate
        approximation with a single explicit CRS contract (browser submits native WGS84, PostGIS's
        `ST_Transform` is the only reprojection point, `Polygon.srid` + fail-closed guards) — found
        during the fix that King County's parcel-polygon endpoint's undeclared default SRID is
        actually EPSG:3857, not the originally-assumed 2926, a real defect the correction itself
        caught; (2) implemented the approved `ReportMap` component, reading only geometry already
        persisted on the immutable artifact (computed once via real `ST_Transform` during
        generation, never re-derived at view time). Both corrections' live-database-dependent
        verification (real `ST_Transform` execution, the full Playwright smoke path via a real map
        click) remains explicitly open — tracked in
        aidlc-docs/operations/external-verification-tracker.md items 3-4, not fabricated. 3 real
        defects found and fixed during the original Code Generation pass via genuine testing: an
        instrumentation.ts server-boot crash when DATABASE_URL is unset, a Playwright file-scope
        test.skip scoping bug, and a disclosed drizzle-orm SQL-injection advisory (upgraded
        0.36.4→0.45.2). See
        aidlc-docs/construction/unit-2-report-generation-presentation-prototype/code/README.md for
        full detail.
  - [x] Build and Test — **APPROVED 2026-08-23** (1 non-blocking doc fix applied post-approval:
        the Security/Provenance section's SRID-guard file reference corrected from
        `report-access/repository.ts` to `spatial-analysis/postgis-adapter.ts`)
        (aidlc-docs/construction/build-and-test/build-and-test-summary.md, covering both Unit 1
        and Unit 2). typecheck clean; `next build` succeeds (first unit with a real compiled
        artifact); 125/125 deterministic tests; 14/14 executable live-integration tests (King
        County incl. verified `outSR=2926`, Legistar, real PDF rendering); 2/2 executable
        Playwright smoke tests against a real running server. 4 external-verification items remain
        open (Neon/PostGIS CRS transform + DB round-trips, live Anthropic, full DB-dependent
        browser smoke path, STAGE_TIMING performance baseline) — tracked in
        aidlc-docs/operations/external-verification-tracker.md, not fabricated.
- [ ] Unit 2B: Commercial Payment & Fulfillment — **AUTHORIZED 2026-08-24** (founder decision;
      Commercial GO/Unit 0C no longer required). Depends only on Unit 2 (COMPLETE) and Technical GO
      (satisfied).
  - [x] Functional Design — **APPROVED 2026-08-24** (6 targeted payment-correctness amendments
        applied post-generation per founder review, no further review gate held): (1) fixed a real
        contradiction between BR-U2B-2 (originally "every transition requires a verified webhook")
        and BR-U2B-5 (`PAID -> REFUND_PENDING` is local) by splitting `OrderState` transitions into
        externally-confirmed vs. local-command kinds; (2) BR-U2B-1 strengthened with a
        concurrency-safe at-most-one-open-`PENDING`-order rule, a database-level (not just
        pre-query) at-most-one-ever-`PAID` constraint keyed on non-null `paidAt`, and explicit
        duplicate-payment-anomaly handling (auto-refund, never silently ignored, never a second
        job); (3) new BR-U2B-14 — the internal `Order` is created *before* the external Stripe
        Checkout Session (using `orderId` as Stripe's `client_reference_id`), closing an
        orphaned-payment risk in the original sequencing; (4) new BR-U2B-15 — the local fulfillment
        side effects of a verified payment (PAID transition, `VERIFIED_PAYMENT` authorization, job
        creation, ledger entry) commit as one atomic unit, closing a stranded-paying-customer crash
        window; (5) BR-U2B-5 corrected — `refundIdempotencyKey` is scoped to one logical refund
        attempt's transport retries only, never reused to originate a new attempt after a
        conclusively-failed one; Unit 2B implements no automatic retry after `REFUND_FAILED`
        (manual/support resolution only, deferred to Unit 3); (6) new BR-U2B-16 — a
        `ScreeningRequest` is purchase-locked once its snapshot is taken at checkout initiation,
        reusing Unit 2's existing immutability rule at the earlier trigger point, no new mechanism.
        Artifacts:
        `aidlc-docs/construction/unit-2b-commercial-payment-fulfillment/functional-design/`:
        business-logic-model.md, business-rules.md, domain-entities.md. New `Order` entity and
        `OrderState` (`PENDING → PAID → REFUND_PENDING → REFUNDED`, plus `REFUND_FAILED` and
        `EXPIRED` — corrected from an initial `PAYMENT_FAILED`/`CANCELED` proposal per founder
        review, since a Stripe Checkout Session has no clean single "payment failed" terminal
        state); `ProcessedStripeEvent` webhook-receipt ledger (defense-in-depth alongside
        state-machine idempotency, not event sourcing); fills in Unit 2's `GenerationAuthorization`
        `VERIFIED_PAYMENT` placeholder (produced only as the direct consequence of a verified
        `PAID` webhook, never speculatively); reuses Unit 2's existing idempotent
        `createReportGenerationJob` unchanged (no new job-level idempotency needed — one `PAID`
        order per `ScreeningRequest`, guaranteed, is sufficient); wires up Unit 2's previously-built
        but never-production-wired `report-access/credential.ts` mechanism as ACC-1's real
        guest-delivery path, with rotation-not-resend on delivery-retry; automatic refund
        initiation (not instant completion — refund is its own async, webhook-confirmed,
        idempotent-Stripe-call lifecycle) on terminal generation failure (PO-4); manual refund via
        an internal-only mechanism for non-failure reasons (PO-5), explicitly never affecting
        report access regardless of reason (refund != access revocation); `INTERNAL_PROTOTYPE`
        retained for internal/demo use only, removed from the public customer flow.
  - [x] NFR Requirements — **APPROVED 2026-08-24**
        (`aidlc-docs/construction/unit-2b-commercial-payment-fulfillment/nfr-requirements/`:
        nfr-requirements.md, tech-stack-decisions.md). Key decisions: Resend for guest report-access
        email (a new, explicitly-scoped trust boundary — only email address + report link ever sent
        to it); **switched the application's DB driver from `drizzle-orm/neon-http` to
        `drizzle-orm/neon-serverless`** (pooled/WebSocket) to give BR-U2B-15's multi-table atomic
        fulfillment a real interactive transaction, since the prior HTTP driver's batch-transaction
        model isn't reliable for conditional multi-statement sequences — this is the first
        DB-driver change since Unit 1; BR-U2B-1's concurrency/duplicate-payment constraints
        implemented as Postgres partial unique indexes (scoped to `state = 'PENDING'` and to
        `paidAt IS NOT NULL`); three-layer test strategy (deterministic webhook/state-machine
        tests, a live Stripe test-mode integration test added to the existing non-blocking suite,
        Stripe-CLI-forwarded end-to-end webhook smoke as external verification); no dedicated
        webhook rate limiter (signature verification + the processed-event ledger are the correct
        defenses) plus a request-body size bound. **Security/PII corrections applied per founder
        review**: PCI scope stated as reduced-not-zero (the business retains its own compliance
        responsibilities); `Order.customerEmail` treated as genuine new PII (minimization, no
        logging, retention tied to the Order record, server-side-only access, Resend named as
        processor); report bearer-link confidentiality hardened (no raw token or full token-bearing
        URL ever logged, `Referrer-Policy: no-referrer` on report pages, no analytics/third-party
        scripts on them, a pre-commercial-use proxy/deployment-log verification item) layered on
        Unit 2's existing hash-only `ReportAccessCredential` mechanism without redesigning it.
  - [x] NFR Design — **APPROVED 2026-08-24** (1 targeted correction applied post-generation: new
        Pattern 9 — Durable Commercial Fulfillment Reconciliation, extending the existing
        `report-generation-orchestrator/poller.ts` with a reconciliation phase that closes a real
        crash-sensitivity gap in three transition-time-only side effects — COMPLETE-needs-delivery,
        FAILED-paid-job-needs-refund, REFUND_PENDING-needs-Stripe-submission/resumption — each a
        conditional, idempotent DB action safe under repeated/overlapping runs, no queue/outbox/
        broker/second-worker/workflow-engine introduced; Pattern 1's Checkout Session reuse
        clarified to check live Stripe state before reuse rather than trusting a cached
        `stripeCheckoutSessionId`, with a new `RECONCILING` status for the paid-or-expired-but-not-
        yet-webhook-reconciled cases, never a locally-forged `Order` transition; Pattern 4 hardened
        with `Cache-Control: no-store`, no full-Checkout-Session-ID/URL logging, no third-party
        analytics on the status page)
        (`aidlc-docs/construction/unit-2b-commercial-payment-fulfillment/nfr-design/`:
        nfr-design-patterns.md, logical-components.md). Zero clarifying questions needed this stage
        — the founder's own NFR Requirements approval message pre-specified every open design
        point (checkout-session resumability's 7 behaviors, the guest-status-page authorization
        model, exact `EMAIL_SENT` semantics). 8 patterns: (1) idempotent/resumable Checkout Session
        creation — resume, never duplicate, using a stable per-Order Stripe idempotency key; (2)
        atomic multi-table payment fulfillment via the new interactive-transaction driver; (3)
        concurrency-safe `Order` uniqueness with explicit constraint-violation handling (treated as
        "someone else won the race," not a customer-facing error); (4) a new **guest status-read
        capability** reusing Stripe's own Checkout Session ID (no new credential minted) —
        status-reads-only scope, a minimized `GuestOrderStatus` enum
        (`PENDING`/`PAYMENT_CONFIRMED`/`REPORT_READY`/`REFUND_PENDING`/`REFUNDED`/
        `REFUND_REQUIRES_SUPPORT`/`EXPIRED`/`NOT_FOUND`), explicit never-exposed field list
        (`customerEmail`, Stripe IDs, `reportAccessToken`, internal audit data); (5) refund's
        idempotent/asynchronous lifecycle (unchanged from Functional Design); (6) webhook ledger +
        raw-body signature verification; (7) guest report-access delivery with
        rotation-on-uncertain-delivery and a precisely-scoped `EMAIL_SENT` (= provider-accepted,
        explicitly not proof of end-recipient delivery — no bounce/complaint infrastructure
        introduced); (8) bearer-link confidentiality hardening (logging discipline,
        `Referrer-Policy: no-referrer`, no analytics on token-bearing pages) layered on Unit 2's
        unmodified `ReportAccessCredential` mechanism. New logical components: `order-payment`,
        `checkout-fulfillment`, a small new `email-delivery` Resend adapter (mirrors the
        Anthropic-client adapter pattern); `report-access` extended, not replaced. No queue,
        outbox, new `OrderState`, general payment-operation framework, distributed lock, new auth
        framework, or bounce-processing infrastructure introduced.
  - [x] Infrastructure Design — **APPROVED 2026-08-24.** Artifacts generated Railway-targeted,
        amended the same day by the deployment-platform pivot to Vercel, then corrected once more
        the same day (Workflow-start idempotency) — see the PLATFORM PIVOT record immediately
        below for the full sequence. Original Railway-targeted decisions (Stripe hard test/live
        separation, Resend corrected environment terminology, the 60s/5min Pattern 9 concrete
        values, the 65,536-byte webhook body bound, the MapTiler Commercial-GO checkpoint
        confirmation, tracker item 7) all stand unchanged throughout — only the execution/lifecycle
        layer, the DB connection strategy, and (in the final correction) which mechanism is
        authoritative for workflow-start idempotency were revised. See
        `aidlc-docs/construction/unit-2b-commercial-payment-fulfillment/infrastructure-design/`
        (infrastructure-design.md, deployment-architecture.md, both amended in place) for the
        current, authoritative version. Proceeding to Code Generation — no further Infrastructure
        Design review held, per the founder's explicit instruction.

## PLATFORM PIVOT — Railway → Vercel (2026-08-24)

**Decision**: Vercel is now the canonical deployment platform for Permit Preflight, replacing
Railway, effective for Unit 2B onward. Full record:
`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`. Historical
Railway decision preserved unaltered in `shared-infrastructure.md` (marked HISTORICAL — SUPERSEDED)
and in Unit 1/2's own Infrastructure Design documents (untouched — accurate for what was actually
built/deployed for them). Unit 1 and Unit 2 remain COMPLETE and were **not** reopened.

**What changed**: the execution/lifecycle layer only. The Railway in-process `ReportGenerationJob`
poller is superseded by durable **Vercel Workflows** (`reportGenerationWorkflow`,
`processRefundWorkflow`) plus a low-frequency **Vercel Cron** reconciliation backstop (not the
primary execution mechanism). The Neon connection strategy changed from one long-lived
application-wide `neon-serverless` Pool (the just-approved-that-morning Railway design) to
`neon-http` as the default driver with a `neon-serverless` `Pool` scoped per-request, used only for
BR-U2B-15's transaction — corrected because a WebSocket Pool cannot outlive a single request on a
serverless platform, per Neon's own documentation. PDF rendering moves from containerized Chromium
to `@sparticuz/chromium` + `puppeteer-core` (same rendering technique, Vercel-compatible binary
provisioning) — flagged as the single biggest unverified compatibility risk from this pivot.

**What did NOT change**: every domain/business invariant — `ScreeningRequest` immutable snapshots,
`Order`/`OrderState`, `ReportGenerationJob` and its durable states, `GenerationAuthorization`
(`VERIFIED_PAYMENT`/`INTERNAL_PROTOTYPE`), `EvidenceReportArtifact` immutability,
`ReportAccessCredential` hashing/revocation, `ProcessedStripeEvent`, payment/job state separation,
webhook idempotency, the Postgres uniqueness constraints, the atomic PAID-fulfillment transaction,
refund idempotency, every evidence/provenance invariant, PostGIS as the sole spatial source of
truth, the deterministic Regulatory Rules Engine, and the LLM-never-determines-regulatory-
conclusions invariant. Stripe, Resend, MapTiler, Neon, and Anthropic all remain unchanged as
providers — only Neon's *connection strategy* changed, not the provider itself.

**Verified against current documentation before locking in** (not memory) — Vercel Workflows'
durability/idempotency mechanics (deterministic hook tokens for run-level dedup, stable `stepId`s
for external-call idempotency), Neon's serverless-driver connection-lifecycle constraints, and the
current Vercel-compatible headless-Chromium approach. No blocking technical incompatibility was
found; the pivot proceeded as directed rather than defaulting back to Railway. One honestly-flagged
non-blocking caveat: Vercel Workflows' multi-region pinning feature requires a pre-1.0/beta SDK
version — not used by this single-region application, noted so it isn't assumed more mature than it
is.

**New external-verification items** (9, 10 — see `external-verification-tracker.md`): a real
Vercel Workflow execution proof, and PDF/Chromium compatibility on a real Vercel deployment. Item 6
(client-IP/rate-limit source-key behavior) retargeted from Railway to Vercel, not yet re-verified
either way. `aidlc-docs/operations/unit-2-operations-runbook.md` marked SUPERSEDED (banner note,
history preserved) for its Railway-specific operational instructions.

### CORRECTION (same day, 2026-08-24) — Workflow-Start Idempotency

**Material correctness correction, applied post-review before Code Generation**: the pivot's first
pass described Vercel Workflow's deterministic hook tokens (`hook.getConflict()`) as providing
run-level idempotent starts. That was wrong — `start()` can create a duplicate workflow run before
a duplicate discovers the hook conflict; the check is not atomic with run creation. **Corrected,
authoritative boundary: the Permit Preflight database, not the Workflow platform.**
`reportGenerationWorkflow`'s first side-effectful step is now the existing, unmodified
`claimQueuedJob` atomic `QUEUED -> IN_PROGRESS` claim (built in Unit 2) — multiple workflow runs
may exist for the same job, but only the run whose claim affects a row may execute the pipeline;
every other run exits immediately. `processRefundWorkflow`'s equivalent authoritative claim is the
conditional `PAID -> REFUND_PENDING` transition, with Stripe's own idempotency key as an
independent second layer. Hook tokens are retained only as defense-in-depth/in-flight-duplicate
detection, never described as providing exactly-once behavior. `workflowRunId`, if persisted, is
for observability only, never a correctness precondition. Every workflow step is now explicitly
documented as at-least-once, not exactly-once, execution. Also corrected: this project runs
**Vercel Pro** (not Hobby, as the pivot's first draft assumed) — plan-specific limits/pricing
framing in the ADR and tracker item 9 updated accordingly. Full record:
`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`'s "Correction:
Workflow-Start Idempotency" section. **The infrastructure pivot is now APPROVED; proceeding to Code
Generation.**

- [ ] Unit 3, Units 4-11 — Unit 3 remains a hard operational gate: BLOCKED pending Unit 2B + Unit 3
      completion (an operational-readiness gate, not a commercial-validation gate). Units 4-11
      remain BLOCKED pending Unit 3 completion, unchanged in spirit from the original sequencing —
      only the Commercial-GO/Unit-0C dependency is removed, per the founder decision above.

## Unit 0 / GO-PIVOT-NO-GO Gate (binding, see execution-plan.md for full detail)
Sequence: Inception -> Application Design -> Units Generation -> Inception approval -> Unit 0
(Pre-Construction Validation, lightweight/human-in-the-loop, no production app required) -> explicit
GO/PIVOT/NO-GO decision -> only then substantial production Construction. All production units
depend on Unit 0's GO outcome. NO-GO stops production Construction. PIVOT returns to
requirements/application-design/units-planning artifacts for revision.

## Outstanding Pre-Final-Gate Items
Items that do not block ongoing Inception stages but MUST be resolved/reported before the final
Inception approval-gate summary is presented for Construction sign-off.

| Item | Status | Notes |
|---|---|---|
| Seattle land-use professional/counsel Tier-2 rule-review cost research (land-use consultant/planner, architect/domain-professional, land-use attorney — rate ranges + fit mapping) | ✅ Complete (2026-08-19) | ~$100-$1,800/escalated rule depending on professional type; Seattle-specific data found for architect rates, general-market for consultant/attorney. See research-findings.md §5. Incorporated into requirements.md §3.2/§14/§15. |

### 🟡 OPERATIONS PHASE (placeholder stage per CLAUDE.md - no formal template; lightweight, scoped per user instruction 2026-08-22)
- [x] Unit 1 Operations Runbook — **APPROVED 2026-08-22**
      (aidlc-docs/operations/unit-1-operations-runbook.md,
      aidlc-docs/operations/external-verification-tracker.md). Non-blocking wording cleanup applied
      (source-failure diagnosis guidance neutralized, no "almost always upstream" assumption).
- [x] Unit 2 Operations Runbook — **APPROVED 2026-08-24** (3 non-blocking housekeeping cleanups
      applied post-approval: a stale tracker-item cross-reference corrected (item 4→5); the
      Anthropic tracker item split into 2a Rule Research Assistant/RRAG-1 and 2b Report
      Explanation, each independently NOT YET RUN, with a genuine test-coverage gap noted for
      `explainFindings` — a background task suggestion was raised for it, not fixed inline; a new
      tracker item 6 added for Railway's unverified client-IP/rate-limit source-key behavior)
      (aidlc-docs/operations/unit-2-operations-runbook.md,
      aidlc-docs/operations/external-verification-tracker.md items 3-6). Covers Railway
      deployment/startup, app-sleeping-disabled confirmation, job-poller single-start, graceful
      shutdown, stale-job recovery, failed-job diagnosis, health-check behavior, Neon migration
      procedure, token rotation/revocation, rate-limit assumptions, PDF-failure diagnosis, MapTiler
      origin restriction, Railway logs/STAGE_TIMING, rollback/redeployment, and the explicit
      single-replica assumption. Found and fixed one real gap while writing it: graceful shutdown
      (`poller.stop()`) was never wired to SIGTERM/SIGINT — fixed in `instrumentation.ts`,
      re-verified (typecheck, 125/125 tests, build, live `/healthz` check all still pass). No new
      infrastructure introduced (no admin dashboard, queue, Redis, or APM).

## UNIT 1: DETERMINISTIC EVALUATION FOUNDATION (SHEDS) — ✅ COMPLETE 2026-08-22
All 7 stages approved: Functional Design, NFR Requirements, NFR Design, Infrastructure Design,
Code Generation, Build & Test, Operations. Not to be reopened for minor refinements. Two tracked,
non-blocking external-verification items remain open (see
aidlc-docs/operations/external-verification-tracker.md): (1) Neon/PostGIS live migration/persistence
verification, (2) Anthropic live RRAG-1 integration verification. Both explicitly NOT VERIFIED
until run with real credentials — their eventual execution does not require reopening Unit 1
unless a material defect is exposed.

## UNIT 2: REPORT GENERATION & PRESENTATION PROTOTYPE — ✅ COMPLETE 2026-08-24
All 7 stages approved: Functional Design, NFR Requirements, NFR Design, Infrastructure Design,
Code Generation (incl. 2 targeted post-review corrections — CRS pipeline, ReportMap), Build & Test,
Operations. Not to be reopened for ordinary implementation refinements or another review cycle.
Eight tracked, non-blocking external-verification items remain open across both units (see
aidlc-docs/operations/external-verification-tracker.md): (1) Unit 1 Neon/PostGIS, (2a) RRAG-1
Anthropic, (2b) Unit 2 Report Explanation Anthropic, (3) Unit 2 CRS-transform/PostGIS live
verification, (4) Unit 2 full DB-dependent browser-smoke path (real map click), (5) Unit 2
STAGE_TIMING performance baseline, (6) Railway client-IP/rate-limit source-key behavior. All
explicitly NOT VERIFIED until run with real credentials/a real deployment — none block Unit 2
completion. The real Tier-2 professional review for the shed candidate remains a
regulatory-content dependency, not a software gap.

**Next work — SUPERSEDED same-day by founder decision (2026-08-24)**: this section originally
directed NOT proceeding into Unit 2B while Commercial GO/Unit 0C remained open. That direction is
now superseded — see the FOUNDER DECISION section above. Unit 2B is authorized and Construction is
proceeding into it. The external-verification-item closure track (B above) remains valid,
independent follow-up work and does not block Unit 2B. Unit 0C interview materials remain
preserved and may still be used opportunistically later, but are no longer a prerequisite.

## UNIT 2B: COMMERCIAL PAYMENT & FULFILLMENT — ✅ COMPLETE 2026-08-25

All 7 stages approved: Functional Design, NFR Requirements, NFR Design, Infrastructure Design
(including the 2026-08-24 founder-driven Railway→Vercel platform pivot and its Workflow-Start
Idempotency correction), Code Generation, Build & Test, Operations. **Not to be reopened for
ordinary implementation refinements, remaining live/credentialed verification work, or another
review cycle** — a real defect discovered later gets its own fix in whatever unit is then active,
not a reopening of this one, per the founder's explicit closing instruction.

**Three rounds of founder-directed post-approval correction, all applied and re-verified, not
merely accepted on faith**:
1. **Code Generation review** (2026-08-25): report price corrected from an unapproved $49.00
   placeholder to the founder-approved **$9.99** (`999` cents, fail-closed on a malformed
   `REPORT_PRICE_CENTS` override); the duplicate-payment anomaly path corrected to retain a
   duplicate-charged Order's real `paidAt`/`stripePaymentIntentId` (Stripe genuinely confirmed
   that payment) instead of falsifying `paidAt` to `NULL` to satisfy a uniqueness constraint — the
   constraint itself (`orders_screening_request_id_paid_unique`) was corrected instead, from "at
   most one Order may ever have had a payment confirmed" to "at most one **canonical** Order may
   ever authorize fulfillment" (migration `0002_hot_colleen_wing.sql`).
2. **Operations review, round 1** (2026-08-25): full runbook written
   (`aidlc-docs/operations/unit-2b-operations-runbook.md`) covering Vercel/Neon/Stripe/Resend/
   Vercel-Workflows/Cron operation, diagnosis, and a 3-tier deployed/verified/commercially-enabled
   launch checklist. Two real gaps were found and **honestly disclosed rather than silently
   patched or hidden**: no Cron path recovered a stranded `IN_PROGRESS` job (a responsibility lost
   when Unit 2's Railway poller was superseded), and two customer-facing URLs carried bearer
   credentials directly in a platform-visible path/query string.
3. **Operations review, round 2** (2026-08-25): both disclosed gaps were then **closed with real
   code**, not left as documentation. Cron reconciliation check 5
   (`reclaimStaleInProgressJobs`) now atomically reclaims a genuinely stale `IN_PROGRESS` job back
   to `QUEUED` (correcting `reclaimStaleJob` itself, which had targeted the wrong state for Unit
   2B's event-driven model) and starts a replacement workflow, with 6 new integration tests
   proving every required invariant including concurrency-safety. The Stripe Checkout Session ID
   and the `reportAccessToken` were both moved out of every request path/query string entirely —
   an HttpOnly cookie for the former, a URL-fragment-to-cookie exchange for the latter — with no
   new authentication framework introduced (every cookie value is still re-validated against the
   existing hash-only/Order lookup on every request). Two documentation corrections were also
   applied (Stripe's real missed-webhook recovery window; Vercel Workflow step-retry wording).

**Final verification, this session, all real**: `npm run typecheck` clean; `npm test` **153/153
passing** across 27 files; `npm run build` succeeds, **18 routes**, every bearer-capability route
now a static clean path; `.next/diagnostics/workflows-manifest.json` directly inspected and
re-confirmed correct (both `reportGenerationWorkflow`/`processRefundWorkflow` and all 5 step
functions registered) — this exact check caught a real, silent, build-succeeds-but-durable-
execution-is-completely-broken defect earlier in Code Generation, documented in full in the code
README and `build-instructions.md`'s troubleshooting section.

### ⚠️ Construction/Operations Complete ≠ Commercial Launch Ready — do not conflate these

Unit 2B being **✅ COMPLETE** means: the code is written, reviewed, corrected, typecheck-clean,
passing its full deterministic suite, building successfully, and its Operations runbook exists and
is accurate. It does **not** mean real customers can safely be charged money today. Per the
founder's explicit instruction, these are different claims and must stay visibly different:

- [ ] Deployed Vercel Workflow execution proven against a real deployment (tracker item 9)
- [ ] Deployed PDF/Chromium rendering proven against a real deployed Vercel Function (item 10)
- [ ] Neon/PostGIS live verification (items 1, 3)
- [ ] Stripe test-mode live verification — the automated suite (item 7's prerequisite) and the
      full CLI-forwarded webhook path (item 7 itself)
- [ ] Stripe live-mode go-live procedure actually executed, deliberately, per the runbook's §3
- [ ] Resend production sending-domain verification (runbook §4)
- [ ] Anthropic live verification, at least Report Explanation (item 2b)
- [ ] MapTiler commercial-use licensing resolved (item 8)
- [ ] The Vercel platform-log token-exposure fix confirmed against a real deployment (item 11 —
      code fix already applied; live confirmation is what remains)
- [ ] Every production secret present and correctly production-scoped (runbook §1/§10)

**None of the above are checked as of this writing.** All remain accurately, honestly **OPEN** in
`aidlc-docs/operations/external-verification-tracker.md` — none were marked complete merely
because code/build/deterministic-test verification passed in this sandbox. The runbook's own §10
commercial-launch checklist is the authoritative, detailed version of this same list.

**Next unit: Unit 3 — Minimum Paid-Product Operations**
(`aidlc-docs/inception/application-design/unit-of-work.md`). Unit 2B is not reopened for it; Unit
3 is its own unit with its own Functional Design onward, per the approved unit plan.

## PLATFORM MAINTENANCE — Next.js 15 → 16 Upgrade — ✅ COMPLETE 2026-08-25

Founder-directed, performed between Unit 3's NFR Design (approved) and Infrastructure Design — a
bounded platform-maintenance amendment, not a new Construction unit, not permission to redesign
Units 1/2/2B. Rationale: Next.js 15 is Maintenance LTS (support ends 2026-10-21); Permit Preflight
is still pre-launch, with no identified legacy-compatibility reason to build new production
functionality (Unit 3 onward) against a soon-unsupported major version.

**Versions**: `next` 15.5.23 → **16.3.3** (Active LTS); `react`/`react-dom` 18.3.1 → **19.2.8**
(Next.js 16's App Router runs on a React 19 canary line); `@types/react`/`@types/react-dom` →
19.2.18/19.2.5. Checked every installed package's `peerDependencies` against React 19 before
upgrading — none conflicted. Node.js (22.22.2, already ≥ the new 20.9+ minimum) and TypeScript
(^5.6.0, already ≥ the new 5.1.0+ minimum) needed no change.

**Bundler**: kept Webpack, explicit via `--webpack` on the `dev`/`build` npm scripts. Next.js 16
defaults to Turbopack, which has no equivalent to the existing `next.config.mjs` `webpack()`
function's `resolve.extensionAlias` remap — required because this codebase's internal imports are
written with explicit `.js` extensions (Node ESM convention) resolved to their real `.ts`/`.tsx`
files via `tsconfig.json`'s `"moduleResolution": "Bundler"`, an established convention since Unit 1.
Checked Turbopack's actual config reference directly (`resolveAlias`/`resolveExtensions`) — neither
supports this remap. A first Turbopack build attempt failed with 56 module-not-found errors,
confirming this is a genuine incompatibility rather than a hypothetical one. Mass-renaming every
internal import specifier project-wide to work around a build-tool default was out of scope for a
version upgrade, so Webpack (already working, unchanged) was explicitly retained instead — one of
the three paths the official upgrade guide itself documents as supported.

**`middleware.ts` → `proxy.ts`**: Unit 3's admin auth/CSRF gate had not yet been code-generated, so
this was a design-document-only correction (Unit 3 NFR Design's `nfr-design-patterns.md` Pattern 1
and `logical-components.md`, both updated; `tech-stack-decisions.md` annotated with a supersession
note rather than rewritten, preserving the original NFR Requirements record). Confirmed via the
official Next.js 15→16 upgrade guide that `proxy`'s runtime is fixed to Node.js and cannot be
configured (the `edge` runtime is not supported in `proxy` at all) — Pattern 2's `node:crypto`-based
constant-time comparison needs no runtime-compatibility fallback as a result.

**Verification** (all in this sandbox; no live Vercel deployment available, unchanged gap from
every prior unit): `npm run typecheck` clean; `npm test` **153/153 passing** (27 files, unchanged
from before the upgrade); `npm run test:integration` **16/16 executable passing**, 42 correctly
self-skipped for missing credentials (same pre-existing gap, not introduced or worsened); `npm run
build` succeeds under `--webpack`, every route from Unit 2B's own route list still compiles,
`✓ Compiled workflows in ...ms (21 steps, 2 workflows)` unchanged, no deprecation warnings,
`/report`/`/checkout/status` remain static (`○`) so their `Referrer-Policy: no-referrer` headers
still apply. Next's build tooling made one automatic, mandatory `tsconfig.json` adjustment
(`"jsx": "preserve"` → `"jsx": "react-jsx"`, plus `.next/dev/types/**/*.ts` added to `include`) —
framework-managed, not a manual choice; typecheck re-confirmed clean afterward. `npm run test:e2e`
not run (not in the founder's minimum verification list; already self-skips without `DATABASE_URL`
regardless of Next.js version, per Unit 2B's own build-and-test record).

**No stop-condition triggered**: no incompatibility found with Vercel Workflows, PDF rendering,
App Router behavior, Stripe webhook raw-body handling, or any other core architectural invariant.
No route, business rule, workflow, schema, or API contract changed. Unit 2B was not reopened — its
own Build & Test record remains an accurate historical snapshot of what was true before this
same-day amendment. Full detail in `aidlc-docs/audit.md`'s framework-version-correction entry and
`aidlc-docs/construction/build-and-test/build-and-test-summary.md`'s own "Platform Maintenance"
section.

**Returning to Unit 3 Infrastructure Design now**, per the founder's explicit instruction.

### Unit 3 Infrastructure Design — ✅ SKIPPED (approved 2026-08-25) — NO NEW INFRASTRUCTURE REQUIRED

**Founder-approved skip.** Unit 3 introduces no new cloud provider, Vercel resource, external
service, worker host, queue, cache, object storage, scheduled infrastructure, networking boundary,
database provider, payment provider, email provider, or AI provider — it continues using the
already-approved Vercel deployment, Next.js 16, Vercel Workflows, Neon PostgreSQL/PostGIS, Drizzle,
Stripe, Resend, Anthropic, and MapTiler/MapLibre unchanged. This is unlike Unit 2 (introduced
MapLibre/MapTiler basemap sourcing) or Unit 2B (introduced Stripe/Resend/Vercel Workflows/Cron as
genuinely new external services), both of which correctly executed Infrastructure Design.

The following Unit 3 additions are **implementation/deployment configuration, not infrastructure**,
and are carried forward explicitly into Code Generation (and Operations) instead of a separate
Infrastructure Design stage: (1) `AdminActionLog` table; (2) `DataSourceHealth` table; (3) Drizzle
migrations for both; (4) `ADMIN_BASIC_AUTH_USERNAME`; (5) `ADMIN_BASIC_AUTH_PASSWORD`;
(6) `ADMIN_OPERATOR_ID`; (7) `proxy.ts` admin-auth/CSRF gate; (8) a generalized request-scoped Neon
transaction helper.

**Proceeding directly to Unit 3 Code Generation Part 1 planning**, per the founder's explicit
instruction.

### Unit 3 Code Generation — ✅ Part 1 APPROVED (3 corrections) + Part 2 (Generation) COMPLETE 2026-08-25

Plan file: `aidlc-docs/construction/plans/unit-3-minimum-paid-product-operations-code-generation-
plan.md`, 17 steps, all `[x]`. Part 1 was approved with 3 corrections: (1) the previously-uncalled
`recordIngestionResult` contract wired into the 2 already-implemented authoritative retrieval
paths (`app/api/parcels/resolve/route.ts` for `"king-county-gis"`,
`report-generation-orchestrator/pipeline.ts` for `"king-county-parcel-polygon"`), best-effort,
neither `parcel-resolution/index.ts` nor `property-intelligence/assemble.ts` modified; (2)
`adminActionLog.reason` made `NOT NULL` with a DB-level `CHECK(length(trim(reason)) > 0)` plus
application-boundary validation, and the admin refund route's body split into
`{refundReason, justification}` so the free-text justification is never passed into Unit 2B's
`RefundReason` parameter; (3) rule-lifecycle transitions (ADM-7) made concurrency-safe via a
conditional `UPDATE regulatory_rules ... WHERE lifecycle_state = <expected>`
(`transitionLifecycleState`), checked for exactly one row affected before any `AdminActionLog`
entry is written — a stale/concurrent request now correctly conflicts rather than silently
"succeeding" on data that already moved.

**Built**: `src/admin-auth/` (constant-time Basic Auth, same-origin CSRF, operator/reason
validation — all deterministically testable via direct function calls); `proxy.ts` (this project's
first pre-route interception file, Next.js 16's `proxy` convention); `src/admin-action-log/`
(append-only, `NOT NULL` reason); `src/data-source-registry/` replaced from an in-memory singleton
to a persisted `dataSourceHealth`-backed module (the old `src/shared/data-source-registry-
instance.ts` removed; `checkReadiness`/`initiateCheckout` now `async`); `src/regulatory-rule-
governance/`'s `disable`/`reenable` (pure) + `repository.ts`'s concurrency-safe
`transitionLifecycleState` + `admin-lifecycle.ts` (orchestration); small additive reads on 3
existing repositories; 12 new `app/api/admin/*` routes for ADM-1 through ADM-8; a 4-section
`app/admin/*` UI; `.env.example` additions (`ADMIN_BASIC_AUTH_USERNAME/PASSWORD`,
`ADMIN_OPERATOR_ID`); a new, purely-additive migration (`0003_heavy_wallow.sql`, 2 new tables + 3
new enums, never applied to a live DB in this sandbox); **29** new deterministic tests (corrected
count — 25 in 5 new test files plus 4 added to the existing `regulatory-rule-governance/
lifecycle.test.ts`; all passing, 182/182 total) plus 2 new `DATABASE_URL`-gated integration test
files (correctly self-skip, not executed in this sandbox). Full detail:
`aidlc-docs/construction/unit-3-minimum-paid-product-operations/code/README.md`.

**Verification, this session, all real**: `npm run typecheck` clean; `npm test` **182/182
passing** across 32 files (29 pre-existing unchanged + 3 new: `data-source-registry/health-
derivation`, `admin-auth/{basic-auth,csrf,credential-check,operator}`, `regulatory-rule-
governance/lifecycle`'s 4 new disable/reenable cases); `npm run build --webpack` succeeds, every
route compiles including all 12 new `app/api/admin/*` routes and 6 new `app/admin/*` pages,
`✓ Compiled workflows in ...ms (21 steps, 2 workflows)` unchanged, `.well-known/workflow/v1/
manifest.json` directly inspected and reconfirms both `reportGenerationWorkflow`/
`processRefundWorkflow` still registered (the new admin refund route's `start()` call did not
disturb workflow discovery). No architectural/product behavior outside Unit 3's own approved scope
was changed; Unit 2B was not reopened.

### Unit 3 — ✅ Full-Repository Review Corrections Applied 2026-08-25

The founder reviewed the actual generated repository (via the new `package:context` archive), not
only the Code Generation summary, and found 5 direct ADM-story/security gaps plus 2 documentation
inaccuracies. Unit 3 was **not** redesigned — every correction is additive or a targeted fix within
already-approved scope:

1. **ADM-5 rewritten**: the old `GET /api/admin/orders?email=` transport is gone —
   `customerEmail` is PII and must never sit in a URL/query string where Vercel platform
   observability could record it. Replaced with `POST /api/admin/orders/search`,
   `{kind: "orderId"|"email"|"reportId", value}`, logically read-only (no mutation, no
   `AdminActionLog` entry, still passes through `proxy.ts`'s CSRF check since it's POST). New
   `src/order-payment/admin-view.ts`'s `AdminOrderView` DTO is now the *only* way an `Order` ever
   reaches the admin browser — `checkoutCreationIdempotencyKey`, `refundIdempotencyKey`, and
   `stripeCheckoutSessionId` (a low-scope bearer capability elsewhere in this app) are never sent.
2. **ADM-1 made report-ID-native**: `GET /api/admin/reports/[reportId]/provenance` now operates
   directly on `EvidenceReportArtifact.id` via the existing `getReportById` — the old
   `[jobId]`-keyed route is gone. ADM-5's `reportId` search resolves
   `reportArtifactId -> ReportGenerationJob -> generationAuthorization.orderId -> Order` (read
   directly off the job's own authorization field — more precise than re-deriving it via
   `screeningRequestId`, which could match an unrelated `PENDING`/`EXPIRED` order).
3. **ADM-4 completed**: the failed-jobs view now shows `retryAttempts`/`createdAt`/`updatedAt` and
   the affected `Order` (linked to `/admin/orders/[orderId]`) for a `VERIFIED_PAYMENT` job, via a
   new pure `resolveOrderIdFromAuthorization` — an `INTERNAL_PROTOTYPE` job truthfully shows no
   customer order, never an invented one. Still strictly read-only; no retry/requeue route exists.
4. **ADM-2 completed, and a real pre-existing gap closed**: `AdminRuleDetail` now renders
   citation/SMC sections/ordinance number/effective date/tier/verification history (including
   Tier-2 professional review detail)/lifecycle state (DISABLED vs SUPERSEDED distinguished
   explicitly)/version chain. Separately, a genuine inherited auditability gap was found:
   `approve()` required a `founderIdentity` but never persisted it, so ADM-2 could not truthfully
   answer "who approved this rule, and when?" Added `RegulatoryRule.approvalRecord?: {
   founderIdentity, approvedAt }` (schema + migration `0004_curly_zuras.sql`, purely additive
   nullable column), `approve()` now takes `approvedAt` explicitly (deterministic, no internal
   clock call) and sets it. Never inferred from `verificationHistory`/`updatedAt`/
   `lifecycleState` — a pre-existing rule with no `approvalRecord` shows "not recorded," not a
   fabricated value.
5. **ADM-3 cadence added, no new infrastructure**: a small static
   `src/data-source-registry/known-sources.ts` definition table (keyed by the same
   `REQUIRED_SOURCE_IDS_FOR_SHED` ids) describes each source's `expectedRefreshCadence` —
   `ON_DEMAND` for both currently-integrated sources, accurately describing how they're actually
   queried (live, per request — never periodically ingested). No new table, no scheduled polling,
   no synthetic health check.

**Documentation corrected**: the code README's "zero Unit 2B files touched" claim was inaccurate —
`order-payment/repository.ts` and `report-access/repository.ts` did receive small additive read
helpers. Corrected to: **Unit 2B payment/refund correctness machinery and workflows were not
changed** (`createCheckoutSession`/`handleVerifiedWebhook`/`processRefund`, `refund-workflow.ts`,
`withFulfillmentTransaction` all unmodified). The "22 new tests" claim was also wrong — corrected
to 29 for the original Code Generation pass (153→182 exactly), now **44 total** after this
correction batch's own 15 additional deterministic tests (182→197) plus 18 new integration tests
across 4 new `DATABASE_URL`-gated files (all correctly self-skip in this sandbox).

**Verification, this session, all real**: `npm run typecheck` clean; `npm test` **197/197
passing**; `npm run build --webpack` succeeds, every route compiles (old `/api/admin/orders` GET
and `/api/admin/reports/[jobId]/provenance` routes confirmed gone, `/api/admin/orders/search` and
`/api/admin/reports/[reportId]/provenance` confirmed present); `.well-known/workflow/v1/
manifest.json` re-inspected, both workflows still registered, step count unchanged. No
architectural/payment/security contradiction was exposed by any of these changes; Unit 2B remains
closed.

**Awaiting the founder's explicit review/approval before proceeding to the next Construction stage
(Build & Test)**, matching every prior unit's gate discipline.

### Unit 3 — ✅ Final Correction (ADM-6) Applied; Code Generation APPROVED 2026-08-25

A final, narrower full-repository review (of the archive regenerated after the 5-batch correction
above) found one remaining material issue, scoped entirely to ADM-6/the existing Unit 2B refund
state machine: `AdminOrderDetailPage` gated the refund action on `order.state === "PAID"` only,
silently dropping Unit 2B's deliberately-designed `REFUND_PENDING` resumability (Workflow 3's
approved resumption behavior).

**Fixed**: new `src/order-payment/admin-refund.ts`'s `decideAdminRefundCommand` — a pure function
using the existing, unmodified `decideRefundAction(order.state)` as the sole authoritative
branching rule (never a duplicated state machine). `PAID` → a genuinely new refund command
(operator chooses `CUSTOMER_REQUEST`/`GOODWILL` + justification). `REFUND_PENDING` → resumption of
the *same* logical refund already in flight — the client can never substitute a new reason; the
existing persisted `refundReason` (which may legitimately be a system-only
`GENERATION_FAILURE`/`DUPLICATE_PAYMENT`) and `refundIdempotencyKey` are used as-is, and their
absence fails closed rather than inventing either. Every other state (`PENDING`/`REFUNDED`/
`REFUND_FAILED`/`EXPIRED`) → rejected `409`, before any `AdminActionLog` write or `start()` call —
`REFUND_FAILED` in particular stays manual/support-resolution only, never auto-reopened.
`AdminOrderDetailPage` now renders "Initiate Refund" (PAID, with the reason selector) vs. "Resume
Refund Submission" (REFUND_PENDING, existing reason shown read-only, no selector) vs. no refund
control at all for every other state; after a successful command it reloads the authoritative
Order rather than fabricating `REFUNDED` ("Refund command accepted; confirmation is pending.").

**Documentation precision preserved**: the code README's new ADM-6 section explicitly distinguishes
the two recovery paths rather than conflating them — a `start()` failure *before* the Workflow ever
receives the command leaves the Order `PAID`, recoverable by a simple operator retry from the PAID
path (Cron plays no role); only a stall *after* the Order actually reached `REFUND_PENDING` is
Unit 2B's existing Cron reconciliation check's job.

**Tests added** (all 10 founder-specified cases): `tests/order-payment/admin-refund.test.ts`
(deterministic, 12 tests — PAID allows CUSTOMER_REQUEST/GOODWILL, PAID rejects a missing reason,
REFUND_PENDING resumes using the existing persisted reason, REFUND_PENDING never lets the client
substitute a reason, REFUND_PENDING requires the existing idempotency key to be present and never
returns/invents one itself, REFUND_PENDING with a missing reason or key fails closed, and all 4
NOOP states — `PENDING`/`REFUNDED`/`REFUND_FAILED`/`EXPIRED` — reject via `it.each`);
`tests/checkout-fulfillment/admin-refund-ui-route-surface.test.ts` (deterministic/structural, 3
tests — the UI's PAID/REFUND_PENDING-only mapping, no reason selector in the resume path, the
server route delegates to `decideAdminRefundCommand` with no route-local re-implementation of the
state check).

**Verification, this session, all real**: `npm run typecheck` clean; `npm test` **212/212 passing**
(up from 197, +15); `npm run test:integration` collects cleanly (unchanged skip/pass counts); `npm
run build --webpack` succeeds, every route compiles unchanged in shape; `.well-known/workflow/v1/
manifest.json` re-confirmed, both workflows still registered, step count unchanged. No
architectural/payment/security contradiction was exposed.

**Unit 3 Code Generation is now APPROVED in full.** Proceeding directly to **Build & Test**, per
the founder's explicit instruction — no further Code Generation review gate held. At Build & Test
completion, `npm run package:context` will be regenerated and the fresh archive path reported.

### Unit 3 — ✅ Build & Test COMPLETE 2026-08-25

All 5 `build-and-test/*.md` documents updated with real Unit 3 results (Unit 3 sections appended
following each file's own established per-unit format):
`build-instructions.md`/`unit-test-instructions.md`/`integration-test-instructions.md`/
`performance-test-instructions.md`/`build-and-test-summary.md`. Two new items added to
`aidlc-docs/operations/external-verification-tracker.md` (12: live Basic Auth/CSRF behavior against
a real deployment; 13: Unit 3's 4 new `DATABASE_URL`-gated integration test files, written but not
executed).

**Final real verification this session** (also re-run once more at the very end of Build & Test,
not merely carried forward from Code Generation): `npm run typecheck` clean; `npm test` **212/212
passing** across 38 files; `npm run test:integration` **16/16 executable passing, 60 correctly
skip** across 16 files (0 failed); `npm run build --webpack` succeeds, `.next/diagnostics/
workflows-manifest.json` directly inspected (the canonical build-output path
`build-instructions.md` itself documents, not just the source-tree `app/.well-known/workflow/v1/
manifest.json` checked throughout this session) — both `reportGenerationWorkflow`/
`processRefundWorkflow` confirmed registered; `npx playwright install chromium` + `npm run
test:e2e` — **2/2 executable passing, 2/2 correctly skip**, confirming `proxy.ts`'s matcher does
not intercept any customer-facing route.

**No new formal load-test suite** (Unit 3, like every prior unit, stays proportional to its actual
scale — a single internal operator, not concurrent public traffic); see
`performance-test-instructions.md`'s new Unit 3 section for what was and wasn't measurable in this
sandbox.

Units 1, 2, 2B, and 3 are all Build & Test-complete and correct as far as this sandbox can prove.
Every external-verification item remains honestly open in
`external-verification-tracker.md` — none fabricated.

**✅ Build & Test APPROVED 2026-08-25.** Proceeding to the **Operations** stage, per the founder's
explicit confirmation — see the "Unit 3 Operations" subsection below.

### Unit 3 Operations — Runbook Complete 2026-08-25, Awaiting Review

Created `aidlc-docs/operations/unit-3-operations-runbook.md`, matching the established per-unit
runbook pattern (`unit-1-operations-runbook.md`/`unit-2-operations-runbook.md`/`unit-2b-operations-
runbook.md`) — documentation only, no new infrastructure, no Unit 3 implementation reopened. 13
sections: admin deployment configuration (Basic Auth credential vs. `ADMIN_OPERATOR_ID` attribution
explicitly distinguished, with their independent fail-closed behaviors); the `proxy.ts` matcher
boundary and first-deployment verification checklist; CSRF operational verification (including the
Preview-deployment-gets-its-own-origin and Development-only-localhost cases); the two new
migrations (`0003_heavy_wallow.sql`, `0004_curly_zuras.sql`) with order/forward-only posture/
`approval_record = NULL`-on-older-rows handling; `AdminActionLog`'s operational meaning (a command
was requested, not proof of external completion) with a 3-row request→workflow→Stripe-confirmation
diagnostic table; refund operations preserving the final ADM-6 behavior exactly, with the
recovery-path distinction stated precisely (a `start()` failure leaving the Order `PAID` is
recoverable only by operator retry, never by Cron, versus a stall after actually reaching
`REFUND_PENDING`, which Cron's existing reconciliation check recovers — the founder's own explicit
non-conflation instruction); the emergency rule disable/re-enable procedure with an explicit
never-re-enable-as-a-content-edit-shortcut warning; data-source health operations (including the
explicit note that Unit 3 has no "force healthy" operation, by design, matching the approved
`AdminActionType` vocabulary); read-only failed-job inspection; admin search/PII handling (the
`AdminOrderView` never-sent-fields list, folding the email-search platform-log check into
external-verification item 12 rather than adding a new item); regulatory approval provenance (the
4-fact table — source verification, Tier-2 review, founder approval, lifecycle state — explicitly
never inferred from one another); a proportional incident/diagnostic table (8 scenarios, existing
Vercel/Neon/Stripe observability only, no new APM/monitoring product); and rollback/deployment
posture (reusing Unit 2B's existing Vercel promote-based rollback, migrations forward-only,
compatibility with prior application code stated as a design expectation not yet independently
verified).

**Housekeeping applied** (documentation corrections, not a new design/code review): corrected
`external-verification-tracker.md`'s stale footer (previously said items 12-13 were added during
Unit 2B Operations — they were actually added during Unit 3 Code Generation); corrected this
document's own stale "awaiting review to proceed to Build & Test" wording now that Build & Test is
approved.

**Items 12 and 13 remain OPEN** in `external-verification-tracker.md`, exactly as instructed — no
real credentialed deployment/database access was available in this sandbox during this Operations
pass, so neither was executed or marked complete; written tests and local deterministic evidence
were not converted into claims of live verification anywhere in the new runbook.

### ✅ Unit 3 Operations APPROVED; Unit 3 Minimum Paid-Product Operations — ✅ COMPLETE 2026-08-25

Three narrow documentation-only corrections applied to `unit-3-operations-runbook.md` per founder
review (no implementation touched):

1. **§5's diagnostic table and §6/§12's recovery guidance corrected** — the original wording
   overstated what DB state alone proves. `Order.state = 'REFUND_PENDING'` proves only that the
   refund state machine reached that state, not which specific Workflow invocation caused it or
   that it maps uniquely to one `AdminActionLog` row. A `REFUND_INITIATED` audit row with
   `Order.state` still `PAID` proves only that the command was recorded and no durable transition
   has yet been observed — **not** that `start()` failed to reach Vercel Workflows (a success whose
   execution hasn't yet reached the DB transition, a lost/ambiguous `start()` response, and other
   transient conditions are equally consistent with that same evidence). Diagnosis now explicitly
   directs using the admin HTTP response, Vercel Workflow/runtime logs, and current `Order` state
   together — never inferring Workflow delivery from `Order.state` alone. The recovery distinction
   is preserved but now phrased by authoritative state (`PAID` vs. `REFUND_PENDING`) rather than by
   a claimed-but-unprovable fact about `start()` delivery.
2. **§8 and §12's `DataSourceHealth` guidance corrected** — `DATA_SOURCE_HEALTH_RECORDING_FAILED`
   proves only that the health *observation* failed to persist; since `recordIngestionResult`
   records both `HEALTHY` and `UNHEALTHY` outcomes, this event alone says nothing about whether the
   underlying authoritative source request itself succeeded or failed. Removed the incorrect "the
   underlying customer request likely/already succeeded" claims; diagnosis now directs inspecting
   the original retrieval/request result directly, never fabricating `observedHealthState` from the
   failed telemetry write.
3. **§10 corrected** — customer email must never appear in a URL (unchanged), but `orderId`/
   `reportId` are not customer-email PII and legitimately appear in the canonical
   `/admin/orders/[orderId]`/`/api/admin/reports/[reportId]/provenance` detail routes; those routes
   are not redesigned to remove IDs from their URLs. The multi-kind search endpoint keeps its
   existing body-based `{kind, value}` contract for all three kinds, for consistency, not because an
   id-in-a-URL is itself a PII problem.

**Everything else in the runbook is unchanged in substance** — Basic Auth vs. `ADMIN_OPERATOR_ID`
distinction, HTTPS-only posture, `proxy.ts` matcher verification, exact-origin CSRF verification,
migration order/forward-only posture, no fabricated historical `approvalRecord`, atomic local
`AdminActionLog` mutations, ADM-6 `PAID`/`REFUND_PENDING` behavior, no `REFUND_FAILED` reopening,
immutable-same-version rule re-enable, observed/manual/effective `DataSourceHealth` semantics,
`UNHEALTHY`-only override, read-only failed jobs, minimized `AdminOrderView`, founder-approval-
provenance distinction, Vercel/Neon/Stripe-only proportional incident response, additive-schema
rollback posture.

**External-verification items 12 and 13 remain OPEN** — no real credentialed deployment/database
check was performed; nothing here converts written tests or local deterministic evidence into a
live-verification claim.

**Unit 3: Minimum Paid-Product Operations is now COMPLETE** — all 7 stages approved: Functional
Design, NFR Requirements, NFR Design, Infrastructure Design (skipped, approved), Code Generation,
Build & Test, Operations. Not to be reopened for minor refinements — only if future live
verification (items 12/13, or any other open item) exposes an actual defect. Unit 3's operational
gate for Units 4-11 is satisfied; proceeding to the next approved Unit of Work per the existing unit
sequence.

---

## UNIT 4: DETACHED GARAGES — Functional Design Part 1 Presented 2026-08-25

Grounded in real research before writing any question (`SRE-GARAGE-1`'s exact acceptance criteria;
confirmed `ProjectType`/`ShedProjectDetails`/`REQUIRED_SOURCE_IDS_FOR_SHED` are the actual
shed-hardcoded points needing generalization while `regulatory-rule-governance` and
`property-intelligence` are already project-type-agnostic; confirmed `/configure`'s "TYPE" step
already has a single-button slot ready for a second project type) rather than assumed. Two genuine,
load-bearing open questions surfaced, not padding: (1) no validated data source exists yet for
"existing structures on the parcel," which `SRE-GARAGE-1`'s lot-coverage-percentage calculation
literally requires; (2) Unit 0B's own pre-construction research found 80% of a real garage-rule
sample was Tier 2 (the opposite of `requirements.md`'s original assumption), and this project has
never brought a Tier-2 rule to ACTIVE — a real tension with what a garage evaluation can honestly
promise under the current governance model, surfaced transparently rather than assumed away. Plan
file: `aidlc-docs/construction/plans/unit-4-detached-garages-functional-design-plan.md`, 5
questions. Awaiting the founder's answers before generating Functional Design artifacts.

## UNIT 4: DETACHED GARAGES — Functional Design Part 2 (original pass, superseded below by the
2026-08-26 correction pass — kept for history)

All 5 Part 1 questions answered by the founder (Q1=A, Q2=B, Q3=A, Q4=A, Q5=B — see the plan file for
full verbatim answers). Part 2 executed exactly as directed: the two bounded research passes first,
then the generalization artifacts that can proceed independently of their outcomes. **This
completion is partial by design — the founder explicitly reserved two decisions rather than having
Functional Design resolve them unilaterally.**

**6 artifacts produced** (all in
`aidlc-docs/construction/unit-4-detached-garages/functional-design/`):

1. **`lot-coverage-data-source-validation.md` (Q1 spike)** — real, live queries against King
   County's GIS REST catalog, the King County/Esri ArcGIS Online content-search API, and Seattle's
   `Seattle_BuildingShells` service. **Finding: NO SUITABLE AUTOMATED AUTHORITATIVE SOURCE FOUND**
   for existing-structure footprint square footage. The two closest candidates
   (`KingCo_ImperviousSurfaces`, `Seattle_BuildingShells`) were each investigated and explicitly
   rejected on stated grounds (10+ years stale; wrong service type for this project's integration
   pattern; measures a different quantity than SMC 23.44.080's actual "lot coverage" definition).
   Per instruction, does **not** choose a fallback — lists candidate fallback options as the
   founder's decision only.
2. **`garage-rule-inventory-and-tier-triage.md` (Q2 research/triage)** — real, live navigation of
   the current Seattle Municipal Code (23.44.070/.080/.090). 4 candidate rules triaged against the
   already-approved BR-6 model: **G1 (height) Tier 2, G2 (rear setback) Tier 2, G3 (side setback)
   Tier 2 [plus a structural data-availability gap on its recorded-agreement path, independent of
   Tier], G4 (lot coverage) Tier 1 but still blocked by the Q1 data gap**. 3 of 4 (75%) Tier 2,
   independently corroborating Unit 0B's own 80% pre-construction finding. Explicit: none of G1-G3
   are activated without founder-approved professional-review resourcing; this document does not
   make that resourcing decision.
3. **`domain-entities.md`** — the discriminated `ProjectDetails = ShedProjectDetails |
   GarageProjectDetails` union (Q3=A, not an optional-fields bag), `ProjectType.GARAGE`,
   `GarageProjectDetails`'s new fields (`existingStructuresFootprintSqFt?` — never defaulted,
   `proposedFootprintSqFt`, `lotAreaSqFt`). Explicitly does **not** define garage rule content
   (reserved per Q2).
4. **`business-rules.md`** — BR-U4-1 (project-type-aware `SUPPORTED_PROJECT_TYPES`), BR-U4-2
   (`evaluateProject` exhaustive dispatch), BR-U4-3 (existing-structures footprint never defaulted
   to 0 — `REQUIRES_VERIFICATION` when unavailable), BR-U4-4 (BR-7's lifecycle gate applies to
   garage rules identically — no garage rule content fabricated by Code Generation), **BR-U4-5 (new
   failure mode this unit introduces: zero-`ACTIVE`-rules must never be presented as "screened
   clean" — report rendering must visibly disclose "no rule coverage yet" per constraint)**,
   BR-U4-6 (no schema change needed for `applicableProjectType`).
5. **`business-logic-model.md`** — Workflow U4-1 (`evaluateProject` project-type dispatch,
   including the new "no ACTIVE rule coverage" outcome tag) and Workflow U4-2 (the real `/configure`
   garage intake path, Q4=A, reusing `ProjectTypeSelector`/`ParcelPlacementMap` unchanged). States
   plainly that the honest-disclosure path (step 6) is expected to be the **common case** for real
   garage submissions until the two founder decisions land, not a rare edge case.
6. **`frontend-components.md`** — `GarageDetailsForm` (mirrors `ShedDetailsForm`, deliberately has
   no existing-structures input field yet — Q1 unresolved), reuses `ParcelPlacementMap` unchanged,
   and a new `NoActiveRuleCoverageNotice` component (per-constraint, visually distinct from
   `KNOWN`/`INFERRED`/`REQUIRES_VERIFICATION` finding cards) implementing BR-U4-5's disclosure
   requirement.

**What Functional Design Part 2 does NOT resolve (both explicit founder decision points, not
oversights)**:
- **Q1 fallback**: how (or whether) to source existing-structure footprint data, given no automated
  source was found.
- **Q2 resourcing**: how to resource professional review for G1/G2/G3 (3 of 4 candidate garage
  rules), without which garage setback/height cannot reach `ACTIVE` and `SRE-GARAGE-1` cannot be
  fully satisfied — only the honest-disclosure path (BR-U4-5) applies to those constraints.

Plan file checkboxes ("What This Stage Produces") all marked `[x]`. Awaiting founder review/approval
before proceeding to Unit 4's next stage.

## UNIT 4: DETACHED GARAGES — Functional Design CORRECTED 2026-08-26 (founder review response)

The founder reviewed Part 2 above and returned 2 decisions plus 4 targeted corrections rather than
approving outright. All applied; all 6 artifacts revised in place (not rewritten — targeted edits
with inline "Revised 2026-08-26" markers so the history stays visible).

**Both outstanding Part 2 decisions resolved**:
- **Founder Decision 1 (Q1 fallback)**: user-supplied existing-structure footprint square footage,
  explicitly USER_SUPPLIED/unverified; the combined lot-coverage finding is **always**
  `REQUIRES_VERIFICATION` (not just when the value is missing); never defaulted to 0; garage-footprint-
  alone must never be labeled as the SMC lot-coverage result. Documented in
  `lot-coverage-data-source-validation.md` and `business-rules.md` BR-U4-3 (revised).
- **Founder Decision 2 (Q2 resourcing)**: a bounded, single-package professional review by a Seattle
  land-use/zoning consultant/planner (attorney escalation only if the zoning professional finds an
  issue outside normal zoning interpretation), producing a durable per-rule record (citation,
  interpretation, applicability/exceptions, caveats, reviewer identity, date, opinion); founder
  sign-off remains a separate later checkpoint; no Tier-2 garage rule reaches `ACTIVE` before review.
  G3's Recorder-integration question resolved as an evidence-availability condition
  (`REQUIRES_VERIFICATION` when a recorded-agreement fact is unknown) rather than a data gap needing
  new integration. Documented in `garage-rule-inventory-and-tier-triage.md` and `business-rules.md`
  BR-U4-4 (revised).

**4 corrections applied**:
1. **Height inventory was incomplete** — G1 only covered the in-required-setback 12/15 ft case. Real
   live research against SMC 23.44.070.A.1 (re-fetched, quoted directly) added **G1b** (the general
   32 ft outside-required-setback regime), itself Tier 2 for the same setback-siting-dependency
   reason as G1, plus an independently-found textual ambiguity in 23.44.070.A.2.d (whether a
   qualifying lot's 42 ft allowance could read onto an accessory structure). Workload is now **4 of
   5 (80%) Tier 2** — corroborates Unit 0B's original 80% finding almost exactly, closer than the
   pre-correction inventory's 75%.
2. **Raw parcel area is not always the SMC lot-coverage denominator** — SMC 23.44.080.B's exclusion
   categories (riparian/wetland/shoreline/steep-slope) were wrongly assumed already supported by
   existing ECA integration; real grep of `src/spatial-analysis/eca.ts` and `postgis-adapter.ts`
   found this false (no production ECA adapter is wired in at all; even the one hazard type with any
   prior design work, `steep_slope`, only supports proximity/intersection facts, not
   area-of-overlap; 3 of 4 exclusion categories have zero prior integration of any kind). Corrected
   the false claim in `lot-coverage-data-source-validation.md`, and introduced `LotCoverageFacts`
   (new internal, server-derived structure — `rawParcelAreaSqFt`/`excludedLotAreaSqFt?`/
   `countableLotAreaSqFt?`/etc.) plus new `business-rules.md` BR-U4-7 stating the two conditions
   under which `countableLotAreaSqFt` may ever be computed, defaulting to `REQUIRES_VERIFICATION`
   otherwise. No new data source or PostGIS capability was added — per instruction, that stays a
   separately-approved decision.
3. **`GarageProjectDetails` was carrying trusted derived facts it shouldn't** —
   `proposedFootprintSqFt`/`lotAreaSqFt` were removed from the client-submitted project-details
   contract entirely; both are now computed server-side into `LotCoverageFacts` at evaluation time,
   matching the established pattern (shed setback distances are likewise never trusted from the
   client). New `business-rules.md` BR-U4-8 states this trust boundary as a standing rule.
4. **Garage purchase-eligibility was conflated with intake support** — adding `GARAGE` to
   `SUPPORTED_PROJECT_TYPES` (BR-U4-1) no longer implies public purchase eligibility. New
   `business-rules.md` BR-U4-9 ("Garage Screening Coverage Readiness") and `business-logic-model.md`
   Workflow U4-3 introduce a separate gate — modeled on the existing `checkReadiness` pattern
   (`screening-request/authorization.ts`) — that must be true before `GARAGE` appears in the
   publicly-served `availableProjectTypes` or is allowed through `initiateCheckout`. Internal
   development/testing of the garage path may proceed regardless (the same "build the capability,
   then gate the sale" sequencing this project already used for shed evaluation vs. shed checkout).

All 6 artifacts (`lot-coverage-data-source-validation.md`, `garage-rule-inventory-and-tier-triage.md`,
`domain-entities.md`, `business-rules.md`, `business-logic-model.md`, `frontend-components.md`) now
carry these corrections. Presenting for founder re-review; per explicit instruction, **not**
proceeding to NFR Requirements until that review lands.

## REGULATORY PROFESSIONAL REVIEW / COMMERCIALIZATION GATE — deferred project-level milestone
*(added 2026-08-26, founder sequencing correction)*

**Not a Unit 4 gate — a project-level milestone that comes after the complete POC (Units 4-11) is
built and deployed.** Recorded here, at the project-state level, precisely so no later unit's
Construction (Unit 4's or any of Units 5-11's) re-introduces professional-review-as-a-prerequisite
by mistake — the founder's explicit instruction: *"We will not pay for any professional regulatory
review until the complete Permit Preflight POC has been built and deployed."*

**What this milestone is**: a single batch engagement reviewing Tier-2 regulatory candidates across
*all* project types built during the POC (not just Unit 4's garage rules) — cheaper and more
efficient than paying for piecemeal per-unit reviews during construction, and only worth doing once
there's a real product to justify the expense.

**Expected sequence** (verbatim from the founder's instruction):
1. Complete Units 4-11 / complete POC scope.
2. Deploy the complete POC.
3. Evaluate whether the product is worth continuing/commercializing.
4. If yes, assemble the full Tier-2 regulatory-review package (across all project types built by
   then, not just garages).
5. Engage the appropriate Seattle land-use/zoning professional(s).
6. Escalate specific questions to legal counsel only where genuinely needed.
7. Record professional opinions in the existing governance model (BR-8's ambiguity/caveat-
   persistence mechanism, BR-7's `SOURCE_VERIFIED` lifecycle step — no new persistence concept).
8. Founder verifies/approves (BR-7/RRAG-5's existing separate-checkpoint invariant, unchanged).
9. Activate commercially-ready rules.
10. Enable the applicable paid project types only when their own coverage-readiness gates
    (e.g., Unit 4's BR-U4-9 "Garage Screening Coverage Readiness") pass.

**Binding invariant for every unit until this milestone is reached**: a unit's Construction may be
marked complete without any Tier-2 rule it introduces having received professional review — that
review requirement gates only that project type's own commercial-readiness/coverage-readiness
predicate (e.g., BR-U4-9 for garages), never the unit's own Construction-complete status. No unit
may engage or pay for a land-use consultant, planner, or attorney before this milestone is reached.
No unit may mark a Tier-2 rule `SOURCE_VERIFIED`/`TESTED`/`APPROVED`/`ACTIVE` without the eventual
review, and no unit may weaken its own Tier-1/Tier-2 governance model (BR-6/BR-7) merely to make its
POC scope appear more complete than it is. See Unit 4's `business-rules.md` BR-U4-4/BR-U4-9 and
`garage-rule-inventory-and-tier-triage.md` for the first concrete application of this milestone.

## UNIT 4: DETACHED GARAGES — Regulatory-Completeness Pass Round 2 CORRECTED 2026-08-26
*(sequencing decision above approved outright and NOT revisited by this round)*

The founder approved the post-POC sequencing correction as final, then identified that the prior
5-candidate regulatory inventory (G1/G1b/G2/G3/G4) — despite round 1's own "regulatory-completeness"
framing — still modeled lot coverage as a flat 50%-of-raw-area rule, never incorporated the
roof-height bonus provisions into height, and never covered the setback baseline or the
street-setback garage-placement exception. Real, live re-reading of SMC 23.44.070.B (roof-height
standards), the complete 23.44.080 (A-G, all 7 subsections), 23.44.090 (Table A + the complete G/I
text), and 23.44.160.C-D (parking/garage placement in street setbacks) followed.

**The inventory is now 13 candidates**, renamed to avoid colliding with SMC's own subsection
lettering (`H1`/`H2` for height, `S1`-`S5` for setback, `L1`-`L6` for lot coverage) — **9 of 13
(69%) Tier 2**, with setback and height having no Tier-1 candidate at all:
- **H1/H2 (height)**: H1 (in-setback, 23.44.070.A.3) now carries a second, independent Tier-2
  reason beyond the prior setback-siting dependency — a genuine, previously-unmodeled conflict
  between A.3.a (specific: shed roofs get no height bonus in a required setback) and B (general:
  shed/butterfly roofs get up to +3 ft), a real general-vs-specific statutory conflict for a
  zoning professional to resolve. H2 (outside-setback, A.1/A.2) incorporates B's roof bonus cleanly
  (no added conflict there).
- **S1-S5 (setback)**: S1 (new) models Table A's baseline dimensions — the shared geometric input
  every other setback/height candidate depends on, itself gated on facts this project doesn't
  capture today (dwelling-unit count, frequent-transit-area status). S2 (new) models the
  23.44.090.G.1 street-setback garage-placement exception and its dependency on
  23.44.160.C/D.4/D.5 — found to require a **Director discretionary determination** as a
  precondition (23.44.160.C.2), a clean, independent BR-6 Tier-2 trigger, plus real
  elevation/grade facts this project has never integrated. S3/S4 (side/rear setback, formerly
  G3/G2) unchanged in substance, re-verified against fresh citations. S5 (new) models the
  23.44.090.G.4 garage-in-setback size/roof-use caps, Tier 2 only because its applicability
  inherits from S2/S3/S4.
- **L1-L6 (lot coverage)**: decomposed from the single flat-50% model into L1 (base 50%, Tier 1),
  L2 (excluded lot-area categories, Tier 1 on governance grounds — BR-U4-7's data-availability
  finding unchanged), L3 (numerator exclusions, Tier 1 — and the basis for the corrected
  existing-structures numerator semantics below), L4 (**new** — 23.44.080.D's minimum 625 sq ft
  coverage floor, Tier 2 because it depends on a Director-approval determination this project can
  never verify), L5 (**new** — 23.44.080.F's frequent-transit multi-unit 60% provision, Tier 2,
  real applicability question explicitly not assumed either way, blocked on an unintegrated
  transit-frequency GIS fact), L6 (**new** — 23.44.080.G's stacked-dwelling-units 60% provision,
  Tier 2, real applicability question explicitly not assumed either way).

**Two additional corrections applied throughout the affected artifacts**:
1. **Lot-coverage numerator semantics** — the USER_SUPPLIED existing-structures figure
   (`business-rules.md` BR-U4-3) must represent the SMC-*countable* area under 23.44.080.C's
   exclusions, not raw/gross footprint of every existing structure; intake copy
   (`frontend-components.md`) corrected accordingly. Still always `REQUIRES_VERIFICATION`
   regardless of value — the correction changes what's being asked for, not the trust level.
2. **`LotCoverageFacts` now supports an applicable ALLOWED COVERAGE quantity**
   (`domain-entities.md`), not merely `countableLotAreaSqFt * 0.50` — folding in L1's default vs.
   L5/L6's conditional 60%, and L4's minimum floor, each independently capable of forcing
   `REQUIRES_VERIFICATION` when unresolved. `business-rules.md` BR-U4-7 rewritten accordingly.

**Stale claims explicitly corrected (per instruction)**: lot coverage is not a universal flat 50%
rule; the 13-candidate inventory is not claimed to be the final, complete SRE-GARAGE-1 rule set
(only the complete set this specific research pass established); existing ECA integration still
does not supply all four 23.44.080.B exclusion categories or their measurable areas (BR-U4-7's
finding stands, unchanged and uncontradicted).

**Scope discipline maintained**: stayed within setback/height/lot-coverage and the cross-references
needed to decide them; did not research 23.44.090.H/J/K or 23.44.100 (a distinct 4th constraint
category, explicitly out of scope).

**All 6 artifacts revised again** (`garage-rule-inventory-and-tier-triage.md` substantially
rewritten; `domain-entities.md`, `business-rules.md` BR-U4-3/BR-U4-4/BR-U4-7, `business-logic-model.md`
Workflow U4-1, `frontend-components.md` updated). Presenting for founder re-review; still not
proceeding to NFR Requirements.

## UNIT 4: DETACHED GARAGES — Final Targeted Correction APPROVED 2026-08-26; Functional Design COMPLETE

The founder accepted round 2's regulatory research outright, then identified two remaining internal
consistency issues, both corrected without any new SMC research, candidate addition/removal, or
revisiting the post-POC sequencing decision (which the founder explicitly reaffirmed as final).

**Correction 1 — Tier separated from per-parcel evidence availability.** Round 2 repeatedly cited
"the project lacks a data source for this fact" as sufficient grounds for Tier 2 — a conflation of
two things this project's own model already correctly separates elsewhere (L2's pattern): whether a
*rule itself* is unambiguous once facts are known (Tier), versus whether *this parcel's* facts are
actually available (evidence, handled by BR-4's `REQUIRES_VERIFICATION`, never by Tier). Re-applying
the founder's own test to all 13 candidates:
- **Reclassified to Tier 1 (governance)**: **S1** (Table A baseline setback dimensions — no genuine
  ambiguity in the branch-selection logic itself, only missing dwelling-unit-count/transit-area
  evidence) and **L6** (stacked-dwelling-units 60% bonus — no cited textual ambiguity in "lots with
  stacked dwelling units" itself; "a lay user might misclassify it" is an evidence-quality concern,
  not a Tier-2 driver, per the founder's explicit framing).
- **L5 (frequent-transit 60% bonus) stays Tier 2**, but its justification is now a specific,
  genuine interpretation question this pass identified: whether SMC 23.44.080.F's own "development
  consisting entirely of dwelling units" trigger can be satisfied at all by a lot that also has a
  non-dwelling accessory garage, given F's actual purpose is to set that lot's *overall* coverage
  cap — not F's multi-part condition structure or its missing transit-area data source (both
  correctly recharacterized as evidence matters, not Tier drivers).
- **H1, H2, S2, S3, S4, S5, L4 keep their Tier-2 classifications**, each now traced to exactly one
  genuine rule-level driver with any evidence gap named separately: H1 (A.3.a/B roof-bonus
  conflict), H2 (A.2.d scoping ambiguity), S2 (160.C.2's Director determination, baked into the
  rule's own text), S3/S4 (overlapping G.2/I.1 and G.3/I.2 provisions with no stated precedence),
  S5 (depends on S2/S3/S4's own genuine ambiguity, not merely S1's evidence gap), L4 (the rule's own
  "or an amount approved by the Director... whichever is greater" clause — an inherently open-ended,
  never-verifiable provision, independent of whether L2 confirms a B-listed area exists at all).
- **Recomputed: 8 of 13 (62%) Tier 2** (H1, H2, S2, S3, S4, S5, L4, L5), **5 of 13 (38%) Tier 1**
  (S1, L1, L2, L3, L6) — corrects round 2's arithmetic error (which claimed 9 but only supported 10
  by its own then-current reasoning) and its `business-rules.md` BR-U4-4 duplication ("L1, L2, L3,
  and L2's own governance classification" — L2 counted twice). **Not forced to match Unit 0B's
  earlier 80% pre-construction sample** — this inventory is authoritative for Unit 4 on its own
  terms, per explicit instruction. Setback and height still have no *fully usable* Tier-1 candidate
  (S1 is Tier 1 but still evidence-gated, and everything else in both constraint types still depends
  on a genuine Tier-2 question) — Tier 1 status is not a usability claim.

**Correction 2 — `minimumCoverageFloor`/`applicableCoveragePercentage` no longer overload
`undefined`.** Both were bare optional numbers in round 2's `LotCoverageFacts`, where `undefined`
meant two materially different things: "confidently does not apply" vs. "genuinely unresolved" —
not equivalent states, and a deterministic evaluator must be able to tell them apart without
guessing. Both are now small discriminated result types (`domain-entities.md`, revised):
`minimumCoverageFloor: { status: "NOT_APPLICABLE" } | { status: "REQUIRES_VERIFICATION",
statutoryMinimumSqFt: 625, reason } | { status: "KNOWN", amountSqFt, provenance }` (the `KNOWN`
state is never fabricated — only reachable if a future capability could conclusively confirm no
Director-approved override exists, which nothing this unit builds today provides);
`applicableCoveragePercentage: { status: "ESTABLISHED", percent: 50 | 60, basis } | { status:
"REQUIRES_VERIFICATION", reason }`. A real practical improvement falls out of this fix: a
straightforward single-family lot with no B-listed area and no stacked/multi-unit qualification can
now legitimately reach `ESTABLISHED`(50%) and a `NOT_APPLICABLE` floor, rather than every garage
evaluation being forced toward `REQUIRES_VERIFICATION` by an overly conservative default — still
blocked from a fully `KNOWN` `allowedCoverageSqFt` by BR-U4-3's numerator gate (the existing-
structures figure is always self-reported), by design.

**All 6 artifacts revised a final time**: `garage-rule-inventory-and-tier-triage.md` (H1/H2/S1/S2/
S5/L4/L5/L6 triage rewritten; summary table now shows the genuine rule-level driver and separate
evidence gap per candidate; counts recomputed), `business-rules.md` (BR-U4-4 recomputed and
de-duplicated; BR-U4-7 rewritten for the discriminated result types), `domain-entities.md`
(`LotCoverageFacts`'s two fields redefined as discriminated unions), `business-logic-model.md`
(Workflow U4-1 step 2(e)/(f) rewritten to match).

**Unit 4 Functional Design is APPROVED and COMPLETE.** Per the founder's explicit instruction, no
further Functional Design review gate is held absent a new regulatory contradiction. **Proceeding
directly to NFR Requirements.**

## UNIT 4: NFR Requirements — ✅ SKIPPED (approved 2026-08-26) — no new NFR surface

Assessed against the approved Functional Design: no new tech-stack selection, no new performance
pattern (`LotCoverageFacts` is simple arithmetic plus existing PostGIS reads), no new security
surface (`existingStructuresFootprintSqFt` crosses the same trust boundary/Boundary Validator
discipline already governing every other client-submitted project-configuration field, not a new
one), no new scalability concern. Recorded as **SKIPPED — no new NFR requirements beyond the
already-approved project baseline.** Inherited, unreopened: server-side Boundary Validator
discipline for all client input; fail-closed validation; deterministic regulatory conclusions;
missing/uncertain evidence → `REQUIRES_VERIFICATION`, never guessed `KNOWN`; existing provenance/
auditability requirements; existing immutable report/snapshot behavior; existing security/logging/
privacy posture; existing accessibility baseline; existing performance instrumentation/sanity
posture; existing Vercel/Neon/PostGIS operational posture. No new PII category is introduced.

## UNIT 4: NFR Design — ✅ SKIPPED (approved 2026-08-26) — all patterns inherited

Recorded as **SKIPPED — all applicable design patterns are inherited from previously approved
units, no new NFR pattern is necessary.** Explicitly not introduced for Unit 4: a new validation
framework, a new evidence-quality framework, a new reliability mechanism, caching, queues/workers,
a new observability product, a new security/auth mechanism, or a redesign of report-generation
durability. Existing patterns are reused as-is.

## UNIT 4: Infrastructure Design — ✅ SKIPPED / APPROVED (approved 2026-08-26) — NO NEW INFRASTRUCTURE

Matches Unit 3's own precedent exactly. Functional Design explicitly adds none of: a new external
GIS/data provider, King County Recorder/title-record integration, ECA-area (wetland/riparian/
shoreline/steep-slope area-of-overlap) integration, transit-frequency GIS integration, an elevation/
topography provider, a new database, a new queue/worker, a new Vercel service, new storage, or a new
third-party API. The canonical infrastructure remains fully unchanged: Vercel, Next.js, Neon
PostgreSQL/PostGIS, Vercel Workflows/Cron, Stripe, Resend, Anthropic, MapLibre/MapTiler, the existing
PDF stack.

**Reopen triggers for any of the three stages above (Unit 4 only, explicit and bounded)**: a new
external data provider/integration; a materially new sensitive-data category; a new authentication/
authorization boundary; a materially expensive spatial computation not represented by the approved
Functional Design; new asynchronous/durable execution requirements; a major new deployment/runtime
dependency. Ordinary implementation details discovered during Code Generation are explicitly **not**
reopen triggers.

**Proceeding directly to Unit 4 Code Generation** — no further architecture/design gate before it.

## UNIT 4: Code Generation — Part 1 (Plan) APPROVED, Part 2 (Generation) COMPLETE 2026-08-26

**Part 1**: grounded in a real, read-only codebase audit (not assumptions from Functional Design's
own self-description) - found `ProjectTypeSelector`/`ShedDetailsForm`/a server-supplied
`availableProjectTypes` list, which `frontend-components.md` assumed already existed as Unit 2
extension points, do **not** exist anywhere in `app/`/`src/` - `app/configure/page.tsx` is one
monolithic component with hardcoded shed logic throughout. Also found: setback/height evaluators
(`REAR_SETBACK`/`HEIGHT_LIMIT`/`SIDE_FRONT_SETBACK_STANDARD`) are already structurally garage-
compatible (signature widening only); `LOT_COVERAGE` is genuinely new evaluator logic; 4
independently-duplicated `SUPPORTED_PROJECT_TYPES`/shed-hardcoded gates existed with no shared
source of truth; no parcel-area computation existed anywhere. 9-step plan written
(`aidlc-docs/construction/plans/unit-4-detached-garages-code-generation-plan.md`), approved with
one regulatory-correctness correction (L1/L5/L6 percentage resolution - `stackedDwellingUnits ===
false` rules out L6 only, never L5, so no real request today reaches `ESTABLISHED(50, L1_DEFAULT)`
- caught before any code was written).

**Part 2 (generation) complete** - all 9 steps implemented:
1. `screening-request/types.ts`: `ProjectType.GARAGE`, `GarageProjectConfiguration` +
   `GarageProjectConfigurationSchema`, `ProjectConfiguration` union, centralized
   `SUPPORTED_PROJECT_TYPES`.
2. Consolidated the 4 duplicated shed-hardcoded gates (`repository.ts`, `authorization.ts`,
   `checkout-fulfillment/index.ts`, `app/api/screening-requests/route.ts`) to import the one shared
   constant.
3. `regulatory-rules-engine/types.ts`: `GarageProjectDetails`, `ProjectDetails` union,
   `LotCoverageFacts` with discriminated `applicableCoveragePercentage`/`minimumCoverageFloor`
   result types (never overloading `undefined`, per the Functional Design's final correction),
   `EvaluationOutcome.uncoveredConstraintTypes` (BR-U4-5).
4. `evaluate.ts`: widened setback/height evaluators to the `ProjectDetails` union (no new logic);
   `DWELLING_SEPARATION` and `LOT_COVERAGE` both fail closed to `REQUIRES_VERIFICATION` when
   dispatched against the wrong project type; new `evaluateLotCoverage` (net-new, always
   `REQUIRES_VERIFICATION` per BR-U4-3); a real, exercised `expectedConstraintTypesFor` exhaustiveness
   switch (BR-U4-2) computing `uncoveredConstraintTypes`.
5. `postgis-adapter.ts`: new `computeParcelAreaSqFt` (`ST_Area`, same SRID-fail-closed discipline as
   every other entry point). `pipeline.ts`: fixed the hardcoded `"shed"` `applicableProjectType`
   filter; project-type-dispatched `LotCoverageFacts` assembly implementing the corrected L1/L5/L6
   logic exactly; `uncoveredConstraintTypes` persisted into the immutable evidence array (BR-U4-5).
6. `repository.ts`: schema selection (`GarageProjectConfigurationSchema` vs. `ShedProjectConfiguration
   Schema`) by `existing.projectType`. `app/api/screening-requests/route.ts`: accepts any
   `SUPPORTED_PROJECT_TYPES` member, not just shed.
7. `authorization.ts`: new `isGarageScreeningCoverageReady()` (hardcoded `false`, matching the
   founder's own "static flag" allowance) and `checkGarageCheckoutEligibility` - consulted by
   `checkout-fulfillment/index.ts`'s `initiateCheckout` (the public payment path) only, never by
   `authorizeReportGeneration` (the internal/CLI-only path) - internal development/testing proceeds
   regardless of public purchase eligibility, per BR-U4-9's own sequencing.
8. `app/configure/page.tsx`: real garage TYPE/DETAILS/PLACEMENT/SUMMARY path, the 3-choice
   existing-structures control and the tri-state stacked-dwelling-units control (never coercing
   "unanswered" to a concrete value). `app/report/page.tsx`: new `NoActiveRuleCoverageNotice`-
   equivalent section, visually and textually distinct from finding cards.
9. 26 new/updated deterministic tests across 6 files (garage evaluate/candidate/validation/
   readiness-gate coverage, `computeParcelAreaSqFt` SRID guards) plus mechanical `projectType: "shed"`
   fixture updates to 4 pre-existing shed test files.

**Real verification performed**: `npm run typecheck` clean; `npm test` **240/240 passing** (42 test
files, up from 212/38); `npm run build` (`next build --webpack`) succeeds, all 26 routes generate
cleanly with no new routes needed. Zero reopen-triggers hit - no new external data provider,
sensitive-data category, auth boundary, expensive spatial computation, async/durable requirement, or
deployment dependency was introduced anywhere in Code Generation.

**One deviation flagged for founder awareness, not silently made**: e2e (Playwright) coverage for the
real garage UI path was not added - the existing full-path e2e test is itself gated behind a live
`DATABASE_URL` (unavailable in this sandbox) and a live map/parcel flow; the corrected logic (L1/L5/L6
resolution, DWELLING_SEPARATION/LOT_COVERAGE fail-closed dispatch, coverage-readiness gate) is
covered directly by the 26 new deterministic unit tests instead. See
`unit-4-detached-garages-code-generation-plan.md`'s "Part 2 Result Summary" for full detail.

Confirmed unchanged, per explicit instruction: existing shed behavior (all pre-Unit-4 tests still
pass byte-for-byte); no garage `RegulatoryRule` reached `ACTIVE`; `isGarageScreeningCoverageReady()`
returns `false`; no new external integration of any kind.

Presenting Code Generation for founder review - next stage (if approved) is Build & Test.

## UNIT 4: Code Generation — Correction Applied; APPROVED / COMPLETE 2026-08-27

Founder review found one real deviation from the approved Functional Design: BR-U4-9 gates **both**
public project-type advertisement **and** checkout, but the implementation above reconciled "real
garage UI" with "no public purchase" by always offering both TYPE-step buttons and enforcing only
at checkout - narrower than the approved invariant. Corrected without touching any of the
substantial garage implementation already built:

- New `GET /api/screening-requests/available-project-types` - a tiny, single-purpose server
  boundary (not a feature-flag framework) computing `[ProjectType.SHED, ...(isGarageScreening
  CoverageReady() ? [ProjectType.GARAGE] : [])]`.
- `app/configure/page.tsx` (client component) fetches this list rather than importing the
  server-only `authorization.js` module directly, defaulting to shed-only until the fetch resolves
  (fail-closed). The garage TYPE button now renders only when the server actually advertises it -
  today, never, since `isGarageScreeningCoverageReady()` is `false`.
- Everything else preserved exactly as built: `GarageDetailsForm`, garage persistence, placement,
  summary, deterministic evaluation, report rendering, all 26 garage tests, and full internal
  `SUPPORTED_PROJECT_TYPES` API support - `GARAGE` remains fully representable/testable
  (`POST /api/screening-requests` and `selectProjectType` both still accept/select it directly),
  just not publicly advertised. The checkout-time gate (`checkGarageCheckoutEligibility`) is
  unchanged and remains an independent, authoritative defense-in-depth layer even if a caller
  bypasses the public list entirely.

**Re-verified after the correction**: `npm run typecheck` clean; `npm test` **240/240 still
passing**; `npm run build` succeeds (27 routes - one new route, everything else unchanged).

**Confirmed per the founder's explicit checklist**: existing shed behavior unchanged; `GARAGE`
remains supported internally; the public `/configure` experience now correctly omits `GARAGE` while
`isGarageScreeningCoverageReady() === false`; direct `GARAGE` checkout remains rejected by the
server-side readiness gate (defense in depth, both layers now correctly present); no garage
`RegulatoryRule` is `ACTIVE`; no new external integration was introduced.

**The Playwright e2e gap remains explicitly accepted for Code Generation** (per the founder's own
instruction) and carried into Build & Test's scope - not blocking, not silently dropped.

**Unit 4 Code Generation is APPROVED and COMPLETE.** No further Code Generation review gate, per
explicit instruction. **Proceeding directly to Unit 4 Build & Test.**

## UNIT 4: Build & Test — COMPLETE 2026-08-27

All 5 `aidlc-docs/construction/build-and-test/*.md` documents updated with real Unit 4 results,
matching the exact pattern already used for Units 1/2/2B/3:
- `build-and-test-summary.md`: new top-level "Unit 4" section (Build Status, Test Execution
  Summary, the two correction rounds - four Functional Design rounds summarized, plus the
  Code Generation BR-U4-9 correction - Tier-2 Shed Rule Status unchanged, Security/Provenance
  Checks, Tests That Could Not Be Executed, Remaining External Dependencies) plus an updated
  "Overall Status" header at the top of the file.
- `build-instructions.md`: new "Result — Unit 4" entry (1 new route, no new env var, no new
  migration, workflow manifest unchanged).
- `unit-test-instructions.md`: expected count updated to 240/240 across 42 files; new "Unit 4"
  subsection under "What This Suite Proves" mapping every new test file to the business rule/
  invariant it proves (BR-U4-2/3/4/7/9, the corrected L1/L5/L6 resolution, `computeParcelAreaSqFt`'s
  SRID guard).
- `integration-test-instructions.md`: new note under the Browser Smoke Suite section - the garage
  full-path scenario was not written, explicitly accepted as a Code Generation gap, tracked rather
  than fabricated.
- `performance-test-instructions.md`: new "Unit 4" section, same proportionality reasoning as
  Units 2/2B/3 - no new formal load-test suite, real 240-test wall-time measurement recorded.

`aidlc-docs/operations/external-verification-tracker.md`: new item 14 (the garage browser-smoke
gap) added with the same not-fabricated, explicitly-tracked discipline as every other open item;
footer updated. Items 1-13 unchanged - none marked complete, since no live credentialed
deployment/database check actually ran in this pass either.

**Real verification underlying all of the above** (same run already reported after the Code
Generation correction, not re-run for docs-only changes): `npm run typecheck` clean; `npm test`
**240/240 passing**, 42 files; `npm run build` succeeds, 27 routes, workflow manifest unchanged.

**Unit 4 Build & Test is COMPLETE.** Per CLAUDE.md's Build and Test stage, the next question is
whether to proceed to the Operations phase (a runbook, matching Units 2B/3's own precedent) -
awaiting the founder's decision.

## UNIT 4: Operations — COMPLETE 2026-08-27; UNIT 4 ITSELF COMPLETE

Delta-only runbook written per explicit founder instruction (Unit 4 introduced no new
infrastructure, external service, credential, Workflow, migration, background process, or admin
subsystem - no restatement of the full Unit 2B/3 runbooks) -
`aidlc-docs/operations/unit-4-operations-runbook.md`, 6 sections:
1. **Garage Commercial-Readiness State** - `isGarageScreeningCoverageReady()` intentionally `false`
   through the POC-build phase; both layers (public advertisement via `available-project-types`,
   checkout via `checkGarageCheckoutEligibility`) documented with a 4-step curl/browser
   verification procedure; explicit instruction not to flip the gate operationally - it changes
   only after the post-POC Regulatory Professional Review/Commercialization Gate milestone and
   explicit founder approval.
2. **Garage Rule Governance** - a 4-row table distinguishing "no ACTIVE garage rules
   (intentional)" / "a rule unexpectedly `DISABLED`" / "`REQUIRES_VERIFICATION` from missing
   evidence (expected)" / "an actual evaluation/report failure" - reaffirms no Tier-2 garage rule
   may ever be activated as an operational workaround.
3. **Lot-Coverage Diagnostics** - documents that `REQUIRES_VERIFICATION` is the commonly-expected
   garage lot-coverage result today (USER_SUPPLIED numerator, generally-unresolved ECA/countable-
   lot-area denominator, generally-unresolved L5 transit applicability) and is not itself a
   failure; names the real existing diagnostic surfaces for genuine failures
   (`DATA_SOURCE_HEALTH_RECORDING_FAILED`, `STAGE_TIMING`, `JOB_COMPLETE`/`JOB_FAILED`,
   `/admin/failed-jobs`) - and honestly discloses that `computeParcelAreaSqFt`'s own call is not
   currently wrapped in a `STAGE_TIMING` block (a real, disclosed granularity gap, not silently
   assumed covered). No new monitoring infrastructure introduced.
4. **`GET /api/screening-requests/available-project-types`** - documented shape, expected current
   response (`["shed"]` only), and the client's fail-closed-to-shed-only behavior on any fetch
   failure. No new alerting system required.
5. **External Verification** - tracker item 14 (garage Playwright scenario) reaffirmed OPEN and
   **explicitly non-blocking for Unit 4 completion**, per the founder's own repeated instruction
   not to fabricate a passing browser result; `computeParcelAreaSqFt` added to the existing item 3
   live-PostGIS-verification checklist (housekeeping only, same underlying blocker) rather than a
   new standalone tracker item.
6. **No New Operations Surface** - explicitly confirmed: no new secrets, deployment component,
   migration, Workflow/Cron, external provider, backup/recovery procedure, or PII-handling
   procedure. Existing Vercel/Neon/PostGIS/report-generation procedures inherited unchanged.

Writing this runbook exposed no new operational correctness/security issue - no additional review
gate held, per explicit instruction.

**Unit 4 (Detached Garages) is now fully ✅ COMPLETE** - all 7 stages approved: Functional Design
(4 correction rounds), NFR Requirements [skipped, no new surface], NFR Design [skipped], Infra-
structure Design [skipped, no new infrastructure], Code Generation (1 correction round), Build &
Test, Operations. Matches `unit-of-work.md`'s own description: "the second project type, proving
the pipeline generalizes beyond sheds" - proven, with the regulatory content itself honestly held
non-`ACTIVE` pending the deferred post-POC professional-review milestone, exactly as directed.

**Proceeding to Unit 5: Vacant Land** (planning/Functional Design), per explicit instruction.

## UNIT 5: VACANT LAND — Functional Design Part 1 Presented 2026-08-27

Grounded in real research (Explore agent) before writing any question — confirmed the real story
cluster is VL-1 through VL-5 (`stories.md`, explicitly distinct from the `SRE-*` project-type
family — "does NOT use Project Configuration's proposed-structure concepts"), confirmed
`unit-of-work.md`'s exact scope/dependency text (Unit 2B + Unit 3, both complete; no technical
dependency on Unit 4). Found real, load-bearing gaps rather than assumed answers: (1)
`WorkflowType`/`ScreeningRequest.projectType`/`.projectDetails` are still single-member/
required-field shapes in actual code, despite Inception-level design docs (`services.md`,
`components.md`) already anticipating a second workflow type — never implemented; (2) zero
regulatory rule content exists for the real vacant-land question set (minimum lot size/density,
`SMC 23.44.060` never read anywhere in this repo) — Unit 0B's Track 2 sample covered only shed/
garage; (3) the only prior vacant-land artifact (`sample-reports.md`'s Sample Report 3) is an
illustrative mock-up, not researched content; (4) "vacant" exists in the codebase today only as a
`parcel-resolution` characteristic flag, never a workflow; (5) VL-1's own acceptance criteria
creates a real scope question (a non-vacant "intend to redevelop" parcel may also enter this
journey - undecided); (6) VL-3's buildable-area figure needs a genuinely new PostGIS capability
(buildable-envelope geometry, not the setback-distance machinery Units 1/4 already have) that this
project has never built. Wrote
`aidlc-docs/construction/plans/unit-5-vacant-land-functional-design-plan.md` with 5 questions
tied to these findings (schema shape; the redevelop edge case; whether to do a bounded regulatory
research pass now vs. defer VL-3/VL-4's content; whether to build real buildable-envelope geometry
or stay `REQUIRES_VERIFICATION`-only for this pass; whether to include the real customer-facing UI
now or defer it). Stopping at Unit 5's normal Functional Design Part 1 gate, matching every prior
unit's two-part-process discipline this session. Awaiting the founder's answers.

## UNIT 5: VACANT LAND — Functional Design Part 2 COMPLETE 2026-08-27, awaiting founder review

All 5 questions answered (Q1=B — a real `workflowType`-discriminated `ScreeningRequest` union,
not loosely-optional fields; Q2=C — an explicit `VacantLandScreeningIntent`
`VACANT_PARCEL`/`REDEVELOP_EXISTING_PARCEL` concept, never silently modeling a non-vacant parcel
as vacant; Q3=A; Q4=A with an explicit fail-closed evidence gate; Q5=A). Plus an explicit
"additional design invariant": Unit 5 is this project's first second-*workflow* implementation,
not a third project type — preserved structurally throughout.

**Bounded regulatory research performed live** (`SMC 23.44.020/.060/.070/.080/.090`, 23.44.060
read for the first time in this project) — `vacant-land-rule-inventory-and-tier-triage.md`, 15
candidates (U1-U15): **3 of 15 (20%) Tier 2** (U6 — a City-enforceable regulatory-agreement
discretionary mechanism; U8 — the same A.2.d height-scoping ambiguity inherited from Unit 4's H2;
U13 — the same Director-approval discretionary mechanism as Unit 4's L4), **12 of 15 Tier 1**. A
genuinely different distribution from Unit 4's 62% Tier 2, explained by real, disclosed structural
reasons, not forced or softened: (a) scenario-based evaluation (vacant land asks "what's plausible
here," not "does this specific proposal comply") genuinely sidesteps the "does an accessory
structure break 'entirely of dwelling units'" ambiguity that drove Unit 4's L5 to Tier 2 — U14 is
independently re-triaged to Tier 1 in this context, with Unit 4's own garage-context finding left
unchanged; (b) a real, useful `KNOWN`-quality finding was found — U1 (SMC 23.44.060.C.4.c: "at
least one dwelling unit is allowed on all lots in existence") answers the core "is this an
independently buildable lot" question cleanly for any parcel Property Resolution has already
confirmed. Real, disclosed evidence gaps remain independent of Tier — the same unresolved ECA
area-of-overlap capability Unit 4's BR-U4-7 found, plus a new "major transit service" 1/4-mile
data gap (distinct from, but the same class as, the existing "frequent transit service area" gap).

**All 4 standard artifacts complete**:
- `domain-entities.md` — the `workflowType`-discriminated `ScreeningRequest`/
  `ScreeningRequestSnapshot` union, `VacantLandScreeningIntent`, minimal `VacantLandDetails`
  (`{ screeningIntent }` only, per VL-1's "no Project Configuration step"), new
  `BuildableEnvelopeFacts` (fail-closed, discriminated `setbackConstrainedArea`/`ecaExclusionArea`
  results matching Unit 4's own discriminated-result discipline), `ResidentialUseScenario`/
  `ScenarioFigure` (multiple independently-`KNOWN`-or-`REQUIRES_VERIFICATION` scenarios, not one
  number), `VacantLandEvaluationOutcome` (reuses `Finding`'s existing classification vocabulary
  unchanged — no new classification concept).
- `business-rules.md` — BR-U5-1 through BR-U5-8: the discriminated-union rule, the
  `REDEVELOP_EXISTING_PARCEL` non-erasure requirement, the buildable-envelope fail-closed gate,
  scenario-based evaluation (with the U14 re-triage explained), no-`ACTIVE`-without-governance
  (deferred to the *same* post-POC milestone Unit 4 established — Unit 5's 15 candidates join
  Unit 4's 13 as one future combined review package, not a separate engagement), the distinct
  entry point requirement, the LLM-explains-never-determines boundary (VL-5), and the explicit
  subdivisions-out-of-scope reaffirmation.
- `business-logic-model.md` — Workflow U5-1 (intake, reusing Parcel Resolution unchanged),
  Workflow U5-2 (the new regulatory evaluation - buildability/use findings, `BuildableEnvelopeFacts`
  assembly, scenario assembly, diligence-risk surfacing), Workflow U5-3 (report assembly/
  explanation, reusing Units 2/2B's immutability/delivery/degradation machinery unchanged).
- `frontend-components.md` — a new screening-intent selector (distinct from `/configure`'s TYPE
  step, reusing existing address/parcel-resolution UI), a `VacantLandReportView` (scenario cards,
  buildable-envelope display with the same never-show-a-partial-polygon prohibition Unit 4's
  lot-coverage labeling rule established, a diligence-risks section reusing `FindingsList`'s
  existing pattern).

**Professional review remains deferred to the same post-POC "Regulatory Professional Review /
Commercialization Gate" milestone Unit 4 established** — not revisited, not a new engagement.

Plan file checkboxes marked `[x]`. Presenting Functional Design Part 2 for founder review; per
explicit instruction, **not** proceeding to NFR Requirements until reviewed.

## UNIT 5: VACANT LAND — Functional Design Part 2 CORRECTED 2026-08-27 (bounded 6-item correction
pass, per founder review), awaiting founder re-review

Founder reviewed the above Part 2 draft and requested changes: overall direction approved in
substance (`VACANT_LAND` as second `WorkflowType`, discriminated `ScreeningRequest`, explicit
redevelopment intent, separate UI, scenario-based evaluation, real PostGIS buildable-envelope
capability, `REQUIRES_VERIFICATION` on missing evidence, subdivisions out of scope, professional
review deferred post-POC) — explicit instruction not to restart broad regulatory research or expand
into FAR/tree standards/demolition law/easement law/subdivision procedure. Exactly 6 corrections
required and applied:

1. **U1 corrected** (`vacant-land-rule-inventory-and-tier-triage.md`): withdrawn the prior claim
   that a confirmed King County parcel record alone makes the buildability-floor finding `KNOWN`.
   Live-verified SMC 23.84A.024's actual "Lot" definition (fetched via `library.municode.com` —
   "a parcel of land that qualifies for separate development or has been separately developed...
   shall abut upon and be accessible from a private or public street sufficiently improved for
   vehicle travel or... an unobstructed permanent access easement... may not be divided by a street
   or alley") and added the existence-as-of-effective-date requirement (~January 21, 2026). U1
   stays Tier 1 (the rule text itself is unambiguous); its *applicability facts* are the genuinely
   unresolved part, now correctly `REQUIRES_VERIFICATION` by default. No Recorder/SDCI integration
   built.
2. **Density mechanics completed** (U16/U17, new): SMC 23.44.060.D.1 (fraction-rounding) and D.6+E
   (density-countable-lot-area ECA exclusions) modeled as real candidates and a new `DensityFacts`
   fact-pair (`rawParcelAreaSqFt`/`densityCountableLotAreaSqFt?`, fail-closed) — every U3-U7 density
   figure now uses the corrected countable divisor and D.1's rounding rule, never raw parcel area.
   Candidate count/Tier distribution recomputed honestly: **17 candidates, 3 Tier 2 (18%)** — not
   preserved at the prior "15/20%" for consistency.
3. **`BuildableEnvelopeFacts` made scenario-scoped**, not one global structure (Table A's setback
   envelope genuinely varies by scenario). New `LotLineRoles` concept documents that this unit's
   minimal UI has no placement step and therefore no mechanism to establish front/rear/side roles
   (`INSUFFICIENT` by honest default — SMC 23.84A.024's own "Lot line, front" definition shows this
   can even be a genuine Director-determined question for some lot configurations), so
   `setbackConstrainedArea` is `REQUIRES_VERIFICATION` for essentially every real evaluation today.
   Side-setback averaging (5 ft average/3 ft minimum) modeled as a labeled conservative 3 ft-
   minimum-only approximation (`isConservativeSideSetbackApproximation` flag), never a naive
   uniform buffer. Table A footnote exceptions independently `REQUIRES_VERIFICATION` when
   unestablished.
4. **Resolved a genuine self-contradiction**: the prior draft's `business-rules.md` (BR-U5-5)
   claimed Unit 5 candidates are never governance-drafted as `RegulatoryRule` rows, while
   `business-logic-model.md`'s Workflow U5-2 simultaneously evaluated SMC-derived numbers directly
   — meaning those numbers would have been hardcoded, bypassing the governed-rule lifecycle every
   prior unit respects. Fixed by adding a generalized `RegulatoryRuleApplicabilityScope`
   discriminated type (`{workflowType: EXISTING_PROPERTY, projectType} | {workflowType:
   VACANT_LAND}`), generalizing `applicableProjectType` — Unit 5's 17 candidates are now real,
   governed `RegulatoryRule` rows evaluated through the exact same evaluator path as every other
   unit, no `"vacant-land"` string shortcut, no parallel regulatory system. Direct consequence:
   since no Unit 5 candidate is ever `ACTIVE` in this unit (BR-U5-5, matching Unit 4's own
   precedent), Workflow U5-2 reinstates Unit 4's `uncoveredConstraintTypes`-style no-`ACTIVE`-
   coverage disclosure mechanism, correcting the prior draft's claim that it wasn't needed.
5. **New BR-U5-9** (Vacant-Land Screening Coverage Readiness), mirroring Unit 4's BR-U4-9 exactly:
   a public-advertisement layer (a coverage-readiness check gating the entry point, mirroring
   `available-project-types`) plus an authoritative server-side checkout layer, both required,
   staying `false` through the POC. Wired into Workflow U5-1 and `frontend-components.md`'s entry
   point.
6. **Documented the real persistence/migration consequence** of the `workflowType`-discriminated
   `ScreeningRequest` union: the actual `screening_requests` table's `project_type`/
   `project_details` columns become nullable, two new nullable columns (`screening_intent`,
   `vacant_land_details`) are added, and a database-level `CHECK` constraint enforces the
   discriminated invariant at the schema level — not left as a TypeScript-only invariant. Exact
   migration SQL deferred to Code Generation, per this project's established pattern.

All 4 standard artifacts (`domain-entities.md`, `business-rules.md`, `business-logic-model.md`,
`frontend-components.md`) plus `vacant-land-rule-inventory-and-tier-triage.md` updated in place.
Plan file status updated. Professional review remains deferred to the same post-POC milestone —
not revisited.

## UNIT 5: VACANT LAND — Functional Design FINAL CORRECTION APPLIED 2026-08-27 — APPROVED/COMPLETE

The founder approved all 6 corrections above and identified 3 further localized correctness defects
in that correction pass itself, all now fixed, no other topic reopened (explicit instruction not to
revisit U1 applicability, U16/U17 mechanics, scenario-scoped envelope architecture, `LotLineRoles`,
`RegulatoryRuleApplicabilityScope`, governed-rule lifecycle, BR-U5-9, the persistence migration,
redevelopment intent, professional-review sequencing, or inventory scope, and no further broad SMC
research performed):

1. **Side-setback approximation was backwards, now fixed**: the correction-pass draft applied U9's
   flat 3 ft minimum and labeled it "conservative" — mathematically wrong, since a 3 ft/3 ft
   condition averages to 3 ft, not the required 5 ft, and does not independently satisfy the
   averaging rule at all. Corrected to option A (the founder's preferred choice): a flat 5 ft on
   each averaging-governed side, labeled explicitly "conservative fixed-5-foot approximation,"
   understood to potentially understate (never overstate) the true maximum buildable area. No
   optimization engine built. Updated in `domain-entities.md`, `business-rules.md` BR-U5-3,
   `business-logic-model.md` Workflow U5-2, and `frontend-components.md`'s scenario-card labeling.
2. **ACTIVE-rule governance now applies uniformly to U1/U2, not only U3-U17**: the prior draft still
   described U2's permitted-use finding as "remains `KNOWN`," inconsistent with BR-U5-5's own
   confirmation that zero Unit 5 candidates reach `ACTIVE` in this unit. Corrected by splitting
   every buildability/use finding into **candidate semantics** (what the rule would determine once
   `ACTIVE`) vs. **current POC execution** (no `ACTIVE` U1/U2 rule ⇒ no governed finding produced,
   disclosed via the same no-`ACTIVE`-coverage mechanism as U3-U17) — Workflow U5-2 step 2,
   `vacant-land-rule-inventory-and-tier-triage.md`'s U1/U2 entries, and `frontend-components.md`'s
   buildability-findings section all updated to state this explicitly.
3. **`BuildableEnvelopeFacts`' ECA `KNOWN` branch corrected to carry real geometry, not an area
   scalar**: `ecaExclusionArea`'s `KNOWN` variant now requires `excludedGeometry`/`provenance`
   alongside `excludedAreaSqFt` — `ST_Difference` needs real geometry, an area number alone cannot
   produce `buildablePolygon`. `buildableAreaSqFt`/`buildablePolygon` stay `undefined` whenever
   geometry (not just area) is unavailable, never derived by subtracting a scalar. No new ECA
   geometry provider added — the correction is about structural correctness when exercised with
   synthetic/known geometry, not more frequent resolution today.
4. **Doc cleanup (non-blocking)**: fixed a stale U16/U17 cross-reference in the Density section
   intro (`vacant-land-rule-inventory-and-tier-triage.md`) that mislabeled U16 (density-countable
   lot area) as U17 — authoritative numbering restated inline: U16 = D.6+E, U17 = D.1.

**Unit 5 (Vacant Land) Functional Design is now APPROVED/COMPLETE.** Per explicit founder
instruction, no further Functional Design review gate is held absent a genuinely new regulatory,
governance, or spatial contradiction — **proceeding directly to NFR Requirements.**

## UNIT 5: NFR Requirements — assessed, recommended ✅ SKIPPED — no new NFR surface (pending founder
confirmation)

Assessed against the approved, twice-corrected Functional Design, the same way Unit 4's own NFR
Requirements assessment was reasoned through (`aidlc-docs/aidlc-state.md`'s Unit 4 section above):

- **Tech stack**: no new selection — Unit 5 reuses Next.js, Postgres, PostGIS, and the existing
  Vercel/Neon operational posture unchanged; no new library, service, or provider is introduced
  (explicit founder instruction, held to throughout: no new ECA/transit-area/Recorder data
  provider).
- **Performance**: the new PostGIS buildable-envelope capability (`ST_Difference`-class geometry
  operations, one per `ResidentialUseScenario`) is genuinely new *work*, but not a new
  computational *tier* — it runs inside the same Spatial Analysis/PostGIS layer and the same
  Report Generation Job/pipeline timeout-retry machinery Units 1/4's `computeSetbackDistances`/
  `computeParcelAreaSqFt` already use, unchanged. Its actual invocation frequency in the deployed
  POC is low by the Functional Design's own fail-closed gating (`LotLineRoles.status` is
  `INSUFFICIENT` by honest default, and the ECA `KNOWN` branch now requires real exclusion
  geometry, not just area) — the expensive path rarely reaches completion today, by design, not
  by oversight. No new performance benchmark or budget is introduced beyond the existing pipeline's.
- **Scalability**: bounded, small growth in per-request work (a handful of scenarios per
  evaluation, not an unbounded set) — no new scaling pattern, queue, or worker needed beyond the
  existing job pipeline.
- **Security**: no new trust boundary — all vacant-land facts (parcel boundary, `DensityFacts`,
  `BuildableEnvelopeFacts`) are server-derived exactly like every other unit's evidence, never
  client-supplied; the new `screening_intent`/`vacant_land_details` columns and `CHECK` constraint
  (Correction 6) are a data-integrity concern already fully specified in Functional Design, not an
  open security question. No new PII category.
- **Availability**: no new external dependency — Report Explanation's existing graceful-degradation
  behavior (RGD-5) is reused unchanged (Workflow U5-3 step 3).
- **Reliability**: the fail-closed evidence discipline (`REQUIRES_VERIFICATION`-by-default for U1,
  `LotLineRoles`, ECA geometry) is a Functional Design concern already fully specified, not an
  open NFR question.

**Recommended: SKIPPED — no new NFR requirements beyond the already-approved project baseline.**
Inherited, unreopened: server-side-only spatial computation; fail-closed evidence discipline;
deterministic regulatory conclusions; existing provenance/auditability; existing immutable
report/snapshot behavior; existing security/logging/privacy posture; existing accessibility
baseline; existing performance instrumentation/sanity posture; existing Vercel/Neon/PostGIS
operational posture. Presented for founder confirmation before proceeding to NFR Design.

## UNIT 5: NFR Requirements — REVISED, EXECUTED (targeted, delta-only) 2026-08-27, awaiting founder
review

**The founder rejected the SKIPPED recommendation** — correctly identifying two genuinely new
NFR-relevant surfaces the skip assessment under-weighted: (1) a load-bearing persistence/schema
generalization (`screening_requests`' `project_type`/`project_details` are `NOT NULL` today,
confirmed at `src/db/schema.ts:98-99` — Correction 6's discriminated union is a real migration-
safety question Unit 4 never had); (2) new PostGIS buildable-envelope geometry operations
(`ST_Difference`-class subtraction, materially different in kind from Unit 1/4's existing
distance/area-against-a-given-footprint measurements). Directed a **targeted, delta-only** pass
covering exactly 6 areas, explicitly not a full boilerplate NFR rewrite.

Wrote `aidlc-docs/construction/unit-5-vacant-land/nfr-requirements/nfr-requirements.md` (28
numbered requirements, NFR-U5-1 through NFR-U5-28, across the 6 founder-specified areas: data
integrity/migration safety; regulatory-rule scope backward compatibility; PostGIS geometry
correctness/reliability; performance/bounded work — soft requirements only, no unmeasured hard
numbers claimed; failure/degradation behavior; explicit inheritance of everything else) and
`tech-stack-decisions.md` (confirms no new tech stack/library/service — the migration reuses the
existing Drizzle/Postgres tooling, the geometry work reuses the existing PostGIS
extension/`postgis-adapter.ts`, timing/retry reuse the existing `withStageTiming`/Workflow SDK
machinery unchanged). Every requirement grounded against real current code
(`src/db/schema.ts`'s actual `NOT NULL` columns, `src/report-generation-orchestrator/
stage-timing.ts`'s real `withStageTiming`/`PipelineStage`, `src/report-generation-job/
repository.ts`'s real retry/stale-claim/`FAILED`-state mechanics), not invented in the abstract.
No migration mechanism prescribed (per instruction — the safety invariant is stated, mechanism
selection deferred to Code Generation). No new GIS library/service added. Plan file
(`unit-5-vacant-land-nfr-requirements-plan.md`) records the scope decision; no `[Answer]:` question
round was needed since the founder's own review message fully specified content.

Presenting the targeted NFR Requirements document for founder review; **not** proceeding to NFR
Design until approved, per explicit instruction.

## UNIT 5: NFR Requirements — ✅ APPROVED/COMPLETE 2026-08-27 (two localized consistency
corrections)

Founder approved in substance; applied exactly 2 corrections, everything else unchanged:

1. **Invalid input geometry vs. computation failure, distinguished**: NFR-U5-11/NFR-U5-14/
   NFR-U5-24 previously blurred two different conditions. Now explicit: (A) PostGIS *successfully
   evaluates* supplied geometry and determines it is invalid (`ST_IsValid` returns `false`) — a
   **data-quality/evidence condition**, fails closed to `REQUIRES_VERIFICATION`, no unapproved
   auto-repair, does **not** fail the report-generation job by itself; (B) the spatial operation
   itself cannot execute (PostGIS/topology exception, DB/runtime failure, timeout) — a
   **computation/runtime failure**, never regulatory uncertainty, follows the existing report-job
   failure/retry path (§5).
2. **No-`ACTIVE`-rule-coverage is not `REQUIRES_VERIFICATION` evidence**: withdrawn from
   NFR-U5-27's list. Three distinct states now stated explicitly and kept separate end to end: (1)
   evidence uncertainty → `REQUIRES_VERIFICATION` (a real `FindingClassification`); (2)
   governed-rule coverage absence → `uncoveredConstraintTypes`-style disclosure (not a
   `FindingClassification` at all); (3) computation/runtime failure → the existing job
   failure/retry path. NFR-U5-28 updated to distinguish computation failure from both of the other
   two, not just from evidence uncertainty.

`tech-stack-decisions.md` approved as written, unchanged. **Unit 5 NFR Requirements is now
APPROVED/COMPLETE.** Per explicit instruction, no further NFR Requirements review gate is held —
**proceeding directly to NFR Design.**

## UNIT 5: NFR Design — assessed, recommend a targeted 2-item pass (pending founder confirmation)

Per the founder's own instruction ("assess NFR Design separately; it may be similarly narrow"),
assessed the approved NFR Requirements against NFR Design's own categories (resilience,
scalability, performance, security patterns; logical components):

- **Resilience/failure-retry patterns**: no new pattern — NFR-U5-25/-26 already commit to reusing
  the existing `ReportGenerationJobState`/retry/stale-claim machinery unchanged; matches Unit 4's
  own NFR Design skip rationale exactly.
- **Performance patterns**: no new pattern — NFR-U5-21/-23 already commit to reusing
  `withStageTiming`/`STAGE_TIMING` unchanged, with one new `PipelineStage` tag, not a new
  instrumentation approach.
- **Security patterns**: no new pattern — no new trust boundary, all facts server-derived.
- **Scalability patterns**: no new pattern — NFR-U5-19/-20 already establish the bound (finite
  scenario set, no client-supplied geometry); no queue/cache/circuit-breaker is introduced.
- **Two genuine candidates remain, matching NFR Requirements' own two new surfaces**:
  1. **Migration rollout pattern** (NFR-U5-3's deferred mechanism selection) — a real
     resilience/reliability *pattern* choice (which safe-rollout shape: expand-migrate-contract vs.
     a feature-gated write path), arguably NFR Design's own job to select rather than deferring
     further to Code Generation.
  2. **Spatial computation result pattern** (a logical component) — NFR-U5-11/-14/-24's
     three-way distinction (data-quality condition / computation failure / success) is currently
     stated as a set of requirements, not yet a named, reusable pattern/component
     `postgis-adapter.ts`'s new buildable-envelope functions would implement consistently.

**Recommended scope**: a targeted, delta-only NFR Design pass covering exactly these 2 items (a
recommended migration pattern; a named spatial-computation-result pattern/component), with every
other category recorded as "no new pattern — inherited," matching Unit 4's own precedent
structure. Presented for founder confirmation before writing the full `nfr-design-patterns.md`/
`logical-components.md` artifacts, so scope is agreed before content is produced (mirroring how
the NFR Requirements skip recommendation was handled).

## UNIT 5: NFR Design — ✅ EXECUTED (targeted, delta-only) 2026-08-27, awaiting founder review

Scope approved; founder supplied the complete design content for both items directly. Wrote
`aidlc-docs/construction/unit-5-vacant-land/nfr-design/nfr-design-patterns.md`:

1. **Migration design pattern** — a staged **EXPAND → MIGRATE → APPLICATION ROLLOUT → ACTIVATE →
   CONTRACT/ENFORCE** rollout, binding invariant: database capability and `VACANT_LAND` write
   activation are separate events. EXPAND adds nullable columns/relaxed `NOT NULL` without enabling
   writes; MIGRATE backfills every row to `EXISTING_PROPERTY` byte-for-byte unchanged and
   generalizes `RegulatoryRule` applicability without changing existing SHED/GARAGE matching;
   APPLICATION ROLLOUT deploys workflow-aware, fail-closed-on-read code that can overlap MIGRATE in
   time; ACTIVATE enables `VACANT_LAND` writes only after rollout, independent of BR-U5-9's own
   commercial-readiness gate (data-layer safety never depends on the commercial flag);
   CONTRACT/ENFORCE finalizes the database `CHECK` constraint only once every deployed instance is
   rollout-compatible. Exact SQL/deployment mechanics remain Code Generation decisions; no new
   migration framework or feature-flag system introduced.
2. **Spatial computation result pattern** — a reusable `SpatialComputationResult<T>` boundary
   (`SUCCESS` / `DATA_QUALITY_UNRESOLVED` / `COMPUTATION_FAILURE`), formalizing NFR-U5-11/-14/-24's
   distinction as one named shape every new PostGIS adapter function implements consistently;
   exact TypeScript representation non-binding (a thrown typed error for `COMPUTATION_FAILURE` is
   explicitly acceptable); binding requirement is the semantic boundary alone.

Wrote `logical-components.md` making 4 existing layers' responsibility boundaries explicit
(Persistence/Migration; Spatial Analysis/PostGIS Adapter; Report-Generation Orchestrator;
Regulatory Evaluator) — critically, that the Spatial Analysis adapter never performs regulatory
classification and the Regulatory Evaluator never catches an infrastructure failure and converts
it into a `Finding`, the concrete mechanism making NFR-U5-27/-28's three-way distinction
structurally hard to re-collapse. Every other NFR Design category (auth, PII, secrets, external-
service resilience, Vercel Workflow retry, job state machine, observability, deployment topology,
backup/recovery, accessibility, scaling) recorded as inherited unchanged, no new infrastructure/
service/queue/cache/GIS library/APM product/auth mechanism. Presenting for founder review; not
proceeding past NFR Design until approved.

## UNIT 5: NFR Design — ✅ APPROVED/COMPLETE 2026-08-27 (one migration-ordering correction)

Founder approved in substance; applied exactly 1 correction. The migration pattern's write-
activation phase was sequenced *before* the database `CHECK` constraint's finalization — a real
gap where a `VACANT_LAND` row could be written while the database was not yet authoritative for
the workflow-shape invariant, relying on application validation alone during that window.
Corrected to 6 phases: EXPAND → MIGRATE → APPLICATION ROLLOUT → **PRE-ACTIVATION ENFORCEMENT**
(new — apply/verify the `CHECK` constraint, before any `VACANT_LAND` row is ever written) →
ACTIVATE → CONTRACT/CLEANUP. The database-integrity gate (Phase 4) now always closes before the
commercial-availability gate (BR-U5-9) is even relevant — restated explicitly: a `VACANT_LAND` row
created internally pre-commercial-launch is always already protected by the database-level
invariant, never by application code alone. `logical-components.md`'s cross-references to the old
5-phase sequence updated to match. Everything else (`SpatialComputationResult<T>`, the 3-state
distinction, typed-error latitude, adapter/orchestrator/evaluator boundaries, `STAGE_TIMING` reuse,
all inherited patterns, no new infrastructure) approved unchanged.

**Unit 5 NFR Design is now APPROVED/COMPLETE.** Per explicit instruction, no further NFR Design
review gate is held — **proceeding directly to Infrastructure Design.**

## UNIT 5: Infrastructure Design — assessed, recommend ✅ SKIPPED — no new infrastructure (pending
founder confirmation)

Assessed against the approved, twice-corrected Functional Design and the approved NFR Design, the
same way Unit 4's own Infrastructure Design assessment was reasoned through
(`aidlc-docs/aidlc-state.md`'s Unit 4 section above — "Matches Unit 3's own precedent exactly"):

- **Deployment environment**: unchanged — same Vercel deployment, no new environment/target.
- **Compute infrastructure**: unchanged — the new buildable-envelope computation runs inside the
  existing Report Generation Job/Workflow SDK compute path (NFR-U5-21/-25, `nfr-design-patterns.md`
  §1/§3's Report-Generation Orchestrator boundary), no new compute service or sizing decision.
- **Storage infrastructure**: the `screening_requests`/`regulatory_rules`-equivalent tables are
  **extended in place** (nullable columns + `CHECK` constraint, the approved 6-phase migration
  pattern) on the existing Neon/Postgres database — not a new database, not a new storage service.
- **Messaging infrastructure**: unchanged — no new queue/event system; the existing Workflow
  SDK/job pipeline is reused unchanged (NFR-U5-25).
- **Networking infrastructure**: unchanged — no new API gateway, load balancer, or network
  topology; the new vacant-land entry point (`frontend-components.md`) is additional routes on the
  existing Next.js/Vercel deployment, not a new network boundary.
- **Monitoring infrastructure**: unchanged — `STAGE_TIMING`/`withStageTiming` reused with one new
  `PipelineStage` tag (NFR-U5-21), no new observability tooling or product.
- **Shared infrastructure**: unchanged — no new multi-tenancy or resource-isolation concern; Unit
  5 shares the exact same Vercel/Neon/PostGIS infrastructure every prior unit already uses, per
  NFR Design's own explicit "no new Vercel service, no new deployment target" statement.

**Recommended: SKIPPED — no new infrastructure beyond the already-approved project baseline.**
This is the migration *design pattern*'s (NFR Design §1) natural infrastructure-layer consequence:
extending an existing table in place, on the existing database, is not a new infrastructure
service to map. Presented for founder confirmation before proceeding to Code Generation.

## UNIT 5: Infrastructure Design — ✅ SKIPPED/APPROVED 2026-08-27 — no new infrastructure

Founder confirmed: Unit 5 introduces no new infrastructure resource, service, deployment target,
queue, cache, storage system, network boundary, provider, secret, or observability product. All
approved changes remain entirely inside the existing Vercel/Next.js deployment, Neon/PostgreSQL,
PostGIS Spatial Analysis layer, Report Generation Job/Vercel Workflow execution path, Drizzle
migration tooling, and `STAGE_TIMING` instrumentation. The migration rollout mechanics are governed
by the approved NFR Design, not a reason to introduce new infrastructure. **Proceeding directly to
Unit 5 Code Generation, Part 1 (grounded plan).**

## UNIT 5: Code Generation Part 1 — DRAFT 2026-08-27, awaiting founder review

Dispatched a real, read-only Explore-agent codebase audit covering all 15 founder-specified areas
before writing the plan. **Headline findings** (full detail in `unit-5-vacant-land-code-generation-
plan.md`): (1) `WorkflowType` is not on the `ScreeningRequest` TypeScript interface at all today —
it exists only as a DB column (`NOT NULL DEFAULT 'EXISTING_PROPERTY'`) that `repository.ts:26`
hardcodes on every insert; Unit 5 introduces the field to the app layer for the first time, not
merely a second enum member; (2) `applicableProjectType` is a plain `text` column — mechanically a
`"vacant-land"` value would compile, but Functional Design's Correction 4 forbids that shortcut, so
the plan adds a new, separate nullable `applicable_workflow_type` column instead, keeping the
existing SHED/GARAGE-governing column completely untouched; (3) `expectedConstraintTypesFor`'s
compile-time-exhaustive switch (`evaluate.ts:81-99`) stays untouched — vacant-land gets its own
`evaluateVacantLand` entry point, never routed through `evaluateProject`, confirmed compatible with
the founder's own item-5 instruction; (4) the garage rollout's real rule-content pattern is
fixture-based (`tests/fixtures/{shed,garage}-candidate.ts` for real DRAFTED content,
`test-only-active-rules.ts` for synthetic ACTIVE test fixtures) — U1-U17 follow the identical
pattern, no new content-storage mechanism; (5) Unit 4's coverage-readiness precedent
(`isGarageScreeningCoverageReady`, a hardcoded-`false` function plus a tiny client-safe route) is
mirrored exactly for vacant-land. **No genuine incompatibility requiring reopening Functional
Design/NFR Requirements/NFR Design/Infrastructure Design was found.**

Wrote `aidlc-docs/construction/plans/unit-5-vacant-land-code-generation-plan.md` — 13 ordered steps
covering all 15 founder-specified areas (domain types; the real 8-file list of unconditional
`projectType`/`projectDetails` call sites; the persistence EXPAND/MIGRATE phases grounded in the
actual current schema — including the finding that no data backfill is actually needed since the
column default already covers every existing row; `RegulatoryRuleApplicabilityScope`'s concrete
two-column DB design; the new, separate `evaluateVacantLand` module; `DensityFacts`/U17's rounding
rule as a new named pure function, grounded in the audit's finding that no rounding utility exists
anywhere in this codebase today; `SpatialComputationResult<T>` implemented as a thrown typed error
for `COMPUTATION_FAILURE` — matching `postgis-adapter.ts`'s existing throw-on-failure convention
exactly, per NFR Design's own explicitly-endorsed latitude — plus a returned two-variant result for
`SUCCESS`/`DATA_QUALITY_UNRESOLVED`; the corrected fixed-5-foot side-setback approximation; the
Vacant-Land Screening Coverage Readiness mirror; the separate customer-journey entry point; report
rendering extending the existing single-inline-component convention `app/report/page.tsx` already
uses rather than introducing new extracted components; a concrete, grounded test plan naming real
new test files matching the existing `tests/<domain>/`-plus-feature-prefix convention; and the
remaining NFR Design rollout phases sequenced explicitly, including confirming CONTRACT/CLEANUP has
nothing to do since no transitional compatibility code is introduced in the first place). No
implementation code written. Presenting Part 1 for founder review, per explicit instruction; not
proceeding to Part 2 (generation) until approved.

## UNIT 5: Code Generation Part 1 — ✅ APPROVED 2026-08-27 (two narrow persistence corrections)

Founder approved in substance; applied exactly 2 corrections. (1) Step 5's `RegulatoryRule`
applicability generalization: `applicable_project_type` made nullable (not left `NOT NULL`) so a
`VACANT_LAND` rule row never carries a bogus shed/garage value — the DB representation now mirrors
`RegulatoryRuleApplicabilityScope` structurally (`EXISTING_PROPERTY` requires
`applicable_project_type` present; `VACANT_LAND` requires it `NULL`), with existing rows preserved
unchanged and explicitly backfilled to `applicable_workflow_type = 'EXISTING_PROPERTY'`, plus a new
DB-level `CHECK` constraint at PRE-ACTIVATION ENFORCEMENT. (2) New Step 9b —
`isVacantLandPersistenceWriteEnabled()`, a narrow, hardcoded-`false`-by-default server-side gate
kept **structurally separate** from `isVacantLandScreeningCoverageReady()` (commercial readiness) —
three distinct states (schema capability / persistence-write activation / commercial readiness)
now named explicitly; `POST /api/screening-requests` rejects a `VACANT_LAND` write while this gate
is `false`, independent of commercial-readiness's own value. Step 13's terminology corrected:
"ACTIVATE" refers only to this data-layer gate; the later, out-of-scope commercial event is never
called that. 5 new tests added to Step 12's plan. **Code Generation Part 1 is now APPROVED.** No
further Part 1 review gate is held, per explicit instruction — proceeding directly to Part 2
(implementation).

## UNIT 5: Code Generation Part 2 — ✅ COMPLETE 2026-08-27 — typecheck/tests/build all pass

All 13 Part 1 steps implemented for real. `npm run typecheck` (0 errors), `npm test` (274/274
passing — all 240 pre-existing tests unchanged plus 34 new), and `npm run build` (clean production
build, new `/vacant-land` and `/api/screening-requests/available-vacant-land-coverage` routes
registered) all pass.

**Files created**: `src/regulatory-rules-engine/vacant-land-types.ts` (domain types),
`vacant-land-density.ts` (U17's real fraction-rounding rule), `evaluate-vacant-land.ts` (the
separate vacant-land evaluator), `tests/fixtures/vacant-land-candidate.ts` (real U1 fixture,
mirroring `garage-candidate.ts`), `app/vacant-land/page.tsx` (the separate customer journey),
`app/api/screening-requests/available-vacant-land-coverage/route.ts`, plus 5 new test files (34
tests) covering workflow-discriminated parsing, migration/CHECK invariants (deterministic parts),
rule-scope matching, no-`ACTIVE`-coverage disclosure, U1's candidate-semantics-vs-POC-execution
split, U17's rounding rule, the density-divisor fail-closed default, and the PostGIS adapter's
deterministic short-circuit paths.

**Files changed**: `src/db/schema.ts` (nullable `screening_requests`/`regulatory_rules` columns +
2 new `CHECK` constraints, generated as 2 separate migrations `0005`/`0006` per NFR Design's
corrected phase ordering — `0006` includes explicit MIGRATE-phase backfill SQL), `src/screening-
request/types.ts` (the real `ScreeningRequest`/`ScreeningRequestSnapshot` discriminated union,
introduced to the app layer for the first time per the audit's own headline finding),
`repository.ts`/`authorization.ts`/`checkout-fulfillment/index.ts`/`app/api/screening-requests/
route.ts` (workflow-first branching at every call site the audit identified, plus the new
`isVacantLandScreeningCoverageReady`/`checkVacantLandCheckoutEligibility`/
`isVacantLandPersistenceWriteEnabled` gates), `src/regulatory-rule-governance/types.ts`/
`lifecycle.ts`/`repository.ts` (the real `RegulatoryRuleApplicabilityScope` two-column DB design),
`src/spatial-analysis/postgis-adapter.ts` (the new `SpatialComputationError` class plus
`computeSetbackConstrainedArea`/`computeEcaExclusionGeometry`/`computeBuildableEnvelope`, each
implementing the `SUCCESS`/`DATA_QUALITY_UNRESOLVED`/`COMPUTATION_FAILURE` boundary exactly as NFR
Design specified, including a real `ST_IsValid` check), `src/spatial-analysis/types.ts` (new
`MultiPolygon` type), `src/report-generation-orchestrator/pipeline.ts` (the new sibling
`runVacantLandPipeline` branch, sharing the outer try/catch so a thrown `SpatialComputationError`
routes into the existing job-failure path unchanged), `app/report/page.tsx` (a new scenario-cards
section, entirely additive — the existing findings/uncovered-constraint-types rendering already
worked generically with zero changes).

**3 real, disclosed scope limitations** (stated plainly in
`unit-5-vacant-land-code-generation-plan.md`'s own closing section, not hidden): (1) one
representative scenario (`GENERAL_DENSITY`) implemented end-to-end rather than the full
U3-U7/U14-U15 family, explicitly anticipated as acceptable by `domain-entities.md` itself; (2) the
setback-constrained-area computation uses a uniform inward `ST_Buffer` at the largest applicable
setback rather than a true differential per-edge offset — a disclosed, honest POC simplification,
not a silently-cut corner; (3) no PostGIS `.integration.test.ts` was written for the new geometry
functions since this sandboxed environment has no live database connection (confirmed no
`DATABASE_URL`) — only the deterministic short-circuit paths (which are the actual production
default today) are tested; flagged as real follow-up work, not silently skipped. Only U1 was built
as a full real candidate fixture, matching Unit 4's own L1-only precedent exactly.

Presenting Code Generation for founder review per the standard 2-option completion message.

## UNIT 5: Code Generation — ✅ APPROVED/COMPLETE 2026-08-27 (six material corrections, real
implementation fixes, not design changes)

Founder reviewed the fresh full-repository archive and found 6 real defects. All 6 corrected;
`npm run typecheck` (0 errors), `npm test` (312/312 — 240 original + 34 first-pass + 38 new), and
`npm run build` (clean) all re-verified after every correction. Full technical detail in
`unit-5-vacant-land-code-generation-plan.md`'s own closing section; summary:

1. **Governed-content invariant restored** — all 17 real candidates (U1-U17) now exist as
   non-`ACTIVE` fixtures (previously only U1); U17's 0.85 rounding threshold and U9's setback
   numbers are no longer hardcoded anywhere in application code — both sourced exclusively from
   ACTIVE `RegulatoryRule` content (`VACANT_LAND_FRACTION_ROUNDING`, `VACANT_LAND_SETBACK`), absent
   → `NO_ACTIVE_COVERAGE`, zero PostGIS call; scenario citations derived exclusively from real
   `appliedRule.citation`, never a static list.
2. **Three-state `ScenarioFigure`/`SetbackConstrainedAreaResult`** — `NO_ACTIVE_COVERAGE` is now
   genuinely distinct from `REQUIRES_VERIFICATION` throughout; no-ACTIVE-coverage never produces a
   diligence-risk Finding (test-verified).
3. **VL-4's bounded 4-scenario family implemented** — `GENERAL_DENSITY`/`SMALL_LOT_BONUS`/
   `TRANSIT_BONUS`/`STACKED_MULTI_UNIT`, replacing the prior single-scenario draft, each
   independently sourced (test-verified no cross-scenario leakage).
4. **Real persisted-shape validation + genuinely staged migration execution** — new
   `screening-request/hydrate.ts` module (zod-discriminated, `.strict()` cross-workflow rejection,
   13 tests) replaces every unsafe `as` cast; the PRE-ACTIVATION ENFORCEMENT migration moved out of
   the normal `db:migrate` chain into a separate, explicit `npm run db:enforce-vacant-land` command
   (5 tests proving the separation) — the staged rollout (EXPAND → rollout → ENFORCEMENT →
   persistence-write activation) is now actually executable as designed, not merely documented.
5. **Spatial buildable-envelope contract corrected** — `rawParcelAreaSqFt ?? 0` removed (genuinely
   optional throughout); real per-edge differential PostGIS setback subtraction replaces the
   uniform-max-buffer misrepresentation, consuming actual lot-line-role edge references; the
   side-averaging branch now applies 5 ft on each SIDE line specifically; `footnoteExceptionStatus`
   genuinely gates the final buildable area/polygon; a new `EmptyGeometry` type + `Polygon.holes`
   field fix the unsafe empty-geometry sentinel and previously-dropped interior rings; `ST_IsValid`
   now checked on supplied ECA geometry too (9 new deterministic geometry-conversion tests,
   independent of a live database).
6. **Public vacant-land readiness fails closed** — `app/vacant-land/page.tsx` now renders only a
   plain unavailable message while `isVacantLandScreeningCoverageReady()` is `false` (the real
   default); no journey step is reachable through the public route.

Two gaps disclosed, not silently skipped, and logged as new `external-verification-tracker.md`
items (15: no live PostGIS integration run, no `DATABASE_URL` in this environment; 16: no
component-level test for the fail-closed page, no React testing infrastructure in this project) —
both matching this project's own established discipline for the shed/garage browser-smoke gaps.

**Unit 5 Code Generation is now APPROVED/COMPLETE.** Per explicit instruction, no further Code
Generation review gate is held — **proceeding directly to Build & Test.**

## UNIT 5: Build & Test — ✅ COMPLETE 2026-08-27

Updated all 5 shared `aidlc-docs/construction/build-and-test/*.md` documents with real Unit 5
results (build-instructions.md, unit-test-instructions.md, integration-test-instructions.md,
performance-test-instructions.md, build-and-test-summary.md), following the exact per-unit-section
pattern Units 1-4 already established. Real, actually-run figures: `npm run typecheck` clean;
`npm test` **312/312 passing**, 50 files (72 new across 8 files); `npm run build` clean, 2 new
routes registered (`/vacant-land`, `/api/screening-requests/available-vacant-land-coverage`); 2
new Drizzle migration files, one in the normal chain (0005 EXPAND-only) and one deliberately
outside it (the manual PRE-ACTIVATION ENFORCEMENT migration, applied only by the new
`db:enforce-vacant-land` script). Two real, disclosed gaps added to
`external-verification-tracker.md` (item 15: no live PostGIS geometry execution, no `DATABASE_URL`
in this sandbox; item 16: no component-level test for `/vacant-land`'s fail-closed rendering, no
React testing infrastructure in this project) — neither fabricated as passing, both following this
project's own established discipline for the shed/garage browser-smoke gaps (items 4/14). All 240
pre-Unit-5 tests remain unchanged/passing throughout.

Presenting Build & Test for founder review per the standard completion message; not proceeding to
Operations until approved.

## UNIT 5: Operations COMPLETE; Unit 5 Itself COMPLETE — 2026-08-27

Founder approved Build & Test with no corrections. Wrote
`aidlc-docs/operations/unit-5-operations-runbook.md` as a genuinely delta-only document (mirroring
Unit 4's own runbook structure exactly) covering the 7 requested sections: (1) the vacant-land
operational/commercial state as three independent gates (schema capability / persistence-write
activation / commercial readiness — none inferred from the others), with a `curl`-based
verification procedure for each; (2) the staged database rollout (EXPAND →
application-rollout → `npm run db:enforce-vacant-land` PRE-ACTIVATION ENFORCEMENT → verify →
persistence-write activation → commercial activation, the last explicitly out of Unit 5
Operations' own scope) with rollback/recovery guidance; (3) a 4-row rule-governance
disambiguation table (no-`ACTIVE`-coverage / unexpectedly `DISABLED` / evidence
`REQUIRES_VERIFICATION` / actual failure); (4) the three-way spatial failure diagnostic table
(data-quality-evidence / no-`ACTIVE`-coverage / computation failure), including how to actually
read a `SpatialComputationError`'s own message; (5) the buildable-envelope expected-behavior
section, explicitly naming a real granularity gap found while writing this section — the
`runVacantLandPipeline`'s `RULES_ENGINE`/`ARTIFACT_PERSISTENCE`/`REPORT_EXPLANATION`
`withStageTiming` calls reuse the existing stage tags rather than a new dedicated one, a real,
disclosed scope-narrowing from what NFR Design's own text anticipated, found and stated here
rather than left for someone else to discover — plus the conservative-fixed-5-foot-approximation
labeling invariant; (6) both external-verification-tracker items (15, 16) kept explicitly OPEN,
with a concrete verification checklist for each, no fabrication; (7) an explicit "no new
operations surface" confirmation. Writing the runbook exposed one real documentation-worth
granularity finding (item 5 above) but no operational correctness, migration-safety, security, or
data-integrity defect, so no additional review gate was held, per explicit instruction.

**Unit 5 (Vacant Land) is now fully COMPLETE** — all 7 Construction stages approved (Functional
Design, NFR Requirements, NFR Design, Infrastructure Design [skipped], Code Generation, Build &
Test, Operations). Unit 5 is this project's first second-*workflow* implementation, proven
end-to-end: a real `workflowType`-discriminated persistence layer with a genuinely staged,
executable rollout; a generalized governed-rule-applicability mechanism reused by a second
workflow without a parallel content system; a real PostGIS buildable-envelope capability with an
honest, fail-closed evidence posture; and a fully separate, fail-closed customer journey — with
every external-verification gap tracked, not fabricated, matching this project's discipline since
Unit 0. **Proceeding to Unit 6 (Optional Accounts) per the approved Construction plan
(`unit-of-work.md`).**

## UNIT 6 (Optional Accounts) — Functional Design Part 1 Presented, 2026-08-27, awaiting founder
answers

Dispatched a real, read-only Explore-agent codebase audit before writing anything. **Headline
findings**: (1) no Account concept exists in code at all today — zero `account`/`user` files,
tables, or types anywhere in `src/`; ACC-1 (guest checkout) is the only Epic 6 story already
implemented; (2) no customer authentication mechanism exists anywhere — the only auth in this
codebase is admin-only single-operator Basic Auth, and `shared/cookies.ts`'s own design comment
already establishes the "cookie is a transport, never a session store, always re-validated
server-side" philosophy a customer mechanism would need to extend; (3) ACC-2's own acceptance
criteria names three candidate proof-of-control mechanisms for linking a guest purchase, none
implemented; (4) **no retention/deletion policy exists anywhere in this project** — a real,
load-bearing gap ACC-4 cannot be designed around without a founder decision; (5) PC-3 (save/
resume) is explicitly flagged as lower-priority/negotiable in its own story text, with zero schema
support today; (6) confirmed Unit 3's real dependency surface for Unit 6 is the existing
admin-action-log/refund-audit trail, not a dispute/Support Case system (which `unit-of-work.md`
itself defers to Unit 9's ADM-9, not yet built) — flagging a real gap between `unit-of-work.md`'s
own stated rationale and what Unit 3 actually built, surfaced rather than silently assumed.

Wrote `aidlc-docs/construction/plans/unit-6-optional-accounts-functional-design-plan.md` with 5
questions, each tied to one of these real findings (Q1: customer authentication mechanism —
magic-link vs. password vs. other; Q2: ACC-2's proof-of-control mechanism; Q3: the
account/report retention-deletion policy itself, genuinely undefined project-wide; Q4: whether
PC-3 is in scope for Unit 6 or deferred; Q5: confirming the real, narrower Unit 3 dependency
surface). `requirements.md §2.4`'s own "minimum scope, not a general-purpose user platform"
directive is taken as the design default, not re-asked. Stopping at Unit 6's normal Functional
Design Part 1 gate, matching every prior unit's own two-part-process discipline this session.
Awaiting the founder's answers.
