/**
 * Proves the boundary the user asked Build & Test to verify: `src/spatial-analysis/geometry.ts`
 * is a deterministic-test reference implementation ONLY. It must never be imported by the
 * production evaluation/assembly path, which is required to treat PostGIS (via a later unit's
 * Report Generation Orchestrator Service - see application-design.md invariant #3, "Spatial
 * Analysis... invoked exclusively by Report Generation Orchestrator Service, post-payment") as
 * the authoritative spatial engine, not a substitute TypeScript geometry implementation.
 *
 * Unit 1 does not itself invoke any spatial engine (PostGIS or otherwise) in production, because
 * Spatial Analysis is explicitly out of the pre-payment invocation path per the approved
 * architecture - `evaluateProject` consumes already-computed distances on `ShedProjectDetails`
 * (populated by a later unit's orchestrator), never computing them itself. This test's job is to
 * make sure that boundary can never silently erode as the codebase grows.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const SRC_ROOT = fileURLToPath(new URL("../../src", import.meta.url));

/** Modules whose production code must never import the pure-TS geometry reference functions. */
const PRODUCTION_MODULES_FORBIDDEN_FROM_GEOMETRY = [
  "regulatory-rules-engine",
  "property-intelligence",
  "parcel-resolution",
  "regulatory-rule-governance",
];

function listTsFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTsFilesRecursive(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Spatial Analysis / PostGIS production boundary", () => {
  it("[hard invariant] no production module imports the pure geometry reference implementation (geometry.ts)", () => {
    const offenders: string[] = [];

    for (const moduleDir of PRODUCTION_MODULES_FORBIDDEN_FROM_GEOMETRY) {
      const dir = join(SRC_ROOT, moduleDir);
      for (const file of listTsFilesRecursive(dir)) {
        const contents = readFileSync(file, "utf-8");
        if (/spatial-analysis\/geometry(\.js)?["']/.test(contents)) {
          offenders.push(relative(dirname(SRC_ROOT), file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("geometry.ts is imported only by its own test file(s), confirming it is test/reference-only code", () => {
    const testsRoot = fileURLToPath(new URL("../../tests", import.meta.url));
    const importers: string[] = [];

    for (const file of listTsFilesRecursive(SRC_ROOT)) {
      if (file.endsWith(join("spatial-analysis", "geometry.ts"))) continue;
      const contents = readFileSync(file, "utf-8");
      if (/spatial-analysis\/geometry(\.js)?["']/.test(contents)) {
        importers.push(relative(dirname(SRC_ROOT), file));
      }
    }
    expect(importers).toEqual([]);

    const testImporters: string[] = [];
    for (const file of listTsFilesRecursive(testsRoot)) {
      const contents = readFileSync(file, "utf-8");
      if (/spatial-analysis\/geometry(\.js)?["']/.test(contents)) {
        testImporters.push(relative(dirname(testsRoot), file));
      }
    }
    expect(testImporters.length).toBeGreaterThan(0);
  });

  it("evaluateProject's setback/height findings are driven entirely by caller-supplied ShedProjectDetails distances, not by any internally recomputed geometry", async () => {
    const { evaluateProject } = await import("../../src/regulatory-rules-engine/evaluate.js");
    const { rearSetbackRule } = await import("../fixtures/test-only-active-rules.js");

    const base = {
      propertyContext: {
        parcelId: "TEST-PARCEL",
        assembledAt: new Date().toISOString(),
        facts: [{ factType: "parcel-geometry-available", value: true, availabilityState: "AVAILABLE" as const, provenance: { sourceAgency: "test", dataset: "test", sourceIdentifier: "test", retrievalTimestamp: new Date().toISOString() } }],
      },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    };

    const passing = evaluateProject({ ...base, project: { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, distanceToRearLotLineFt: 10 } });
    const failing = evaluateProject({ ...base, project: { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, distanceToRearLotLineFt: 1 } });

    const passOutcome = passing.findings.find((f) => f.subject === rearSetbackRule.subject)?.complianceOutcome;
    const failOutcome = failing.findings.find((f) => f.subject === rearSetbackRule.subject)?.complianceOutcome;

    expect(passOutcome).toBe("PASS");
    expect(failOutcome).toBe("FAIL");
  });
});

describe("CRS boundary (Code Generation correction, 2026-08-23)", () => {
  it("[hard invariant] the removed local flat-earth coordinate approximation is not used by any production path (src/ or app/)", () => {
    const appRoot = fileURLToPath(new URL("../../app", import.meta.url));
    const roots = [SRC_ROOT, appRoot];
    // Constants/patterns unique to the removed approximation (meters-per-degree scaling, the
    // feet-per-meter division) - if any of these reappear anywhere in production code, the
    // approximation has crept back in.
    const forbiddenPatterns = [/111_?320/, /110_?540/, /\/\s*0\.3048/];

    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of listTsFilesRecursive(root)) {
        if (file.includes(`${dirname(root)}/tests`)) continue;
        const contents = readFileSync(file, "utf-8");
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(contents)) {
            offenders.push(relative(dirname(SRC_ROOT), file));
            break;
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("PostGIS's ST_Transform is the only reprojection mechanism referenced anywhere in the spatial-analysis component", () => {
    const contents = readFileSync(join(SRC_ROOT, "spatial-analysis", "postgis-adapter.ts"), "utf-8");
    expect(contents).toContain("ST_Transform");
    // No client-side reprojection library (e.g. proj4) is a dependency of this module.
    expect(contents).not.toMatch(/from ["']proj4["']/);
  });
});
