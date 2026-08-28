import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { resolveOrderIdFromAuthorization } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../src/screening-request/authorization.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

describe("ADM-4: resolveOrderIdFromAuthorization", () => {
  it("a VERIFIED_PAYMENT job's affected Order is correlated directly from its own authorization", () => {
    const authorization: GenerationAuthorization = {
      type: GenerationAuthorizationType.VERIFIED_PAYMENT,
      screeningRequestId: "screening-1",
      orderId: "order-1",
      authorizedAt: "2026-08-25T00:00:00.000Z",
    };
    expect(resolveOrderIdFromAuthorization(authorization)).toBe("order-1");
  });

  it("[hard invariant] an INTERNAL_PROTOTYPE job truthfully has no customer Order - never invented", () => {
    const authorization: GenerationAuthorization = {
      type: GenerationAuthorizationType.INTERNAL_PROTOTYPE,
      screeningRequestId: "screening-1",
      authorizedBy: "founder@example.com",
      authorizedAt: "2026-08-25T00:00:00.000Z",
    };
    expect(resolveOrderIdFromAuthorization(authorization)).toBeUndefined();
  });
});

describe("ADM-4 failed-jobs route surface", () => {
  it("[hard invariant] no retry/requeue action exists anywhere under the failed-jobs admin path", () => {
    expect(existsSync(join(REPO_ROOT, "app/api/admin/failed-jobs"))).toBe(true);
    const source = readFileSync(join(REPO_ROOT, "app/api/admin/failed-jobs/route.ts"), "utf8");
    expect(source).toMatch(/export async function GET/);
    expect(source).not.toMatch(/export async function POST/);
    expect(source).not.toMatch(/export async function PUT/);
    expect(source).not.toMatch(/export async function PATCH/);
  });

  it("the failed-jobs route response includes retryAttempts (via job.retryAttempts, unmodified from the DB row)", () => {
    const source = readFileSync(join(REPO_ROOT, "app/api/admin/failed-jobs/route.ts"), "utf8");
    expect(source).toMatch(/retryAttempts:\s*job\.retryAttempts/);
  });
});
