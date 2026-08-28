# Unit 3: NFR Design — Logical Components

No new infrastructure (queue, cache, circuit breaker, external service) — every component below is
application code against the already-approved Neon/Postgres database and Vercel/Next.js runtime,
matching every prior unit's discipline.

| Component | Owns | New/Extended | Notes |
|---|---|---|---|
| **Admin Auth & CSRF Gate** (`proxy.ts`) | Pattern 1 (Basic Auth) + Pattern 3 (CSRF) for every matched request | **New** — this project's first pre-route interception file | Next.js 16.3.3 convention (`export function proxy`), corrected 2026-08-25 from the originally-planned `middleware.ts`/`export function middleware` after the project's framework-version upgrade — see the framework-version-correction audit entry. Matcher: `/admin`, `/admin/:path*`, `/api/admin`, `/api/admin/:path*` only. Runtime is fixed to Node.js by Next.js 16 itself (`proxy` does not support the `edge` runtime and its runtime cannot be configured), so no runtime declaration is needed. |
| **Credential Comparison Helper** | Pattern 2 (fixed-length-digest + `timingSafeEqual`, uniform failure response) | **New**, small, dependency-free (`node:crypto`) | Called from the Admin Auth Gate; no separate export needed elsewhere. |
| **`resolveExpectedAdminOrigin()`** | Pattern 3's per-environment trusted-origin resolution | **New**, extends `src/shared/app-url.ts`'s existing `resolveAppBaseUrl()` | Production/Preview: identical logic (reused, not duplicated). Development: one explicit `localhost` carve-out on top. |
| **`withAdminTransaction`** (or a shared generic `withTransaction`) | Pattern 4's atomic domain-mutation + `AdminActionLog` commit | **New**, generalizes Unit 2B's `withFulfillmentTransaction` (`src/db/client.ts`) | Same `neon-serverless` Pool-scoped-to-one-call shape; Unit 2B's own function is either renamed to the shared generic form or left as-is with Unit 3 adding its own equivalent — a Code Generation-level choice, not fixed here, as long as the underlying Pool-lifecycle discipline (opened, used, closed, never held as a singleton) is not duplicated with different rules. |
| **`AdminActionLog` repository** | Insert (every mutation), read (not exposed to any ADM story directly — this unit has no "view the audit log" story; it exists for future operational/support use, not a Unit 3 UI surface) | **New table + repository** | Append-only — no update/delete function is ever built for it. |
| **`DataSourceHealth` repository** | Pattern 6 — replaces `src/data-source-registry/index.ts`'s in-memory `Map` | **Extended/replaced storage**, same functional contract | `getSourceHealth`, `isKnownUnhealthy` (now reading `effectiveHealthState`), `recordIngestionResult` (writes only `observedHealthState`), `setManualOverride`/`clearManualOverride` (write only `manualOverrideState`), `listUnhealthySources`. Existing callers (`checkReadiness`, Property Intelligence retrievers) keep calling the same conceptual operations — only the storage backing and the two-field split change. |
| **Regulatory Rule Governance — `disable`/`reenable`** | Pattern 4 (paired with `AdminActionLog`) | **New**, extends existing `lifecycle.ts`'s pure-function pattern | Matches `activate()`'s exact shape (`LifecycleResult<RegulatoryRule>`), legal-transition-only, no content mutation possible through this path. |
| **Order & Payment — admin refund entry point** | Pattern 5 | **New thin caller**, zero change to `order-payment`/`processRefundWorkflow` themselves | Unit 3's admin route calls the exact existing `start(processRefundWorkflow, [orderId, reason])`, sequenced after Pattern 5's audit commit — no new refund logic anywhere. |
| **Admin/Support Service reads** (ADM-1/2/3/4/5) | Workflow 2's shared read shape | **New**, thin — each a small query against an existing owner | No new persisted state; `AdminActionLog`/`DataSourceHealth` are the only two genuinely new tables this unit introduces. |
| **Admin frontend** (`app/admin/...`) | `frontend-components.md`'s 4 sections | **New** | Plain Next.js pages/forms, no new UI dependency (`tech-stack-decisions.md`). |

## Explicitly Not Introduced (reaffirmed)

Consistent with the founder's explicit "keep everything else approved" list and NFR-U3-1's
scalability framing: no queue, no Redis, no distributed-transaction/outbox/event-sourcing
mechanism, no CSRF-token/session framework, no database-backed brute-force/rate-limit system, no
new admin-specific UI library, no admin-user-management/RBAC/OAuth, no generalized search
platform, no `FAILED`-job retry mechanism. None of these become justified merely because NFR
Design as a stage exists — only a concrete requirement demonstrating a real need would, and none
currently do.

## Env Vars Introduced by This Unit

| Variable | Classification | Notes |
|---|---|---|
| `ADMIN_BASIC_AUTH_USERNAME` | Server secret | Paired with the password below; both required or every admin route fails closed. |
| `ADMIN_BASIC_AUTH_PASSWORD` | Server secret | Must be high-entropy, deliberately generated — never a memorable phrase (operational requirement, documented in the eventual operations runbook, not enforceable in code beyond that documentation). |
| `ADMIN_OPERATOR_ID` | Server config, not a secret in the credential sense, but not client-exposed either | Supplies `AdminActionLog.operatorId` attribution, independent of the Basic Auth credential (BR-U3-0a). |

No existing env var changes meaning; no existing secret's classification changes.
