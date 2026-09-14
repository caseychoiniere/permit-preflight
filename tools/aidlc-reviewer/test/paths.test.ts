import { describe, expect, it } from "vitest";
import { PathSecurityError, REPO_ROOT, resolveRepoPath } from "../src/paths.js";

describe("resolveRepoPath", () => {
  it("accepts a normal repository-relative path", () => {
    const resolved = resolveRepoPath("aidlc-docs/sample.md");
    expect(resolved.startsWith(REPO_ROOT)).toBe(true);
    expect(resolved.endsWith("aidlc-docs/sample.md")).toBe(true);
  });

  it("accepts the repo root's own governing policy path", () => {
    expect(() => resolveRepoPath(".ai/reviewer/decision-policy.md")).not.toThrow();
  });

  it("rejects ../ traversal that escapes the repository root", () => {
    expect(() => resolveRepoPath("../../../etc/passwd")).toThrow(PathSecurityError);
  });

  it("rejects a traversal path that climbs out and back in", () => {
    expect(() => resolveRepoPath("aidlc-docs/../../outside/secret.txt")).toThrow(PathSecurityError);
  });

  it("rejects an absolute path", () => {
    expect(() => resolveRepoPath("/etc/passwd")).toThrow(PathSecurityError);
  });

  it("rejects .env", () => {
    expect(() => resolveRepoPath(".env")).toThrow(PathSecurityError);
  });

  it("rejects a path inside .git", () => {
    expect(() => resolveRepoPath(".git/config")).toThrow(PathSecurityError);
  });

  it("rejects a path inside node_modules", () => {
    expect(() => resolveRepoPath("node_modules/somejunk")).toThrow(PathSecurityError);
  });

  it("rejects a private key file under .ssh", () => {
    expect(() => resolveRepoPath(".ssh/id_rsa")).toThrow(PathSecurityError);
  });

  it("rejects a symlink that resolves outside the repository root", () => {
    // aidlc-docs/escape-link.md is a symlink (created by the test fixture setup) pointing at
    // test/fixtures/outside/secret.txt, which is outside REPO_ROOT.
    expect(() => resolveRepoPath("aidlc-docs/escape-link.md")).toThrow(PathSecurityError);
  });

  it("rejects an empty path", () => {
    expect(() => resolveRepoPath("")).toThrow(PathSecurityError);
  });
});
