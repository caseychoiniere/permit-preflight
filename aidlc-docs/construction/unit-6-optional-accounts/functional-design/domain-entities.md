# Unit 6 — Domain Entities (Optional Accounts)

Extends Units 1-5's domain model. Owns a new `Account` service boundary (`components.md`'s
component #15), reusing Unit 2's existing `report-access/credential.ts` token primitives
(`generateAccessCredential`/`hashToken`/`resolveByAccessToken` — 256-bit CSPRNG token, SHA-256
hash-only persistence) for every new token this unit introduces, per the founder's own explicit
"no general auth platform unless proven necessary" instruction. Scope held to the
`requirements.md` §2.4 minimum throughout: authentication, secure purchase linking, report
history, deletion — nothing else.

## `Account` — new, deliberately minimal

```ts
export interface Account {
  id: string;
  email: string; // unique; the only personal data this unit collects beyond what Unit 2B already has
  createdAt: string;
  updatedAt: string;
}
```

No password, no profile fields, no name, no preferences (per the founder's explicit "avoid
profiles/avatars/... unless a genuine requirement makes one unavoidable" — none does).

## `MagicLinkToken` — new (Q1/Q2's authentication and claim mechanism)

```ts
export const MagicLinkPurpose = {
  LOGIN: "LOGIN",
  CLAIM_PURCHASE: "CLAIM_PURCHASE",
} as const;
export type MagicLinkPurpose = (typeof MagicLinkPurpose)[keyof typeof MagicLinkPurpose];

/** Reuses report-access/credential.ts's existing AccessCredential primitive unchanged - the raw
 * token is 256 bits of CSPRNG data, only its SHA-256 hash is ever persisted (tokenHash), the raw
 * value exists only long enough to be emailed once. Short-lived (BR-U6-1) and single-use
 * (consumedAt set on first successful verification, never reused).
 *
 * Transport: the raw token is NEVER placed in a URL query string, pathname, or redirect query
 * parameter (matching this project's own established discipline for `reportAccessToken` - no raw
 * bearer credential in a URL, since URLs are logged/cached/leaked via Referer in ways a POST body
 * is not). It travels only in the email itself, briefly in the browser's URL *fragment*
 * (`#token=...`, never sent to any server as part of a request), and in the body of the one POST
 * that verifies it. See business-logic-model.md's "Magic-link transport" note for the full
 * fragment-to-POST exchange this token type requires on both LOGIN and CLAIM_PURCHASE flows.
 *
 * Consumption is a real atomic persistence invariant, not merely a narrative claim - see
 * business-logic-model.md workflow 2/3's `consumeMagicLinkToken` primitive: a single conditional
 * `UPDATE ... WHERE tokenHash = ? AND purpose = ? AND consumedAt IS NULL AND expiresAt > now()
 * RETURNING ...`, so exactly one concurrent verifier can ever succeed for a given token. */
export interface MagicLinkToken {
  id: string;
  purpose: MagicLinkPurpose;
  tokenHash: string;
  /** LOGIN: the address a real Account must already exist for, or will be created for, at
   * verification time. CLAIM_PURCHASE: the Order's own `customerEmail` - NEVER a client-supplied
   * address (BR-U6-3's hard invariant) - so a successful click on this link is real proof of
   * control over the purchase email specifically, not merely of some email the requester typed. */
  email: string;
  /** Required (non-undefined) only for CLAIM_PURCHASE - which already-authenticated Account
   * initiated the claim request. Structurally absent for LOGIN (there is no account yet). */
  accountId?: string;
  /** Required only for CLAIM_PURCHASE - which Order is being claimed. Structurally absent for
   * LOGIN. */
  orderId?: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}
```

## `AccountSession` — new (Q1's session mechanism)

```ts
/** A real, separate opaque token from the magic-link token that established it (Q1's own
 * explicit instruction) - reuses the same report-access/credential.ts primitive. Delivered via an
 * HttpOnly/Secure/SameSite=Lax cookie (matching shared/cookies.ts's existing
 * CHECKOUT_SESSION_COOKIE/REPORT_ACCESS_COOKIE convention and stated philosophy: "the cookie is a
 * transport, not a new trust boundary" - every request re-validates tokenHash against this table
 * server-side, never trusts the cookie's mere presence). */
export interface AccountSession {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  /** Set when the session is explicitly logged out or superseded by account deletion (BR-U6-5) -
   * a revoked session's token resolves identically to an unknown one (matching
   * resolveByAccessToken's own existing "revoked and unknown resolve identically" invariant). */
  revokedAt?: string;
}
```

**Cookie clearing is a server-response concern, not a client one.** Because
`ACCOUNT_SESSION_COOKIE` is `HttpOnly`, client-side JavaScript cannot read or clear it directly
(that is the entire point of `HttpOnly`). Logout and account deletion both clear it via a
`Set-Cookie` header (expired/max-age-0) on the API response itself, using the same shared cookie
helper `CHECKOUT_SESSION_COOKIE`/`REPORT_ACCESS_COOKIE` already use — the frontend only reacts to a
successful response and redirects; it never attempts to mutate the cookie itself. See
`business-logic-model.md` workflow 2 (logout) and workflow 5 (deletion).

## `AccountOrderLink` — new (Q2's claim/linking record, ACC-2/ACC-3)

```ts
export const PurchaseLinkMethod = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  REPORT_ACCESS_TOKEN: "REPORT_ACCESS_TOKEN",
} as const;
export type PurchaseLinkMethod = (typeof PurchaseLinkMethod)[keyof typeof PurchaseLinkMethod];

/** The real, server-side-authoritative link between an Account and an existing Order (Unit 2B) -
 * this record, not email-text equality, is what ACC-3's report-history query and
 * `authorizeReportAccess` actually check. `orderId` is unique across this table (Q2's own "must
 * not silently transfer" invariant, enforced at the database level, not only in application
 * code, matching this project's own established discipline for `orders`' own partial unique
 * indexes and Unit 5's CHECK constraints) - an Order can be linked to at most one Account at a
 * time. Linking the same (accountId, orderId) pair twice is idempotent (Q2) - re-attempting an
 * already-established link by the SAME account succeeds as a no-op; attempting it for a
 * DIFFERENT account is rejected (BR-U6-3). */
export interface AccountOrderLink {
  id: string;
  accountId: string;
  orderId: string;
  linkedAt: string;
  linkMethod: PurchaseLinkMethod;
}
```

**`AccountOrderLink` is also the authorization record for Account Access to the report itself** —
a second, independent route to the *same* immutable report, alongside Guest Access
(`reportAccessCredentials`'s existing bearer-token mechanism, entirely unchanged). Given a
session-resolved `accountId` and a requested `orderId`, a matching `AccountOrderLink` row is what
authorizes resolving `orders.screeningRequestId → evidenceReportArtifacts.screeningRequestId` to
find the same `EvidenceReportArtifact` row Guest Access would otherwise reach via a bearer token —
this is a new *authorization path* to existing report-rendering code, never a second report-storage
or rendering mechanism, never a reconstruction of the original guest token, and never a freshly
minted replacement guest token. See `business-rules.md` BR-U6-4 and `business-logic-model.md`
workflow 4 for the full two-mode (Guest / Account) model.

## Persistence — new tables (Drizzle conventions matching `db/schema.ts`'s own established style)

```ts
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const magicLinkPurposeEnum = pgEnum("magic_link_purpose", ["LOGIN", "CLAIM_PURCHASE"]);

export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: magicLinkPurposeEnum("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    accountId: uuid("account_id"), // nullable - required only for CLAIM_PURCHASE
    orderId: uuid("order_id"), // nullable - required only for CLAIM_PURCHASE
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    // Mirrors Unit 5's own discriminated-shape CHECK-constraint discipline: a LOGIN token has
    // neither accountId nor orderId; a CLAIM_PURCHASE token has both. Enforced at the database
    // layer, not application-code discipline alone.
    check(
      "magic_link_tokens_purpose_shape_valid",
      sql`(${table.purpose} = 'LOGIN' AND ${table.accountId} IS NULL AND ${table.orderId} IS NULL) OR (${table.purpose} = 'CLAIM_PURCHASE' AND ${table.accountId} IS NOT NULL AND ${table.orderId} IS NOT NULL)`
    ),
  ]
);

export const accountSessions = pgTable("account_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const purchaseLinkMethodEnum = pgEnum("purchase_link_method", ["EMAIL_VERIFICATION", "REPORT_ACCESS_TOKEN"]);

export const accountOrderLinks = pgTable("account_order_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  orderId: uuid("order_id").notNull().unique(), // at most one Account per Order - Q2's own anti-transfer invariant
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  linkMethod: purchaseLinkMethodEnum("link_method").notNull(),
});
```

**No new column on `orders`, `screeningRequests`, `evidenceReportArtifacts`, or
`reportAccessCredentials`** — the claim-by-report-token path (BR-U6-3) resolves an `orderId` from
an existing bearer token entirely through already-existing relationships
(`reportAccessCredentials.reportArtifactId` → `evidenceReportArtifacts.screeningRequestId` →
`orders.screeningRequestId`, `state = 'PAID'`), and `AccountOrderLink` is a genuinely new,
separate table rather than a column added to `orders` — deliberately, since an `Order`'s own
commercial/audit record must remain exactly as it is today regardless of whether/which Account
ever links to it (Q3's own retention requirement).

## Cookie transport — new (`shared/cookies.ts` addition)

```ts
export const ACCOUNT_SESSION_COOKIE = "permit_preflight_account_session";
```

Same `HttpOnly`/`Secure`/`SameSite=Lax` attributes and the same "cookie is a transport, not a new
trust boundary — every caller re-validates server-side" philosophy `CHECKOUT_SESSION_COOKIE`/
`REPORT_ACCESS_COOKIE` already establish, extended to a third cookie rather than a new mechanism.
