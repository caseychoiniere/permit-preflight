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

type Step = "ADDRESS" | "SCREENING_INTENT" | "SUMMARY";

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

  // Code Generation review Correction 6 - BR-U5-9 fail-closed: while coverage readiness is not
  // confirmed `true` (the real, deployed default throughout the POC), the normal public route
  // exposes NONE of the journey steps (address entry, screening-intent buttons, request creation,
  // checkout) - only this plain unavailable message. Internal implementation/testing remains
  // fully exercisable through the domain/API/integration tests directly, never through this
  // public page while readiness is false.
  if (!coverageAvailable) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
        <h1>Vacant-Land Preliminary Screening</h1>
        <p role="status">Vacant-land screening is not yet available.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1>Vacant-Land Preliminary Screening (Prototype)</h1>

      {step === "ADDRESS" && (
        <section>
          <label>
            Property address
            <input value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Property address" />
          </label>
          <button type="button" onClick={submitAddress}>Find parcel</button>
          {addressError && <p role="alert">{addressError}</p>}

          {pendingClarification && (
            <div role="alert" style={{ marginTop: 16, padding: 12, border: "1px solid #ddd" }}>
              {pendingClarification.candidates.length === 1 ? (
                <>
                  <p>
                    We found this parcel but couldn&apos;t independently verify it ({pendingClarification.reason.toLowerCase().replace(/_/g, " ")}).
                  </p>
                  <p>
                    <strong>{pendingClarification.candidates[0]!.canonicalAddress ?? `Parcel ${pendingClarification.candidates[0]!.parcelId}`}</strong>
                  </p>
                  <p>Is this the property you want to evaluate?</p>
                  <button type="button" onClick={() => confirmParcelCandidate(pendingClarification.candidates[0]!)}>
                    Yes, this is the property
                  </button>{" "}
                  <button type="button" onClick={() => setPendingClarification(null)}>
                    No, let me revise the address
                  </button>
                </>
              ) : (
                <>
                  <p>We found more than one possible match. Which one is the property you want to evaluate?</p>
                  {pendingClarification.candidates.map((c) => (
                    <div key={c.parcelId} style={{ marginBottom: 8 }}>
                      <button type="button" onClick={() => confirmParcelCandidate(c)}>
                        {c.canonicalAddress ?? `Parcel ${c.parcelId}`}
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setPendingClarification(null)}>
                    None of these - let me revise the address
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {step === "SCREENING_INTENT" && (
        <section>
          <p>Parcel confirmed: {parcelId}</p>
          {parcelIsVacant && (
            <button type="button" onClick={() => selectScreeningIntent(VacantLandScreeningIntent.VACANT_PARCEL)}>
              Screen this vacant lot
            </button>
          )}
          <button type="button" onClick={() => selectScreeningIntent(VacantLandScreeningIntent.REDEVELOP_EXISTING_PARCEL)}>
            Screen for potential redevelopment
          </button>
          {createError && <p role="alert">{createError}</p>}
        </section>
      )}

      {step === "SUMMARY" && (
        <section>
          <h2>Review</h2>
          <p>Parcel: {parcelId}</p>
          <p>Screening request created. This is a preliminary screening assessment, not a recommendation.</p>
          <button type="button" onClick={checkout}>Continue to payment</button>
          {authorizedMessage && <p role="alert">{authorizedMessage}</p>}
        </section>
      )}
    </main>
  );
}
