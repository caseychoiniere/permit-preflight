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
  },
});
