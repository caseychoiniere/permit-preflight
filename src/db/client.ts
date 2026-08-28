/**
 * Database client. Lazily constructed so importing this module never requires DATABASE_URL to
 * be set (deterministic tests never touch this file's exported `getDb()`).
 *
 * No live Neon credentials exist in the Code Generation session that produced this file - this
 * is real, correct integration code, exercised by the (not-run-here) integration test suite once
 * real credentials are provisioned, per the approved Infrastructure Design.
 *
 * Two-driver strategy (Unit 2B, corrected by the 2026-08-24 Railway->Vercel platform pivot - see
 * aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md):
 * - `getDb()` / neon-http: the default for everything that doesn't need a genuine interactive
 *   transaction - stateless HTTP, no connection lifecycle, safe to cache as a module-level
 *   singleton (unlike a WebSocket Pool, which cannot outlive a single request on Vercel).
 * - `withFulfillmentTransaction()` / neon-serverless: used ONLY for BR-U2B-15's atomic payment-
 *   fulfillment transaction. Opens a Pool, runs one real interactive transaction, closes the Pool
 *   - entirely within one call. Never held as a module-level singleton, never reused across
 *   invocations.
 */

import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;
export type TransactionalDb = Parameters<Parameters<ReturnType<typeof drizzleServerless<typeof schema>>["transaction"]>[0]>[0];

neonConfig.webSocketConstructor = ws;

let cached: Db | undefined;

function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. This is expected in the deterministic test suite, which must " +
        "never call getDb()/withFulfillmentTransaction(). See .env.example and " +
        "aidlc-docs/construction/shared-infrastructure.md."
    );
  }
  return url;
}

export function getDb(): Db {
  if (cached) return cached;
  const sql = neon(requireDatabaseUrl());
  cached = drizzle(sql, { schema });
  return cached;
}

/**
 * Runs `fn` inside one real, interactive Postgres transaction via a `Pool` that is opened, used,
 * and closed entirely within this call - never held across invocations (Neon's own documented
 * constraint for WebSocket connections on a serverless platform like Vercel). This is the ONLY
 * place in the application that should call this function - it exists exclusively for
 * BR-U2B-15's atomic payment-fulfillment sequence (Order PAID transition, GenerationAuthorization
 * persistence, ReportGenerationJob creation, ProcessedStripeEvent recording, all-or-nothing).
 */
export async function withFulfillmentTransaction<T>(fn: (tx: TransactionalDb) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  try {
    const db = drizzleServerless(pool, { schema });
    return await db.transaction(fn);
  } finally {
    await pool.end();
  }
}

/**
 * Unit 3's admin-mutation counterpart to withFulfillmentTransaction - structurally identical
 * (same Pool-open/use/close-within-one-call discipline), deliberately kept as its own separate
 * function rather than renaming/repurposing withFulfillmentTransaction, so Unit 2B's code and
 * every existing call site stay untouched. Scoped to Unit 3's 4 atomic local admin mutations
 * (RULE_DISABLED, RULE_REENABLED, DATA_SOURCE_MARKED_UNHEALTHY, DATA_SOURCE_OVERRIDE_CLEARED) -
 * never REFUND_INITIATED, which crosses the DB/Vercel-Workflow boundary and uses an
 * audit-commit-before-start() sequencing instead (a single ordinary getDb() write, no
 * transaction needed for one statement).
 */
export async function withAdminTransaction<T>(fn: (tx: TransactionalDb) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  try {
    const db = drizzleServerless(pool, { schema });
    return await db.transaction(fn);
  } finally {
    await pool.end();
  }
}

/**
 * Unit 6's account-auth counterpart to withFulfillmentTransaction/withAdminTransaction -
 * structurally identical (same Pool-open/use/close-within-one-call discipline), deliberately kept
 * as its own separate function per this project's established one-helper-per-domain-purpose
 * convention (db/client.ts's own docstring for withAdminTransaction states this explicitly - Unit
 * 2B's code and every existing call site stay untouched by adding a third). Scoped to Unit 6's two
 * real transactional operations: verifyLoginLink (atomic LOGIN token consumption + Account
 * find-or-create + AccountSession creation) and deleteAccount (the full delete/retain-split
 * transaction) - and, per Code Generation Part 1 review, completeClaimByEmail's account-bound
 * CLAIM_PURCHASE consumption + AccountOrderLink creation.
 */
export async function withAccountTransaction<T>(fn: (tx: TransactionalDb) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  try {
    const db = drizzleServerless(pool, { schema });
    return await db.transaction(fn);
  } finally {
    await pool.end();
  }
}
