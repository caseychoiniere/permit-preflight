import { describe, expect, it } from "vitest";
import { generateAccessCredential, hashToken, resolveByAccessToken, type CredentialStore } from "../../src/report-access/credential.js";

describe("Report Access Credential (NFR Design Pattern 1)", () => {
  it("generates a raw token distinct from its hash, both non-empty", () => {
    const { rawToken, tokenHash } = generateAccessCredential();
    expect(rawToken.length).toBeGreaterThan(20);
    expect(tokenHash).toHaveLength(64); // SHA-256 hex
    expect(tokenHash).not.toBe(rawToken);
  });

  it("[hard invariant] two generated credentials never collide (256-bit entropy)", () => {
    const a = generateAccessCredential();
    const b = generateAccessCredential();
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("hashToken is deterministic - the same raw token always hashes the same way", () => {
    const { rawToken, tokenHash } = generateAccessCredential();
    expect(hashToken(rawToken)).toBe(tokenHash);
  });

  it("[hard invariant] resolveByAccessToken looks up by hash, never by the raw token value", async () => {
    const { rawToken, tokenHash } = generateAccessCredential();
    let queriedHash: string | undefined;
    const store: CredentialStore<{ id: string }> = {
      findActiveByHash: async (hash) => {
        queriedHash = hash;
        return hash === tokenHash ? { id: "report-1" } : undefined;
      },
    };
    const result = await resolveByAccessToken(rawToken, store);
    expect(queriedHash).toBe(tokenHash);
    expect(queriedHash).not.toBe(rawToken);
    expect(result).toEqual({ outcome: "FOUND", report: { id: "report-1" } });
  });

  it("[hard invariant] an unknown token resolves to NOT_FOUND, never throws or fabricates a report", async () => {
    const store: CredentialStore<{ id: string }> = { findActiveByHash: async () => undefined };
    const result = await resolveByAccessToken("some-random-guessed-token", store);
    expect(result).toEqual({ outcome: "NOT_FOUND" });
  });
});
