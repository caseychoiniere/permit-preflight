/**
 * Database client. Lazily constructed so importing this module never requires DATABASE_URL to
 * be set (deterministic tests never touch this file's exported `getDb()`).
 *
 * No live Neon credentials exist in the Code Generation session that produced this file - this
 * is real, correct integration code, exercised by the (not-run-here) integration test suite once
 * real credentials are provisioned, per the approved Infrastructure Design.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | undefined;

export function getDb(): Db {
  if (cached) return cached;

  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. This is expected in the deterministic test suite, which must " +
        "never call getDb(). See .env.example and aidlc-docs/construction/shared-infrastructure.md."
    );
  }

  const sql = neon(url);
  cached = drizzle(sql, { schema });
  return cached;
}
