/**
 * Drizzle schema. Unit 1 owns regulatoryRules/inferencePolicies. Unit 2 adds the persisted
 * entities its Functional/NFR Design approved: screeningRequests, reportGenerationJobs,
 * evidenceReportArtifacts, reportPdfRenderings, reportAccessCredentials.
 *
 * Shared infrastructure: Neon PostgreSQL + PostGIS (see aidlc-docs/construction/shared-infrastructure.md).
 */

import { pgTable, text, timestamp, uuid, jsonb, pgEnum, boolean, integer, customType, uniqueIndex, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const lifecycleStateEnum = pgEnum("regulatory_rule_lifecycle_state", [
  "RESEARCHED",
  "DRAFTED",
  "TRIAGED",
  "SOURCE_VERIFIED",
  "TESTED",
  "APPROVED",
  "ACTIVE",
  "SUPERSEDED",
  "DISABLED", // Acknowledged for domain-model compatibility only - transition/tooling is Unit 3 (ADM-7). Not exercised by Unit 1.
]);

export const tierEnum = pgEnum("regulatory_rule_tier", ["TIER_1", "TIER_2"]);

/**
 * RegulatoryRule (domain-entities.md "Regulatory Rule Domain" > RegulatoryRule).
 * `ruleSpecification`, `citation`, `caveats`, `testCases`, and `verificationHistory` are stored
 * as jsonb - their internal shape is defined in TypeScript (see
 * src/regulatory-rule-governance/types.ts) and validated at the application boundary
 * (Boundary Validator), not enforced by the database schema itself.
 */
export const regulatoryRules = pgTable(
  "regulatory_rules",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: text("subject").notNull(),
  /** Unit 5 (Code Generation Part 1, Step 5 - corrected per founder review): made NULLABLE.
   * EXISTING_PROPERTY rows require this present (shed/garage); VACANT_LAND rows require this
   * NULL - a VACANT_LAND rule is never forced to carry a bogus shed/garage value merely to
   * satisfy a NOT NULL constraint. See applicableWorkflowType below and the
   * regulatory_rules_applicability_scope_valid CHECK constraint (PRE-ACTIVATION ENFORCEMENT
   * migration). */
  applicableProjectType: text("applicable_project_type"),
  /** Unit 5 addition - RegulatoryRuleApplicabilityScope's real discriminant (domain-entities.md,
   * Correction 4). 'EXISTING_PROPERTY' requires applicableProjectType present; 'VACANT_LAND'
   * requires applicableProjectType NULL. Every pre-Unit-5 row is explicitly backfilled to
   * 'EXISTING_PROPERTY' (MIGRATE phase) - never left NULL as an implicit default, so the
   * invariant is auditable, not inferred. */
  applicableWorkflowType: text("applicable_workflow_type").default("EXISTING_PROPERTY"),
  applicableZone: text("applicable_zone").notNull(),
  ruleSpecification: jsonb("rule_specification").notNull(),
  citation: jsonb("citation").notNull(),
  lifecycleState: lifecycleStateEnum("lifecycle_state").notNull().default("RESEARCHED"),
  tier: tierEnum("tier"),
  caveats: jsonb("caveats").notNull().default([]),
  testCases: jsonb("test_cases").notNull().default([]),
  verificationHistory: jsonb("verification_history").notNull().default([]),
  supersedesRuleId: uuid("supersedes_rule_id"),
  supersededByRuleId: uuid("superseded_by_rule_id"),
  isTestOnlyFixture: boolean("is_test_only_fixture").notNull().default(false),
  /** Unit 2 addition (BR-U2-10, domain-entities.md "RegulatoryRule Extension"): the set of
   * evidence-quality levels a human explicitly decided, at governance-approval time, are
   * sufficient for a KNOWN classification under this rule. A rule with no entry for
   * GENERAL_LOCATION_ONLY cannot produce KNOWN from GENERAL_LOCATION_ONLY-sourced evidence -
   * enforced in regulatory-rules-engine/evaluate.ts, not by the database. Never set by
   * application code at evaluation time - only by the governance workflow (lifecycle.ts callers). */
  acceptedEvidenceQuality: jsonb("accepted_evidence_quality").notNull().default([]),
  /** Unit 3 addition (2026-08-25, full-repository review) - closes a real pre-existing
   * auditability gap: approve() required a founderIdentity but never persisted it. Nullable -
   * absent for every rule approved before this column existed; never backfilled/inferred. */
  approvalRecord: jsonb("approval_record"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Unit 5 NFR Design (PRE-ACTIVATION ENFORCEMENT) - the RegulatoryRuleApplicabilityScope
     * invariant enforced at the database layer, not application-code discipline alone. Generated
     * as a separate, later migration (0006) than the nullable-column EXPAND migration (0005), per
     * the approved staged rollout - never bundled with the EXPAND phase. */
    check(
      "regulatory_rules_applicability_scope_valid",
      sql`(${table.applicableWorkflowType} = 'EXISTING_PROPERTY' AND ${table.applicableProjectType} IS NOT NULL) OR (${table.applicableWorkflowType} = 'VACANT_LAND' AND ${table.applicableProjectType} IS NULL)`
    ),
  ]
);

/**
 * InferencePolicy (domain-entities.md "Regulatory Rule Domain" > InferencePolicy).
 */
export const inferencePolicies = pgTable("inference_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: text("subject").notNull(),
  derivationMethod: text("derivation_method").notNull(),
  citationOrBasis: text("citation_or_basis").notNull(),
  lifecycleState: lifecycleStateEnum("lifecycle_state").notNull().default("RESEARCHED"),
  version: text("version").notNull(),
  isTestOnlyFixture: boolean("is_test_only_fixture").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// Unit 2: Report Generation & Presentation Prototype
// ---------------------------------------------------------------------------------------------

export const validationStateEnum = pgEnum("screening_request_validation_state", ["DRAFT", "VALID"]);
export const jobStateEnum = pgEnum("report_generation_job_state", ["QUEUED", "IN_PROGRESS", "COMPLETE", "FAILED"]);

/**
 * ScreeningRequest (domain-entities.md). `projectDetails` carries ProjectConfiguration
 * (ShedProjectConfiguration or, since Unit 4, GarageProjectConfiguration - discriminated by the
 * sibling `projectType` column, not by an internal tag) as jsonb - shape owned by
 * src/screening-request/types.ts. `snapshot`, once set at generation-authorization time, is never
 * overwritten again (enforced in application code, not by the database) - this is what makes "the
 * snapshot" an immutable copy of "the live request" distinct from later edits to a *different*
 * live request.
 */
export const screeningRequests = pgTable(
  "screening_requests",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowType: text("workflow_type").notNull().default("EXISTING_PROPERTY"),
  confirmedParcelId: text("confirmed_parcel_id").notNull(),
  /** Unit 5 (Code Generation Part 1, Step 3) - made NULLABLE. Required for
   * workflowType='EXISTING_PROPERTY', NULL for workflowType='VACANT_LAND' - never both
   * unconditionally required, per BR-U5-1's discriminated union. */
  projectType: text("project_type"),
  projectDetails: jsonb("project_details"),
  /** Unit 5 addition - VacantLandScreeningIntent ('VACANT_PARCEL' | 'REDEVELOP_EXISTING_PARCEL').
   * NULL for workflowType='EXISTING_PROPERTY'; required for workflowType='VACANT_LAND'. */
  screeningIntent: text("screening_intent"),
  /** Unit 5 addition - VacantLandDetails (currently just { screeningIntent }, per VL-1's "no
   * Project Configuration step" - deliberately minimal). NULL for 'EXISTING_PROPERTY'; required
   * for 'VACANT_LAND'. */
  vacantLandDetails: jsonb("vacant_land_details"),
  validationState: validationStateEnum("validation_state").notNull().default("DRAFT"),
  /** Null until authorizeReportGeneration succeeds; immutable once set. */
  snapshot: jsonb("snapshot"),
  snapshotTakenAt: timestamp("snapshot_taken_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Unit 5 NFR Design (PRE-ACTIVATION ENFORCEMENT, corrected ordering per founder review -
     * enforced BEFORE VACANT_LAND write activation, never after) - the workflowType-discriminated
     * ScreeningRequest invariant enforced at the database layer (NFR-U5-2). */
    check(
      "screening_requests_workflow_shape_valid",
      sql`(${table.workflowType} = 'EXISTING_PROPERTY' AND ${table.projectType} IS NOT NULL AND ${table.projectDetails} IS NOT NULL AND ${table.screeningIntent} IS NULL AND ${table.vacantLandDetails} IS NULL) OR (${table.workflowType} = 'VACANT_LAND' AND ${table.projectType} IS NULL AND ${table.projectDetails} IS NULL AND ${table.screeningIntent} IS NOT NULL AND ${table.vacantLandDetails} IS NOT NULL)`
    ),
  ]
);

/**
 * ReportGenerationJob (domain-entities.md; components.md "Report Generation Job").
 * `generationAuthorization` is the INTERNAL_PROTOTYPE GenerationAuthorization record (Unit 2) -
 * stored inline rather than in a separate table since it is produced once and immediately
 * consumed by job creation (BR-U2-2). `claimedAt` + `retryAttempts` are what NFR Design Pattern 3's
 * atomic claim/stale-recovery mechanism operates on.
 */
export const reportGenerationJobs = pgTable("report_generation_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  screeningRequestId: uuid("screening_request_id").notNull(),
  generationAuthorization: jsonb("generation_authorization").notNull(),
  state: jobStateEnum("state").notNull().default("QUEUED"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  retryAttempts: integer("retry_attempts").notNull().default(0),
  failureReasons: jsonb("failure_reasons").notNull().default([]),
  evidenceReportArtifactId: uuid("evidence_report_artifact_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * EvidenceReportArtifact (domain-entities.md, corrected 2026-08-22). Immutable once created - no
 * application code path may UPDATE a row in this table after insert (enforced by convention/code
 * review, matching Unit 1's RGD-4 discipline for the domain type). The PDF is deliberately NOT a
 * column here - see reportPdfRenderings below.
 */
export const evidenceReportArtifacts = pgTable("evidence_report_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  screeningRequestId: uuid("screening_request_id").notNull(),
  reportGenerationJobId: uuid("report_generation_job_id").notNull(),
  findings: jsonb("findings").notNull(),
  evidence: jsonb("evidence").notNull(),
  explanation: jsonb("explanation"),
  ruleVersionsUsed: jsonb("rule_versions_used").notNull().default([]),
  dataRetrievalTimestamps: jsonb("data_retrieval_timestamps").notNull().default({}),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * ReportPdfRendering (NFR Design Pattern 6, corrected Functional Design). A disposable/
 * recreatable derivative of an EvidenceReportArtifact - never mutates the artifact it derives
 * from. Rendered lazily on first request, cached thereafter (findReportPdfRendering before
 * re-rendering).
 */
export const reportPdfRenderings = pgTable("report_pdf_renderings", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportArtifactId: uuid("report_artifact_id").notNull(),
  renderingVersion: text("rendering_version").notNull().default("1"),
  bytes: bytea("bytes").notNull(),
  contentHash: text("content_hash"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Unit 2B addition (BR-U2B-10) - declared here (ahead of its Unit 2B section below) since
 * reportAccessCredentials, an original Unit 2 table, references it. */
export const deliveryStatusEnum = pgEnum("report_access_credential_delivery_status", [
  "EMAIL_PENDING",
  "EMAIL_SENT",
  "EMAIL_FAILED",
]);

/**
 * ReportAccessCredential (NFR Design Pattern 1). Only `tokenHash` is ever persisted - the raw
 * bearer token exists only in memory long enough to return it once, at creation/rotation time.
 * `active` distinguishes the current credential from a revoked/rotated-away one; revoked and
 * unknown tokens must resolve identically from the caller's perspective (src/report-access
 * enforces this, not the schema).
 */
export const reportAccessCredentials = pgTable("report_access_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportArtifactId: uuid("report_artifact_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  /** Unit 2B addition (BR-U2B-10) — tracks the guest-delivery email attempt for *this*
   * credential, not the report's lifecycle. EMAIL_SENT means Resend accepted the send, never a
   * guarantee of end-recipient delivery. */
  deliveryStatus: deliveryStatusEnum("delivery_status"),
  deliveryAttempts: integer("delivery_attempts").notNull().default(0),
  lastDeliveryAttemptAt: timestamp("last_delivery_attempt_at", { withTimezone: true }),
});

export type RegulatoryRuleRow = typeof regulatoryRules.$inferSelect;
export type NewRegulatoryRuleRow = typeof regulatoryRules.$inferInsert;
export type InferencePolicyRow = typeof inferencePolicies.$inferSelect;
export type NewInferencePolicyRow = typeof inferencePolicies.$inferInsert;
export type ScreeningRequestRow = typeof screeningRequests.$inferSelect;
export type NewScreeningRequestRow = typeof screeningRequests.$inferInsert;
export type ReportGenerationJobRow = typeof reportGenerationJobs.$inferSelect;
export type NewReportGenerationJobRow = typeof reportGenerationJobs.$inferInsert;
export type EvidenceReportArtifactRow = typeof evidenceReportArtifacts.$inferSelect;
export type NewEvidenceReportArtifactRow = typeof evidenceReportArtifacts.$inferInsert;
export type ReportPdfRenderingRow = typeof reportPdfRenderings.$inferSelect;
export type NewReportPdfRenderingRow = typeof reportPdfRenderings.$inferInsert;
export type ReportAccessCredentialRow = typeof reportAccessCredentials.$inferSelect;
export type NewReportAccessCredentialRow = typeof reportAccessCredentials.$inferInsert;

// ---------------------------------------------------------------------------------------------
// Unit 2B: Commercial Payment & Fulfillment
// ---------------------------------------------------------------------------------------------

export const orderStateEnum = pgEnum("order_state", [
  "PENDING",
  "PAID",
  "REFUND_PENDING",
  "REFUNDED",
  "REFUND_FAILED",
  "EXPIRED",
]);

/**
 * Order (domain-entities.md, Unit 2B `OrderState` — BR-U2B-1 through BR-U2B-16). Payment/order
 * state only — never generation state (ReportGenerationJob owns that entirely, unchanged
 * component boundary). Two partial unique indexes enforce BR-U2B-1's concurrency invariants at
 * the database level, not only via application-level pre-queries:
 * - at most one PENDING order per screeningRequestId (no two concurrently-open checkout attempts)
 * - at most one CANONICAL paid order per screeningRequestId (corrected 2026-08-25 — the invariant
 *   is "at most one Order may ever authorize fulfillment," not "at most one Order may ever have
 *   had a payment confirmed": a `refundReason = 'DUPLICATE_PAYMENT'` order is explicitly EXCLUDED
 *   from this constraint, so it may still record a real, truthful `paidAt`/`stripePaymentIntentId`
 *   — Stripe really did confirm that payment — without colliding with the canonical order's own
 *   `paidAt`. `paidAt` is never cleared by any subsequent refund, canonical or duplicate, so this
 *   constraint holds durably through every later refund state.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    screeningRequestId: uuid("screening_request_id").notNull(),
    state: orderStateEnum("state").notNull().default("PENDING"),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull(),
    /** Stable idempotency key for the Stripe Checkout Session *creation* call (BR-U2B-14) — a
     * retry of that specific creation call reuses this key. Distinct from refundIdempotencyKey. */
    checkoutCreationIdempotencyKey: text("checkout_creation_idempotency_key").notNull(),
    /** Absent while checkout-session creation is in flight/incomplete (BR-U2B-14) — Order
     * existence never depends on this being present yet. */
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    /** Sourced only from verified Stripe checkout/payment data (BR-U2B-13) — never client-submitted. */
    customerEmail: text("customer_email"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundReason: text("refund_reason"),
    /** Scoped to ONE logical refund attempt (BR-U2B-5's corrected scope) — generated once, reused
     * for every transport-level retry AND every Workflow run resuming that same attempt. Never a
     * Vercel Workflow step's stepId. */
    refundIdempotencyKey: text("refund_idempotency_key"),
    stripeRefundId: text("stripe_refund_id"),
    /** Set only when Stripe CONFIRMS the refund succeeded — never when the request is merely
     * submitted (BR-U2B-5). */
    refundConfirmedAt: timestamp("refund_confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_screening_request_id_pending_unique")
      .on(table.screeningRequestId)
      .where(sql`${table.state} = 'PENDING'`),
    uniqueIndex("orders_screening_request_id_paid_unique")
      .on(table.screeningRequestId)
      .where(sql`${table.paidAt} is not null and ${table.refundReason} is distinct from 'DUPLICATE_PAYMENT'`),
  ]
);

/**
 * ProcessedStripeEvent (BR-U2B-4) — a minimal webhook-receipt ledger, defense-in-depth alongside
 * Order's own state-machine idempotency, never a general event-sourcing store.
 */
export const processedStripeEvents = pgTable("processed_stripe_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  stripeObjectId: text("stripe_object_id").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
export type ProcessedStripeEventRow = typeof processedStripeEvents.$inferSelect;
export type NewProcessedStripeEventRow = typeof processedStripeEvents.$inferInsert;

// ---------------------------------------------------------------------------------------------
// Unit 3: Minimum Paid-Product Operations
// ---------------------------------------------------------------------------------------------

export const adminActionTypeEnum = pgEnum("admin_action_type", [
  "REFUND_INITIATED",
  "RULE_DISABLED",
  "RULE_REENABLED",
  "DATA_SOURCE_MARKED_UNHEALTHY",
  "DATA_SOURCE_OVERRIDE_CLEARED",
]);

export const adminTargetTypeEnum = pgEnum("admin_target_type", ["ORDER", "REGULATORY_RULE", "DATA_SOURCE"]);

export const sourceHealthStateEnum = pgEnum("source_health_state", ["HEALTHY", "UNHEALTHY", "UNKNOWN"]);

/**
 * AdminActionLog (domain-entities.md, Unit 3 - BR-U3-9). Attribution/audit history only - never
 * authoritative for Order/RegulatoryRule/DataSourceHealth state, and never the mechanism that
 * makes an admin command atomic (the DB transaction, or the audit-commit-before-start()
 * sequencing for REFUND_INITIATED, are what do that - this table is the record of it, not the
 * mechanism itself). Append-only - no update/delete function is ever built for it.
 *
 * `reason` is `NOT NULL` (corrected 2026-08-25 founder review) - every Unit 3 mutating operator
 * command requires a non-empty human justification, enforced here at the database level in
 * addition to application-boundary validation (never solely trusted to the application layer,
 * matching this schema's existing partial-unique-index style of enforcing invariants at the DB
 * level).
 */
export const adminActionLog = pgTable(
  "admin_action_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operatorId: text("operator_id").notNull(),
    actionType: adminActionTypeEnum("action_type").notNull(),
    targetType: adminTargetTypeEnum("target_type").notNull(),
    /** text, not uuid - a DataSourceHealth targetId is a stable string id (e.g.
     * "king-county-gis"), not a uuid, so this column must accommodate both. */
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    /** Holds `{ refundReason: RefundReason }` for REFUND_INITIATED rows only - the machine-
     * readable Unit 2B RefundReason, kept structurally separate from `reason` (the operator's
     * free-text justification) per the founder's 2026-08-25 correction. */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Defense-in-depth alongside application-boundary validateAtBoundary - a NOT NULL column
    // still permits an empty or whitespace-only string, which this CHECK excludes.
    check("admin_action_log_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ]
);

/**
 * DataSourceHealth (domain-entities.md, Unit 3 - corrected observed/override/effective split).
 * Replaces Unit 1's in-memory DataSourceRegistry storage (src/data-source-registry/) - same
 * conceptual API, persisted so state survives across Vercel's independent serverless invocations.
 *
 * `observedHealthState` is written ONLY by recordIngestionResult (automated). `manualOverrideState`
 * is written ONLY by admin actions (src/data-source-registry/repository.ts's
 * setManualOverride/clearManualOverride). `effectiveHealthState = manualOverrideState ??
 * observedHealthState` is computed at read time, never stored - there is no column for it.
 */
export const dataSourceHealth = pgTable("data_source_health", {
  sourceId: text("source_id").primaryKey(),
  observedHealthState: sourceHealthStateEnum("observed_health_state").notNull().default("UNKNOWN"),
  lastSuccessfulRetrieval: timestamp("last_successful_retrieval", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastFailureReason: text("last_failure_reason"),
  manualOverrideState: sourceHealthStateEnum("manual_override_state"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminActionLogRow = typeof adminActionLog.$inferSelect;
export type NewAdminActionLogRow = typeof adminActionLog.$inferInsert;
export type DataSourceHealthRow = typeof dataSourceHealth.$inferSelect;
export type NewDataSourceHealthRow = typeof dataSourceHealth.$inferInsert;

// ---------------------------------------------------------------------------------------------
// Unit 6: Optional Accounts
// ---------------------------------------------------------------------------------------------

/**
 * Account (domain-entities.md, Unit 6). Deliberately minimal - email + timestamps only, no
 * password/profile fields (BR-U6-1). Created only as the direct side effect of a successfully
 * verified LOGIN MagicLinkToken (business-logic-model.md workflow 2) - there is no separate
 * "create account" insert path anywhere in this codebase.
 */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const magicLinkPurposeEnum = pgEnum("magic_link_purpose", ["LOGIN", "CLAIM_PURCHASE"]);

/**
 * MagicLinkToken (domain-entities.md, Unit 6 - BR-U6-1). Reuses report-access/credential.ts's
 * existing generateAccessCredential/hashToken primitives unchanged - only tokenHash is ever
 * persisted. Purpose-discriminated: a LOGIN row carries neither accountId nor orderId (there is no
 * account to log into yet); a CLAIM_PURCHASE row carries both (bound to the Account that started
 * the claim and the Order being claimed) - enforced below by
 * magic_link_tokens_purpose_shape_valid, this schema's second use of the CHECK-constraint-for-
 * discriminated-shape pattern Unit 5 established for screening_requests/regulatory_rules.
 *
 * FK constraints added per Code Generation Part 1 review (correction 3) - this schema's FIRST real
 * foreign-key constraints (every earlier table's relationships are application-layer-only; see
 * unit-6-optional-accounts-code-generation-plan.md finding 11 for why deleteAccount, this
 * project's first real multi-row DELETE operation, justifies introducing them here). accountId
 * cascades (a token is meaningless once its account is gone, and cascading here can only ever
 * remove magic_link_tokens rows); orderId restricts (this FK can only ever BLOCK an Order deletion,
 * never cause one - reinforcing RGD-4's existing "Order is never deleted" invariant at the database
 * level). Neither FK direction can ever reach Order/EvidenceReportArtifact/reportAccessCredentials
 * as a consequence of an Account being deleted - accountId and orderId are independent columns on
 * this same row, not chained through each other.
 */
export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: magicLinkPurposeEnum("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "magic_link_tokens_purpose_shape_valid",
      sql`(${table.purpose} = 'LOGIN' AND ${table.accountId} IS NULL AND ${table.orderId} IS NULL) OR (${table.purpose} = 'CLAIM_PURCHASE' AND ${table.accountId} IS NOT NULL AND ${table.orderId} IS NOT NULL)`
    ),
  ]
);

/**
 * AccountSession (domain-entities.md, Unit 6 - BR-U6-2). A token structurally separate from the
 * magic-link token that established it - its own generateAccessCredential() call, its own hash.
 * Delivered via ACCOUNT_SESSION_COOKIE (shared/cookies.ts), re-validated server-side on every
 * request (resolveByAccessToken against revokedAt IS NULL AND expiresAt > now()) - the cookie is a
 * transport, never a trust boundary on its own.
 */
export const accountSessions = pgTable("account_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const purchaseLinkMethodEnum = pgEnum("purchase_link_method", ["EMAIL_VERIFICATION", "REPORT_ACCESS_TOKEN"]);

/**
 * AccountOrderLink (domain-entities.md, Unit 6 - BR-U6-3/BR-U6-4). The sole authorization record
 * for Account Access (Mode B) to a report, and the sole record of guest-purchase claiming. orderId
 * is UNIQUE - at most one Account may ever be linked to a given Order (BR-U6-3 invariant 3's
 * database-level, race-safe anti-transfer enforcement; see account-auth/link-repository.ts's
 * INSERT ... ON CONFLICT (order_id) DO NOTHING RETURNING ... + SELECT pattern, NFR Design
 * Pattern 4). FK reasoning mirrors magicLinkTokens above: accountId cascades (defense-in-depth -
 * deleteAccount's own transaction already deletes these rows explicitly), orderId restricts (an
 * Order must never be deletable while a link to it exists).
 */
export const accountOrderLinks = pgTable(
  "account_order_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    linkMethod: purchaseLinkMethodEnum("link_method").notNull(),
  },
  (table) => [
    // Postgres does not automatically index a merely foreign-key-shaped column - order_id's own
    // UNIQUE constraint provides no lookup path for account_id-filtered queries (listReportHistory,
    // NFR-U6-47/NFR-U6-57 - added per NFR Requirements review).
    index("account_order_links_account_id_idx").on(table.accountId),
  ]
);

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
export type MagicLinkTokenRow = typeof magicLinkTokens.$inferSelect;
export type NewMagicLinkTokenRow = typeof magicLinkTokens.$inferInsert;
export type AccountSessionRow = typeof accountSessions.$inferSelect;
export type NewAccountSessionRow = typeof accountSessions.$inferInsert;
export type AccountOrderLinkRow = typeof accountOrderLinks.$inferSelect;
export type NewAccountOrderLinkRow = typeof accountOrderLinks.$inferInsert;
