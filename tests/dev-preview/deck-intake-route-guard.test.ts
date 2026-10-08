import { afterEach, describe, expect, it, vi } from "vitest";

/** The dev-only deck intake preview must be unreachable in production builds. */
describe("dev deck-intake page - production guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("calls notFound() when NODE_ENV is production, before rendering anything", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = (await import("../../app/dev/deck-intake/page.js")).default;
    expect(() => page()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});
