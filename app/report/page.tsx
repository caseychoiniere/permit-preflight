"use client";

/**
 * ReportPage (RGD-2, RGD-3, RGD-6). Reads exclusively through GET /api/reports (BR-U2-7) - the
 * token IS the credential, there is no reportId-based route anywhere in this app. Its actual
 * report-content rendering lives in the shared ../components/ReportView.js (2026-08-28 extraction,
 * so the post-checkout status page can show the same rendering without a second copy) - this file
 * owns only the token-exchange/loading/not-found handling specific to reaching this page via an
 * emailed link.
 *
 * Corrected 2026-08-25 (Operations, bearer-credential-in-URL finding): the raw reportAccessToken
 * no longer appears anywhere in this page's own URL path/query string - Vercel's platform request
 * logs (Runtime Logs, Log Drains) capture the full Request Path and Search Params, outside this
 * application's own logging discipline's control. The guest report-access email link now points
 * here as `/report#access_token=<token>` - a URL FRAGMENT, which browsers never send as part of
 * the actual HTTP request, so it never reaches Vercel (or any server) as request data at all. On
 * load, this page reads the fragment client-side, POSTs the token in a request BODY to
 * /api/reports/access (which validates it via the existing hash-only credential lookup and sets an
 * HttpOnly session cookie), then immediately strips the fragment from the visible URL via
 * history.replaceState - the raw token is never left sitting in the visible URL or browser
 * history. Subsequent report/PDF reads rely on that cookie, never a URL-embedded token again.
 */

import { useEffect, useState } from "react";
import { ReportView, type Report } from "../components/ReportView.js";
import { Container } from "../components/ui/Container.js";
import { Card } from "../components/ui/Card.js";

const ACCESS_TOKEN_HASH_PREFIX = "#access_token=";

export default function ReportPage() {
  const [report, setReport] = useState<Report | "LOADING" | "NOT_FOUND">("LOADING");

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      const res = await fetch("/api/reports", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setReport("NOT_FOUND");
        return;
      }
      setReport(await res.json());
    }

    async function run() {
      const hash = window.location.hash;
      if (hash.startsWith(ACCESS_TOKEN_HASH_PREFIX)) {
        const token = decodeURIComponent(hash.slice(ACCESS_TOKEN_HASH_PREFIX.length));
        const exchangeRes = await fetch("/api/reports/access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        // Strip the fragment from the visible URL regardless of outcome - the raw token must
        // never remain visible in the URL or browser history once read.
        window.history.replaceState(null, "", "/report");
        if (cancelled) return;
        if (!exchangeRes.ok) {
          setReport("NOT_FOUND");
          return;
        }
      }
      await loadReport();
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

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
          <p className="text-sm text-slate-600">Report not found. If you believe this is an error, check that you used the complete link you were given.</p>
        </Card>
      </Container>
    );

  return (
    <Container className="max-w-3xl">
      <ReportView report={report} pdfHref="/api/reports/pdf" headingLevel="h1" />
    </Container>
  );
}
