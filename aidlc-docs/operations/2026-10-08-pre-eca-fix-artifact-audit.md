# Pre-ECA-fix report artifact audit — 2026-10-08

**Why:** until 2026-10-08 the ECA retriever (`src/property-intelligence/seattle-eca.ts`) queried eight of ten hazard services at layer id 0 (nonexistent), and its fallback read only the flood layer, so a hazard whose own layer never answered could be persisted as `NO_INTERSECTION`. Fixed in commit `74abe97` (layer ids, hazard-specific fallback, POST), then tightened (an unanswered individual layer is always `INDETERMINATE`; per-hazard `sourceLayers` provenance is now persisted).

**Method:** read-only SQL against the project's Neon database (`neondb`, the one the local dev/staging environment and the integration tests use). No row was modified, deleted or re-labelled. Immutable historical artifacts stay exactly as generated.

## Findings
| Measure | Result |
|---|---|
| Artifacts in the database | 233, **all generated before the fix** (the fix commit is 2026-10-08 22:38Z; the newest artifact predates it) |
| Artifacts carrying an `environmental-constraints` fact | 18, all **shed** reports, 2026-09-15 to 2026-09-23 |
| Of those: hazards with no individual-layer answer | exactly 8 of 10 in every one |
| Of those: reported as `NO_INTERSECTION` despite no answer | all 18 (up to 8 hazards each), including the two map-dispositive ones (priority habitat, peat settlement) |
| Tied to a paid order | 15 (all Stripe **test mode**, `cs_test_…`; purchasers: the founder's own address and `example.com` test addresses); 3 unpaid |
| Orders in `cs_live_…` (live Stripe) mode | **0**. All 33 paid orders are test mode (28 `cs_test_…`, 5 integration fixtures with no session id) |
| Artifacts without an ECA fact (older or ECA unavailable at the time) | 215; not affected by this defect |

## Classification
All 233 existing artifacts are **pre-fix staging/QA artifacts**. They are not evidence of launch readiness for ECA content. The 18 ECA-bearing ones must not be shown to anyone as a current-quality report.

## Is anything outside staging/test use?
- **No live-mode payment has ever been recorded**, and no purchaser other than the founder's own address and `example.com` fixtures appears. No genuine customer report exists in the database that was audited.
- A **public Vercel Production deployment exists** (`permit-preflight-kohl.vercel.app`, serving all five project types, built from `main`). Its Production-scope environment contains **no Stripe, Resend, Anthropic, MapTiler or `APP_BASE_URL` variables** (those exist only in the Development scope), and `CRON_SECRET` is effectively unset (the 5-minute reconcile cron returns 500 "CRON_SECRET is not configured"). A report can only be produced for a paid order (webhook-created job) or by the CLI-only internal path, so no customer report can have been generated or paid for there. Its `DATABASE_URL` is a sensitive variable that cannot be read back, so its contents were not inspected; the conclusion rests on it being unable to charge.
- Conclusion: **no production/customer report was generated with the broken retriever.** Not a stop condition. (The Production deployment's missing configuration is recorded as a launch-configuration finding, not a correctness issue.)
