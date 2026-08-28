import { getDb } from "../../../../src/db/client.js";
import { getSourceHealth } from "../../../../src/data-source-registry/index.js";
import { KNOWN_SOURCE_DEFINITIONS } from "../../../../src/data-source-registry/known-sources.js";
import { REQUIRED_SOURCE_IDS_FOR_SHED } from "../../../../src/screening-request/authorization.js";

/** ADM-3: every known source's observed/override/effective state, shown distinctly, merged with
 * the small static expected-refresh-cadence definition (known-sources.ts) - not a new database
 * table, not scheduled polling. Iterates the known-source-id list (rather than only already-
 * existing rows) so a source that has never been touched by ingestion or an override still
 * appears, with the upsert-on-first-touch getSourceHealth already provides. */
export async function GET() {
  const db = getDb();
  const sources = await Promise.all(
    REQUIRED_SOURCE_IDS_FOR_SHED.map(async (sourceId) => ({
      ...(await getSourceHealth(db, sourceId)),
      expectedRefreshCadence: KNOWN_SOURCE_DEFINITIONS[sourceId]?.expectedRefreshCadence,
      description: KNOWN_SOURCE_DEFINITIONS[sourceId]?.description,
    }))
  );
  return Response.json({ sources });
}
