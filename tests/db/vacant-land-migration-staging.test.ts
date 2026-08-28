/**
 * Deterministic (no DB) test proving the staged migration is actually executable in the designed
 * order (Code Generation review Correction 4B) - `npm run db:migrate` (`drizzle-kit migrate`)
 * applies every migration file present in `src/db/migrations/` with a journal entry. The
 * PRE-ACTIVATION ENFORCEMENT phase must NOT be one of those files/entries, or the staged rollout
 * (EXPAND -> application rollout -> PRE-ACTIVATION ENFORCEMENT -> persistence-write activation)
 * would collapse into a single automatic step, exactly the defect the founder found.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "src", "db", "migrations");
const MANUAL_MIGRATIONS_DIR = join(process.cwd(), "src", "db", "manual-migrations");
const JOURNAL_PATH = join(MIGRATIONS_DIR, "meta", "_journal.json");
const ENFORCEMENT_FILE = join(MANUAL_MIGRATIONS_DIR, "pre-activation-enforcement-vacant-land.sql");

describe("Unit 5 staged migration - PRE-ACTIVATION ENFORCEMENT is NOT in the normal db:migrate chain", () => {
  it("[hard invariant] the normal migrations directory contains no file mentioning the workflow-shape CHECK constraint", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    for (const file of files) {
      const contents = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      expect(contents).not.toMatch(/ADD CONSTRAINT "screening_requests_workflow_shape_valid"/);
      expect(contents).not.toMatch(/ADD CONSTRAINT "regulatory_rules_applicability_scope_valid"/);
    }
  });

  it("[hard invariant] the journal (what drizzle-kit migrate actually applies) has no entry for the enforcement migration", () => {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as { entries: { tag: string }[] };
    const tags = journal.entries.map((e) => e.tag);
    expect(tags.some((t) => t.includes("pre_activation_enforcement") || t.includes("workflow_shape"))).toBe(false);
  });

  it("the EXPAND-phase migration (0005) exists in the normal chain and adds the nullable columns only, no CHECK constraint", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith("0005"));
    expect(files).toHaveLength(1);
    const contents = readFileSync(join(MIGRATIONS_DIR, files[0]!), "utf8");
    expect(contents).toMatch(/ADD COLUMN "applicable_workflow_type"/);
    expect(contents).toMatch(/ADD COLUMN "screening_intent"/);
    expect(contents).not.toMatch(/ADD CONSTRAINT/);
  });

  it("[hard invariant] the enforcement SQL is preserved in a separate, explicit location outside the automatic chain", () => {
    expect(existsSync(ENFORCEMENT_FILE)).toBe(true);
    const contents = readFileSync(ENFORCEMENT_FILE, "utf8");
    expect(contents).toMatch(/ADD CONSTRAINT "screening_requests_workflow_shape_valid"/);
    expect(contents).toMatch(/ADD CONSTRAINT "regulatory_rules_applicability_scope_valid"/);
    // The explicit MIGRATE-phase backfill lives here too, not silently assumed.
    expect(contents).toMatch(/UPDATE "regulatory_rules" SET "applicable_workflow_type"/);
  });

  it("a dedicated npm script exists for applying the enforcement migration explicitly, separate from db:migrate", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["db:enforce-vacant-land"]).toBeDefined();
    expect(packageJson.scripts["db:enforce-vacant-land"]).not.toBe(packageJson.scripts["db:migrate"]);
  });
});
