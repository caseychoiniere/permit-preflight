/**
 * DEV/TEST-ONLY preview of the two waiting experiences (parcel lookup, report generation) in every state. 404 in any production build; reads and writes nothing.
 * Open at /dev/loading-preview while `npm run dev` is running.
 */
import { notFound } from "next/navigation";
import { Card } from "../../components/ui/Card.js";
import { Container } from "../../components/ui/Container.js";
import { LookupLoading } from "../../components/LookupLoading.js";
import { ReportGenerationProgress } from "../../components/ReportGenerationProgress.js";

export const dynamic = "force-dynamic";

export default function LoadingPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Container>
      <h1 className="text-lg font-semibold text-slate-900">Loading experiences (dev preview)</h1>
      <div className="mt-4 grid gap-4">
        <Card>
          <h2 className="text-sm font-semibold text-slate-700">Parcel search - looking up</h2>
          <LookupLoading stage="RESOLVING" />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-700">Parcel search - loading the parcel</h2>
          <LookupLoading stage="LOADING_PARCEL" />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-700">Parcel search - error</h2>
          <LookupLoading stage={null} error="We couldn't find a parcel for this address. Please check it and try again." />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-700">Report generation - working</h2>
          <ReportGenerationProgress />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-700">Report generation - longer than normal (50 s)</h2>
          <ReportGenerationProgress initialElapsedMs={50_000} />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-700">Report generation - very long (160 s)</h2>
          <ReportGenerationProgress initialElapsedMs={160_000} />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-700">Report generation - ready</h2>
          <ReportGenerationProgress done />
        </Card>
      </div>
    </Container>
  );
}
