"use client";

/**
 * Account Access report view (BR-U6-4 Mode B) - Unit 6 Code Generation Part 2 review, correction 1.
 *
 * This is a new AUTHORIZATION route to the SAME immutable EvidenceReportArtifact the guest report
 * (app/report/page.tsx) and post-checkout report (app/checkout/status/page.tsx) render - not a
 * second rendering mechanism. It reuses the shared ../../../components/ReportView.js verbatim, so
 * the account view shows exactly the same content (map, findings, requires-verification,
 * uncovered-constraint notices, vacant-land scenarios, explanation, evidence notes) as the other
 * two - the approved Code Generation plan's "reuses the existing report view's presentational
 * logic/components (not a rewrite of app/report/page.tsx)" item, now that ReportView exists (it
 * was extracted during the validation pause, after Unit 6 Code Generation Part 2 was first
 * generated).
 *
 * This file owns ONLY: the account-session-authorized fetch of GET /api/account/reports/[orderId]
 * (whose response shape already matches ReportView's Report), NOT_FOUND handling, and passing the
 * account-authorized PDF route (GET /api/account/reports/[orderId]/pdf) as ReportView's pdfHref.
 * No guest reportAccessToken is ever involved.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ReportView, type Report } from "../../../components/ReportView.js";
import { Container } from "../../../components/ui/Container.js";
import { Card } from "../../../components/ui/Card.js";

export default function AccountReportPage() {
  const params = useParams<{ orderId: string }>();
  const [report, setReport] = useState<Report | "LOADING" | "NOT_FOUND">("LOADING");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const res = await fetch(`/api/account/reports/${params.orderId}`, { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setReport("NOT_FOUND");
        return;
      }
      setReport(await res.json());
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.orderId]);

  if (report === "LOADING")
    return (
      <Container>
        <p className="text-sm text-slate-500">Loading...</p>
      </Container>
    );
  if (report === "NOT_FOUND")
    return (
      <Container>
        <Card>
          <p className="text-sm text-slate-600">Report not found, or this account doesn&apos;t have access to it.</p>
        </Card>
      </Container>
    );

  return (
    <Container className="max-w-3xl">
      <a href="/account" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Back to your account
      </a>
      <div className="mt-3">
        <ReportView report={report} pdfHref={`/api/account/reports/${params.orderId}/pdf`} headingLevel="h1" />
      </div>
    </Container>
  );
}
