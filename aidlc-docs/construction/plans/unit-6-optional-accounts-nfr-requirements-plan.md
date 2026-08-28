# Unit 6: Optional Accounts — NFR Requirements Plan

**Status: COMPLETE 2026-08-27 — founder-directed, targeted, delta-only.** No `[Answer]:` question
round was needed — the founder's own directive message (logged verbatim in `audit.md`,
`2026-08-27T11:30:00Z`) fully specified the 9 scope areas and their content. This plan records that
scope decision, matching the precedent set by Unit 5's own founder-directed NFR Requirements pass
(`unit-5-vacant-land-nfr-requirements-plan.md`).

## Why these 9 areas, not a full boilerplate rewrite

Unit 6 is the first unit in this project to introduce **customer-facing authentication** in any
form — every prior unit's only auth surface was Unit 3's single-operator admin Basic Auth. That is
a genuinely new class of risk (bearer-credential handling, session lifecycle, cross-account data
isolation, concurrent-request races on shared state) this project has not previously had to specify
requirements for. The 9 areas map directly to the concrete mechanisms Functional Design (as
corrected) actually introduced:

1. Magic-link/token security → `MagicLinkToken`, the fragment-to-POST transport pattern.
2. Customer session security → `AccountSession`, `ACCOUNT_SESSION_COOKIE`.
3. Authorization/data isolation → `AccountOrderLink`, BR-U6-4's two-mode report-access model.
4. Concurrency/transactional integrity → the atomic token-consumption primitive, the LOGIN
   transaction, `AccountOrderLink.orderId`'s race-safe uniqueness.
5. Privacy/deletion → BR-U6-5's precise delete/retain split.
6. Auth-endpoint abuse resistance → three new publicly reachable, email-triggering endpoints
   (`requestLoginLink`, `verifyLoginLink`/`completeClaimByEmail`, `claimPurchase` Path A) that did
   not exist before this unit.
7. Email delivery/failure behavior → reuses `email-delivery/resend-client.ts`, but for a new,
   security-sensitive purpose (authentication, not just report delivery).
8. Performance/retention → new tables (`accounts`, `magic_link_tokens`, `account_sessions`,
   `account_order_links`), modest scale expectations stated explicitly rather than assumed.
9. Explicit baseline inheritance → every category genuinely unaffected, stated rather than omitted
   silently (payment/refund, report generation/immutability, admin auth, deployment topology,
   backup/recovery, accessibility).

**Scope discipline, per explicit instruction**: targeted, delta-only — no rewrite of unrelated
project-wide NFRs. No new tech stack, service, or vendor (Redis, distributed rate limiter, CAPTCHA)
is introduced unless a requirement demonstrably cannot be satisfied without one; no invented
numeric limits without grounding them in what already exists in this codebase
(`report-access/rate-limiter.ts`'s already-approved defaults) or explicit deferral to Build & Test
evidence.

## What This Stage Produces
- [x] `aidlc-docs/construction/unit-6-optional-accounts/nfr-requirements/nfr-requirements.md` — the
  9 founder-specified areas, each grounded in the real Functional Design mechanisms and, where
  reusing existing infrastructure, the real existing code (`report-access/credential.ts`,
  `shared/cookies.ts`, `report-access/rate-limiter.ts`, `email-delivery/resend-client.ts`).
- [x] `aidlc-docs/construction/unit-6-optional-accounts/nfr-requirements/tech-stack-decisions.md` —
  records that no new tech stack, library, or service is introduced; every requirement is satisfied
  within the existing Postgres/Next.js/Vercel/Resend stack and its existing primitives.

Not proceeding to NFR Design until this document is reviewed and approved, per explicit
instruction.

## Founder Review — APPROVED IN SUBSTANCE, Four Targeted Corrections Applied

**2026-08-27**. Four corrections applied, none reopening Functional Design or expanding Unit 6's
feature scope: (1) new §2b adds CSRF protection requirements (NFR-U6-51 through NFR-U6-55) for
`AccountSession`-authenticated mutating routes, reusing Unit 3's existing same-origin CSRF
**pattern** (not admin credentials); (2) §6 corrected from an in-process-only rate-limiting model
(stale single-replica reasoning inapplicable to Vercel's multi-instance/cold-start model) to a
Vercel-Firewall-primary / `FailedLookupRateLimiter`-local-defense-in-depth model, with a new
external-verification-tracker item 17; (3) §4's `Account`/`AccountOrderLink` uniqueness-conflict
handling corrected from a catch-a-raw-`UNIQUE`-violation-and-continue description (which cannot be
relied upon — it leaves the enclosing transaction aborted) to an explicit transaction-safe strategy
(`INSERT ... ON CONFLICT DO NOTHING RETURNING ...` + `SELECT`, or `SAVEPOINT`); (4) new NFR-U6-57
requires a B-tree index on `account_order_links(account_id)`, which NFR-U6-47's own query shape
assumed but the schema didn't yet specify. One non-blocking wording correction also applied
(NFR-U6-9, corrected from an overstated "uniform-cost" timing claim to a behavioral no-oracle
requirement). All corrections applied to both `nfr-requirements.md` and `tech-stack-decisions.md`.

**Unit 6 NFR Requirements is now APPROVED/COMPLETE.** No further NFR Requirements review gate is
held, per explicit instruction — proceeding directly to NFR Design.
