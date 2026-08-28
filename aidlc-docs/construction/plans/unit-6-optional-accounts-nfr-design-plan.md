# Unit 6: Optional Accounts — NFR Design Plan

**Status: COMPLETE 2026-08-27 — founder-directed, targeted, delta-only.** No `[Answer]:` question
round was needed — NFR Requirements' own review-correction round (`audit.md`, `2026-08-27T12:00:00Z`)
already specified every open design point at or past normal NFR-Design-level concreteness: the
exact CSRF validation logic to reuse (`src/admin-auth/csrf.ts`'s `checkSameOrigin` behavior), the
exact rate-limiting model (Vercel Firewall primary + `FailedLookupRateLimiter` local secondary), the
exact transaction-safety strategy family (`ON CONFLICT ... RETURNING` or `SAVEPOINT`), and the exact
missing index. This plan records that scope decision, matching the precedent set by Unit 5's own
founder-directed NFR Design pass (no question round needed when the prior stage's approval message
already resolves every open point).

## The 5 patterns this document defines

Each maps directly to one or more NFR Requirements sections/corrections:

1. **Shared Bearer-Credential Token Pattern, Two New Consumers** — `MagicLinkToken`/`AccountSession`
   both reuse `report-access/credential.ts` unchanged; the NFR-U6-26 atomic conditional-consumption
   statement is specified as the canonical, single implementation of that primitive's "single-use"
   contract, used by both token kinds.
2. **Fragment-to-POST Transport Pattern** — the concrete client/server mechanics satisfying
   NFR-U6-5/6.
3. **Shared Same-Origin CSRF Core, Two Callers** — resolves NFR-U6-51/52: extracts the
   origin-agnostic core of Unit 3's `checkSameOrigin` into a shared, credential-free helper, with
   admin and account routes each supplying their own trusted-origin resolver — reuse of the
   *pattern*, never of admin credentials or admin code paths.
4. **Transaction-Safe Conflict Resolution Pattern** — resolves NFR-U6-28/29's "acceptable
   strategies" into one concrete, chosen mechanism (`INSERT ... ON CONFLICT DO NOTHING RETURNING
   ...` + fallback `SELECT`) for both `accounts.email` and `account_order_links.order_id`.
5. **Two-Layer Rate Limiting Pattern** — resolves NFR-U6-37/38's outer/inner model into concrete
   component boundaries (a Vercel Firewall rule as deployment configuration; a second,
   independently-scoped `FailedLookupRateLimiter` instance for the application-local layer).

## What This Stage Produces
- [x] `aidlc-docs/construction/unit-6-optional-accounts/nfr-design/nfr-design-patterns.md` — the 5
  patterns above, plus an explicit inherited-unchanged section.
- [x] `aidlc-docs/construction/unit-6-optional-accounts/nfr-design/logical-components.md` — the one
  new logical component this unit introduces (a customer account/auth module) and every existing
  component it touches, with an explicit responsibility-boundary table.

Not proceeding to Infrastructure Design until this document is reviewed and approved, per standard
process — though this document's own §5 flags that Infrastructure Design likely should **execute**
for Unit 6 (not skip, unlike Unit 5), since the Vercel Firewall rate-limiting rule is a genuine new
deployment/cloud-configuration surface, not purely application code.

## Founder Review — APPROVED, One Security Correction Applied

**2026-08-27**. One targeted correction, none of the eleven do-not-reopen items touched:
**`completeClaimByEmail` must be bound to the authenticated Account that started the claim, not
just the token's own validity.** A valid `CLAIM_PURCHASE` token proves control of the purchase
email; it does not by itself prove control of the Account the claim was started from — both proofs
are now required before an `AccountOrderLink` is created. Applied: Pattern 1's atomic consumption
statement is now account-bound for `CLAIM_PURCHASE` (`account_id = <session-resolved accountId>`,
never client-supplied); the claim-completion sequence (session resolution → account-bound
consumption → link creation) now executes as one transaction with rollback-on-infrastructure-
failure; Pattern 3's CSRF-protected mutation set gained `completeClaimByEmail`. Two small,
disclosed opportunistic corrections were also applied to keep documents internally consistent
(matching this project's own established precedent for cross-artifact fixes found during a later
stage, e.g. Unit 2's NFR Design correcting a Functional Design artifact without reopening its
review gate): `business-rules.md` BR-U6-3 and `business-logic-model.md` workflow 3's Path A
completion step, and `frontend-components.md`'s claim-verify landing page (§2b), updated to state
the two-proof requirement and its fail-closed, non-oracle frontend messaging; and
`nfr-requirements.md` NFR-U6-26's example SQL, updated for consistency with Pattern 1's corrected
statement.

**Unit 6 NFR Design is now APPROVED/COMPLETE.** No further NFR Design review gate is held, per
explicit instruction — proceeding directly to Infrastructure Design, which **executes** (not
skipped) per this document's own §5 recommendation, now confirmed by the founder's own closing
instruction.
