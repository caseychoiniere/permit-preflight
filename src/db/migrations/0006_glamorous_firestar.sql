CREATE TYPE "public"."magic_link_purpose" AS ENUM('LOGIN', 'CLAIM_PURCHASE');--> statement-breakpoint
CREATE TYPE "public"."purchase_link_method" AS ENUM('EMAIL_VERIFICATION', 'REPORT_ACCESS_TOKEN');--> statement-breakpoint
CREATE TABLE "account_order_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"link_method" "purchase_link_method" NOT NULL,
	CONSTRAINT "account_order_links_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "account_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "account_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "magic_link_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"account_id" uuid,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "magic_link_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "magic_link_tokens_purpose_shape_valid" CHECK (("magic_link_tokens"."purpose" = 'LOGIN' AND "magic_link_tokens"."account_id" IS NULL AND "magic_link_tokens"."order_id" IS NULL) OR ("magic_link_tokens"."purpose" = 'CLAIM_PURCHASE' AND "magic_link_tokens"."account_id" IS NOT NULL AND "magic_link_tokens"."order_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "account_order_links" ADD CONSTRAINT "account_order_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_order_links" ADD CONSTRAINT "account_order_links_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_order_links_account_id_idx" ON "account_order_links" USING btree ("account_id");
-- NOTE (hand-corrected after `drizzle-kit generate`): the auto-generated version of this file also
-- included ALTER TABLE statements re-adding regulatory_rules_applicability_scope_valid and
-- screening_requests_workflow_shape_valid. Those two CHECK constraints already exist in every real
-- deployed database - they were applied via Unit 5's deliberately out-of-journal manual migration
-- (src/db/manual-migrations/pre-activation-enforcement-vacant-land.sql, npm run
-- db:enforce-vacant-land), never through a tracked migration file. drizzle-kit's snapshot diff
-- doesn't know that - schema.ts has declared them since Unit 5, but no tracked migration/snapshot
-- ever recorded them as applied, so the first `drizzle-kit generate` run since then re-proposed
-- them here. Re-applying them via this migration would fail non-idempotently against any database
-- that already has them (a duplicate ADD CONSTRAINT), so they are removed from this file - this
-- migration is scoped to Unit 6's own additions only. The generated 0006_snapshot.json is left
-- untouched (it correctly reflects schema.ts's full current state for future diffing); only this
-- SQL file was hand-corrected, mirroring this project's own established precedent for a bad
-- drizzle-kit generation (Unit 5's 0005/0006 sequencing fix, aidlc-state.md).