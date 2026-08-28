/**
 * Unit 5 (Vacant Land) density arithmetic - SMC 23.44.060.D.1 (U17). Code Generation Part 1, Step
 * 7 - a genuinely new, named, pure function (no rounding/math utility existed anywhere in this
 * codebase before Unit 5).
 *
 * **Corrected per founder review**: the prior version hardcoded the regulatory threshold (0.85)
 * directly in this function and the evaluator applied it whenever a generic density rule was
 * ACTIVE - bypassing U17's own governance. This function is now a genuinely generic, pure rounding
 * primitive with NO regulatory number of its own; the threshold is a required parameter the
 * evaluator supplies ONLY from an ACTIVE U17 `RegulatoryRule`'s own `ruleSpecification`. No ACTIVE
 * U17 rule means this function is never called at all for a real evaluation - the caller discloses
 * no-ACTIVE-coverage instead (evaluate-vacant-land.ts).
 */

/** Generic "a fraction over `thresholdFraction` constitutes an additional unit" rounding rule -
 * NOT ordinary round-half-up. `thresholdFraction` must come from an ACTIVE U17 RegulatoryRule
 * row's own governed content (SMC 23.44.060.D.1's real value is 0.85, but this function itself
 * asserts nothing about that - it is pure arithmetic over whatever threshold it is given). */
export function applyFractionalUnitRounding(rawUnitCount: number, thresholdFraction: number): number {
  const wholeUnits = Math.floor(rawUnitCount);
  const fraction = rawUnitCount - wholeUnits;
  return fraction > thresholdFraction ? wholeUnits + 1 : wholeUnits;
}
