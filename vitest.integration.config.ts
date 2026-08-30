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
