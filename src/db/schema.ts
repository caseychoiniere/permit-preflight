/**
 * Drizzle schema. Unit 1 owns regulatoryRules/inferencePolicies. Unit 2 adds the persisted
 * entities its Functional/NFR Design approved: screeningRequests, reportGenerationJobs,
 * evidenceReportArtifacts, reportPdfRenderings, reportAccessCredentials.
 *
 * Shared infrastructure: Neon PostgreSQL + PostGIS (see aidlc-docs/construction/shared-infrastructure.md).
 */

import { pgTable, text, timestamp, uuid, jsonb, pgEnum, boolean, integer, customType } from "drizzle-orm/pg-core";

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
export const regulatoryRules = pgTable("regulatory_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: text("subject").notNull(),
  applicableProjectType: text("applicable_project_type").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
 * ScreeningRequest (domain-entities.md). `projectDetails` carries ShedProjectConfiguration
 * (widthFt/depthFt/heightFt/alleyAdjacent/proposedFootprint/lotLineRoleAssignment/
 * distanceInputMode) as jsonb - shape owned by src/screening-request/types.ts.
 * `snapshot`, once set at generation-authorization time, is never overwritten again
 * (enforced in application code, not by the database) - this is what makes "the snapshot" an
 * immutable copy of "the live request" distinct from later edits to a *different* live request.
 */
export const screeningRequests = pgTable("screening_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowType: text("workflow_type").notNull().default("EXISTING_PROPERTY"),
  confirmedParcelId: text("confirmed_parcel_id").notNull(),
  projectType: text("project_type").notNull(),
  projectDetails: jsonb("project_details").notNull(),
  validationState: validationStateEnum("validation_state").notNull().default("DRAFT"),
  /** Null until authorizeReportGeneration succeeds; immutable once set. */
  snapshot: jsonb("snapshot"),
  snapshotTakenAt: timestamp("snapshot_taken_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
