"use client";

/**
 * Vacant-Land Screening entry point (Unit 5, BR-U5-6, Workflow U5-1). Deliberately DISTINCT from
 * `/configure` - never rendered as another option inside its TYPE step (BR-U5-6's explicit
 * instruction). Reuses `/configure`'s own address/parcel-resolution call sequence (POST
 * /api/parcels/resolve + boundary fetch) rather than duplicating that business logic, per Q5's
 * "smallest clean design" instruction - no Project Configuration step follows (VL-1).
 */

import { useEffect, useState } from "react";
import { ParcelResolutionStatus, type CandidateParcel, type ClarificationReason } from "../../src/parcel-resolution/types.js";
import { confirmCandidate } from "../../src/parcel-resolution/resolve.js";
import { VacantLandScreeningIntent } from "../../src/screening-request/types.js";
import { Container } from "../components/ui/Container.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";

type Step = "ADDRESS" | "SCREENING_INTENT" | "SUMMARY";

const STEP_ORDER: Step[] = ["ADDRESS", "SCREENING_INTENT", "SUMMARY"];

export default function VacantLandPage() {
  const [step, setStep] = useState<Step>("ADDRESS");
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  // Product-correctness amendment (2026-08-27) - "fail closed on claims, not on completion,"
  // mirroring the identical fix in /configure. See aidlc-docs/decisions/
  // 2026-08-27-fail-closed-on-claims-not-completion-correction.md.
  const [pendingClarification, setPendingClarification] = useState<{ candidates: CandidateParcel[]; reason: ClarificationReason } | null>(null);
  const [parcelId, setParcelId] = useState<string | null>(null);
  const [parcelIsVacant, setParcelIsVacant] = useState(false);
  const [screeningRequestId, setScreeningRequestId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [authorizedMessage, setAuthorizedMessage] = useState<string | null>(null);

  // BR-U5-9 - Vacant-Land Screening Coverage Readiness. Fetched from the server rather than
  // assumed; defaults to unavailable until the fetch resolves, matching /configure's own
  // "absent means absent, fail closed" discipline for BR-U4-9.
  const [coverageAvailable, setCoverageAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/screening-requests/available-vacant-land-coverage")
      .then((res) => res.json())
      .then((result) => {
        if (!cancelled && typeof result.available === "boolean") setCoverageAvailable(result.available);
      })
      .catch(() => {
        /* leave the unavailable default in place - fail closed */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function proceedWithParcel(candidate: CandidateParcel) {
    setParcelId(candidate.parcelId);
    setParcelIsVacant(candidate.characteristics?.vacant === true);
    setStep("SCREENING_INTENT");
  }

  async function submitAddress() {
    setAddressError(null);
    setPendingClarification(null);
    const res = await fetch("/api/parcels/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
    const result = await res.json();

    if (result.status === ParcelResolutionStatus.CONFIRMED) {
      proceedWithParcel(result.confirmedParcel);
      return;
    }

    if (result.status === ParcelResolutionStatus.CLARIFICATION_REQUIRED && result.candidates?.length > 0) {
      setPendingClarification({ candidates: result.candidates, reason: result.clarificationReason });
      return;
    }

    if (result.status === ParcelResolutionStatus.RESOLUTION_UNAVAILABLE) {
      setAddressError("We couldn't reach the parcel data source right now. Please try again in a moment.");
      return;
    }

    setAddressError("We couldn't find a parcel for this address. Please check it and try again.");
  }

  function confirmParcelCandidate(chosen: CandidateParcel) {
    if (!pendingClarification) return;
    const result = confirmCandidate(chosen, pendingClarification.candidates);
    setPendingClarification(null);
    if (result.status === ParcelResolutionStatus.CONFIRMED) proceedWithParcel(result.confirmedParcel);
  }

  async function selectScreeningIntent(screeningIntent: string) {
    setCreateError(null);
    const res = await fetch("/api/screening-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmedParcelId: parcelId, workflowType: "VACANT_LAND", screeningIntent }),
    });
    const result = await res.json();
    if (result.error) {
      setCreateError(result.error);
      return;
    }
    setScreeningRequestId(result.id);
    setStep("SUMMARY");
  }

  async function checkout() {
    if (!screeningRequestId) return;
    setAuthorizedMessage(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screeningRequestId }),
    });
    const result = await res.json();
    if (result.error) {
      setAuthorizedMessage(result.error);
      return;
    }
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    if (result.alreadyPaid) {
      setAuthorizedMessage("This screening request has already been paid for.");
    }
  }

  /** Purely a navigation change - mirrors /configure's own goToPreviousStep. Every step's state
   * (address, parcelId, ...) is already held in this component and is never cleared on a step
   * change. */
  function goToPreviousStep() {
    const currentIndex = STEP_ORDER.indexOf(step);
    if (currentIndex > 0) setStep(STEP_ORDER[currentIndex - 1]!);
  }

  // Code Generation review Correction 6 - BR-U5-9 fail-closed: while coverage readiness is not
  // confirmed `true` (the real, deployed default throughout the POC), the normal public route
  // exposes NONE of the journey steps (address entry, screening-intent buttons, request creation,
  // checkout) - only this plain unavailable message. Internal implementation/testing remains
  // fully exercisable through the domain/API/integration tests directly, never through this
  // public page while readiness is false.
  if (!coverageAvailable) {
    return (
      <Container>
        <Card>
          <h1 className="text-lg font-semibold text-slate-900">Vacant-Land Preliminary Screening</h1>
          <p role="status" className="mt-2 text-sm text-slate-500">
            Vacant-land screening is not yet available.
          </p>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      {step === "ADDRESS" && (
        <Card>
          <h1 className="text-lg font-semibold text-slate-900">Vacant-Land Preliminary Screening</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the property address to look up its parcel.</p>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Property address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              aria-label="Property address"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <Button variant="primary" className="mt-4" onClick={submitAddress}>
            Find parcel
          </Button>
          {addressError && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {addressError}
            </p>
          )}

          {pendingClarification && (
            <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              {pendingClarification.candidates.length === 1 ? (
                <>
                  <p className="text-sm text-amber-900">
                    We found this parcel but couldn&apos;t independently verify it ({pendingClarification.reason.toLowerCase().replace(/_/g, " ")}).
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {pendingClarification.candidates[0]!.canonicalAddress ?? `Parcel ${pendingClarification.candidates[0]!.parcelId}`}
                  </p>
                  <p className="mt-2 text-sm text-amber-900">Is this the property you want to evaluate?</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => confirmParcelCandidate(pendingClarification.candidates[0]!)}>
                      Yes, this is the property
                    </Button>
                    <Button variant="secondary" onClick={() => setPendingClarification(null)}>
                      No, let me revise the address
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-amber-900">We found more than one possible match. Which one is the property you want to evaluate?</p>
                  <div className="mt-3 flex flex-col items-start gap-2">
                    {pendingClarification.candidates.map((c) => (
                      <Button key={c.parcelId} variant="secondary" onClick={() => confirmParcelCandidate(c)}>
                        {c.canonicalAddress ?? `Parcel ${c.parcelId}`}
                      </Button>
                    ))}
                  </div>
                  <Button variant="ghost" className="mt-2" onClick={() => setPendingClarification(null)}>
                    None of these - let me revise the address
                  </Button>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      {step === "SCREENING_INTENT" && (
        <Card>
          <p className="text-sm text-slate-500">
            Parcel confirmed: <span className="font-medium text-slate-900">{parcelId}</span>
          </p>
          <h1 className="mt-2 text-lg font-semibold text-slate-900">What kind of screening do you need?</h1>
          <div className="mt-4 flex flex-col items-start gap-2">
            {parcelIsVacant && (
              <Button variant="primary" onClick={() => selectScreeningIntent(VacantLandScreeningIntent.VACANT_PARCEL)}>
                Screen this vacant lot
              </Button>
            )}
            <Button variant="primary" onClick={() => selectScreeningIntent(VacantLandScreeningIntent.REDEVELOP_EXISTING_PARCEL)}>
              Screen for potential redevelopment
            </Button>
          </div>
          {createError && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </p>
          )}
          <Button variant="secondary" className="mt-4" onClick={goToPreviousStep}>
            &larr; Previous
          </Button>
        </Card>
      )}

      {step === "SUMMARY" && (
        <Card>
          <h1 className="text-lg font-semibold text-slate-900">Review</h1>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Parcel</dt>
              <dd className="font-medium text-slate-900">{parcelId}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-slate-500">Screening request created. This is a preliminary screening assessment, not a recommendation.</p>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={goToPreviousStep}>
              &larr; Previous
            </Button>
            <Button variant="primary" onClick={checkout}>
              Continue to payment
            </Button>
          </div>
          {authorizedMessage && (
            <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {authorizedMessage}
            </p>
          )}
        </Card>
      )}
    </Container>
  );
}
