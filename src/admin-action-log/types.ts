/**
 * AdminActionLog - Unit 3 (domain-entities.md, BR-U3-9). Attribution/audit history only - never
 * authoritative for Order/RegulatoryRule/DataSourceHealth state (see repository.ts's docstring
 * for the atomicity/sequencing guarantees that make this true).
 */

export const AdminActionType = {
  REFUND_INITIATED: "REFUND_INITIATED",
  RULE_DISABLED: "RULE_DISABLED",
  RULE_REENABLED: "RULE_REENABLED",
  DATA_SOURCE_MARKED_UNHEALTHY: "DATA_SOURCE_MARKED_UNHEALTHY",
  DATA_SOURCE_OVERRIDE_CLEARED: "DATA_SOURCE_OVERRIDE_CLEARED",
} as const;
export type AdminActionType = (typeof AdminActionType)[keyof typeof AdminActionType];

export const AdminTargetType = {
  ORDER: "ORDER",
  REGULATORY_RULE: "REGULATORY_RULE",
  DATA_SOURCE: "DATA_SOURCE",
} as const;
export type AdminTargetType = (typeof AdminTargetType)[keyof typeof AdminTargetType];

export interface AdminActionLogEntry {
  operatorId: string;
  actionType: AdminActionType;
  targetType: AdminTargetType;
  targetId: string;
  /** Non-empty after trim - enforced both at the API boundary (see shared/admin-auth.ts's
   * validateReason) and by the database's own CHECK constraint (db/schema.ts). Never optional. */
  reason: string;
  metadata?: Record<string, unknown>;
}
