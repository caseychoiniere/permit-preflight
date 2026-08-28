import { z } from "zod";
import { getDb } from "../../../../../src/db/client.js";
import { getOrderById, findOrdersByCustomerEmail } from "../../../../../src/order-payment/repository.js";
import { toAdminOrderView, type AdminOrderView } from "../../../../../src/order-payment/admin-view.js";
import { getJobByEvidenceReportArtifactId } from "../../../../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../../../../src/screening-request/authorization.js";
import { validateAtBoundary } from "../../../../../src/shared/validation.js";

const SearchBodySchema = z.object({
  kind: z.enum(["orderId", "email", "reportId"]),
  value: z.string().trim().min(1),
});

/**
 * ADM-5: order lookup/search (corrected 2026-08-25 - replaces the old GET /api/admin/orders?email=
 * transport). POST with a JSON body so `customerEmail` (PII) never appears in a request path or
 * query string, where Vercel platform observability could record it. Logically READ-ONLY: no
 * domain mutation, no AdminActionLog entry - still passes through proxy.ts's same-origin CSRF
 * check because it is technically POST (not weakened for this route).
 *
 * `kind: "orderId"` and `"reportId"` resolve to at most one order; `kind: "email"` may resolve to
 * several (a customer can have multiple orders over time). All three are exact-match only - no
 * substring/prefix/wildcard/fuzzy matching (Q6).
 */
export async function POST(request: Request) {
  const rawBody = (await request.json().catch(() => undefined)) as unknown;
  const validated = validateAtBoundary(SearchBodySchema, rawBody);
  if (validated.outcome === "INVALID") {
    return Response.json({ error: "Validation failed.", issues: validated.issues }, { status: 400 });
  }
  const { kind, value } = validated.data;
  const db = getDb();

  let orders: AdminOrderView[] = [];

  if (kind === "orderId") {
    const order = await getOrderById(db, value);
    orders = order ? [toAdminOrderView(order)] : [];
  } else if (kind === "email") {
    const found = await findOrdersByCustomerEmail(db, value);
    orders = found.map(toAdminOrderView);
  } else {
    // reportId -> ReportGenerationJob -> its generationAuthorization's orderId (VERIFIED_PAYMENT
    // only) - precise and unambiguous, since a report is only ever generated for a
    // VERIFIED_PAYMENT job (BR-U2B-15). An INTERNAL_PROTOTYPE job's report has no associated
    // Order, truthfully returned as no results rather than a guessed one.
    const job = await getJobByEvidenceReportArtifactId(db, value);
    if (job) {
      const authorization = job.generationAuthorization as GenerationAuthorization;
      if (authorization.type === GenerationAuthorizationType.VERIFIED_PAYMENT) {
        const order = await getOrderById(db, authorization.orderId);
        orders = order ? [toAdminOrderView(order)] : [];
      }
    }
  }

  return Response.json({ orders });
}
