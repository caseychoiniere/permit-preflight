/**
 * normalizeReportTokenInput - Unit 6 Code Generation Part 2 review, correction 2.
 *
 * The "Claim a purchase" form (app/account/page.tsx) tells the customer they may paste "your
 * report access link OR token". The guest report-access email (src/report-access/repository.ts)
 * only ever gives them a LINK of the shape `${APP_BASE_URL}/report#access_token=<encoded token>`,
 * so most customers will paste the whole URL. claimByReportToken (workflows.ts) expects the RAW
 * token, so a pasted URL would previously be hashed as if it were the token itself and always
 * fail - a direct mismatch between the stated promise and the actual behaviour.
 *
 * This helper closes exactly that gap and nothing wider:
 *   - a bare token (anything that is not an http/https URL) is returned trimmed, unchanged
 *   - a Permit Preflight report-access URL carrying `#access_token=<token>` in its FRAGMENT
 *     returns the decoded raw token
 *   - anything else (a malformed URL, a URL with no `access_token` fragment, an unrelated URL)
 *     returns null - the caller treats that identically to an invalid token, never as an oracle
 *
 * It is deliberately NOT a general URL parser: only the `#access_token=` fragment key is read,
 * matching the one and only link shape this application actually issues (and mirroring
 * app/report/page.tsx's own client-side fragment read). It never logs, and the raw token value is
 * only ever returned, never recorded here. The report-access credential architecture is untouched:
 * this changes how a pasted string is interpreted before lookup, nothing about the credential
 * itself.
 */

const ACCESS_TOKEN_FRAGMENT_KEY = "access_token";

export function normalizeReportTokenInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Only strings that are explicitly http/https URLs are treated as links; every other shape is a
  // bare token. (A raw token is opaque base64url-ish text and never starts with a URL scheme.)
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null; // Malformed URL - fail closed, never throw.
  }

  // The token lives in the URL FRAGMENT (`#access_token=...`), never the query string - that is
  // the whole point of the fragment-transport design (it is never sent to any server). Parse the
  // fragment as URL-encoded key/value pairs and read only our one key.
  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (!fragment) return null;

  const token = new URLSearchParams(fragment).get(ACCESS_TOKEN_FRAGMENT_KEY);
  if (!token) return null; // A URL with no access_token fragment (e.g. someone pasted the wrong link).

  return token;
}
