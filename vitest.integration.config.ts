import { defineConfig } from "vitest/config";

/**
 * Live external-source/DB integration & health tests (King County/Seattle/FEMA/Neon/Anthropic).
 * Requires real credentials (.env or CI secrets) - NOT part of the default `npm test` gate.
 */
export default defineConfig({
  test: {
    name: "integration",
    include: ["tests/**/*.integration.test.ts"],
    environment: "node",
    // Maintenance correction (2026-09-15): multiple integration-test FILES can independently
    // snapshot/restore or otherwise mutate the same well-known, shared dataSourceHealth rows
    // (king-county-parcel-polygon, seattle-building-outlines, seattle-eca) - Vitest's default
    // cross-file parallelism let one file's snapshot/restore interleave with another's, able to
    // restore stale/mid-flight state after the "true" prior state was already restored. Disabling
    // file-level parallelism for the whole integration run is the smallest fix (a built-in Vitest
    // option, not a new locking subsystem) and is an acceptable tradeoff here since integration
    // tests are already outside the fast default `npm test` gate. Tests within one file still run
    // sequentially as before (unmodified).
    fileParallelism: false,
    // Deterministic default so integration tests never fail on a missing APP_BASE_URL merely
    // because the developer's shell doesn't happen to export one (2026-08-27 test-isolation
    // correction) - only takes effect if the environment doesn't already provide one; a real
    // exported APP_BASE_URL (e.g. pointing at a real deployed staging URL) still takes
    // precedence, since Vitest's `env` config does not override an already-set process.env value.
    env: {
      APP_BASE_URL: process.env["APP_BASE_URL"] ?? "http://localhost:3000",
    },
  },
});
