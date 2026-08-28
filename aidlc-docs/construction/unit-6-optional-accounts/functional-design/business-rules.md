# Unit 6 — Business Rules (Optional Accounts)

## BR-U6-1 — Authentication mechanism: magic-link only, no passwords

Customer authentication is passwordless email (magic link), reusing
`report-access/credential.ts`'s existing token primitives. A `MagicLinkToken` with
`purpose=LOGIN`:
- Is single-use — `consumedAt` is set on first successful verification; a second attempt with the
  same raw token is rejected identically to an unknown token (matches `resolveByAccessToken`'s
  existing not-found-vs-revoked-indistinguishable behavior, so a used/expired/forged token all
  fail the same way — no oracle for guessing which).
- Is short-lived — `expiresAt` set at issuance to a fixed short window (15 minutes), independent of
  `AccountSession`'s own, much longer, expiry.
- Verifying a LOGIN token for an email with no existing `Account` **creates** the `Account`
  (email + createdAt) as part of verification — there is no separate "sign up" step; requesting a
  login link for a new address *is* account creation. This directly satisfies ACC-2's "optional
  account creation."
- No password is ever collected, stored, or hashed. No OAuth/social login provider is integrated.
- **The raw token is never placed in a URL query string, pathname, or redirect query parameter** —
  it travels only in the email body, briefly in the browser's URL *fragment* (never sent to any
  server), and in the body of the one POST that verifies it. Matches this project's own existing
  discipline against raw bearer credentials in URLs (`reportAccessToken`, Unit 2B's confidentiality
  hardening). Same rule applies to `CLAIM_PURCHASE` tokens (BR-U6-3).
- **Token consumption is a real atomic persistence invariant**, not a narrative claim: a single
  conditional `UPDATE magic_link_tokens SET consumed_at = now() WHERE token_hash = ? AND purpose =
  ? AND consumed_at IS NULL AND expires_at > now() RETURNING ...` — exactly one concurrent verifier
  can ever receive the successful row; unknown/expired/already-consumed/lost-the-race outcomes
  remain externally indistinguishable. LOGIN verification (token consumption, `Account`
  find-or-create, `AccountSession` creation) executes as one DB transaction — if any later step
  fails, the token consumption itself rolls back too, so a valid link is never permanently burned
  without successfully establishing a session.

**Why:** matches the founder's Q1=A answer exactly, and reuses cryptographic primitives already
reviewed and load-bearing elsewhere in this codebase rather than introducing a new secret class
(passwords) this project has never stored.

## BR-U6-2 — Account session lifecycle

An `AccountSession` is issued only as the direct result of a successfully verified LOGIN
`MagicLinkToken`. Its raw token is delivered via `ACCOUNT_SESSION_COOKIE`
(`HttpOnly`/`Secure`/`SameSite=Lax`), matching `CHECKOUT_SESSION_COOKIE`/`REPORT_ACCESS_COOKIE`'s
own existing attributes.

- **The cookie is a transport, not a trust boundary** (this project's own established phrase,
  `shared/cookies.ts`): every authenticated request re-resolves the presented raw token via
  `resolveByAccessToken` against `accountSessions`, checking `revokedAt IS NULL AND expiresAt >
  now()`, exactly as `REPORT_ACCESS_COOKIE` is already re-validated on every report-access request.
  The cookie's mere presence proves nothing by itself.
- Logout revokes the specific session (`revokedAt = now()`) — it does not delete the `Account`.
- All of an account's sessions are proactively revoked as part of account deletion (BR-U6-5).
- **`ACCOUNT_SESSION_COOKIE` is `HttpOnly` — client-side JavaScript cannot read or clear it.**
  Logout and account deletion clear/expire the cookie via a `Set-Cookie` header on the server
  response itself (the shared cookie helper, mirroring `CHECKOUT_SESSION_COOKIE`/
  `REPORT_ACCESS_COOKIE`'s own existing clearing convention), never via client-side cookie
  mutation — the frontend only reacts to a successful response and redirects.
- Session token expiry is longer than a magic-link token's (a session persists across visits; a
  magic link is single-use and short-lived) — the two are never the same token or table.

## BR-U6-3 — Guest-purchase linking: dual-path proof-of-control, no silent transfer

`ACC-2`'s claim/link flow accepts **either**:
- **Path A — `EMAIL_VERIFICATION`**: a `MagicLinkToken` with `purpose=CLAIM_PURCHASE` is sent to
  the target `Order.customerEmail` **only** — never to a client-supplied address, and never
  triggered by simple text equality between the requesting Account's `email` and the Order's
  `customerEmail`. **Corrected per NFR Design review**: verifying the emailed link is necessary but
  not sufficient — completion additionally requires a valid `AccountSession` whose `accountId`
  exactly matches the token's own bound `accountId` (the account that originally started the
  claim). The email proves control of the purchase email; the session proves control of the
  Account receiving the purchase; **both** are required before an `AccountOrderLink` is created. A
  valid token presented with no session, an expired/revoked session, or a different account's
  session does not create a link. Transport and consumption follow BR-U6-1's rules exactly
  (fragment-to-POST, never a URL query/path token; the same atomic conditional-`UPDATE`-`RETURNING`
  consumption primitive, `purpose=CLAIM_PURCHASE`-scoped, now additionally conditioned on
  `account_id` matching the session — see `business-logic-model.md` workflow 3 and
  `nfr-design/nfr-design-patterns.md` Pattern 1).
- **Path B — `REPORT_ACCESS_TOKEN`**: the requester supplies the raw bearer token issued at
  purchase (the same value `reportAccessCredentials` already governs). It is validated via the
  existing `resolveByAccessToken` mechanism (not a new lookup), then resolved to a specific
  `orderId` via the real join `reportAccessCredentials.reportArtifactId →
  evidenceReportArtifacts.id → evidenceReportArtifacts.screeningRequestId → orders.screeningRequestId
  (WHERE orders.state = 'PAID') → orders.id`. Possession and validity of the token *is* the proof;
  no further email check is layered on top.

**Hard invariants (from the founder's Q2 answer, all enforced in code, not just documented):**
1. Email-address text equality **alone** is never sufficient for either path — Path A requires an
   actual successful magic-link click; Path B requires actual token validity, and neither path
   accepts a plain "does this address look the same" comparison as a substitute.
2. Linking the **same** `(accountId, orderId)` pair a second time is idempotent — succeeds as a
   no-op, returns the existing `AccountOrderLink`.
3. Attempting to link an `orderId` **already linked to a different `accountId`** is rejected
   (`ALREADY_LINKED_TO_ANOTHER_ACCOUNT`) — enforced at the database level via `accountOrderLinks
   .orderId`'s `UNIQUE` constraint, **not application-code pre-check discipline alone**: the link
   attempt always issues the `INSERT`, and a unique-constraint violation is caught and resolved by
   re-querying the now-authoritative existing row — same `accountId` → treated as the idempotent
   success case (invariant 2); different `accountId` → `ALREADY_LINKED_TO_ANOTHER_ACCOUNT`. A
   pre-check `SELECT` alone would leave a real race window between check and insert; the
   constraint-violation-then-resolve sequence is what actually closes it.
4. There is no automatic account-to-account transfer flow — resolving case 3 (if ever needed) is
   explicitly out of scope for Unit 6 and requires manual/support handling outside this unit.

## BR-U6-4 — Report access has two independent authorization modes for the same immutable report

A given `EvidenceReportArtifact` is reachable through **two structurally independent** authorization
routes — never a second report-storage or rendering mechanism, just two different ways to get
authorized to the same one:

**Mode A — Guest Access (existing, unchanged):** possession of a valid `reportAccessCredentials`
bearer token, resolved exactly as it is today via the existing `resolveByAccessToken` mechanism.
Unit 6 does not modify this path, does not reconstruct or recover a lost raw guest token on an
account's behalf, and never mints a fresh replacement guest token merely to support account-based
history — those would each be a second, redundant mechanism doing what Mode B already does.

**Mode B — Account Access (new, this unit):** requires all of:
1. A valid `AccountSession`, resolved server-side (BR-U6-2) — `accountId` comes **only** from this
   resolution, never from a client-supplied value.
2. A matching `AccountOrderLink` row (`accountId = <session's account> AND orderId = <requested
   order>`) — this is the entire authorization check; there is no secondary check.
3. Server-side resolution from the authorized `Order` to its `EvidenceReportArtifact` via the
   existing `orders.screeningRequestId → evidenceReportArtifacts.screeningRequestId` relationship —
   the same join Path B's claim mechanism already uses, reused here for report retrieval, not
   re-derived.

Account Access **never**:
- Trusts a client-supplied `accountId` or `orderId` for authorization purposes.
- Uses `Order.customerEmail` text matching as an authorization check — that field is commercial
  metadata, not an access-control input, consistent with BR-U6-3's "email match alone is never
  sufficient" invariant.
- Reconstructs, recovers, or re-derives the original guest bearer token, or issues a new one.
- Revokes or alters the existing guest credential — Mode A and Mode B coexist; linking an account is
  strictly additive, never a migration that revokes the guest path.

A request for an `orderId` the caller's account does not hold a link for is rejected as `FORBIDDEN`
**without revealing whether some other account owns that order** — the failure looks identical
whether the order doesn't exist, belongs to no account, or belongs to a different account.

## BR-U6-5 — Account deletion: immediate, no soft-delete, precise deletion/retention split

On explicit, confirmed account-deletion request:

**Deleted/revoked immediately (no grace period, no minimum retention window):**
- The `Account` row itself.
- All `AccountSession` rows for that account (or equivalently, all revoked — no session for a
  deleted account resolves as valid again). Cleared via `Set-Cookie` on the server response, since
  `ACCOUNT_SESSION_COOKIE` is `HttpOnly` and cannot be cleared client-side (BR-U6-2).
- All outstanding (unconsumed, unexpired) `CLAIM_PURCHASE` `MagicLinkToken` rows referencing that
  account (`accountId = <account>`).
- **All outstanding (unconsumed, unexpired) `LOGIN` `MagicLinkToken` rows for that account's
  normalized email** (`email = <account's normalized email>`) — `LOGIN` tokens deliberately carry
  no `accountId` (BR-U6-1's discriminated shape), so deletion must capture the account's own
  normalized email *before* deleting the `Account` row and use it to find these tokens by `email`,
  not by `accountId`. Without this, a magic-link email requested-but-not-yet-clicked before
  deletion could recreate the just-deleted account without a freshly requested authentication link,
  defeating the immediate-deletion intent.
- All `AccountOrderLink` rows for that account — this severs the account↔order relationship only.

**Retained, unmutated (per RGD-4's immutability discipline, held without exception since Unit 1):**
- The `Order` row(s) previously linked — including `customerEmail`, per its own already-established
  commercial/audit retention posture (unchanged by this unit).
- The `EvidenceReportArtifact` row(s) and all report content/provenance — an account deletion event
  never rewrites, re-renders, or otherwise mutates a previously generated report.
- All other existing commercial/audit records (payment, refund, admin-action-log entries).

**Re-linking after deletion:** a *future* Account (new or different) may re-link a retained guest
purchase only by satisfying BR-U6-3's proof-of-control mechanisms again from scratch — deletion
does not preserve or grandfather any prior proof.

**No special refund/dispute hold** — existing refund/payment/support operations on a retained Order
remain fully possible after its linked Account is deleted, using the retained `Order` record alone.

## BR-U6-6 — Explicit scope boundary

Unit 6 delivers exactly ACC-1 (already implemented, unchanged), ACC-2, ACC-3, ACC-4. It explicitly
does **not**:
- Implement PC-3 (save/resume of in-progress `ScreeningRequest`s) — deferred to a later unit or
  standalone capability; no `accountId`/`ownerId` column is added to `screeningRequests` in this
  unit.
- Build a `SupportCase`/dispute/complaint-record system — Unit 6 depends only on Unit 3's real,
  already-built admin-action-log/refund-audit surface (`src/admin-action-log/`); a genuine
  dispute-case subsystem remains deferred to Unit 9 (ADM-9).
- Automatically extend `AdminActionType`/`AdminActionLog` just because accounts now exist — ordinary
  customer account creation, authentication, purchase claiming/linking, report-history access, and
  account deletion are **not** `AdminActionLog` events; a new `AdminActionType` is added only if a
  genuine ADMIN-performed account mutation requiring audit is identified during design (none is, in
  this pass).
- Add profiles, avatars, social login, password-reset flows, organizations/teams, roles/RBAC,
  notification preferences, saved searches, or any generalized identity-management infrastructure
  beyond the four domain entities in `domain-entities.md`.
