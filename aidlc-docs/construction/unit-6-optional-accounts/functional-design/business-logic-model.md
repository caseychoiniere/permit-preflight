# Unit 6 — Business Logic Model (Optional Accounts)

Five workflows. Each names its real inputs/outputs, the tables it touches, and how it enforces the
business rules in `business-rules.md`. Together, workflows 1-2 are the "authentication/session
lifecycle" the founder asked to see, workflow 3 is the "guest-purchase claim lifecycle," workflow 4
is the "report-history authorization model," and workflow 5 is "account deletion/unlinking
behavior."

## Magic-link transport (applies to workflows 1, 2, 3 — stated once)

Every magic link (`LOGIN` and `CLAIM_PURCHASE` alike) uses the same fragment-to-POST exchange, per
BR-U6-1, so the raw token is never placed in a URL query string, pathname, or redirect query
parameter:

1. The emailed URL carries the raw token in the **fragment**: `https://.../account/verify#token=
   <raw-token>` (LOGIN) or `https://.../account/claim/verify#token=<raw-token>` (CLAIM_PURCHASE).
   A fragment is never sent to any server as part of the HTTP request — it exists only in the
   browser.
2. The landing page's client-side script reads `location.hash` on load, then immediately calls
   `history.replaceState(...)` to strip the fragment from the visible URL and browser history
   before doing anything else — so the raw token never lingers somewhere a screenshot, browser
   history entry, or shoulder-surf could capture it.
3. It then issues a single `POST` with `{ token: rawToken }` in the request **body** to the
   verification endpoint (`POST /api/account/verify-login` or `POST /api/account/verify-claim`).
   The raw token is never appended to that POST's own URL either.
4. The server hashes the presented token, resolves/consumes it (see the atomic consumption
   primitive below), and **never logs or echoes the raw token** in any response, redirect, or log
   line — only its hash ever appears server-side, matching `report-access`'s own existing
   hash-only-persistence discipline.

## Atomic token consumption (applies to workflows 2 and 3 — stated once)

Consuming a `MagicLinkToken` (either purpose) is one conditional, atomic statement, not a
read-then-write:

```sql
UPDATE magic_link_tokens
SET consumed_at = now()
WHERE token_hash = $1
  AND purpose = $2
  AND consumed_at IS NULL
  AND expires_at > now()
RETURNING id, email, account_id, order_id;
```

Exactly one concurrent caller can ever receive a returned row for a given token — every other
concurrent or later attempt (unknown token, expired, already consumed, or simply lost the race)
returns zero rows, and the caller maps that uniformly to `INVALID_OR_EXPIRED` with no distinguishing
detail (no oracle for guessing which case occurred).

---

## 1. Request login link (`requestLoginLink(email)`)

1. Normalize `email` (lowercase/trim — matches existing `orders.customerEmail` normalization
   convention).
2. Generate a credential via the existing `generateAccessCredential()` (raw token + hash).
3. Insert a `MagicLinkToken` row: `purpose=LOGIN`, `tokenHash`, `email`, `accountId=undefined`,
   `orderId=undefined`, `expiresAt = now() + 15min`.
4. Send an email containing the fragment-carried verification URL (see "Magic-link transport"
   above) via the existing `email-delivery/resend-client.ts` — same delivery mechanism already used
   for report-ready emails, no new provider integration.
5. **Always returns a generic "check your email" response**, regardless of whether an `Account`
   already exists for that address — request/login and signup are the same flow (BR-U6-1), so there
   is no account-enumeration signal to leak either way.

## 2. Verify login link / logout — authentication/session lifecycle

**`verifyLoginLink(rawToken)`** (called from the `/account/verify` landing page's POST, per the
transport section above):

1. Atomically consume the token via the shared primitive above, scoped `purpose=LOGIN`. No row →
   `INVALID_OR_EXPIRED`.
2. Steps 2-4 execute in the **same DB transaction** as step 1's consumption, so a failure at any of
   these steps rolls the token consumption back too — a valid link is never left permanently burned
   without a session actually being established:
   a. Look up `Account` by the token's `email`; if none exists, create one (`INSERT accounts
      (email)`) — this is the account-creation path (BR-U6-1).
   b. Generate a new, **separate** credential via `generateAccessCredential()` for the session
      (never reuses the magic-link token's own value).
   c. Insert an `AccountSession` row (`accountId`, `tokenHash`, `expiresAt = now() + <session
      window>`).
3. On commit: set `ACCOUNT_SESSION_COOKIE` (`HttpOnly`/`Secure`/`SameSite=Lax`) via `Set-Cookie` on
   the response.
4. Every subsequent authenticated request re-resolves this cookie's value via
   `resolveByAccessToken(rawSessionToken, accountSessionStore)`, filtering `revokedAt IS NULL AND
   expiresAt > now()` (BR-U6-2) — implemented as a shared `resolveAccountSession(request)` helper
   used by every account-scoped route handler, mirroring `report-access`'s own existing
   resolve-on-every-request pattern.

**`logout(accountId)`**: requires an active session. `UPDATE accountSessions SET revokedAt = now()
WHERE id = <current session's id>` — revokes only the specific session used to call it, not every
session for the account. The response clears `ACCOUNT_SESSION_COOKIE` via `Set-Cookie`
(max-age 0 / expired) — the client never attempts to clear an `HttpOnly` cookie itself; it reacts to
the successful response and redirects.

## 3. Claim a guest purchase (`claimPurchase(accountId, input)`) — guest-purchase claim lifecycle

Entry point requires an already-authenticated session (`accountId` resolved per workflow 2, step 4
— never client-supplied). `input` is one of:

**Path A — start email verification:**
1. `input = { method: "EMAIL_VERIFICATION", orderId }`.
2. Look up `Order` by `orderId`; if not found, return `ORDER_NOT_FOUND`.
3. Generate a credential; insert `MagicLinkToken { purpose: CLAIM_PURCHASE, email: order
   .customerEmail, accountId, orderId, expiresAt: now() + 15min }` — the email target is read from
   the `Order` record itself, **never** taken from client input (BR-U6-3 invariant 1).
4. Send the fragment-carried verification URL to `order.customerEmail` via `resend-client.ts`, per
   the "Magic-link transport" section above (`/account/claim/verify#token=...`).
5. **`completeClaimByEmail(rawToken)`**, invoked by the claim-verify landing page's POST —
   **corrected per NFR Design review**: possession of a valid `CLAIM_PURCHASE` token is necessary
   but **not sufficient**. Completion requires both:
   a. Resolve the current request's `AccountSession` server-side (workflow 2, step 4) —
      `sessionAccountId`. No valid session → `NOT_AUTHENTICATED` (frontend: prompt to sign in and
      request a new link, §2b below).
   b. Atomically consume the token via the shared primitive, **now additionally conditioned on
      `account_id = sessionAccountId`**:
      ```sql
      UPDATE magic_link_tokens
      SET consumed_at = now()
      WHERE token_hash = $1
        AND purpose = 'CLAIM_PURCHASE'
        AND account_id = $2  -- sessionAccountId, never client-supplied
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING order_id, account_id;
      ```
      No row → the same generic `INVALID_OR_EXPIRED` result regardless of the actual cause (unknown
      token, expired, already consumed, or a valid token whose bound `account_id` simply doesn't
      match the current session) — the failure never discloses *which* of these occurred beyond
      what the frontend needs to tell an unauthenticated/mismatched customer to restart (§2b),
      matching NFR-U6-7's existing no-oracle principle extended to this new condition.
   Steps a-b and the link-creation step (6) execute inside **one database transaction** — if link
   creation fails for an infrastructure reason (not an `ALREADY_LINKED_TO_ANOTHER_ACCOUNT`
   business outcome, which is a valid completion, just not the creating one), the token consumption
   itself rolls back, so a valid claim is never permanently burned without its `AccountOrderLink`
   actually having been established (or deterministically resolved to an idempotent/rejected
   outcome).

**Path B — report-access-token possession:**
1. `input = { method: "REPORT_ACCESS_TOKEN", rawReportToken }`.
2. `resolveByAccessToken(rawReportToken, reportAccessCredentialStore)` — reuses the existing
   `report-access` resolution exactly as guest report viewing already does. Invalid/expired/revoked
   → `INVALID_TOKEN`.
3. Resolve the real join: `credential.reportArtifactId → evidenceReportArtifacts.id
   → evidenceReportArtifacts.screeningRequestId → orders.screeningRequestId (WHERE state='PAID')
   → orders.id`. No match → `ORDER_NOT_FOUND` (should not occur for a valid credential given the
   existing pipeline invariants, but handled explicitly rather than assumed).
4. Proceed to step 6 with the resolved `orderId`.

**Shared step 6 — create the link (race-safe, not pre-check-only):**
- Always attempt `INSERT accountOrderLinks (accountId, orderId, linkMethod, linkedAt)` directly —
  `linkMethod` is `EMAIL_VERIFICATION` for Path A, `REPORT_ACCESS_TOKEN` for Path B.
- On success: return the new row.
- On a unique-constraint violation (`orderId` already present): re-query the now-authoritative
  existing row —
  - Same `accountId` → return it (idempotent no-op, BR-U6-3 invariant 2).
  - Different `accountId` → return `ALREADY_LINKED_TO_ANOTHER_ACCOUNT` (BR-U6-3 invariant 3); the
    conflicting insert attempt is discarded, nothing is altered.
- This insert-then-resolve-conflict sequence, not a `SELECT`-then-`INSERT` pre-check, is what
  actually closes the race window between two concurrent claim attempts for the same order.

## 4. Report access — two independent modes for the same immutable report (BR-U6-4)

**4a. List report history (`listReportHistory(accountId)`)** — Account Access mode, entry point:
1. `accountId` comes only from the resolved `AccountSession` (workflow 2, step 4) — never accepted
   as a request parameter.
2. `SELECT accountOrderLinks.orderId, linkedAt, linkMethod FROM accountOrderLinks WHERE accountId =
   $1`, joined to `orders`/`evidenceReportArtifacts` for display fields (status, purchase date,
   report-ready state) exactly as the existing guest-facing order/report views already read them —
   no new read model, just an additional `WHERE` scope.

**4b. Open a linked report (`getAccountReport(accountId, orderId)`)** — the actual Account Access
authorization + resolution, invoked when the account opens one of its listed reports:
1. `accountId` from the resolved session (never client-supplied); `orderId` from the request.
2. `SELECT 1 FROM accountOrderLinks WHERE accountId = $1 AND orderId = $2` — this row's existence
   **is** the entire authorization check (BR-U6-4 Mode B). No row → `FORBIDDEN`, returned
   identically whether the order doesn't exist, belongs to no account, or belongs to a different
   account (no ownership-existence oracle).
3. On success: resolve `orders.screeningRequestId → evidenceReportArtifacts.screeningRequestId` to
   the `EvidenceReportArtifact` row — the same join Path B (workflow 3) already performs in the
   other direction, reused here for retrieval.
4. Hand that artifact to the **existing** report-rendering code (unchanged from Unit 2/2B) — Unit 6
   adds a new authorization gate in front of report retrieval, never a new report-storage or
   rendering mechanism. No guest token is reconstructed, recovered, or minted at any point in this
   path.

**Mode A — Guest Access** (unchanged, for contrast): a valid `reportAccessCredentials` bearer token,
resolved via the existing `resolveByAccessToken`, remains an entirely independent, unmodified route
to the same artifact — it coexists with Mode B and is never revoked or altered by linking an
account (BR-U6-4).

## 5. Delete account (`deleteAccount(accountId)`) — account deletion/unlinking behavior

Requires an authenticated session for `accountId` and an explicit confirmation step in the UI
(`frontend-components.md`) — no confirmation, no deletion. Executed as a single transaction:

1. `SELECT email FROM accounts WHERE id = $1` — capture the account's own normalized email **before
   deleting anything**, needed for step 3.
2. `DELETE FROM accountSessions WHERE accountId = $1` (all sessions, including the one used to
   authorize this very request).
3. `DELETE FROM magicLinkTokens WHERE (purpose = 'CLAIM_PURCHASE' AND accountId = $1) OR (purpose =
   'LOGIN' AND email = $2 AND consumedAt IS NULL AND expiresAt > now())` — deletes outstanding
   `CLAIM_PURCHASE` tokens by `accountId` (they carry one, by construction) **and** outstanding
   `LOGIN` tokens by the captured normalized email (they carry no `accountId` — BR-U6-1's
   discriminated shape), closing the gap where a requested-but-unclicked login link could otherwise
   recreate the just-deleted account.
4. `DELETE FROM accountOrderLinks WHERE accountId = $1` — severs ownership; the referenced `Order`/
   `EvidenceReportArtifact` rows are untouched by this statement (they're a different table with no
   cascade back onto them).
5. `DELETE FROM accounts WHERE id = $1`.
6. No statement in this transaction ever targets `orders`, `evidenceReportArtifacts`,
   `reportAccessCredentials`, or any other pre-existing table — satisfying BR-U6-5's retention split
   and RGD-4 by construction (there is no code path that could mutate them here).
7. On commit: clear `ACCOUNT_SESSION_COOKIE` via `Set-Cookie` on the response (it is `HttpOnly` —
   the client cannot clear it itself); the frontend reacts to the successful response and redirects.
8. A retained guest bearer token for a formerly-linked order (if the customer still has it) keeps
   working exactly as before — deletion never touches `reportAccessCredentials` rows, since those
   were never owned by the account in the first place (BR-U6-4 Mode A's independence).
