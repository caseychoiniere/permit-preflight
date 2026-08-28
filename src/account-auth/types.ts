/**
 * Unit 6 - Optional Accounts domain types (business-rules.md, domain-entities.md). Deliberately
 * minimal - no password/profile fields, no generalized identity concepts beyond what ACC-1
 * through ACC-4 require.
 */

export interface Account {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export const MagicLinkPurpose = {
  LOGIN: "LOGIN",
  CLAIM_PURCHASE: "CLAIM_PURCHASE",
} as const;
export type MagicLinkPurpose = (typeof MagicLinkPurpose)[keyof typeof MagicLinkPurpose];

export interface MagicLinkToken {
  id: string;
  purpose: MagicLinkPurpose;
  tokenHash: string;
  email: string;
  accountId?: string;
  orderId?: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface AccountSession {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export const PurchaseLinkMethod = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  REPORT_ACCESS_TOKEN: "REPORT_ACCESS_TOKEN",
} as const;
export type PurchaseLinkMethod = (typeof PurchaseLinkMethod)[keyof typeof PurchaseLinkMethod];

export interface AccountOrderLink {
  id: string;
  accountId: string;
  orderId: string;
  linkedAt: string;
  linkMethod: PurchaseLinkMethod;
}

/** Magic-link token expiry - 15 minutes (BR-U6-1), independent of AccountSession's own, much
 * longer, expiry. */
export const MAGIC_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/** AccountSession expiry - a starting value, not treated as final (matches this project's own
 * established provisional-value precedent, e.g. DEFAULT_STALE_CLAIM_THRESHOLD_MS). */
export const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
