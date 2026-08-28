-- Unit 5 NFR Design Migration Design Pattern - PRE-ACTIVATION ENFORCEMENT phase.
-- Applied only once every deployed application instance is workflow-aware (0005's EXPAND phase
-- fully rolled out) - per the founder's corrected ordering, this migration's CHECK constraints are
-- enforced BEFORE any VACANT_LAND row can ever be written (Code Generation Part 1, Step 9b's
-- persistence-write gate stays false through this migration and beyond, until explicitly flipped).

-- MIGRATE phase (explicit backfill, not relying on the applicable_workflow_type/workflow_type
-- column defaults alone - NFR Design's own "explicit, auditable, idempotent" requirement). Every
-- pre-Unit-5 regulatory_rules row is scoped to EXISTING_PROPERTY; its existing
-- applicable_project_type value is preserved unchanged.
UPDATE "regulatory_rules" SET "applicable_workflow_type" = 'EXISTING_PROPERTY' WHERE "applicable_workflow_type" IS NULL;--> statement-breakpoint

-- screening_requests.workflow_type already defaults to 'EXISTING_PROPERTY' (set before Unit 5),
-- so no row is expected to be NULL here - this UPDATE is a defensive, idempotent no-op for any row
-- that predates the default, kept explicit rather than assumed.
UPDATE "screening_requests" SET "workflow_type" = 'EXISTING_PROPERTY' WHERE "workflow_type" IS NULL;--> statement-breakpoint

-- PRE-ACTIVATION ENFORCEMENT phase - the CHECK constraints themselves.
ALTER TABLE "regulatory_rules" ADD CONSTRAINT "regulatory_rules_applicability_scope_valid" CHECK (("regulatory_rules"."applicable_workflow_type" = 'EXISTING_PROPERTY' AND "regulatory_rules"."applicable_project_type" IS NOT NULL) OR ("regulatory_rules"."applicable_workflow_type" = 'VACANT_LAND' AND "regulatory_rules"."applicable_project_type" IS NULL));--> statement-breakpoint
ALTER TABLE "screening_requests" ADD CONSTRAINT "screening_requests_workflow_shape_valid" CHECK (("screening_requests"."workflow_type" = 'EXISTING_PROPERTY' AND "screening_requests"."project_type" IS NOT NULL AND "screening_requests"."project_details" IS NOT NULL AND "screening_requests"."screening_intent" IS NULL AND "screening_requests"."vacant_land_details" IS NULL) OR ("screening_requests"."workflow_type" = 'VACANT_LAND' AND "screening_requests"."project_type" IS NULL AND "screening_requests"."project_details" IS NULL AND "screening_requests"."screening_intent" IS NOT NULL AND "screening_requests"."vacant_land_details" IS NOT NULL));
