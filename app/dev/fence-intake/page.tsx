/**
 * DEV/TEST-ONLY Unit 7 (Fences) intake preview. Renders the REAL FenceDetailsForm and, on submit, the
 * REAL ReportView for what the production evaluator produces from the form's validated output (all
 * eight rules treated as ACTIVE in memory only). No database access, no lifecycle changes, no
 * checkout. Lets fences be exercised by hand while they remain unavailable to customers
 * (isFenceScreeningCoverageReady() === false). Returns 404 in any production build. Open at
 * /dev/fence-intake while `npm run dev` is running.
 */

import { notFound } from "next/navigation";
import { FenceIntakePreview } from "./FenceIntakePreview.js";

export const dynamic = "force-dynamic";

export default function FenceIntakePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Unit 7 fence intake preview (dev only)</h1>
      <p>Real form, real evaluator, real report. In-memory rules only - nothing is saved or purchasable.</p>
      <FenceIntakePreview />
    </main>
  );
}
