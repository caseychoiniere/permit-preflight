CREATE TYPE "public"."report_generation_job_state" AS ENUM('QUEUED', 'IN_PROGRESS', 'COMPLETE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."regulatory_rule_lifecycle_state" AS ENUM('RESEARCHED', 'DRAFTED', 'TRIAGED', 'SOURCE_VERIFIED', 'TESTED', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."regulatory_rule_tier" AS ENUM('TIER_1', 'TIER_2');--> statement-breakpoint
CREATE TYPE "public"."screening_request_validation_state" AS ENUM('DRAFT', 'VALID');--> statement-breakpoint
CREATE TABLE "evidence_report_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screening_request_id" uuid NOT NULL,
	"report_generation_job_id" uuid NOT NULL,
	"findings" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"explanation" jsonb,
	"rule_versions_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_retrieval_timestamps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inference_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"derivation_method" text NOT NULL,
	"citation_or_basis" text NOT NULL,
	"lifecycle_state" "regulatory_rule_lifecycle_state" DEFAULT 'RESEARCHED' NOT NULL,
	"version" text NOT NULL,
	"is_test_only_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"applicable_project_type" text NOT NULL,
	"applicable_zone" text NOT NULL,
	"rule_specification" jsonb NOT NULL,
	"citation" jsonb NOT NULL,
	"lifecycle_state" "regulatory_rule_lifecycle_state" DEFAULT 'RESEARCHED' NOT NULL,
	"tier" "regulatory_rule_tier",
	"caveats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"test_cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supersedes_rule_id" uuid,
	"superseded_by_rule_id" uuid,
	"is_test_only_fixture" boolean DEFAULT false NOT NULL,
	"accepted_evidence_quality" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_access_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_artifact_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "report_access_credentials_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "report_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screening_request_id" uuid NOT NULL,
	"generation_authorization" jsonb NOT NULL,
	"state" "report_generation_job_state" DEFAULT 'QUEUED' NOT NULL,
	"claimed_at" timestamp with time zone,
	"retry_attempts" integer DEFAULT 0 NOT NULL,
	"failure_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_report_artifact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_pdf_renderings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_artifact_id" uuid NOT NULL,
	"rendering_version" text DEFAULT '1' NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_hash" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_type" text DEFAULT 'EXISTING_PROPERTY' NOT NULL,
	"confirmed_parcel_id" text NOT NULL,
	"project_type" text NOT NULL,
	"project_details" jsonb NOT NULL,
	"validation_state" "screening_request_validation_state" DEFAULT 'DRAFT' NOT NULL,
	"snapshot" jsonb,
	"snapshot_taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
