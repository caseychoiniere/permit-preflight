/**
 * SampleReportPreview - a static, generic preview shown on the checkout Review step to help a
 * prospective customer understand what a completed report looks like before paying.
 *
 * Deliberately NOT this screening request's real data: the real report is only ever generated
 * after a verified Stripe payment webhook (BR-U2B-9) - this component must never be wired to
 * fetch, compute, or display anything derived from the user's actual parcel/placement. It exists
 * purely as illustrative marketing content, and says so visibly, so it can never be mistaken for
 * an actual finding about this property. Visually mirrors app/report/page.tsx's own finding-card
 * styling (Card + Badge) so the preview looks like a real report, without being one.
 */

import { Card } from "./ui/Card.js";
import { Badge } from "./ui/Badge.js";

interface SampleFinding {
  subject: string;
  tone: "success" | "warning";
  label: string;
  explanation: string;
}

const SAMPLE_FINDINGS: SampleFinding[] = [
  {
    subject: "Front Setback",
    tone: "success",
    label: "PASS",
    explanation: "The proposed structure's closest point to the front lot line clears the required minimum setback for this zone.",
  },
  {
    subject: "Rear Setback",
    tone: "success",
    label: "PASS",
    explanation: "The proposed structure's closest point to the rear lot line clears the required minimum setback for this zone.",
  },
  {
    subject: "Side Setbacks",
    tone: "warning",
    label: "REQUIRES VERIFICATION",
    explanation: "Side-yard clearance could not be automatically confirmed for this parcel shape and needs manual verification.",
  },
  {
    subject: "Lot Coverage",
    tone: "success",
    label: "PASS",
    explanation: "Combined structure footprint stays under the maximum lot-coverage percentage allowed for this zone.",
  },
  {
    subject: "Height Limit",
    tone: "success",
    label: "PASS",
    explanation: "The proposed structure's height stays under the maximum accessory-structure height allowed for this zone.",
  },
];

export function SampleReportPreview() {
  // Roughly the first third visible, the last two-thirds blurred - matches how a real report page
  // (app/report/page.tsx) stacks its finding cards, so the cut is representative of the real shape.
  const visibleCount = Math.ceil(SAMPLE_FINDINGS.length / 3);
  const visible = SAMPLE_FINDINGS.slice(0, visibleCount);
  const restBlurred = SAMPLE_FINDINGS.slice(visibleCount);

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold text-slate-900">What your report will look like</h2>
      <p className="mt-1 text-sm text-slate-500">
        A sample preview - not this property&apos;s actual results. Your real findings are generated after checkout.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {visible.map((f) => (
          <FindingCard key={f.subject} finding={f} />
        ))}

        <div className="relative">
          <div aria-hidden="true" className="pointer-events-none flex select-none flex-col gap-3 blur-sm">
            {restBlurred.map((f) => (
              <FindingCard key={f.subject} finding={f} />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-b from-transparent via-white/60 to-white pb-4">
            <Card className="text-center shadow-md">
              <p className="text-sm font-semibold text-slate-900">Unlock your full report</p>
              <p className="mt-1 text-xs text-slate-500">
                Complete checkout to see every finding, citation, and plain-language explanation for this property.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: SampleFinding }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm text-slate-900">{finding.subject}</strong>
        <Badge tone={finding.tone}>{finding.label}</Badge>
      </div>
      <p className="mt-2 text-sm text-slate-600">{finding.explanation}</p>
    </Card>
  );
}
