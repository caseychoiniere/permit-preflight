# Build Instructions

Shared across units, updated as each unit's Build & Test runs — see the "Unit 1" and "Unit 2"
sections below for what changed at each point.

## Prerequisites
- **Build Tool**: Node.js 22+ (native `fetch` required) + npm, TypeScript 5.9 (`tsc --noEmit`),
  Next.js 16 (`next build --webpack` — the first unit with a real compiled/bundled artifact is
  Unit 2). **Upgraded from Next.js 15.5.23 to 16.3.3 on 2026-08-25**, pre-Unit-3-Infrastructure-
  Design (see `aidlc-docs/audit.md`'s framework-version-correction entry) — Next.js 15 was
  Maintenance LTS nearing end of support, and the project was still pre-launch. `--webpack` is now
  explicit in the `dev`/`build` npm scripts: Next.js 16 defaults both commands to Turbopack, which
  has no equivalent to the `webpack.resolve.extensionAlias` remap this codebase's `.js`-suffixed
  internal import specifiers rely on (required by `tsconfig.json`'s `"moduleResolution": "Bundler"`
  convention, established since Unit 1) — reverting to the already-working Webpack bundler avoided a
  mass rename of internal import specifiers project-wide, which was out of scope for a framework
  version upgrade. Unit 2B adds the Workflow SDK's own build-time compilation step (`workflow/next`'s
  `withWorkflow()`, wired into `next.config.mjs`) — visible as `✓ Compiled workflows in ...ms` at
  the start of `next build`'s output; confirmed still producing the same step/workflow count
  (21 steps, 2 workflows) after the Next.js 16 upgrade.
- **Dependencies**: `drizzle-orm`, `zod`, `@neondatabase/serverless`, `next`, `react`,
  `react-dom`, `maplibre-gl`, `playwright` (runtime, Unit 1/2); Unit 2B adds `stripe`, `resend`,
  `workflow`, `puppeteer-core`, `@sparticuz/chromium`, `ws` (runtime) and `tsx` (dev, for
  `scripts/generate-prototype-report.ts`); `typescript`, `vitest`, `drizzle-kit`, `@types/node`,
  `@types/react`, `@types/react-dom`, `@playwright/test`, `@types/ws` (dev).
- **Environment Variables**: None required for `npm run typecheck`, `npm test`, or `npm run build`.
  `DATABASE_URL` and `ANTHROPIC_API_KEY` are required only for the credentialed integration suite;
  Unit 2B adds `STRIPE_SECRET_KEY` (test-mode) for its own credentialed integration suite, plus
  `STRIPE_WEBHOOK_SECRET`/`RESEND_API_KEY`/`CRON_SECRET`/`APP_BASE_URL` for a real deployment (not
  needed for typecheck/test/build); `NEXT_PUBLIC_MAPTILER_KEY` is optional (map renders without a
  basemap image if unset) — see `.env.example`.
- **System Requirements**: any machine that runs Node.js 22+. PDF rendering and the Playwright
  smoke suite additionally need Chromium installed (`npx playwright install chromium`). Unit 2B's
  PDF-rendering integration test (`puppeteer-core` + `@sparticuz/chromium`) is **Linux-only** — it
  skips cleanly on macOS/Windows and runs for real on Linux CI.

## Build Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (optional — only needed for integration tests / a real basemap)
```bash
cp .env.example .env
# then fill in DATABASE_URL (Neon), ANTHROPIC_API_KEY, and NEXT_PUBLIC_MAPTILER_KEY as needed
```

### 3. Typecheck
```bash
npm run typecheck
```

### 4. Build (Unit 2 onward — Unit 1 alone had no compiled artifact)
```bash
npm run build   # next build - compiles the application, generates all routes
```

### 5. Install Playwright's Browser (once, for PDF rendering + the e2e smoke suite)
```bash
npx playwright install chromium
```

### 6. Verify Build Success
- **Expected Output**: `tsc --noEmit` exits 0 with no output; `next build` reports "Compiled
  successfully" and lists every route (static and dynamic) with no errors.
- **Build Artifacts**: `.next/` (Next.js's build output — gitignored, not committed). Unit 1's
  `src/` remains importable directly as a plain TypeScript package with no build step of its own.
- **Common Warnings**: None expected. `strict: true` and `noUncheckedIndexedAccess: true` are both
  enabled; the build is expected to be zero-warning, zero-error.

## Troubleshooting

### Build Fails with Dependency Errors
- **Cause**: `npm install` not run, or `node_modules` out of sync with `package.json`.
- **Solution**: `rm -rf node_modules package-lock.json && npm install`.

### Build Fails with Compilation Errors
- **Cause**: A type error was introduced, or `drizzle-kit generate` wasn't re-run after a
  `src/db/schema.ts` change (Drizzle's generated migration types can drift from a hand-edited schema).
- **Solution**: Run `npm run typecheck` locally to see the exact error; run `npm run db:generate` after
  any schema.ts change.

### `next build` Fails to Resolve a `.js`-Extension Import
- **Cause**: `src/` uses explicit `.js` extensions in import specifiers (required for Node's
  native ESM resolution). Webpack's default resolver doesn't remap those to the on-disk
  `.ts`/`.tsx` files the way `tsc`'s own bundler resolution does.
- **Solution**: Already handled — `next.config.mjs` sets `resolve.extensionAlias: {".js": [".ts",
  ".tsx", ".js"]}`. If this error reappears, check that config wasn't reverted.

### `next build` Succeeds But `.next/diagnostics/workflows-manifest.json` Registers 0 Workflows
- **Cause (found during Unit 2B Code Generation, real and non-obvious)**: the Workflow SDK's own
  build-time workflow-discovery scanner does its own module resolution, separate from webpack's —
  it does **not** understand this codebase's `.js`-extension-pointing-at-a-`.ts`-file import
  convention, even though webpack itself (via the `extensionAlias` fix above) resolves it fine.
  This fails **silently** — `next build` reports zero errors either way, so the only way to catch
  it is to actually inspect the manifest.
- **Solution**: every import of `src/workflows/report-generation-workflow.ts` /
  `refund-workflow.ts` (from `app/api/webhooks/stripe/route.ts`,
  `src/checkout-fulfillment/index.ts`, `src/checkout-fulfillment/reconciliation.ts`) omits the
  `.js` suffix, with an inline comment at each site. **Verify after any change to those imports**:
  `rm -rf .next && npm run build && python3 -c "import json; print(json.load(open('.next/diagnostics/workflows-manifest.json'))['workflows'].keys())"`
  must list both `src/workflows/refund-workflow.ts` and `src/workflows/report-generation-workflow.ts`.

## Result — Unit 1 (2026-08-22)
`npm run typecheck` — clean, zero errors. No compiled artifact (no deployed runtime in Unit 1).

## Result — Unit 2 (2026-08-23)
`npm run typecheck` — clean, zero errors. `npm run build` — succeeds; all 12 routes compile
(8 API routes, `/`, `/configure`, `/healthz`, `/report/[token]`), static pages generate.
`npx playwright install chromium` — succeeds, enabling real PDF-rendering and browser-smoke
verification in this same sandbox.

## Result — Unit 2B (2026-08-25)
`npm run typecheck` — clean, zero errors. `npm run build` — succeeds; 17 routes compile (4 new
Unit 2B API routes, the Workflow SDK's own 2 internal `.well-known/workflow/*` routes, the new
`/checkout/status` page, plus the 12 carried forward from Unit 2), static pages generate, **and**
`.next/diagnostics/workflows-manifest.json` was directly inspected and confirmed to register both
`reportGenerationWorkflow`/`processRefundWorkflow` and all 5 of their step functions with the
intended execution graph (see the `.js`-extension troubleshooting entry above — this check caught
a real defect on the first build attempt, where the manifest silently registered 0 workflows).
`npx playwright install chromium` unchanged (still used for the unrelated local/CI browser-smoke
suite — PDF rendering itself moved to `puppeteer-core`/`@sparticuz/chromium`, Linux-only, verified
separately per Chromium binary source above).

## Result — Unit 3 (2026-08-25)
`npm run typecheck` — clean, zero errors. `npm run build --webpack` — succeeds; every route from
Unit 2B still compiles unchanged, plus 12 new `app/api/admin/*` routes (ADM-1 through ADM-8) and 6
new `app/admin/*` pages, and `ƒ Proxy (Middleware)` appears in the route list (this project's first
`proxy.ts` — the Next.js 16 pre-route interception convention; see the Platform Maintenance section
above for why this project is on Next.js 16, not 15). `.next/diagnostics/workflows-manifest.json`
re-inspected via the same Python one-liner as Unit 2B's own check — still registers exactly
`src/workflows/refund-workflow.ts` and `src/workflows/report-generation-workflow.ts`, confirming
the new admin refund route's `start(processRefundWorkflow, ...)` call site did not disturb workflow
discovery. Two new environment variables are required for the admin surface (`ADMIN_BASIC_AUTH_
USERNAME`/`PASSWORD`, `ADMIN_OPERATOR_ID`) — none required for typecheck/test/build. Two new
purely-additive migrations were generated (`0003_heavy_wallow.sql`: `admin_action_log` +
`data_source_health` tables + 3 enums; `0004_curly_zuras.sql`: `regulatory_rules.approval_record`
column) — neither applied to a live DB in this sandbox, same discipline as every prior unit.

## Result — Unit 4 (2026-08-27)
`npm run typecheck` — clean, zero errors. `npm run build --webpack` — succeeds; every route from
Unit 3 still compiles unchanged, plus 1 new route
(`app/api/screening-requests/available-project-types` — the Garage Screening Coverage Readiness
gate's public-advertisement half, business-rules.md BR-U4-9). `.next/diagnostics/workflows-manifest
.json` re-inspected — still registers exactly the same 2 workflows as Unit 3, confirming Unit 4
introduced no new asynchronous/durable execution requirement. No new environment variable is
required. No new migration was generated — `screeningRequests.projectType`/`projectDetails` and
`regulatoryRules.applicableProjectType` were already plain `text`/`jsonb` columns (confirmed via a
real read-only codebase audit before Code Generation began); `"garage"` needed zero schema change.

## Result — Unit 5 (2026-08-27, re-verified after 2 correction rounds)
`npm run typecheck` — clean, zero errors. `npm run build --webpack` — succeeds; every route from
Unit 4 still compiles unchanged, plus 2 new routes (`/vacant-land`,
`/api/screening-requests/available-vacant-land-coverage`). `.next/diagnostics/workflows-manifest
.json` unaffected — still registers the same 2 workflows, confirming Unit 5 introduces no new
asynchronous/durable execution requirement. No new environment variable is required. **Two new
migration files**: `0005_expand_vacant_land_workflow.sql` (in the normal `src/db/migrations/`
chain — nullable `project_type`/`project_details`/`applicable_project_type` columns, new nullable
`screening_intent`/`vacant_land_details`/`applicable_workflow_type` columns) and, deliberately
**outside** that chain, `src/db/manual-migrations/pre-activation-enforcement-vacant-land.sql`
(the workflow-shape `CHECK` constraints + their explicit backfill, applied only by the new `npm
run db:enforce-vacant-land` script — never by `npm run db:migrate`). Neither migration applied to
a live DB in this sandbox, same discipline as every prior unit's own generated-but-unapplied
migrations.
