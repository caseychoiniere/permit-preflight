ALTER TABLE "regulatory_rules" ALTER COLUMN "applicable_project_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "screening_requests" ALTER COLUMN "project_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "screening_requests" ALTER COLUMN "project_details" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "regulatory_rules" ADD COLUMN "applicable_workflow_type" text DEFAULT 'EXISTING_PROPERTY';--> statement-breakpoint
ALTER TABLE "screening_requests" ADD COLUMN "screening_intent" text;--> statement-breakpoint
ALTER TABLE "screening_requests" ADD COLUMN "vacant_land_details" jsonb;