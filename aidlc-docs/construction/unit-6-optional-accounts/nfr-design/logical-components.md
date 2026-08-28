# Unit 6 — Logical Components (Optional Accounts)

**One new logical component** (Unit 6 is the first unit to introduce customer-facing
authentication, so unlike Unit 5 this is not purely a boundary clarification on existing modules),
plus responsibility-boundary notes on the existing modules the 5 patterns touch.

## Account & Customer Auth (`src/account-auth/`) — **new**

**Owns**:
- The domain types and persistence for `Account`, `MagicLinkToken`, `AccountSession`,
  `AccountOrderLink` (`domain-entities.md`), and the Drizzle schema/migration additions for their 4
  tables plus the `account_order_links(account_id)` index (NFR-U6-57).
- All 5 business-logic-model.md workflows: `requestLoginLink`, `verifyLoginLink`/
  `completeClaimByEmail`/`logout`, `claimPurchase` (both paths), `listReportHistory`/
  `getAccountReport`, `deleteAccount`.
- Pattern 1's atomic token-consumption statement and Pattern 4's transaction-safe conflict
  resolution — both live here, as the one place either kind of concurrency-sensitive write happens.
- Calling out to `report-access/credential.ts` (Pattern 1, unmodified — a dependency, not a
  modification) and `email-delivery/resend-client.ts` (unmodified — two new templates, same
  adapter).
- Applying Pattern 3's shared CSRF check (via `src/shared/same-origin.ts`, below) to its own
  mutating routes, and Pattern 5's Layer 2 local rate-limiting to its own public endpoints.

**Does not own**: report content, rendering, or storage (delegated to the existing Evidence &
Report Artifact / PDF-rendering components, unchanged); payment/order state (delegated to
`order-payment`/`checkout-fulfillment`, unchanged — this component only *reads* `orders` by id/
`screeningRequestId`, never writes to it); admin authentication (a structurally separate component,
`src/admin-auth/`, sharing only Pattern 3's extracted helper — see below).

## `src/shared/same-origin.ts` — **new, extracted from existing admin CSRF logic**

**Owns**: the origin-agnostic `checkSameOrigin(request, expectedOrigin)` core (Pattern 3) —
`Sec-Fetch-Site` cross-site rejection, exact `Origin` match, `Referer`-origin fallback, fail-closed.
Takes no admin- or account-specific input; produces only `{ outcome: "OK" | "FORBIDDEN" }`.

**Does not own**: trusted-origin resolution (each caller supplies its own `expectedOrigin`) or any
credential/session check — this module never reads a cookie, a Basic Auth header, or any
account/admin identity. It is purely an origin-matching function.

**Callers** (each independently resolves its own trusted origin and applies its own scope of
mutating routes):
- `src/admin-auth/csrf.ts` — unchanged behavior, now delegates its origin-matching logic here;
  still calls `resolveExpectedAdminOrigin()` for its own trusted origin; still applies only to
  `/api/admin/*` mutating routes.
- `src/account-auth/csrf.ts` (new, thin) — calls the same shared core with its own resolved trusted
  origin; applies only to the account-mutating routes Pattern 3 names (`claimPurchase`, `logout`,
  `deleteAccount`, and — **added per this correction** — `completeClaimByEmail`, now that it
  depends on `AccountSession` authentication and mutates account state).

Neither caller can satisfy the other's check by presenting its own credential — the shared function
establishes *same-origin*, not *identity*; identity (admin Basic Auth vs. `AccountSession`) remains
each caller's own, entirely separate concern.

## `src/shared/rate-limiter-instance.ts` — **extended, not replaced**

**Owns**: the process-wide `FailedLookupRateLimiter` singleton(s). Gains one new export,
`accountAuthLocalLimiter`, a second, independently-scoped instance of the **same existing class** —
kept separate from `reportLookupLimiter` (Pattern 5, Layer 2) so report-access and account-auth
abuse resistance never share (and cannot exhaust) one another's budget.

**Does not own**: the authoritative, deployment-wide rate-limiting decision (Pattern 5, Layer 1) —
that responsibility belongs to the Vercel Firewall rule, a platform-configuration artifact this
module has no code-level relationship to at all.

## Report Access / Evidence & Report Artifact (existing, unmodified in behavior — new second caller)

**Owns** (unchanged): `reportAccessCredentials`, `resolveByAccessToken`'s existing lookup, and the
existing artifact-rendering code — every existing Guest Access behavior stays exactly as it was.

**Gains**: a second, independent caller — `getAccountReport` (in `account-auth`) resolves an
`EvidenceReportArtifact` via `orders.screeningRequestId → evidenceReportArtifacts.screeningRequestId`
and hands it to the **same** existing rendering code Guest Access already uses. This is Account
Access's own resolution path (BR-U6-4 Mode B) — it never calls into `report-access/repository.ts`'s
credential-lookup functions at all (there is no guest token in this path to look up), and
`report-access/repository.ts` itself requires no code change to support it.

## Vercel Platform Firewall (deployment configuration — not an application module)

**Owns**: Pattern 5's Layer 1 rate-limiting rule. This is not application code and has no source
file in this project's repository — it is configured via the Vercel dashboard or
`vercel.json`/project settings, tracked as a deployment-configuration artifact, most likely to be
formalized during Unit 6's own Infrastructure Design stage (flagged as a recommendation, not
executed here — see the closing note below).

## Summary — Responsibility Boundary Table

| Component | Produces | Never produces |
|---|---|---|
| `account-auth` | `Account`/session/link state changes, both magic-link flows, report-history/access authorization decisions | A write to `orders`, `evidenceReportArtifacts`, or `reportAccessCredentials`; a regenerated/reconstructed guest token |
| `shared/same-origin.ts` | `OK`/`FORBIDDEN` same-origin verdicts | Any identity/authentication decision |
| `shared/rate-limiter-instance.ts` (both instances) | Local, in-process rate-limit verdicts (defense-in-depth) | An authoritative, deployment-wide rate-limit guarantee |
| Vercel Platform Firewall | The authoritative, deployment-wide rate-limit enforcement | Any application-level state change |
| Report Access / Evidence & Report Artifact | Rendered report content, to either a valid guest token or a valid Account Access authorization | A distinction between which caller requested it, beyond authorization already having been established by the caller's own layer |

No component here re-implements another's responsibility — `account-auth` never re-implements
report rendering or storage; `report-access`/Evidence & Report Artifact never implements account
authorization logic (it is handed an already-resolved artifact id, exactly as before); the shared
CSRF and rate-limiting helpers never make an identity or business decision, only a same-origin or
volume verdict respectively.

---

**Forward note (not executed in this document)**: the Vercel Firewall rule (above) is a genuine new
deployment/cloud-configuration surface, unlike Unit 5, which had none new. This document recommends
Unit 6's Infrastructure Design stage **execute** (not skip) to formally specify that configuration —
a decision for the next stage, not asserted as already made here.
