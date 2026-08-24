import { defineConfig } from "vitest/config";

/**
 * Default config: deterministic fixture-based domain tests only. No network, no DB, no
 * credentials - runs in CI on every change (`npm test`). Live external-source/DB health tests
 * live in vitest.integration.config.ts (`npm run test:integration`), per NFR Requirements'
 * fixture strategy and Infrastructure Design's execution-environment split.
 */
export default defineConfig({
  test: {
    name: "deterministic",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.integration.test.ts", "node_modules/**"],
    environment: "node",
  },
});
