# Unit 3: Minimum Paid-Product Operations — NFR Requirements Plan

**Status: ANSWERED 2026-08-25 — both questions answered, plus detailed additional NFR direction on
brute-force posture and a restatement of the atomicity/sequencing invariants. Proceeding to
generate the NFR requirements/tech-stack-decisions artifacts (Part 2).**

## Context From Functional Design (Already Decided, Not Reopened Here)

Functional Design's BR-U3-0 already carries forward a specific, binding NFR scope for this unit
(the founder's own explicit instruction from the Functional Design review round): HTTPS-only in
deployed environments, a strong high-entropy admin password, the `Authorization` header and
decoded credential never logged, every admin route failing closed if credentials are unconfigured,
CSRF protection for mutating `/api/admin/*` routes (HTTP Basic Auth alone is not a CSRF defense —
browsers cache and auto-attach it), and proportional consideration of brute-force protection
without introducing new infrastructure absent evidence of need. This plan's job is to turn that
into concrete, sized NFR requirements and tech-stack decisions — not to reopen the authentication
model itself (single shared HTTP Basic Auth credential, no accounts/RBAC/OAuth), which is already
approved.

## Plan

- [x] `aidlc-docs/construction/unit-3-minimum-paid-product-operations/nfr-requirements/nfr-requirements.md`
- [x] `aidlc-docs/construction/unit-3-minimum-paid-product-operations/nfr-requirements/tech-stack-decisions.md`
      — confirmed: zero new npm dependencies needed

## Questions

## Question 1
Functional Design fixed that Basic Auth alone isn't a CSRF defense and that mutating
`/api/admin/*` routes need a proportional control — what should that control actually be? (No new
session/token-storage framework is being proposed by any of these options — all are stateless,
consistent with Basic Auth's own stateless nature.)

A) **Origin/Referer header validation** — reject any mutating `/api/admin/*` request whose `Origin`
(or, if absent, `Referer`) header doesn't match this deployment's own expected origin. Zero new
state, zero new dependency, standard browser-enforced header a cross-site form/script cannot forge
to match your real origin.

B) **A double-submit CSRF token** — issue a random token (e.g. via a cookie set alongside the first
successful Basic Auth request) that the client must echo back in a custom header on every mutating
request. More conventional for session-cookie-based apps, but adds real state/plumbing this
otherwise-stateless Basic Auth design doesn't currently have anywhere else.

C) Other (please describe after `[Answer]:` tag below)

[Answer]: A — same-origin request validation (Origin, with a strictly-matched Referer fallback only when Origin is legitimately absent) for every mutating method, expected origin sourced from trusted server-side deployment config (never the incoming Host header), no substring/suffix matching, explicit Development-only localhost allowance, Preview deployments use their real trusted origin, plus Fetch Metadata (`Sec-Fetch-Site`) as defense-in-depth (never the sole defense). GET requests still require Basic Auth but not this check. No CSRF-token persistence, no session cookies, no new dependency.

## Question 2
Is there any requirement that the admin UI work well on a phone/tablet, or is desktop-only
acceptable (an operator using this from a laptop/desktop browser)?

A) **Desktop-only is fine** — no dedicated responsive/mobile design effort; the UI just needs to be
usable in an ordinary desktop browser window. (Basic Auth's native browser prompt and simple
forms/tables will still render on mobile, just not optimized for it.)

B) **Must be genuinely usable on mobile** — e.g., for checking order status or issuing a refund
from a phone while away from a desk.

C) Other (please describe after `[Answer]:` tag below)

[Answer]: A — desktop-focused, not desktop-only-broken-elsewhere: ordinary resilient layout (no fixed desktop-only widths, tables scroll horizontally where needed, controls stay reachable, no text overlap), but no dedicated mobile navigation/components/breakpoint design/mobile test matrix.

## Additional NFR Direction (not a formal question, applied directly)

Brute-force posture for Basic Auth: require a high-entropy `ADMIN_BASIC_AUTH_PASSWORD`, use
constant-time credential comparison where practical, never log supplied `Authorization` values,
failed-auth responses must not reveal whether the username or the password was wrong specifically,
and no database-backed login-attempt/rate-limit system is built in Unit 3. Cheap platform-level
restriction/rate-limiting of the `/admin` surface (if Vercel offers it without new application
infrastructure) may be documented as optional defense-in-depth in NFR Design, but is not required
for functional correctness.

Reaffirmed (already fixed at Functional Design, restated here as binding NFR scope, not reopened):
rule-lifecycle-mutation+AdminActionLog atomicity; data-source-override-mutation+AdminActionLog
atomicity; `ADMIN_OPERATOR_ID` must be configured and non-blank for any mutation; refund-audit
sequencing (audit commit before `start()`) as the durable-attribution guarantee for the one action
that genuinely cannot share a single Postgres transaction with its own workflow start.
