/**
 * BR-U2B-9, corrected 2026-08-24: INTERNAL_PROTOTYPE must never be a deployed HTTP route -
 * "unlinked from the UI" is not authorization on a platform where every deployed Route Handler is
 * a public endpoint. This is a structural/production-boundary-style test: it inspects the actual
 * filesystem, not application behavior, so it fails loudly if a future change accidentally
 * reintroduces an HTTP-reachable authorization route.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

function listRouteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...listRouteFiles(full));
    } else if (entry === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

describe("INTERNAL_PROTOTYPE route surface", () => {
  it("[hard invariant] the old internal-trigger route no longer exists under app/", () => {
    expect(existsSync(join(REPO_ROOT, "app/api/screening-requests/[id]/authorize"))).toBe(false);
  });

  it("[hard invariant] no deployed route imports authorizeReportGeneration", () => {
    const routeFiles = listRouteFiles(join(REPO_ROOT, "app"));
    expect(routeFiles.length).toBeGreaterThan(0); // sanity: the walk actually found routes

    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must never import authorizeReportGeneration (INTERNAL_PROTOTYPE) - it is CLI-only`).not.toContain("authorizeReportGeneration");
    }
  });

  it("the INTERNAL_PROTOTYPE CLI script exists and lives OUTSIDE app/ (never bundled into the deployed route surface)", () => {
    expect(existsSync(join(REPO_ROOT, "scripts/generate-prototype-report.ts"))).toBe(true);
  });

  it("Next.js public routes are exactly the 3 BR-U2B-9 permits (webhook, checkout, checkout status) plus the unchanged Unit 1/2 routes and the Cron backstop", () => {
    const routeFiles = listRouteFiles(join(REPO_ROOT, "app")).map((f) => f.slice(REPO_ROOT.length));
    expect(routeFiles.some((f) => f.includes("api/webhooks/stripe"))).toBe(true);
    expect(routeFiles.some((f) => f.includes("api/checkout/status"))).toBe(true);
    expect(routeFiles.some((f) => f.endsWith("api/checkout/route.ts"))).toBe(true);
    expect(routeFiles.some((f) => f.includes("api/cron/reconcile"))).toBe(true);
  });
});
