# Unit 6: Optional Accounts — Infrastructure Design Plan

**Status: COMPLETE 2026-08-27 — executes (not skipped), founder-confirmed.** Unlike Unit 5 (which
skipped this stage — no new infrastructure), Unit 6 introduces one genuine new deployment/cloud-
configuration surface: the Vercel Firewall rate-limiting rule NFR Design's Pattern 5 specifies. No
`[Answer]:` question round was needed — NFR Design's own Pattern 5 (already approved, unchanged by
the founder's one NFR Design correction) already fully specifies what this rule protects, its
initial threshold, and why it's the right mechanism; there is no remaining ambiguity for a question
to resolve.

## Why this stage executes, unlike Unit 5

Every other Unit 6 component (`src/account-auth/`, `src/shared/same-origin.ts`, the extended
`rate-limiter-instance.ts`) is ordinary application code deployed exactly as every existing Vercel
Function already is — no new infrastructure choice. The Vercel Firewall rule is different in kind:
it is a **platform-configuration** decision (which paths, what threshold, where it's defined) that
does not live in application source and was correctly identified, during NFR Design review, as
belonging to this stage rather than being silently left as an unconfigured assumption.

## What This Stage Produces
- [x] `aidlc-docs/construction/unit-6-optional-accounts/infrastructure-design/infrastructure-design.md`
  — the one real new infrastructure decision (the Firewall rule's concrete configuration), plus an
  explicit confirmation table that everything else reuses existing Unit 2B/3 infrastructure
  unchanged.
- [x] `aidlc-docs/construction/unit-6-optional-accounts/infrastructure-design/deployment-architecture.md`
  — an updated running-system diagram showing the Firewall layer in front of the existing Vercel
  application, and the account-auth data flow through existing Neon/Resend.

Not proceeding to Code Generation until this document is reviewed and approved.

## Founder Review — APPROVED/COMPLETE, One Non-Blocking Implementation Note

**2026-08-27**. Approved as written. One non-blocking note recorded for Code Generation: Vercel
Firewall rate-limit responses may use the platform's normal `429` behavior — the response is not
required to be byte-for-byte identical to the application's own generic successful-auth responses.
The binding security invariant is narrower and already satisfied: rate limiting must not disclose
Account/Order existence; a distinct `429` based only on request-volume/IP state does not violate
that invariant (it discloses nothing about any specific Account or Order). If a custom Firewall
response is ever configured, that is deployment configuration, not application-domain behavior.

**Unit 6 Infrastructure Design is now COMPLETE.** Proceeding to Code Generation, Part 1.
