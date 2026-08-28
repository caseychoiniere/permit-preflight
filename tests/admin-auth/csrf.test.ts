import { describe, expect, it } from "vitest";
import { checkSameOrigin } from "../../src/admin-auth/csrf.js";

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const TRUSTED = { APP_BASE_URL: "https://permitpreflight.example", VERCEL_URL: undefined, NODE_ENV: "production" };

describe("checkSameOrigin (NFR Design Pattern 3, deterministic)", () => {
  it("accepts an exact-match Origin header", () => {
    withEnv(TRUSTED, () => {
      const request = new Request("https://permitpreflight.example/api/admin/orders/1/refund", {
        method: "POST",
        headers: { origin: "https://permitpreflight.example" },
      });
      expect(checkSameOrigin(request).outcome).toBe("OK");
    });
  });

  it("[hard invariant] a similar-looking but different origin does NOT match - no substring/suffix matching", () => {
    withEnv({ APP_BASE_URL: "https://example.com", VERCEL_URL: undefined, NODE_ENV: "production" }, () => {
      // evil-example.com must never match example.com (NFR Requirements' own worked example).
      const request = new Request("https://example.com/api/admin/orders/1/refund", {
        method: "POST",
        headers: { origin: "https://evil-example.com" },
      });
      expect(checkSameOrigin(request).outcome).toBe("FORBIDDEN");
    });
  });

  it("falls back to a strictly-parsed Referer origin only when Origin is absent", () => {
    withEnv(TRUSTED, () => {
      const request = new Request("https://permitpreflight.example/api/admin/orders/1/refund", {
        method: "POST",
        headers: { referer: "https://permitpreflight.example/admin/orders/1" },
      });
      expect(checkSameOrigin(request).outcome).toBe("OK");
    });
  });

  it("[hard invariant] fails closed when neither Origin nor Referer is present", () => {
    withEnv(TRUSTED, () => {
      const request = new Request("https://permitpreflight.example/api/admin/orders/1/refund", { method: "POST" });
      expect(checkSameOrigin(request).outcome).toBe("FORBIDDEN");
    });
  });

  it("Sec-Fetch-Site: cross-site is rejected as defense-in-depth, even with a correct Origin header", () => {
    withEnv(TRUSTED, () => {
      const request = new Request("https://permitpreflight.example/api/admin/orders/1/refund", {
        method: "POST",
        headers: { origin: "https://permitpreflight.example", "sec-fetch-site": "cross-site" },
      });
      expect(checkSameOrigin(request).outcome).toBe("FORBIDDEN");
    });
  });

  it("Sec-Fetch-Site: same-origin does not itself grant access without also matching Origin/Referer", () => {
    withEnv(TRUSTED, () => {
      const request = new Request("https://permitpreflight.example/api/admin/orders/1/refund", {
        method: "POST",
        headers: { origin: "https://not-the-trusted-origin.example", "sec-fetch-site": "same-origin" },
      });
      expect(checkSameOrigin(request).outcome).toBe("FORBIDDEN");
    });
  });

  it("Development: falls back to a fixed localhost origin when neither APP_BASE_URL nor VERCEL_URL is set", () => {
    withEnv({ APP_BASE_URL: undefined, VERCEL_URL: undefined, NODE_ENV: "development" }, () => {
      const request = new Request("http://localhost:3000/api/admin/orders/1/refund", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      });
      expect(checkSameOrigin(request).outcome).toBe("OK");
    });
  });

  it("[hard invariant] the Development localhost carve-out never applies outside Development", () => {
    withEnv({ APP_BASE_URL: undefined, VERCEL_URL: undefined, NODE_ENV: "production" }, () => {
      const request = new Request("https://permitpreflight.example/api/admin/orders/1/refund", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      });
      expect(checkSameOrigin(request).outcome).toBe("FORBIDDEN");
    });
  });
});
