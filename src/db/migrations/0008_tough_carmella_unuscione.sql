ALTER TYPE "public"."admin_action_type" ADD VALUE 'RULE_PROFESSIONAL_REVIEW_RECORDED';--> statement-breakpoint
CREATE TABLE "rule_professional_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"reviewer_identity" text NOT NULL,
	"reviewer_role" text NOT NULL,
	"review_date" timestamp with time zone NOT NULL,
	"source_provisions" jsonb NOT NULL,
	"conclusion" text NOT NULL,
	"limitations" text NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"suitable_for_product_use" boolean NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_professional_reviews_identity_not_blank" CHECK (length(trim("rule_professional_reviews"."reviewer_identity")) > 0),
	CONSTRAINT "rule_professional_reviews_conclusion_not_blank" CHECK (length(trim("rule_professional_reviews"."conclusion")) > 0),
	CONSTRAINT "rule_professional_reviews_limitations_not_blank" CHECK (length(trim("rule_professional_reviews"."limitations")) > 0)
);
--> statement-breakpoint
ALTER TABLE "rule_professional_reviews" ADD CONSTRAINT "rule_professional_reviews_rule_id_regulatory_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."regulatory_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_professional_reviews_rule_idx" ON "rule_professional_reviews" USING btree ("rule_id");