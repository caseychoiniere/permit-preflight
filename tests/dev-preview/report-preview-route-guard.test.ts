import { afterEach, describe, expect, it, vi } from "vitest";

/** The dev preview page must be unreachable in production builds (never a customer-facing route). */
describe("dev report-preview page - production guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("calls notFound() when NODE_ENV is production, before rendering anything", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = (await import("../../app/dev/report-preview/page.js")).default;
    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});
