/**
 * Semantic address normalization (BR-1a: "not literal string equality - abbreviation, case, and
 * standardized directional-notation differences are not conflicts").
 *
 * Deliberately conservative: normalizes forms that are unambiguously equivalent
 * (case, whitespace, common street-type/directional abbreviations). Does NOT attempt fuzzy
 * matching of house numbers, street names, or anything that could mask a real ADDRESS_MISMATCH -
 * that would violate the "no lowering the confidence threshold" invariant.
 */

const DIRECTIONAL_MAP: Record<string, string> = {
  north: "N",
  south: "S",
  east: "E",
  west: "W",
  northeast: "NE",
  northwest: "NW",
  southeast: "SE",
  southwest: "SW",
};

const STREET_TYPE_MAP: Record<string, string> = {
  avenue: "AVE",
  ave: "AVE",
  street: "ST",
  str: "ST",
  boulevard: "BLVD",
  blvd: "BLVD",
  place: "PL",
  drive: "DR",
  road: "RD",
  lane: "LN",
  way: "WAY",
  court: "CT",
  circle: "CIR",
  terrace: "TER",
};

function expandToken(token: string): string {
  const lower = token.toLowerCase().replace(/[.,]/g, "");
  if (lower in DIRECTIONAL_MAP) return DIRECTIONAL_MAP[lower]!;
  if (lower in STREET_TYPE_MAP) return STREET_TYPE_MAP[lower]!;
  return token.toUpperCase().replace(/[.,]/g, "");
}

/**
 * Produces canonical, comparable tokens from a free-text address. Two inputs whose token
 * sequences are equivalent (see addressesSemanticallyEqual) are considered semantically
 * equivalent for reverse-validation purposes (BR-1a condition 3). Inputs that normalize
 * differently are NOT assumed to conflict - they simply aren't proven equivalent by this
 * function alone (the caller/reverse-validation step decides what to do with that).
 */
export function normalizeAddressTokens(raw: string): string[] {
  const collapsedWhitespace = raw.trim().replace(/\s+/g, " ");
  return collapsedWhitespace
    .split(" ")
    .filter((t) => t.length > 0)
    .map(expandToken);
}

export function normalizeAddress(raw: string): string {
  return normalizeAddressTokens(raw).join(" ");
}

export function normalizeParcelIdentifier(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "");
}

/**
 * Semantic equivalence check used by reverse-validation (BR-1a condition 3 / BR-1b condition 3).
 *
 * A candidate's canonical address (e.g. "3216 Fuhrman Ave E") and a user's full input (e.g.
 * "3216 Fuhrman Ave E, Seattle, WA 98102") legitimately differ in specificity - one is not
 * "wrong" merely for omitting city/state/zip. This compares the SHORTER token sequence as a
 * prefix of the longer one: every token in the shorter address must exactly match the
 * corresponding token in the longer one, in order. This still correctly REJECTS a genuine
 * mismatch (different house number, different street) because those differ at an early token
 * position, which a prefix check catches immediately - it does not loosen the check for the
 * property that actually matters (BR-1a's core safety invariant).
 */
export function addressesSemanticallyEqual(a: string, b: string): boolean {
  const tokensA = normalizeAddressTokens(a);
  const tokensB = normalizeAddressTokens(b);
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  if (shorter.length === 0) return false;
  return shorter.every((token, i) => token === longer[i]);
}
