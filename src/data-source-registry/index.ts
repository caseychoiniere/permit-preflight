/**
 * Data Source Registry - domain-entities.md "Data Source Registry". Owns cross-cutting metadata
 * about each external authoritative source, independent of any single property lookup.
 *
 * Persisted since Unit 3 (2026-08-25) - see repository.ts and types.ts. Originally in-memory for
 * Unit 1 (a process-local Map); replaced because Vercel Functions are stateless, independent
 * invocations with no shared process memory, so an admin override set via one Function instance
 * would have been invisible to a different instance handling the next checkout attempt.
 */

export * from "./types.js";
export * from "./repository.js";
