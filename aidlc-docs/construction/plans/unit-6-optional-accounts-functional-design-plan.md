# Unit 6: Optional Accounts — Functional Design Plan

**Status: Part 2 COMPLETE — founder answers recorded, artifacts generated, awaiting founder
review.** Grounded in a real, read-only Explore-agent
codebase audit (2026-08-27) against `aidlc-docs/inception/application-design/{unit-of-work,
components,component-methods}.md`, `aidlc-docs/inception/user-stories/stories.md` (Epic 6: ACC-1
through ACC-4; PC-3), and `requirements.md` §2.4/§6/§10.

## Real findings this plan is grounded in

1. **No Account concept exists in code today.** `find src -iname "*account*" -o -iname "*user*"`
   returns zero matches; `src/db/schema.ts` has no `accounts`/`users` table. ACC-1 (guest checkout,
   no forced account) is the only Epic 6 story already implemented, entirely through Unit 2B's
   `orders.customerEmail` + `reportAccessCredentials` bearer-token mechanism.
2. **No customer authentication mechanism exists anywhere.** The only auth in this codebase is
   `src/admin-auth/`'s single-operator HTTP Basic Auth (`basic-auth.ts`) + same-origin CSRF check
   (`csrf.ts`) — explicitly a single-operator gate, not a multi-user session system. `shared/
   cookies.ts`'s own design comment is explicit: "not a general session/auth framework... the
   cookie is a transport, not a new trust boundary... each caller re-validates the cookie's value
   against the existing server-side mechanism on every request." A customer-facing Account auth
   mechanism does not yet exist in any form and needs a real design decision (Q1 below).
3. **ACC-2's own acceptance criteria already names three candidate proof-of-control mechanisms**
   for linking a prior guest purchase to a new account ("successful email verification/magic-link
   confirmation to the purchase email, or possession of the secure report-access token issued at
   purchase, or another appropriately authenticated mechanism") and one hard invariant ("an
   email-address match alone is never sufficient"). `grep -rniE "proof.of.control|
   linkGuestPurchase|claim.*purchase" src/` returns zero matches — this is fully undesigned in
   code (Q2 below).
4. **No retention/deletion policy exists anywhere in this project.** `requirements.md §10` only
   mandates that one be *defined*; every other document (`stories.md` ACC-4, `components.md`,
   `component-methods.md`) forward-references "the retention policy" as something still to be
   decided. The one concrete, already-decided retention text in this codebase
   (`unit-2b-commercial-payment-fulfillment/nfr-requirements/nfr-requirements.md`) governs
   `orders.customerEmail` specifically, tied to the `Order` record's own commercial/audit
   retention — not accounts. **This is a real, load-bearing policy gap Unit 6 cannot proceed
   without a founder decision on** (Q3 below).
5. **PC-3 (save/resume) is explicitly flagged in the story map itself as lower-priority/
   negotiable** ("a candidate for deferral," `stories.md`) and has zero schema support today
   (`screeningRequests` has no account/user reference column at all) — a real scope question, not
   assumed either way (Q4 below).
6. **Unit 3's real capability Unit 6 was scoped to depend on** is the admin action log/refund
   audit trail (`src/admin-action-log/`, `AdminActionType`: `REFUND_INITIATED`/`RULE_DISABLED`/
   `RULE_REENABLED`/`DATA_SOURCE_MARKED_UNHEALTHY`/`DATA_SOURCE_OVERRIDE_CLEARED`) — **not** a
   dedicated dispute/Support Case record system, which `unit-of-work.md` itself defers to Unit 9
   (ADM-9). `unit-of-work.md`'s own Unit 6 rationale ("account deletion/disputes are exactly the
   kind of new support surface Unit 3's minimum capability exists to handle") maps only to this
   existing audit-log surface, not to a not-yet-built dispute-case system — flagged here so Unit 6
   isn't scoped against a capability that doesn't actually exist yet (Q5 below).
7. **`requirements.md` §2.4 already answers the "how much account UI" question directly**:
   "Account system scope should be the minimum needed for these two capabilities [report history,
   repeat-property analysis] — not a general-purpose user platform." Taken as the design default,
   not re-asked as an open question.

---

## Questions

### Q1 — Customer authentication mechanism

No customer-facing login/session mechanism exists in this codebase today. `requirements.md §2.4`
says account creation needs only "email + authentication method," and `shared/cookies.ts`'s own
stated philosophy (cookie-as-transport, always re-validated server-side, never a session store) is
already established for guest bearer tokens.

**[Answer]:** Which authentication mechanism should Unit 6 implement?

- A. **Magic-link / passwordless email**, extending the existing guest-report-access-token pattern
  (`reportAccessCredentials`'s hash-only-token-storage, single-use-link delivery via the existing
  `email-delivery/resend-client.ts`) to a real, longer-lived account session — no password to
  store or leak, matches this project's existing guest-access precedent most closely.
- B. **Email + password**, a real credential-storage mechanism (hashed, e.g. bcrypt/argon2) — more
  conventional, but introduces a new class of secret this project has never stored before (every
  existing "auth" in this codebase — admin Basic Auth, guest bearer tokens — is either an env-var
  static credential or a random opaque token, never a user-chosen password).
- C. Something else (state it).

**[Answer]: A.** Magic-link/passwordless email, reusing the existing Resend integration. Short-lived,
single-use, hash-only-persisted token for the magic link itself; a separate opaque high-entropy
session token issued only after successful verification, delivered via an HttpOnly/Secure/
appropriate-SameSite cookie, validated/revocable server-side on every request. No password storage
anywhere. No OAuth/social login. No general-purpose auth platform unless a later requirement proves
one necessary. Guest checkout remains entirely unchanged.

### Q2 — Proof-of-control mechanism for linking a guest purchase (ACC-2)

ACC-2 itself names three candidate mechanisms and one hard invariant (email match alone is never
sufficient). Which should Unit 6 actually implement?

**[Answer]:**
- A. **Magic-link/email-verification only** — confirm control of the purchase email via a sent
  link, matching Q1=A's own mechanism if chosen.
- B. **Report-access-token possession only** — the user must supply the actual bearer token from
  their purchase confirmation/email (the same token `reportAccessCredentials` already issues).
- C. **Either A or B**, whichever the user has available.
- D. Something else (state it).

**[Answer]: C.** Support both A (purpose-specific magic-link/claim-link sent to the Order's own
`customerEmail`, never a client-supplied address) and B (possession of the existing valid
report-access credential, validated via the existing `resolveByAccessToken` mechanism). Email-
address text equality alone is never sufficient for either path — the authenticated account's own
email matching `Order.customerEmail` is not itself proof. Linking the same purchase to the same
account is idempotent; a purchase already linked to a different account must be rejected, never
silently transferred. No automatic account-to-account transfer flow in Unit 6.

### Q3 — Retention/deletion policy for account deletion (ACC-4)

This project has no retention/deletion policy defined anywhere yet — a real, load-bearing decision
this unit cannot design around without an answer. ACC-4's own acceptance criteria requires:
account credentials + unnecessary personal data deleted; report *records* handled per a retention
policy (e.g. anonymized/retained for business-record purposes, not silently altered — cross-
referencing RGD-4's immutability requirement, which this project has held without exception since
Unit 1).

**[Answer]:** What should account deletion actually do to:
- The account record itself (credentials, email) — deleted immediately? A soft-delete/grace
  period first?
- Prior `Order`/`EvidenceReportArtifact` rows linked to that account — anonymize the account link
  while preserving the immutable report/order record for business/audit purposes (matching
  RGD-4 and the existing `orders.customerEmail` retention precedent), or something else?
- Any minimum retention window before actual deletion is permitted (e.g. for open disputes/
  refund windows), or none?

**[Answer]:** Immediate deletion after explicit confirmation — no soft-delete, no grace period, no
minimum retention window. On confirmed deletion: DELETE/REVOKE the account record, all account
sessions, all outstanding customer-auth/magic-link tokens, any account-only profile/preferences
(none exist), and account-to-order/report ownership/linkage records whose only purpose is account
history. RETAIN the `Order`, `EvidenceReportArtifact`, all existing commercial/audit records,
`Order.customerEmail` per its already-established retention posture, and all immutable report
content/provenance completely unmutated — account deletion must never rewrite or mutate an
immutable `EvidenceReportArtifact` (RGD-4). The account relationship must therefore be severable
without deleting the underlying commercial/report record. No special refund/dispute hold on account
deletion — existing refund/payment/support operations remain possible from retained records after
the account itself is gone. A future account may re-link an eligible retained guest purchase only
by satisfying ACC-2 proof-of-control again from scratch. Do not invent a specific number-of-years
retention policy for Orders in this unit — Unit 6 inherits their existing commercial/audit
retention posture unchanged.

### Q4 — PC-3 (save/resume in-progress requests): in scope for Unit 6, or deferred?

PC-3 is explicitly flagged as lower-priority/negotiable in its own story text, and has zero schema
support today.

**[Answer]:**
- A. **In scope for Unit 6** — implement save/resume for an authenticated account's in-progress
  `ScreeningRequest` (shed/garage/vacant-land alike).
- B. **Deferred** — Unit 6 delivers ACC-2/3/4 only (account creation, linking, history, deletion);
  PC-3 becomes a candidate for a later unit or a standalone addition.

**[Answer]: B.** PC-3 is deferred. Unit 6 scope is exactly ACC-1 (guest purchase remains
supported)/ACC-2 (optional account creation + secure guest-purchase linking)/ACC-3 (account report
history)/ACC-4 (account deletion). Do not add ownership/persistence/resume semantics for incomplete
`ScreeningRequest`s in Unit 6; PC-3 is recorded as explicitly deferred for a later standalone
capability/unit.

### Q5 — Confirm Unit 6's real dependency surface

`unit-of-work.md`'s own stated rationale for Unit 6 depending on Unit 3 ("account deletion/
disputes are exactly the kind of new support surface Unit 3's minimum capability exists to
handle") maps only to Unit 3's real admin-action-log/refund-audit surface, not to a dedicated
Support Case/dispute-record system (which `unit-of-work.md` itself defers to Unit 9, ADM-9, not
yet built).

**[Answer]:** Confirmed — Unit 6 depends only on capabilities Unit 3 actually built (the existing
`AdminActionLog`/refund-audit surface). Do NOT build a `SupportCase`/dispute-case-management/
complaint-workflow/new dispute-record subsystem in Unit 6; ADM-9 remains deferred to Unit 9. Do not
extend `AdminActionLog` automatically just because accounts exist — only add a new
`AdminActionType` if Unit 6 introduces an actual admin-performed account mutation requiring audit
(none identified in this design pass). Ordinary customer account creation, authentication, purchase
claiming/linking, report-history access, and account deletion are not `AdminActionLog` events merely
because that log exists.

**Additional scope invariants reiterated by the founder:** `requirements.md` §2.4's minimum-scope
mandate applies throughout; avoid profiles, avatars, social login, password-reset flows,
organizations/teams, roles/RBAC, notification preferences, saved searches, PC-3 save/resume, and
generalized identity-management infrastructure unless a genuine requirement discovered during
design makes one unavoidable (none did).

---

## What This Stage Produces
- [x] `aidlc-docs/construction/unit-6-optional-accounts/functional-design/domain-entities.md`
- [x] `aidlc-docs/construction/unit-6-optional-accounts/functional-design/business-rules.md`
- [x] `aidlc-docs/construction/unit-6-optional-accounts/functional-design/business-logic-model.md`
- [x] `aidlc-docs/construction/unit-6-optional-accounts/functional-design/frontend-components.md`

Part 2 complete. Presented for founder review; not proceeding to NFR Requirements until approved,
per the founder's own explicit instruction.

## Founder Review — Round 1: REQUEST CHANGES (four localized corrections), Round 2: APPROVED/COMPLETE

**Round 1 (2026-08-27)**: substance approved; four localized corrections required — (1) magic-link
tokens (LOGIN and CLAIM_PURCHASE) must never appear in a URL query/path, corrected to a
fragment-to-POST-body exchange; (2) BR-U6-4 rewritten into two independent authorization modes for
the same immutable report (Mode A Guest Access, unchanged; Mode B Account Access, new); (3) account
deletion corrected to also invalidate outstanding LOGIN tokens by the account's own normalized
email (they carry no `accountId`), plus an `HttpOnly`-cookie mechanics correction (server clears
the cookie via `Set-Cookie`, never client JS); (4) token consumption specified as a real atomic
conditional `UPDATE ... RETURNING` primitive, LOGIN verification wrapped in one transaction with
rollback, `AccountOrderLink` creation corrected to an insert-then-resolve-conflict sequence. All
four applied to all four artifacts.

**Round 2 (2026-08-27)**: **APPROVED/COMPLETE.** All ten do-not-reopen items held unchanged
throughout. **Unit 6 Functional Design is now fully approved.** Proceeding directly to NFR
Requirements per explicit instruction — see
`aidlc-docs/construction/plans/unit-6-optional-accounts-nfr-requirements-plan.md`.
