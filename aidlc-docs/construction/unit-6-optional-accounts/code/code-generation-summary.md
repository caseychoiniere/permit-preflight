# Unit 6 (Optional Accounts) — Code Generation Summary

Full step-by-step detail lives in `aidlc-docs/construction/plans/unit-6-optional-accounts-code-generation-plan.md`
(Part 1's grounded audit + plan, the founder's three bounded corrections, and Part 2's generation).
This file is a short pointer, per this project's "Markdown summaries only" convention for `code/` —
the real application code lives at the workspace root, not here.

**Verification**: `npm run typecheck` (0 errors), `npm test` (323/323 passing — 312 pre-existing +
11 new, zero regressions, including `tests/admin-auth/csrf.test.ts` passing **unmodified**, proving
the CSRF extraction preserved admin behavior byte-for-byte), `npm run build` (clean production
build, all 14 new Unit 6 routes registered — 8 `app/account/*` pages, `/api/account/*` and its 8
sub-routes).

**Created**:
- `src/account-auth/` — `types.ts`, `token-repository.ts`, `account-repository.ts`,
  `link-repository.ts`, `report-access.ts`, `workflows.ts`, `csrf.ts`, `session.ts`
- `src/shared/same-origin.ts` (extracted CSRF core)
- `src/email-delivery/account-templates.ts` (login-link, claim-link)
- `app/account/{login,verify,page,deleted}.tsx`, `app/account/claim/verify/page.tsx`,
  `app/account/reports/[orderId]/page.tsx`
- `app/api/account/{request-login-link,verify-login,verify-claim,logout,delete,reports}/route.ts`,
  `app/api/account/claim/{email,token}/route.ts`, `app/api/account/reports/[orderId]/route.ts`
- `src/db/migrations/0006_glamorous_firestar.sql` (hand-corrected after `drizzle-kit generate` —
  see the migration file's own inline note for why 2 unrelated pre-existing CHECK constraints were
  stripped from the generated output)
- `tests/shared/same-origin.test.ts`, `tests/account-auth/csrf.test.ts` (deterministic, 11 tests),
  `tests/account-auth/workflows.integration.test.ts` (integration, not run in this sandbox)

**Changed**: `src/db/schema.ts` (4 new tables + this schema's first real FK constraints),
`src/db/client.ts` (`withAccountTransaction`), `src/admin-auth/csrf.ts` (delegates to the shared
core, behavior-preserving), `src/shared/app-url.ts` (`resolveExpectedAppOrigin`, aliased for the
existing admin call site), `src/shared/cookies.ts` (`ACCOUNT_SESSION_COOKIE`),
`src/shared/rate-limiter-instance.ts` (`accountAuthLocalLimiter`), `src/shared/logger.ts`
(`LOGIN_LINK_REQUEST_FAILED` event).

**Three founder-directed Part 1 corrections, all implemented**: (1) Path B's join requires
`orders.state = 'PAID'` (`report-access.ts`'s `resolveOrderByReportToken`, with real integration
test coverage for the no-eligible-order case); (2) the Vercel Firewall scope is documented (not
coded) as an exact-4-path `inc`-operator rule, requiring `claimPurchase`'s Path A/Path B to be
**separate routes** (`claim/email` vs. `claim/token`) so the rule can protect only the
email-triggering endpoint; (3) explicit FK constraints with `onDelete` actions — `CASCADE` on every
`accountId` reference, `RESTRICT` on every `orderId` reference — this schema's first real foreign
keys, with real integration test coverage for both the cascade and restrict behaviors.

**One NFR Design correction (session-account binding) also implemented**: `completeClaimByEmail`'s
atomic consumption statement is account-bound (`token-repository.ts`'s `consumeClaimToken`), the
claim-completion sequence is transactional, and `verify-claim`'s route is CSRF-protected.

**Disclosed scope limitations** (not hidden): the Vercel Firewall rule itself remains unconfigured
against any real project (`external-verification-tracker.md` item 17, open).

**Founder review of Part 2 (2026-09-10): REQUEST CHANGES — four bounded customer-facing corrections, all implemented:**
1. **Account Access now reuses the shared `ReportView`** (extracted during the validation pause, after
   this unit was first generated). `app/account/reports/[orderId]/page.tsx` renders `<ReportView>`
   verbatim — same map, findings, requires-verification, uncovered-constraint notices, vacant-land
   scenarios, explanation, evidence notes as the guest and post-checkout views. New
   `GET /api/account/reports/[orderId]/pdf` route: authorization is `AccountSession` →
   `getAccountReport`'s `AccountOrderLink` check → existing `EvidenceReportArtifact` → existing
   `getOrRenderReportPdf()`; it never mints/recovers/reads a guest report-access token, and is passed
   as `ReportView`'s `pdfHref`.
2. **`normalizeReportTokenInput`** (`src/account-auth/report-token-input.ts`, pure/deterministic) —
   the "Claim a purchase" token field now really accepts both a raw token and a pasted
   `.../report#access_token=<token>` link (fragment only, decoded); malformed/unrelated input fails
   closed to `null` → 404 (no oracle). Never logs the token; the credential architecture is untouched.
3. **Customer-facing Order reference** — `deliverGuestReportAccess` now includes an `Order reference`
   line (the Order's own id, the value claim Path A already asks for) in the guest report-ready
   email; also shown on the post-checkout status page. No new identifier/column.
4. **Report-history entries are distinguishable** — `listLinksForAccount` joins `ScreeningRequest`
   and returns `confirmedParcelId`, `workflowType`, `projectType`, `paidAt` (all existing fields);
   the account page card now leads with the screening description + parcel + purchase date, and no
   longer surfaces `linkMethod`.

**Verification (2026-09-10):** `npm run typecheck` 0 errors; `npm test` **421/421** (+25 new
deterministic — `report-token-input.test.ts`, `account-report-surface.test.ts`); `npm run build`
clean; `npm run test:integration` — Unit 6 suite **11/11 against live Neon staging** (3 new
integration tests). 8 unrelated integration failures were a live King County GIS outage, not a code
defect.
