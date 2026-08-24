import { defineConfig } from "@playwright/test";

/**
 * The deliberately small browser smoke suite (NFR-U2-6) - not a comprehensive E2E matrix. Points
 * at a server the CI workflow starts separately (see .github/workflows/ci.yml) so this config
 * doesn't itself own database/environment setup.
 */
const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: { baseURL },
  // Starts `next start` (a real production build must already exist - CI runs `npm run build`
  // first) and waits for it to respond before running tests, tearing it down afterward. Reuses
  // an already-running server locally (e.g. one started manually) rather than starting a second
  // one on the same port.
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
});
