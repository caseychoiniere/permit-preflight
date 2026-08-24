/**
 * Boundary Validator (NFR Design Pattern 2, unit-1 nfr-design-patterns.md).
 *
 * One consistent cross-cutting pattern applied at every trust boundary Unit 1 has:
 * AddressInput, ParcelIdentifierInput, and every external API response.
 *
 * Domain logic never receives raw external input directly - only the validated, domain-shaped
 * result of `validateAtBoundary`. TypeScript's compile-time typing alone is not treated as
 * sufficient (requirements.md SS6) - this performs real runtime validation via zod schemas
 * supplied by each component.
 */

import type { ZodType } from "zod";

export type ValidationResult<T> =
  | { outcome: "VALID"; data: T }
  | { outcome: "INVALID"; issues: string[] };

/**
 * Validates `raw` against `schema`. Never throws - callers must handle both outcomes
 * explicitly, consistent with "domain logic never consumes unvalidated external input directly."
 */
export function validateAtBoundary<T>(schema: ZodType<T>, raw: unknown): ValidationResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { outcome: "VALID", data: result.data };
  }
  return {
    outcome: "INVALID",
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}
