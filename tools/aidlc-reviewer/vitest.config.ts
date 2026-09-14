import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Points paths.ts's REPO_ROOT at the test fixture repo for the whole run, BEFORE any test
    // file's top-level imports execute - this is what lets resolveRepoPath()'s tests exercise
    // real traversal/symlink/blocklist behavior without touching the actual project repo.
    env: {
      AIDLC_REVIEWER_REPO_ROOT: path.join(dirname, "test", "fixtures", "repo"),
    },
  },
});
