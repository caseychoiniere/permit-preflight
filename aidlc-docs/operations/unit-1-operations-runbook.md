# Unit 1 Operations Runbook

## Scope of This Document

There is **no deployed Permit Preflight runtime** at this point in the project — Unit 1
("Deterministic Evaluation Foundation") is internal domain logic, tooling, and tests only, per
its approved Infrastructure Design. This runbook is scoped accordingly: it covers what actually
exists and what an operator (currently: the founder, working locally) actually needs to do.
Production-service concerns are marked **N/A** below with the reason, not filled in speculatively.

## 1. Running Internal Scripts/Tooling Safely

There is no CLI or admin tool yet (that's Admin/Support Service, Unit 3 — ADM-1 through ADM-9).
Everything in `src/` is a plain TypeScript library, invoked today only from `tests/`. If a
developer needs to exercise a function directly (e.g., to manually inspect a `RegulatoryRule`
lifecycle transition), the safe pattern is:

- Never write throwaway scripts that skip the exported functions' required parameters (e.g.
  `founderIdentity`) to "make it easier" — every governance transition function requires an
  explicit human-identity argument by design (BR-6/BR-7/RRAG-8); a script that hardcodes a fake
  identity to save typing silently defeats that guardrail.
- Never point ad hoc scripts at a production database — there isn't one yet, but this rule holds
  going forward. Use a local `.env` pointed at an isolated dev/test database only.
- Prefer adding a proper test (`tests/`) over a one-off script when the goal is "prove this
  behavior works" — the deterministic suite is already the source of truth for correctness.

## 2. Running Tests

```bash
npm test                  # deterministic suite - no network/DB/credentials, safe to run anywhere, anytime
npm run test:integration  # live King County/Legistar (no creds needed) + Neon/Anthropic (skip cleanly without creds)
npm run typecheck         # tsc --noEmit
```

`npm test` is safe to run in any environment with no setup. `npm run test:integration` is also
safe to run with no setup — the King County/Legistar tests hit real public endpoints (read-only,
no write/mutation risk), and the Neon/Anthropic tests self-skip without credentials rather than
erroring. See `aidlc-docs/construction/build-and-test/integration-test-instructions.md` for the
full per-suite breakdown.

## 3. Diagnosing Source Failures

Every external-source failure surfaces as a structured JSON log line via `src/shared/logger.ts`
(e.g. `{"event":"SOURCE_FAILURE","factType":"...","dataset":"..."}`), and as an
`availabilityState: "SOURCE_ERROR"` fact on the resulting `PropertyContext` — never a silent
default. To diagnose:

1. Check console/log output for `SOURCE_FAILURE` events — they name the exact `factType` and
   `dataset` that failed.
2. For parcel resolution specifically, a source failure produces `RESOLUTION_UNAVAILABLE` (never
   `NO_MATCH`) with an `unavailabilityDetail.failureNature` field describing why.
3. A live-source failure may indicate an upstream outage, rate limit, schema change, or an
   adapter defect. Re-run the integration test and inspect the current source response before
   assigning cause — `src/shared/retry.ts`'s bounded retry already absorbs purely transient
   failures (3 attempts, per `DEFAULT_RETRY_POLICY`), so a failure that survives that shouldn't be
   assumed upstream without checking.
4. A schema-validation failure (`"...failed validation: ..."` errors) means the upstream response
   shape changed — check the failing field against the live response directly (as was done for
   the Legistar defect found during Build & Test) before assuming the adapter code is wrong.

## 4. Applying Database Migrations Safely (once a dev/test database exists)

No live Neon database has been provisioned in this project yet (tracked as an open item — see
`external-verification-tracker.md`). Once one is:

1. **Use an isolated Neon dev/test branch or project — never a production database** (there isn't
   one yet, but this is the standing rule for all future migrations too).
2. Set `DATABASE_URL` in `.env` (never commit it — already gitignored).
3. Run `npm run db:migrate` (`drizzle-kit migrate`), which applies
   `src/db/migrations/0000_*.sql` (schema) and `0001_enable_postgis.sql` (extension) in order.
4. Verify: `npm run test:integration` — this activates `tests/db/schema.integration.test.ts`,
   which checks the PostGIS extension is enabled and round-trips both persisted entity types.
5. A migration is not considered verified against Neon until that test suite passes for real —
   per the user's explicit instruction, this must stay a visible open item, not be assumed.

## 5. Rule-Governance Operations — How Human Approval Is Preserved

There is no operator UI for the `RegulatoryRule`/`InferencePolicy` lifecycle yet (Unit 3's job).
Today, the lifecycle functions in `src/regulatory-rule-governance/lifecycle.ts` are only invoked
from tests. The invariant that matters operationally, once a real operator interface exists:

- Every state-advancing function (`triage`, `sourceVerify`, `approve`, `activate`, `supersede`)
  requires an explicit human-identity parameter (`founderIdentity`) — there is no code path that
  advances a rule's lifecycle without one.
- `sourceVerify` structurally requires an `escalatedProfessional` record for Tier 2 rules — a
  Tier 2 rule cannot be marked source-verified by the founder alone.
- No AI-facing code (`rule-research-assistant/`) has any dependency on `lifecycle.ts` at all —
  verified by a standing test (`tests/rule-research-assistant/research.test.ts`) — so this
  invariant cannot silently erode as the codebase grows.
- **Whoever eventually builds the Unit 3 operator interface must call these functions directly
  with a real recorded identity** — it must never construct a shortcut that bypasses them. This
  runbook entry exists specifically so that requirement isn't forgotten between now and Unit 3.

## 6. Credentials / Environment Configuration

- All credentials are environment-variable-only (`DATABASE_URL`, `ANTHROPIC_API_KEY`) — see
  `.env.example`. `.env` is gitignored; never commit real values.
- Deterministic tests (`npm test`) require and use none of them.
- Neither credential is ever written to a log line or included in an error message (verified
  during Build & Test — see `build-and-test-summary.md`'s "Security / Provenance Checks").
- No secrets manager exists yet — deferred to real production deployment per Infrastructure
  Design, and there's no infrastructure yet that would need one.

## 7. Tracking the Remaining External-Verification Checks

See `aidlc-docs/operations/external-verification-tracker.md` — the two Build & Test items
(Neon/PostGIS live verification, Anthropic live verification) that were explicitly *not* run in
any sandbox this project has used so far. They remain open, tracked items, not silently-assumed
"done."

## 8. What's Explicitly N/A Right Now

The following are standard Operations-phase concerns that do **not** apply yet, because there is
no deployed runtime, no customer traffic, and no production service:

| Concern | Status | Why |
|---|---|---|
| Production alerting/monitoring | N/A | No deployed service to monitor. |
| Incident response for a public service | N/A | No public service exists. |
| Customer support operations | N/A | No customers, no product surface yet (Unit 2+). |
| Scaling operations | N/A | Nothing is under load. |
| Deployment/rollback procedures | N/A | Nothing is deployed. |
| On-call procedures | N/A | No live service to be on call for. |

These become relevant once a later unit (Unit 2 onward) actually deploys something — revisit this
document's scope at that point rather than building this out speculatively now.
