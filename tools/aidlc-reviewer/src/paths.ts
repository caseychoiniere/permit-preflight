/**
 * Repository-relative path resolution with defense-in-depth against path traversal, symlink
 * escape, and access to sensitive files. Every artifact/changed-file path the review_gate tool
 * reads goes through resolveRepoPath() - there is no other read path into this module's file
 * access.
 */

import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

/**
 * The repository root this server is allowed to read from. Resolved once at module load from
 * AIDLC_REVIEWER_REPO_ROOT if set (useful for tests), otherwise from the current working
 * directory - Claude Code's project-scoped MCP servers are launched with cwd set to the project
 * root, so no hardcoded, developer-specific absolute path is needed (see .mcp.json).
 */
export const REPO_ROOT = realpathSync(process.env["AIDLC_REVIEWER_REPO_ROOT"] ?? process.cwd());

/** Directory names that are never readable anywhere in the tree, regardless of depth. */
const BLOCKED_DIR_NAMES = new Set([".git", "node_modules", ".ssh", ".aws"]);

/**
 * Filename patterns that are never readable, regardless of directory. Covers dotenv files (exact
 * ".env" and every ".env.*" variant - local/production/etc), common private-key/credential file
 * shapes, and this server's own decision log directory's non-decision files are NOT special-cased
 * here (decisions.jsonl is read via decision-log.ts, not resolveRepoPath, and is safe to expose).
 */
const BLOCKED_FILE_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /^id_rsa(\.pub)?$/i,
  /^id_ed25519(\.pub)?$/i,
  /^id_dsa(\.pub)?$/i,
  /^id_ecdsa(\.pub)?$/i,
  /^\.netrc$/i,
  /^credentials(\.json)?$/i,
  /^\.npmrc$/i,
];

function isBlockedPath(absolute: string): boolean {
  const relative = path.relative(REPO_ROOT, absolute);
  const segments = relative.split(path.sep);
  if (segments.some((segment) => BLOCKED_DIR_NAMES.has(segment))) {
    return true;
  }
  const basename = segments[segments.length - 1] ?? "";
  return BLOCKED_FILE_PATTERNS.some((pattern) => pattern.test(basename));
}

/**
 * Resolves a repository-relative path to an absolute path, guaranteed to be inside REPO_ROOT and
 * not one of the always-blocked sensitive paths - or throws PathSecurityError. Never returns a
 * path outside the repository, even via a symlink that exists inside the repository but resolves
 * outside it.
 */
export function resolveRepoPath(relativePath: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new PathSecurityError("Artifact path must be a non-empty string");
  }
  if (path.isAbsolute(relativePath)) {
    throw new PathSecurityError(`Artifact path must be repository-relative, got an absolute path: ${relativePath}`);
  }

  const absolute = path.resolve(REPO_ROOT, relativePath);

  if (absolute !== REPO_ROOT && !absolute.startsWith(REPO_ROOT + path.sep)) {
    throw new PathSecurityError(`Artifact path escapes repository root: ${relativePath}`);
  }

  if (isBlockedPath(absolute)) {
    throw new PathSecurityError(`Artifact path is blocked (sensitive path): ${relativePath}`);
  }

  // Symlink-escape check: only meaningful once the path exists. A not-yet-existing path cannot
  // be a symlink, so it cannot escape via one - the caller (context.ts) is responsible for
  // treating "does not exist" as its own failure mode when a real file was expected.
  if (existsSync(absolute)) {
    const real = realpathSync(absolute);
    if (real !== REPO_ROOT && !real.startsWith(REPO_ROOT + path.sep)) {
      throw new PathSecurityError(`Artifact path resolves outside the repository via a symlink: ${relativePath}`);
    }
    if (isBlockedPath(real)) {
      throw new PathSecurityError(`Artifact path resolves to a blocked location via a symlink: ${relativePath}`);
    }
  }

  return absolute;
}
