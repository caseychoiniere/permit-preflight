import { describe, expect, it } from "vitest";
import { packageEvidenceBundle, type PermittedSourceEvidenceBundle } from "../../src/regulatory-source-access/index.js";

const validBundle: PermittedSourceEvidenceBundle = {
  sourceExcerpts: [{ text: "Accessory structures shall be set back...", citation: "SMC 23.44.090 Table A" }],
  citationMetadata: { smcSections: ["SMC 23.44.090 Table A"], ordinanceNumber: "127376" },
  acquisitionMethod: "human-interactive-browser (Municode)",
  acquiredAt: "2026-08-19T00:00:00Z",
};

describe("packageEvidenceBundle", () => {
  it("passes through a bundle with at least one source excerpt unchanged", () => {
    expect(packageEvidenceBundle(validBundle)).toEqual(validBundle);
  });

  it("[hard invariant] rejects an empty evidence bundle rather than packaging it as if evidence existed", () => {
    expect(() => packageEvidenceBundle({ ...validBundle, sourceExcerpts: [] })).toThrow(/at least one source excerpt/i);
  });
});
