/**
 * ADM-5, corrected 2026-08-25: customerEmail is PII and must never appear in a request path or
 * query string (Vercel platform observability records both). Structural/production-boundary-style
 * tests, matching internal-prototype-route-surface.test.ts's own style - they inspect the actual
 * filesystem/source, not application behavior, so they fail loudly if a future change
 * reintroduces email into a URL.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

describe("ADM-5 order search route surface", () => {
  it("[hard invariant] the old GET /api/admin/orders?email= route no longer exists", () => {
    expect(existsSync(join(REPO_ROOT, "app/api/admin/orders/route.ts"))).toBe(false);
  });

  it("[hard invariant] the search route is POST-only (a query-string GET search is never reintroduced)", () => {
    const source = readFileSync(join(REPO_ROOT, "app/api/admin/orders/search/route.ts"), "utf8");
    expect(source).toMatch(/export async function POST/);
    expect(source).not.toMatch(/export async function GET/);
  });

  it("[hard invariant] the search route reads its input from the request body, never from request.url's query string", () => {
    const source = readFileSync(join(REPO_ROOT, "app/api/admin/orders/search/route.ts"), "utf8");
    expect(source).toMatch(/request\.json\(\)/);
    expect(source).not.toMatch(/searchParams/);
    expect(source).not.toMatch(/new URL\(request\.url\)/);
  });

  it("[hard invariant] the order-search admin page never places the searched value into a URL, query string, or redirect", () => {
    const source = readFileSync(join(REPO_ROOT, "app/admin/orders/page.tsx"), "utf8");
    expect(source).not.toMatch(/\?email=/);
    expect(source).not.toMatch(/searchParams/);
    expect(source).not.toMatch(/encodeURIComponent\(email\)/);
    // The fetch call must POST to the fixed search endpoint, not build a per-search URL.
    expect(source).toMatch(/fetch\("\/api\/admin\/orders\/search"/);
  });

  it("the report-id-native provenance route operates on EvidenceReportArtifact.id, not a ReportGenerationJob id", () => {
    expect(existsSync(join(REPO_ROOT, "app/api/admin/reports/[jobId]/provenance/route.ts"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "app/api/admin/reports/[reportId]/provenance/route.ts"))).toBe(true);
  });
});
