/**
 * Live Seattle Legistar API integration test - real network call, no credentials required
 * (public API). Uses the real ordinance number behind the Unit 0B shed candidate
 * (tests/fixtures/shed-candidate.ts) as a known-real search term.
 */

import { describe, expect, it } from "vitest";
import { getOrdinanceHistory } from "../../src/regulatory-source-access/index.js";

const KNOWN_REAL_ORDINANCE_SEARCH_TERM = "127376";

describe("Legistar live integration", () => {
  it("getOrdinanceHistory returns real ordinance-history entries for a known ordinance number", async () => {
    const entries = await getOrdinanceHistory(KNOWN_REAL_ORDINANCE_SEARCH_TERM);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.ordinanceNumber === KNOWN_REAL_ORDINANCE_SEARCH_TERM)).toBe(true);
  });

  it("[hard invariant] a search term matching nothing returns an empty array, never a fabricated entry", async () => {
    const entries = await getOrdinanceHistory("ZZZZZ-NO-SUCH-MATTER-99999999");
    expect(entries).toEqual([]);
  });
});
