/**
 * Paid-path verification for one or more orders (staging/dev): order -> report job -> artifact (rules applied, zoning evidence, findings, no chapter of another
 * zone family cited) -> access credential / email status -> the real report and PDF routes (via the checkout-session cookie).
 * Read-only apart from fetching the report and PDF through the local app. Usage: npx tsx scripts/verify-paid-order.ts <scratch-dir-for-pdfs> <orderId...>
 */
import { eq, inArray } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { getDb } from "../src/db/client.js";
import { orders, reportGenerationJobs, evidenceReportArtifacts, reportAccessCredentials, screeningRequests, regulatoryRules } from "../src/db/schema.js";
process.loadEnvFile(".env.local");
const SP = process.argv[2]!;
async function main() {
  const db = getDb();
  for (const oid of process.argv.slice(3)) {
    const [o] = await db.select().from(orders).where(eq(orders.id, oid));
    const [sr] = await db.select().from(screeningRequests).where(eq(screeningRequests.id, o!.screeningRequestId));
    const job = (await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, o!.screeningRequestId)))[0];
    console.log(`== ${(sr as any).projectType} ${(sr as any).confirmedParcelId} order=${o!.state} job=${job?.state ?? "none"} email=${o!.customerEmail}`);
    if (o!.state !== "PAID" || job?.state !== "COMPLETE" || !job.evidenceReportArtifactId) { console.log("   NOT READY"); continue; }
    const [a] = await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, job.evidenceReportArtifactId));
    const ids = (a!.ruleVersionsUsed as any[]).map((r) => r.ruleId ?? r.id ?? r);
    const rules = ids.length ? await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids)) : [];
    const ev = a!.evidence as any[];
    const zr = ev.find((e) => e.factType === "zoning-resolution")?.value;
    console.log("   zoning:", zr?.status, zr?.governing, "| lot zones", JSON.stringify(zr?.lotZones));
    console.log("   ruleVersionsUsed:", ids.length, "rows, scopes:", [...new Set(rules.map((r: any) => r.applicableZone))].join(" | "), "| all ACTIVE:", rules.every((r: any) => r.lifecycleState === "ACTIVE"));
    const fs = a!.findings as any[];
    console.log("   findings:", fs.length, "| outcomes:", ["PASS", "FAIL"].map((k) => `${k}=${fs.filter((f) => f.complianceOutcome === k).length}`).join(" "), "| REQUIRES_VERIFICATION:", fs.filter((f) => f.classification === "REQUIRES_VERIFICATION").length);
    console.log("   zoning finding:", fs.find((f) => String(f.subject).startsWith("Zoning applied"))?.explanationBasis?.slice(0, 160));
    const text = JSON.stringify(fs);
    const fam = zr?.governingFamily;
    console.log("   family:", fam, "| cites SMC 23.44 (NR chapter):", /23\.44/.test(text), "| cites 23.45:", /23\.45/.test(text), "| cites 23.47A:", /23\.47A/.test(text));
    const creds = await db.select().from(reportAccessCredentials).where(eq(reportAccessCredentials.reportArtifactId, a!.id));
    console.log("   email:", creds.map((c) => `${c.active ? "active" : "revoked"}:${c.deliveryStatus}x${c.deliveryAttempts}`).join(", "));
    const cookie = `pp_checkout_session=${o!.stripeCheckoutSessionId}`;
    const rep = await fetch("http://localhost:3000/api/checkout/report", { headers: { cookie } });
    const pdf = await fetch("http://localhost:3000/api/checkout/report/pdf", { headers: { cookie } });
    const buf = Buffer.from(await pdf.arrayBuffer());
    const file = `${SP}/paid-${(sr as any).projectType}-${(sr as any).confirmedParcelId}.pdf`; writeFileSync(file, buf);
    console.log("   report route:", rep.status, "| pdf:", pdf.status, pdf.headers.get("content-type"), buf.length, "bytes", buf.subarray(0, 5).toString(), "->", file);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERR", e); process.exit(1); });
