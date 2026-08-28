# Unit 3: Minimum Paid-Product Operations — NFR Design Plan

**Status: No open questions — proceeding directly to artifact generation.** The founder's own NFR
Requirements approval message already specified every NFR Design category below at (or past) the
level of concreteness this stage normally elicits through questions. Per the mandatory category
review (not skipped without justification):

- **Resilience Patterns**: no new pattern needed. The four local admin mutations are single
  atomic transactions (no retry semantics required — they either fully commit or fully roll back,
  nothing to retry automatically). The refund path reuses Unit 2B's existing resumable
  `processRefundWorkflow`/Cron-reconciliation resilience unchanged. Justification for asking
  nothing further: the founder's message names the exact sequencing/atomicity behavior required.
- **Scalability Patterns**: no new pattern — NFR-U3-1 already fixes single-operator,
  no-autoscaling scope, unchanged by this stage.
- **Performance Patterns**: no new pattern — NFR-U3-2's soft targets need no dedicated
  optimization strategy (small, targeted queries throughout).
- **Security Patterns**: fully specified — pre-route auth gate + matcher scope, constant-time
  comparison technique, uniform failure response, same-origin CSRF validation with a named
  expected-origin-resolution helper and its per-environment behavior, brute-force posture. Nothing
  left ambiguous.
- **Logical Components**: fully specified — the pre-route auth/CSRF gate itself (`middleware.ts`,
  confirmed below), a generalized atomic-transaction helper (extending Unit 2B's existing
  two-driver pattern), and the persisted `DataSourceHealth` component with its
  observed/override/effective split.

**One tech-stack correction applied, then superseded by a framework upgrade (2026-08-25)**: this
project's installed Next.js version was originally confirmed at **15.5.23**
(`node -e "console.log(require('next/package.json').version)"`), which uses the
`middleware.ts`/`export function middleware` convention. Immediately after this NFR Design stage
completed, the founder ordered a project-wide Next.js 15→16 upgrade (Next.js 15 being Maintenance
LTS, nearing end of support, and the project still pre-launch — see the framework-version-correction
audit entry and `aidlc-docs/aidlc-state.md`). The project is now on Next.js **16.3.3** (confirmed
Active LTS at time of upgrade), so the binding convention for Unit 3's admin pre-route gate is
`proxy.ts`/`export function proxy`, not `middleware.ts`/`export function middleware`. This plan file
is left as a historical record of the original (correct-at-the-time) determination;
`nfr-design-patterns.md`'s Pattern 1 and `logical-components.md` carry the corrected, binding
specification.

## What This Stage Produces

- [x] `aidlc-docs/construction/unit-3-minimum-paid-product-operations/nfr-design/nfr-design-patterns.md`
- [x] `aidlc-docs/construction/unit-3-minimum-paid-product-operations/nfr-design/logical-components.md`
