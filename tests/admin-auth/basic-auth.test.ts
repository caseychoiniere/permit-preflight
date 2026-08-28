import { describe, expect, it } from "vitest";
import { checkBasicAuth } from "../../src/admin-auth/basic-auth.js";

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

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

describe("checkBasicAuth (NFR Design Pattern 1/2, deterministic)", () => {
  it("[hard invariant] fails closed when ADMIN_BASIC_AUTH_USERNAME/PASSWORD are not both configured, regardless of the supplied header", () => {
    withEnv({ ADMIN_BASIC_AUTH_USERNAME: undefined, ADMIN_BASIC_AUTH_PASSWORD: undefined }, () => {
      const request = new Request("https://example.com/admin", { headers: { authorization: basicAuthHeader("admin", "correct-password") } });
      expect(checkBasicAuth(request).outcome).toBe("UNAUTHORIZED");
    });
    withEnv({ ADMIN_BASIC_AUTH_USERNAME: "admin", ADMIN_BASIC_AUTH_PASSWORD: undefined }, () => {
      const request = new Request("https://example.com/admin", { headers: { authorization: basicAuthHeader("admin", "correct-password") } });
      expect(checkBasicAuth(request).outcome).toBe("UNAUTHORIZED");
    });
  });

  it("accepts the exact correct username/password", () => {
    withEnv({ ADMIN_BASIC_AUTH_USERNAME: "admin", ADMIN_BASIC_AUTH_PASSWORD: "correct-horse-battery-staple" }, () => {
      const request = new Request("https://example.com/admin", { headers: { authorization: basicAuthHeader("admin", "correct-horse-battery-staple") } });
      expect(checkBasicAuth(request).outcome).toBe("OK");
    });
  });

  it("[uniform failure response] wrong username, wrong password, both wrong, and a malformed header all produce the identical UNAUTHORIZED outcome shape", () => {
    withEnv({ ADMIN_BASIC_AUTH_USERNAME: "admin", ADMIN_BASIC_AUTH_PASSWORD: "correct-password" }, () => {
      const wrongUsername = checkBasicAuth(new Request("https://example.com/admin", { headers: { authorization: basicAuthHeader("wrong", "correct-password") } }));
      const wrongPassword = checkBasicAuth(new Request("https://example.com/admin", { headers: { authorization: basicAuthHeader("admin", "wrong-password") } }));
      const bothWrong = checkBasicAuth(new Request("https://example.com/admin", { headers: { authorization: basicAuthHeader("wrong", "wrong-password") } }));
      const missing = checkBasicAuth(new Request("https://example.com/admin"));
      const malformedNoBasicPrefix = checkBasicAuth(new Request("https://example.com/admin", { headers: { authorization: "Bearer sometoken" } }));
      const malformedNoColon = checkBasicAuth(
        new Request("https://example.com/admin", { headers: { authorization: `Basic ${Buffer.from("nocolonhere", "utf8").toString("base64")}` } })
      );

      for (const result of [wrongUsername, wrongPassword, bothWrong, missing, malformedNoBasicPrefix, malformedNoColon]) {
        expect(result).toEqual({ outcome: "UNAUTHORIZED" });
      }
    });
  });

  it("a password containing a colon is handled correctly (only the FIRST colon separates username from password)", () => {
    withEnv({ ADMIN_BASIC_AUTH_USERNAME: "admin", ADMIN_BASIC_AUTH_PASSWORD: "pass:word:with:colons" }, () => {
      const request = new Request("https://example.com/admin", { headers: { authorization: basicAuthHeader("admin", "pass:word:with:colons") } });
      expect(checkBasicAuth(request).outcome).toBe("OK");
    });
  });
});
