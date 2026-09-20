/**
 * Unit 6 Code Generation Part 2 review, corrections 1/3/4 - structural / source-scan guards,
 * matching this project's established pattern for behaviour that can't be rendered/exercised
 * without a DB or a React test runner (see tests/checkout-fulfillment/*-route-surface.test.ts).
 * The DB-dependent behaviour itself is covered in tests/account-auth/workflows.integration.test.ts.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

describe("Correction 1 - Account Access reuses the shared ReportView, not a second renderer", () => {
  const page = read("app/account/reports/[orderId]/page.tsx");

  it("the account report page imports and renders the shared ReportView component", () => {
    expect(page).toMatch(/import \{ ReportView.*\} from ".*components\/ReportView\.js"/);
    expect(page).toMatch(/<ReportView\b/);
  });

  it("[hard invariant] it does NOT re-implement its own findings renderer (no local classification-splitting, no local Finding/Report interface)", () => {
    expect(page).not.toMatch(/f\.classification !== FindingClassification\.REQUIRES_VERIFICATION/);
    expect(page).not.toMatch(/interface Finding\b/);
    expect(page).not.toMatch(/knownAndInferred/);
    expect(page).not.toMatch(/requiresVerification\.map/);
  });

  it("passes the account-authorized PDF route as ReportView's pdfHref - never a guest token URL", () => {
    expect(page).toMatch(/pdfHref=\{`\/api\/account\/reports\/\$\{params\.orderId\}\/pdf`\}/);
    expect(page).not.toMatch(/access_token/);
  });

  it("the account report API returns the exact field set ReportView's Report type consumes", () => {
    const route = read("app/api/account/reports/[orderId]/route.ts");
    for (const field of ["id:", "findings:", "evidence:", "explanation:", "generatedAt:"]) {
      expect(route).toContain(field);
    }
  });
});

describe("Correction 1 - Account PDF route: AccountSession + AccountOrderLink -> existing artifact -> existing renderer", () => {
  const pdfRoute = read("app/api/account/reports/[orderId]/pdf/route.ts");

  it("authorization is AccountSession (resolveAccountSession) + AccountOrderLink (getAccountReport)", () => {
    expect(pdfRoute).toMatch(/resolveAccountSession/);
    expect(pdfRoute).toMatch(/getAccountReport\(db, session\.accountId, orderId\)/);
  });

  it("renders via the EXISTING immutable artifact + EXISTING PDF renderer (getReportById + getOrRenderReportPdf)", () => {
    expect(pdfRoute).toMatch(/getReportById\(db, result\.artifactId\)/);
    expect(pdfRoute).toMatch(/getOrRenderReportPdf\(db, artifact\)/);
  });

  it("[hard invariant] never mints, recovers, or reads a guest report-access token / cookie", () => {
    expect(pdfRoute).not.toMatch(/findArtifactIdByAccessToken/);
    expect(pdfRoute).not.toMatch(/REPORT_ACCESS_COOKIE/);
    expect(pdfRoute).not.toMatch(/rotateAccessCredential|createAccessCredential/);
    expect(pdfRoute).not.toMatch(/access_token/);
  });

  it("a non-authorized outcome is a 404 (no order-existence oracle)", () => {
    expect(pdfRoute).toMatch(/result\.outcome !== "FOUND"\) return notFound\(\)/);
    expect(pdfRoute).toMatch(/status: 404/);
  });
});

describe("Correction 2 - the claim/token route normalizes a pasted link OR token before lookup", () => {
  const route = read("app/api/account/claim/token/route.ts");

  it("calls normalizeReportTokenInput on the submitted value before claimByReportToken", () => {
    expect(route).toMatch(/normalizeReportTokenInput\(body\.token\)/);
    const normIdx = route.indexOf("normalizeReportTokenInput(body.token)");
    const claimIdx = route.indexOf("claimByReportToken(db, session.accountId, rawToken)");
    expect(normIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeGreaterThan(normIdx);
  });

  it("an un-normalizable value is a 404, identical to an invalid token (no oracle)", () => {
    expect(route).toMatch(/if \(!rawToken\) \{[\s\S]*?status: 404/);
  });
});

describe("Correction 3 - the guest report-access email carries the customer-facing Order reference", () => {
  const repo = read("src/report-access/repository.ts");

  it("deliverGuestReportAccess accepts an orderReference and includes it in the email body", () => {
    expect(repo).toMatch(/orderReference\?: string/);
    expect(repo).toMatch(/Order reference:/);
  });

  it("[hard invariant] the Order reference lines are plain labelled text - never a link, never carrying the access token", () => {
    const htmlLine = repo.split("\n").find((l) => l.includes("orderReferenceHtml") && l.includes("?")) ?? "";
    const textLine = repo.split("\n").find((l) => l.includes("orderReferenceText") && l.includes("?")) ?? "";
    expect(htmlLine).not.toMatch(/<a\s|href=/);
    expect(htmlLine + textLine).not.toMatch(/access_token/);
  });

  it("both real call sites pass the Order id through", () => {
    expect(read("src/checkout-fulfillment/index.ts")).toMatch(/deliverGuestReportAccess\([\s\S]*?authorization\.orderId\)/);
    expect(read("src/checkout-fulfillment/reconciliation.ts")).toMatch(/deliverGuestReportAccess\([\s\S]*?orderRow\?\.id\)/);
  });

  it("the post-checkout status page also surfaces the Order reference (a second, in-browser place to obtain it)", () => {
    const statusPage = read("app/checkout/status/page.tsx");
    expect(statusPage).toMatch(/Order reference:/);
    expect(read("app/api/checkout/report/route.ts")).toMatch(/orderReference/);
  });
});

describe("Correction 4 - report history entries carry enough EXISTING data to tell screenings apart", () => {
  it("listLinksForAccount joins ScreeningRequest and selects parcel id, workflow/project type, and paid date", () => {
    const linkRepo = read("src/account-auth/link-repository.ts");
    expect(linkRepo).toMatch(/\.innerJoin\(screeningRequests,/);
    for (const field of ["confirmedParcelId:", "workflowType:", "projectType:", "paidAt:"]) {
      expect(linkRepo).toContain(field);
    }
  });

  it("[hard invariant] it adds NO new identifier/column - only existing schema fields are selected", () => {
    const linkRepo = read("src/account-auth/link-repository.ts");
    // Nothing here creates a table/column or an ad-hoc reference number.
    expect(linkRepo).not.toMatch(/pgTable|addColumn|referenceNumber|confirmationNumber/);
  });

  it("the account page shows the screening description + parcel + date, and does NOT feature linkMethod prominently", () => {
    const page = read("app/account/page.tsx");
    expect(page).toMatch(/describeScreening\(r\)/);
    expect(page).toMatch(/\{r\.confirmedParcelId\}/);
    // linkMethod must no longer be rendered in the history card at all.
    expect(page).not.toMatch(/via \{r\.linkMethod\}/);
    expect(page).not.toMatch(/\{r\.linkMethod\}/);
  });
});
