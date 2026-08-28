/**
 * Basic Auth check (NFR Design Pattern 1) - the admin gate's authentication half. Factored out of
 * proxy.ts (a thin wrapper) so it can be exercised via direct function calls in deterministic
 * tests, not just a real HTTP round-trip against a real deployment.
 */

import { constantTimeEqual } from "./credential-check.js";

export type BasicAuthResult = { outcome: "OK" } | { outcome: "UNAUTHORIZED" };

/** Uniform failure response (founder-directed): whether the username was wrong, the password was
 * wrong, both were wrong, the header was malformed, or credentials are simply unconfigured, the
 * outcome is identical - UNAUTHORIZED. No code path returns a different shape that would let an
 * attacker learn which part of a guess was correct. Malformed headers are never logged - a
 * malformed Authorization header could itself contain attacker-supplied or real-credential data
 * not meant for a log line. */
export function checkBasicAuth(request: Request): BasicAuthResult {
  const configuredUsername = process.env["ADMIN_BASIC_AUTH_USERNAME"];
  const configuredPassword = process.env["ADMIN_BASIC_AUTH_PASSWORD"];
  if (!configuredUsername || !configuredPassword) {
    // Fail closed - a deployment/configuration defect must never silently become "no auth required".
    return { outcome: "UNAUTHORIZED" };
  }

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) {
    return { outcome: "UNAUTHORIZED" };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return { outcome: "UNAUTHORIZED" };
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return { outcome: "UNAUTHORIZED" };
  }
  const suppliedUsername = decoded.slice(0, separatorIndex);
  const suppliedPassword = decoded.slice(separatorIndex + 1);

  // Both comparisons always run (never short-circuited) so "username wrong" and "password wrong"
  // and "both wrong" all take the same code path/shape - the uniform-failure requirement.
  const usernameMatches = constantTimeEqual(suppliedUsername, configuredUsername);
  const passwordMatches = constantTimeEqual(suppliedPassword, configuredPassword);

  if (!usernameMatches || !passwordMatches) {
    return { outcome: "UNAUTHORIZED" };
  }
  return { outcome: "OK" };
}
