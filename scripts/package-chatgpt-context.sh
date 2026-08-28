#!/usr/bin/env bash
#
# Packages the CURRENT WORKING TREE (tracked + modified + untracked-but-not-gitignored files)
# into a ZIP for handing the whole repo to an external reviewer (e.g. ChatGPT), rooted under a
# `permit-preflight/` directory. Deliberately does NOT use `git archive` - that only packages the
# last commit, silently omitting exactly the uncommitted/untracked work a review usually needs.
#
# Read-only with respect to the repository: never modifies source files, never touches git state
# (no staging, no commits, no working-tree deletions), never uploads anything. The only write is
# the output ZIP itself, and that is written OUTSIDE the repository (../permit-preflight-chatgpt-
# context.zip) so it can never accidentally package itself or be committed.
#
# Secrets are excluded BEFORE the archive is built, not redacted after - both by relying on the
# project's existing .gitignore (which already excludes .env/.env.* while keeping .env.example)
# and, as defense-in-depth independent of .gitignore, an explicit secret-like filename filter
# applied to every candidate file. The finished archive is then independently re-inspected for
# the same patterns; any match deletes the archive and fails loudly rather than shipping it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Not inside a git repository - aborting." >&2
  exit 1
fi

OUTPUT_ZIP="$(cd "$REPO_ROOT/.." && pwd)/permit-preflight-chatgpt-context.zip"
STAGING_PARENT="$(mktemp -d)"
STAGING_DIR="$STAGING_PARENT/permit-preflight"
mkdir -p "$STAGING_DIR"

cleanup() {
  rm -rf "$STAGING_PARENT"
}
trap cleanup EXIT

# Returns 0 (true) if `rel_path` looks like a secret/credential file or a previously-generated
# context archive, and should therefore never be packaged - independent of .gitignore, since an
# untracked credential file dropped into the tree would otherwise pass straight through.
should_exclude() {
  local rel_path="$1"
  local base lower_base lower_path
  base="$(basename "$rel_path")"
  lower_base="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
  lower_path="$(printf '%s' "$rel_path" | tr '[:upper:]' '[:lower:]')"

  # Explicit allow-list: documents expected configuration, never real secrets.
  if [[ "$lower_base" == ".env.example" ]]; then
    return 1
  fi

  case "$lower_base" in
    .env | .env.* | *.pem | *.key | id_rsa | id_rsa.* | id_ed25519 | id_ed25519.* | *.zip)
      return 0
      ;;
  esac

  case "$lower_path" in
    *service-account*.json | *serviceaccount*.json | *credentials*.json | *credential*.json)
      return 0
      ;;
  esac

  return 1
}

file_count=0
excluded_count=0

while IFS= read -r -d '' rel_path; do
  if should_exclude "$rel_path"; then
    excluded_count=$((excluded_count + 1))
    continue
  fi
  # Skip anything that isn't a regular file (e.g. a broken symlink or a submodule gitlink) -
  # git ls-files can report paths that no longer resolve to a plain file.
  if [[ ! -f "$rel_path" ]]; then
    continue
  fi
  dest="$STAGING_DIR/$rel_path"
  mkdir -p "$(dirname "$dest")"
  cp "$rel_path" "$dest"
  file_count=$((file_count + 1))
done < <(git ls-files --cached --others --exclude-standard -z)

if [[ "$file_count" -eq 0 ]]; then
  echo "No files matched for packaging - aborting without writing a ZIP." >&2
  exit 1
fi

rm -f "$OUTPUT_ZIP"
(cd "$STAGING_PARENT" && zip -r -q "$OUTPUT_ZIP" permit-preflight)

# Independent safety inspection of the FINISHED archive - checked by filename pattern against
# its actual contents, not against the pre-filter's own bookkeeping, so a bug in should_exclude
# can't silently pass itself.
SECRET_PATTERN='(^|/)(\.env(\..+)?|[^/]*\.pem|[^/]*\.key|id_rsa[^/]*|id_ed25519[^/]*)$'
violation=""
while IFS= read -r entry; do
  entry_base="$(basename "$entry")"
  if [[ "$entry_base" == ".env.example" ]]; then
    continue
  fi
  if printf '%s' "$entry" | grep -Eiq "$SECRET_PATTERN"; then
    violation="$entry"
    break
  fi
done < <(unzip -Z1 "$OUTPUT_ZIP")

if [[ -n "$violation" ]]; then
  rm -f "$OUTPUT_ZIP"
  echo "SAFETY CHECK FAILED: potentially sensitive file found in the archive: $violation" >&2
  echo "The archive was deleted before this script exited. Nothing was uploaded anywhere." >&2
  exit 1
fi

zip_size_human="$(du -h "$OUTPUT_ZIP" | cut -f1 | tr -d ' ')"
zip_entry_count="$(unzip -Z1 "$OUTPUT_ZIP" | wc -l | tr -d ' ')"

echo "ZIP created: $OUTPUT_ZIP"
echo "Size: $zip_size_human"
echo "Files included: $zip_entry_count"
if [[ "$excluded_count" -gt 0 ]]; then
  echo "Files excluded by the secret/credential filter: $excluded_count"
fi
