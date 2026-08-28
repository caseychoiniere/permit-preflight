import { describe, expect, it } from "vitest";
import { checkAccountSameOrigin } from "../../src/account-auth/csrf.js";

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

describe("checkAccountSameOrigin (Unit 6, NFR Design Pattern 3 correction)", () => {
  it("accepts an exact-match Origin header for an account mutation route", () => {
    withEnv(TRUSTED, () => {
      const request = new Request("https://permitpreflight.example/api/account/delete", {
        method: "POST",
        headers: { origin: "https://permitpreflight.example" },
      });
      expect(checkAccountSameOrigin(request).outcome).toBe("OK");
    });
  });

  it("rejects a cross-origin request", () => {
    withEnv(TRUSTED, () => {
      const request = new Request("https://permitpreflight.example/api/account/delete", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      });
      expect(checkAccountSameOrigin(request).outcome).toBe("FORBIDDEN");
    });
  });

  it("fails closed when neither Origin nor Referer is present", () => {
    withEnv(TRUSTED, () => {
      const request = new Request("https://permitpreflight.example/api/account/delete", { method: "POST" });
      expect(checkAccountSameOrigin(request).outcome).toBe("FORBIDDEN");
    });
  });

  it("[hard invariant] does not depend on any admin credential or admin-scoped env var - only the shared trusted-origin resolver", () => {
    withEnv({ ...TRUSTED, ADMIN_USERNAME: undefined, ADMIN_PASSWORD: undefined }, () => {
      const request = new Request("https://permitpreflight.example/api/account/delete", {
        method: "POST",
        headers: { origin: "https://permitpreflight.example" },
      });
      expect(checkAccountSameOrigin(request).outcome).toBe("OK");
    });
  });
});
