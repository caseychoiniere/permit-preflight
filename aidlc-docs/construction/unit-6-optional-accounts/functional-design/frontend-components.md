# Unit 6 — Frontend Components (Optional Accounts)

Minimum UI per `requirements.md` §2.4 ("the minimum needed for these two capabilities [report
history, repeat-property analysis] — not a general-purpose user platform"). Five thin routes (two of
them near-identical magic-link landing pages) plus a logout control, no new design system, reusing
existing form/layout primitives from `app/configure/page.tsx` and `app/report/page.tsx`'s own
component conventions. The account-scoped report view itself (`app/account/reports/[orderId]/
page.tsx`, §3) reuses the existing report renderer entirely — it is a new authorization route, not a
new page design.

## 1. `app/account/login/page.tsx` — request/verify login link

- Single email input + submit button. On submit, calls `requestLoginLink` (workflow 1) and always
  renders the same "check your email" confirmation state (no account-enumeration signal, per
  BR-U6-1).
- No password field, no "forgot password" link, no OAuth buttons — none exist.
- Guest checkout entry points (`app/configure/page.tsx`) remain entirely unchanged and do not link
  here or require it — account creation is optional and never interrupts the existing guest flow.

## 2. `app/account/verify/page.tsx` — magic-link landing (LOGIN)

- **The raw token is never in the URL query string or path** — the emailed link carries it in the
  URL *fragment* (`#token=...`), which the browser never sends to any server. On load, client-side
  script reads `location.hash`, immediately calls `history.replaceState(...)` to strip the fragment
  from the visible URL/history, then issues a single `POST { token }` to the verification endpoint
  (per `business-logic-model.md`'s "Magic-link transport" section) — no user action needed beyond
  having clicked the emailed link.
- Success: session cookie is set server-side via `Set-Cookie` on the POST response (`HttpOnly` — the
  page never touches the cookie itself); redirect to `app/account/page.tsx`.
- Failure (`INVALID_OR_EXPIRED`): a single generic message and a link back to
  `app/account/login/page.tsx` to request a new link — no detail on *why* it failed (expired vs.
  already used vs. forged vs. lost a concurrent race all look identical, matching workflow 2's
  no-oracle design).

## 2b. `app/account/claim/verify/page.tsx` — magic-link landing (CLAIM_PURCHASE)

- Same fragment-to-POST pattern as above, distinct route and endpoint (`POST
  /api/account/verify-claim`).
- **Corrected per NFR Design review**: completing a claim now requires **both** the token and an
  active `AccountSession` whose account matches the token's own bound account (workflow 3, Path A
  step 5) — this page does **not** silently complete a claim while the browser is unauthenticated
  or authenticated as a different account.
- Success (token valid, session present, accounts match): the claimed report now appears in
  `app/account/page.tsx`'s report-history list; redirect there.
- Failure — a single generic message covering every case (unknown/expired/consumed token, no
  session, or a session belonging to a different account; per workflow 3's no-oracle principle,
  none is distinguished in the UI): *"Open this verification link in the browser/account where you
  started the claim, or sign in and request a new verification email."* — with a link to
  `app/account/login/page.tsx`. This is an accepted MVP limitation, not a defect to fix further: no
  cross-device claim-transfer/session-handoff infrastructure is built in Unit 6.

## 3. `app/account/page.tsx` — account home: report history + claim + delete

Three sections on one page (deliberately not three separate routes, to keep the surface minimal):

**Report history** — a list (reusing the existing report/order summary card pattern from
`app/report/page.tsx`) populated by `listReportHistory` (workflow 4a): purchase date, screening
address/summary, report status, a link for each. Clicking a report navigates to an account-scoped
report route (e.g. `app/account/reports/[orderId]/page.tsx`) that calls `getAccountReport`
(workflow 4b) — Account Access (BR-U6-4 Mode B), authorized purely by the session + matching
`AccountOrderLink`, never by reusing or reconstructing the original guest bearer link. This is a
second authorization *route* into the same existing report view/renderer, not a second report page
or rendering mechanism. Empty state: "No reports linked to this account yet" plus a pointer to the
claim form below.

**Claim a purchase** — a small form offering both paths (BR-U6-3 / workflow 3), user picks one:
- Path A: an Order reference (order id / confirmation number) input + "Send verification email"
  button → shows the same generic "check your email" pending state; a follow-up visit to the
  emailed claim link (landing on `app/account/claim/verify/page.tsx`, §2b) completes the link and
  redirects here with the new report now listed.
- Path B: a single "paste your report access link or token" input → submits directly, completes
  synchronously, and either adds the report to the list immediately or shows a specific rejection
  (`INVALID_TOKEN`, `ORDER_NOT_FOUND`, or `ALREADY_LINKED_TO_ANOTHER_ACCOUNT` — the one error
  workflow 3 does surface precisely, since it's a real, actionable "contact support" case rather
  than an auth-oracle risk).

**Delete account** — a clearly separated, visually distinct danger-zone control. Clicking it opens
an explicit confirmation step (modal or inline expand — matches this project's existing confirm-
before-irreversible-action pattern used for admin refund actions in `app/admin/`) stating plainly
what is deleted vs. retained (mirrors BR-U6-5's own split) before the final confirm button calls
`deleteAccount` (workflow 5). On success: `ACCOUNT_SESSION_COOKIE` is cleared server-side via
`Set-Cookie` on the response (it is `HttpOnly` — the page never attempts to clear it itself); the
frontend reacts to the successful response and redirects to a simple "Your account has been
deleted" confirmation view (not the login page directly, to avoid implying anything about whether
login would succeed).

## 4. Logout control

A simple "Log out" action available from `app/account/page.tsx` (and anywhere else the session is
shown, e.g. a header state) — calls the `logout` endpoint (workflow 2's logout case), which revokes
the current session and clears `ACCOUNT_SESSION_COOKIE` server-side via `Set-Cookie`; the frontend
reacts to the successful response and redirects to the public homepage — it never mutates the
cookie itself. No "log out of all devices" UI beyond what deletion already provides in full.

## Explicitly not built

Per BR-U6-6 / the founder's avoid-list: no profile/avatar editing, no password-reset UI (no
password exists), no organization/team switcher, no notification-preferences panel, no saved-search
UI, no save/resume-in-progress-request UI (PC-3 deferred — the existing guest `app/configure/page.tsx`
flow is entirely unmodified by this unit).
