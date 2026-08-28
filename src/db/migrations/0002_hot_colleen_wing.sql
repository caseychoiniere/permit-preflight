CREATE TYPE "public"."report_access_credential_delivery_status" AS ENUM('EMAIL_PENDING', 'EMAIL_SENT', 'EMAIL_FAILED');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('PENDING', 'PAID', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screening_request_id" uuid NOT NULL,
	"state" "order_state" DEFAULT 'PENDING' NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"checkout_creation_idempotency_key" text NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"customer_email" text,
	"paid_at" timestamp with time zone,
	"refund_reason" text,
	"refund_idempotency_key" text,
	"stripe_refund_id" text,
	"refund_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_stripe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"stripe_object_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_stripe_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
ALTER TABLE "report_access_credentials" ADD COLUMN "delivery_status" "report_access_credential_delivery_status";--> statement-breakpoint
ALTER TABLE "report_access_credentials" ADD COLUMN "delivery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "report_access_credentials" ADD COLUMN "last_delivery_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_screening_request_id_pending_unique" ON "orders" USING btree ("screening_request_id") WHERE "orders"."state" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "orders_screening_request_id_paid_unique" ON "orders" USING btree ("screening_request_id") WHERE "orders"."paid_at" is not null and "orders"."refund_reason" is distinct from 'DUPLICATE_PAYMENT';