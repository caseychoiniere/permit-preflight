/**
 * CLI entry point for the real Unit 6B 19-candidate governance bootstrap (rule-lifecycle admin
 * mechanism plan, §5, 2026-09-24). Thin wrapper over
 * `src/regulatory-rule-governance/bootstrap-unit-6b.ts`'s shared logic - the ONLY caller that
 * supplies the real 19 candidates (`tests/fixtures/shed-permit-candidates.ts`'s
 * `realShedPermitCandidates`) and their real, fixed UUIDs. Never invoked by any automated test
 * (see `tests/regulatory-rule-governance/bootstrap-unit-6b.test.ts`, which exercises the same
 * shared function against synthetic, disposable inputs instead).
 *
 * Usage: `npx tsx scripts/bootstrap-unit-6b-governance.ts`. Requires `ADMIN_OPERATOR_ID` and
 * `DATABASE_URL` to be set. Idempotent - safe to re-run; re-running never overwrites an existing
 * row (insertRuleIfAbsent, ON CONFLICT DO NOTHING) and reports which rows were newly created vs.
 * already present.
 */

import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { bootstrapUnit6bGovernance, type BootstrapCandidate } from "../src/regulatory-rule-governance/bootstrap-unit-6b.js";
import { realShedPermitCandidates, tierForRealShedPermitCandidate } from "../tests/fixtures/shed-permit-candidates.js";

/**
 * The real 19 Unit 6B candidates' fixed row UUIDs (`regulatory_rules.id` is a real Postgres uuid
 * column; `realShedPermitCandidates`' own `id` field is a human-readable string, never used as the
 * row id directly). Generated once via `crypto.randomUUID()`, committed here, never regenerated -
 * mirrors `scripts/staging-test-rules.ts`'s own established idempotent-seeding precedent. Keyed by
 * each candidate's own `input.id` so the mapping stays legible against
 * `tests/fixtures/shed-permit-candidates.ts`.
 */
const FIXED_ROW_IDS: Record<string, string> = {
  "shed-permit-p1-roof-area-2026": "f3d69a72-7a3c-4bd9-ba7f-9109afe07d12",
  "shed-permit-p2a-story-height-2026": "866a4c1a-4371-4e0f-b646-0ff23d94bb83",
  "shed-permit-p2b1-accessory-height-in-setback-2026": "b57c5f7e-f432-45e1-aef1-817c4d6faadb",
  "shed-permit-p2b2-accessory-height-outside-setback-2026": "8c761b65-7b30-493b-9be5-df20d7107164",
  "shed-permit-p3a-foundation-exemption-2026": "b60b31ec-9884-4ed7-a746-c1575c78a811",
  "shed-permit-p3b-foundation-stfi-disqualifier-2026": "5cb06a49-f637-4ddf-a218-705655a289b2",
  "shed-permit-p4-attachment-2026": "0e1a7e0d-988a-4d15-80da-d006e35d1c65",
  "shed-permit-p5-use-2026": "4c239578-35a8-4bbd-8fce-1b8f85d1aba3",
  "shed-permit-p6-eca-criterion-2026": "68c29b20-efc9-4dae-8200-276ded81d48c",
  "shed-permit-p7a-size-span-footprint-2026": "187f923c-2b15-44b9-87fe-19b768a5279d",
  "shed-permit-p7b-size-span-structural-2026": "cfdd1460-74aa-4b2b-b573-e0b476b85559",
  "shed-permit-p9-exemption-not-zoning-compliance-2026": "1438fa68-aecc-4626-bb24-b6229a5fc715",
  "shed-lot-coverage-c1a-base-maximum-2026": "77c3ea8b-883c-4e4e-822d-9e9906cb2dc2",
  "shed-lot-coverage-c1b-eca-exclusion-2026": "b4a5d16a-3047-4dca-8191-17db8a8033c3",
  "shed-lot-coverage-c1c-transit-bonus-2026": "009af91c-80ba-4538-92a4-fd4ff2ad367f",
  "shed-lot-coverage-c1d-stacked-bonus-2026": "b49b2f2d-2ce9-405c-ab95-9c2b13bc6241",
  "shed-lot-coverage-c1e-floor-2026": "931b3b3a-00ef-4d16-b707-6fbc00d8f062",
  "shed-lot-coverage-c1e-director-alternative-2026": "4d3983b7-19a8-4066-93ab-92648569eced",
  "shed-lot-coverage-c2-estimate-caveat-2026": "e6094993-1683-44fc-b27d-f01c27bddc85",
};

// P8 (trade permits, withdrawn) and C3 (superseded) must never appear here - regression guard
// against a future edit silently widening bootstrap's scope beyond the founder-confirmed 19.
const EXCLUDED_IDS = ["shed-permit-p8", "shed-lot-coverage-c3"];

async function main() {
  if (realShedPermitCandidates.length !== 19) {
    throw new Error(`Expected exactly 19 real Unit 6B candidates, found ${realShedPermitCandidates.length}. Refusing to bootstrap - scope may have drifted.`);
  }
  for (const candidate of realShedPermitCandidates) {
    if (EXCLUDED_IDS.some((excluded) => candidate.id.includes(excluded))) {
      throw new Error(`Candidate "${candidate.id}" matches an explicitly excluded id (P8/C3). Refusing to bootstrap.`);
    }
    if (!FIXED_ROW_IDS[candidate.id]) {
      throw new Error(`No fixed row UUID mapped for candidate "${candidate.id}". Refusing to bootstrap an unmapped candidate.`);
    }
  }

  const operatorId = requireOperatorId();
  if (!operatorId) {
    throw new Error("ADMIN_OPERATOR_ID is not configured.");
  }

  const candidates: BootstrapCandidate[] = realShedPermitCandidates.map((input) => ({
    input,
    tier: tierForRealShedPermitCandidate(input.id),
    fixedRowId: FIXED_ROW_IDS[input.id]!,
  }));

  const result = await bootstrapUnit6bGovernance(getDb(), candidates, operatorId);
  console.log(`Bootstrap complete. Created ${result.created.length} row(s), ${result.alreadyPresent.length} already present.`);
  if (result.created.length > 0) {
    console.log("Created:", result.created.join(", "));
  }
  if (result.alreadyPresent.length > 0) {
    console.log("Already present (unchanged):", result.alreadyPresent.join(", "));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
