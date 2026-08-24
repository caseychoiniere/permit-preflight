# Build Instructions

Shared across units, updated as each unit's Build & Test runs — see the "Unit 1" and "Unit 2"
sections below for what changed at each point.

## Prerequisites
- **Build Tool**: Node.js 22+ (native `fetch` required) + npm, TypeScript 5.6 (`tsc --noEmit`),
  Next.js 15 (`next build` — the first unit with a real compiled/bundled artifact is Unit 2).
- **Dependencies**: `drizzle-orm`, `zod`, `@neondatabase/serverless`, `next`, `react`,
  `react-dom`, `maplibre-gl`, `playwright` (runtime); `typescript`, `vitest`, `drizzle-kit`,
  `@types/node`, `@types/react`, `@types/react-dom`, `@playwright/test` (dev).
- **Environment Variables**: None required for `npm run typecheck`, `npm test`, or `npm run build`.
  `DATABASE_URL` and `ANTHROPIC_API_KEY` are required only for the credentialed integration suite;
  `NEXT_PUBLIC_MAPTILER_KEY` is optional (map renders without a basemap image if unset) — see
  `.env.example`.
- **System Requirements**: any machine that runs Node.js 22+. PDF rendering and the Playwright
  smoke suite additionally need Chromium installed (`npx playwright install chromium`).

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

## Result — Unit 1 (2026-08-22)
`npm run typecheck` — clean, zero errors. No compiled artifact (no deployed runtime in Unit 1).

## Result — Unit 2 (2026-08-23)
`npm run typecheck` — clean, zero errors. `npm run build` — succeeds; all 12 routes compile
(8 API routes, `/`, `/configure`, `/healthz`, `/report/[token]`), static pages generate.
`npx playwright install chromium` — succeeds, enabling real PDF-rendering and browser-smoke
verification in this same sandbox.
