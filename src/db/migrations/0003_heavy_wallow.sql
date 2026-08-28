CREATE TYPE "public"."admin_action_type" AS ENUM('REFUND_INITIATED', 'RULE_DISABLED', 'RULE_REENABLED', 'DATA_SOURCE_MARKED_UNHEALTHY', 'DATA_SOURCE_OVERRIDE_CLEARED');--> statement-breakpoint
CREATE TYPE "public"."admin_target_type" AS ENUM('ORDER', 'REGULATORY_RULE', 'DATA_SOURCE');--> statement-breakpoint
CREATE TYPE "public"."source_health_state" AS ENUM('HEALTHY', 'UNHEALTHY', 'UNKNOWN');--> statement-breakpoint
CREATE TABLE "admin_action_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" text NOT NULL,
	"action_type" "admin_action_type" NOT NULL,
	"target_type" "admin_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_action_log_reason_not_blank" CHECK (length(trim("admin_action_log"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "data_source_health" (
	"source_id" text PRIMARY KEY NOT NULL,
	"observed_health_state" "source_health_state" DEFAULT 'UNKNOWN' NOT NULL,
	"last_successful_retrieval" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_reason" text,
	"manual_override_state" "source_health_state",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
