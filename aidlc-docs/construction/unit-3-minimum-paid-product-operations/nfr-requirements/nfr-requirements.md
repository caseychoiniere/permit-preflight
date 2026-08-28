# Unit 3: NFR Requirements

Reuses Unit 1/2/2B's security discipline (env-only credentials, runtime schema validation at every
trust boundary, never-logged secret list) and general reliability posture unchanged. This unit
introduces the application's first privileged, internal-operator-only surface — sizing what that
needs is this document's main new content.

## NFR-U3-1: Scalability

Unchanged framing from every prior unit's prototype-scale posture (NFR-U2-1/NFR-U2B-1) — single
operator, low request volume, no autoscaling/load-balancing/multi-instance coordination introduced.
The admin surface's own load is negligible by construction (one human, occasional use); nothing
about Unit 3 changes the scalability posture of the customer-facing surfaces it reads from.

## NFR-U3-2: Performance (soft targets, not SLAs)

- Every ADM read (inspection) should complete well within a few seconds — each is a small,
  targeted query (or a short join chain for ADM-5), never a heavy aggregate scan.
- Mutating actions (rule disable/re-enable, data-source override set/clear) complete within one
  short database transaction — no external call involved, so latency is dominated by the
  transaction itself, expected to be well under a second.
- Admin-initiated refund (ADM-6) has the same latency shape as Unit 2B's automatic refund trigger:
  a fast local audit-commit-then-`start()` call (BR-U3-6, corrected) — the actual refund
  *confirmation* remains Stripe-side/webhook-driven and outside this unit's control, unchanged from
  NFR-U2B-2.
- No formal throughput target — matches every prior unit's "soft engineering sanity check, not a
  contractual SLA" framing, especially apt for a tool with exactly one user.

## NFR-U3-3: Availability

No formal uptime SLA, unchanged from prior units. The admin surface being briefly unavailable
(e.g. during a deploy) has no customer-facing impact — it is purely an operational tool, not part
of any customer-facing request path. No special-cased outage handling needed beyond what Vercel
already provides for any deployed route.

## NFR-U3-4: Security

### Authentication (BR-U3-0, unchanged from Functional Design, sized here)
- Single shared **HTTP Basic Auth** credential (`ADMIN_BASIC_AUTH_USERNAME`/
  `ADMIN_BASIC_AUTH_PASSWORD`), server-side environment variables only, gating **every**
  `/admin/*` page and `/api/admin/*` route.
- **Fail closed**: if either credential is unconfigured in the running environment, every admin
  route rejects all requests — never a silent "no auth required" fallback.
- **HTTPS-only** in deployed environments — Basic Auth's credential is only safe to transmit over
  TLS; this is a deployment-configuration requirement (Vercel serves HTTPS by default for any real
  deployment), not new application code.
- **Password strength (founder-directed)**: `ADMIN_BASIC_AUTH_PASSWORD` must be a strong,
  high-entropy value generated deliberately (e.g. a password manager or a CSPRNG-based generator),
  never a memorable/guessable phrase — this is an operational/deployment requirement (what value
  gets set), not something the application can enforce in code beyond documenting it clearly in
  the operations runbook this unit will need.
- **Constant-time comparison**: the credential comparison must not leak timing information that
  could help an attacker narrow down a correct value character-by-character — use a constant-time
  comparison primitive where the runtime provides one, rather than a naive `===`/string-equality
  check.
- **Uniform failure response**: a failed Basic Auth attempt must respond identically whether the
  username, the password, or both were wrong — never a response that reveals which part was
  incorrect.
- **Never logged**: the raw `Authorization` header value and the decoded credential join
  `reportAccessToken`/`DATABASE_URL`/`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`RESEND_API_KEY`/
  `CRON_SECRET` on this codebase's established never-logged list (`src/shared/logger.ts`'s
  documented discipline).
- **No general auth framework**: explicitly no accounts, no RBAC, no password-reset flow, no
  OAuth, no database-backed admin-user table — one operational control, proportionate to
  solo-operator scale.

### Operator Attribution (BR-U3-0a, sized here)
- `ADMIN_OPERATOR_ID` (a separate server-side env var) supplies the identity recorded in
  `AdminActionLog` — independent of the Basic Auth credential itself.
- **Fail closed, independent of authentication**: any mutating admin action must reject
  (not proceed) if `ADMIN_OPERATOR_ID` is absent or blank, even though the caller already passed
  Basic Auth — authentication proves *who is allowed*, it does not by itself supply *what to
  attribute the action to*.

### CSRF Protection for Mutating Admin Routes (founder-directed, this stage's central new
requirement)
Basic Auth alone is not a CSRF defense — browsers cache and automatically re-attach a Basic Auth
credential to same-origin-looking requests, including ones a malicious third-party page could
induce. **Same-origin request validation**, stateless and dependency-free, applies to every
mutating (`POST`/`PUT`/`PATCH`/`DELETE`) `/api/admin/*` request:

1. The expected admin/application origin is derived from trusted **server-side deployment
   configuration** — never from the incoming request's own `Host` header (which an attacker
   controls the framing of, even if not its actual routing).
2. The request's `Origin` header must **exactly** match that expected origin. No substring/suffix
   matching under any circumstance (`https://evil-example.com` must never be treated as matching
   `https://example.com`, including as a suffix/prefix of a longer string).
3. If `Origin` is legitimately absent (some legitimate same-origin requests omit it), fall back to
   `Referer`, parsed to its origin component and compared with the same exact-match rule — never a
   looser check.
4. If neither header establishes a same-origin request, the mutation is **rejected, fail closed**.
5. **`Sec-Fetch-Site`** (Fetch Metadata) is checked as **defense-in-depth**, not the sole
   mechanism — an explicit cross-site value is rejected; `same-origin`/`none` (where legitimately
   applicable) is accepted. Not every client is guaranteed to send Fetch Metadata headers, so this
   never substitutes for the Origin/Referer check above.
6. **Development** may explicitly allow a `localhost` origin (for local `next dev`); **Preview**
   deployments derive/use their own actual trusted Vercel Preview origin, never a weakened/wildcard
   comparison.
7. `GET` requests (all of Workflow 2's read-only inspection) still require Basic Auth but **not**
   this same-origin check — CSRF is a concern for state-changing requests, not reads.
8. **No new state, no new dependency**: no CSRF-token persistence, no session cookie, no
   authentication database table, no general auth framework — this is a stateless header check,
   consistent with Basic Auth's own stateless nature.

### Brute-Force Posture (founder-directed — proportional, not new infrastructure)
No database-backed login-attempt tracking or rate-limiting system is built in Unit 3. The
combination of a required high-entropy password (above) and this surface's low, human-only request
volume makes online brute-force impractical without dedicated infrastructure at this unit's actual
scale. If Vercel offers a cheap, no-new-application-infrastructure way to restrict/rate-limit the
`/admin` path itself (e.g. platform-level access rules), NFR Design may document that as optional
defense-in-depth — it is explicitly not required for this unit's functional correctness, and
nothing here waits on it.

### Data Handled
No new category of sensitive data is introduced. `AdminActionLog.reason`/`metadata` are the only
genuinely new persisted text an operator supplies — `domain-entities.md`'s existing constraint
(never a dumping ground for secrets/full domain records/bearer credentials) is the binding rule;
this NFR section adds no further data-classification requirement beyond what's already fixed there.

## NFR-U3-5: Reliability

### Atomicity for Local Privileged Mutations (BR-U3-9, corrected at Functional Design — restated
here as binding, not reopened)
`RULE_DISABLED`/`RULE_REENABLED`/`DATA_SOURCE_MARKED_UNHEALTHY`/`DATA_SOURCE_OVERRIDE_CLEARED`:
the domain mutation and its `AdminActionLog` entry commit in **one** database transaction — either
both succeed or both roll back. No admin action may ever change regulatory or data-source-health
behavior while leaving no durable audit record of who did it and why.

### Refund Audit Sequencing (BR-U3-6, corrected at Functional Design — restated here as binding)
`REFUND_INITIATED` crosses this application's database and the separately-durable Vercel Workflow
runtime — no distributed transaction, outbox, or generic event system is introduced to fake
atomicity across that boundary. Instead: the `AdminActionLog` entry commits **before**
`start(processRefundWorkflow, ...)` is ever called, so no admin refund command can ever *appear* to
succeed without a durable audit record already existing. Money-state truth remains exactly where
Unit 2B already established it (`Order.state`, confirmed only by a verified Stripe webhook);
`AdminActionLog` records that an operator *initiated* an attempt, never that it *succeeded*.

### Existing Reliability Mechanisms Reused, Not Reimplemented
- `processRefundWorkflow`/`decideRefundAction`'s existing resumability (Unit 2B, unchanged) governs
  a retried admin refund attempt exactly as it governs the automatic path.
- Unit 2B's existing Cron reconciliation check 3 (stale `REFUND_PENDING`) is the backstop for a
  lost `start()` response following an admin-initiated refund — no Unit-3-specific recovery
  mechanism is introduced for this case.

## NFR-U3-6: Maintainability

No new testing/documentation discipline beyond what every prior unit already established
(deterministic test suite for pure logic, live-integration suite for anything requiring
`DATABASE_URL`, code README documenting defects found and fixed) — Code Generation will apply that
same standard to Unit 3's own new code.

## NFR-U3-7: Usability (founder-directed)

Desktop-focused, not mobile-optimized: no dedicated mobile navigation, mobile-specific components,
responsive-breakpoint design exercise, or mobile acceptance-test matrix is built for Unit 3.
Ordinary resilient web layout practices still apply regardless — forms must not depend on a fixed
desktop-only width, wide tables scroll horizontally rather than clipping or overlapping, every
control stays reachable, and text never overlaps or becomes unreadable at a narrower viewport. The
primary, and only actively-designed-for, usability target is a normal laptop/desktop browser.
