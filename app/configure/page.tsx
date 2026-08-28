"use client";

/**
 * ProjectConfigurationFlow (PC-1, PC-2, Workflow 1/2). A linear, revisitable wizard: address ->
 * project type -> dimensions -> map placement + lot-line roles -> summary -> checkout.
 * The final step (Unit 2B, BR-U2B-9) redirects to a real Stripe Checkout Session via
 * POST /api/checkout - report generation is authorized exclusively by a verified payment webhook,
 * never by this page directly. (INTERNAL_PROTOTYPE triggering still exists, but only as a
 * server-only CLI script - scripts/generate-prototype-report.ts - never reachable from the UI.)
 *
 * Unit 4 (Detached Garages): the full garage TYPE/DETAILS/PLACEMENT/SUMMARY path is implemented
 * and remains fully representable/testable (business-rules.md BR-U4-1's intake/evaluation
 * support), but the TYPE step's PUBLIC advertisement of GARAGE is itself gated by Garage
 * Screening Coverage Readiness (BR-U4-9, corrected per founder review 2026-08-27) - BR-U4-9 gates
 * BOTH public advertisement AND checkout, not checkout alone. This client component fetches the
 * available-types list from GET /api/screening-requests/available-project-types (a tiny
 * server-safe boundary - this file must never import screening-request/authorization.js directly,
 * a server-only module) rather than hardcoding or assuming the list. Server-side, the checkout gate
 * (checkGarageCheckoutEligibility) remains an independent, authoritative defense even if a caller
 * bypasses this list and creates a GARAGE ScreeningRequest directly via the API.
 */

import { useEffect, useState } from "react";
import { ParcelPlacementMap, type PlacementSelection, type LotLineSelection } from "../components/ParcelPlacementMap.js";
import type { GeographicPoint, Polygon } from "../../src/spatial-analysis/types.js";
import { DistanceInputMode, LotLineRoleStatus, ProjectType } from "../../src/screening-request/types.js";
import { ParcelResolutionStatus, type CandidateParcel, type ClarificationReason } from "../../src/parcel-resolution/types.js";
import { confirmCandidate } from "../../src/parcel-resolution/resolve.js";

type Step = "ADDRESS" | "TYPE" | "DETAILS" | "PLACEMENT" | "SUMMARY";
type SelectedProjectType = typeof ProjectType.SHED | typeof ProjectType.GARAGE | null;
/** undefined = not answered (never coerced to a concrete value); tri-state matches
 * frontend-components.md's explicit 3-choice contract for both garage-only fields. */
type TriState = boolean | undefined;

export default function ConfigurePage() {
  const [step, setStep] = useState<Step>("ADDRESS");
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  // Product-correctness amendment (2026-08-27) - "fail closed on claims, not on completion."
  // CLARIFICATION_REQUIRED with 1+ real candidates is no longer a dead end: the user explicitly
  // confirms which parcel to evaluate rather than the flow requiring algorithmic corroboration to
  // proceed. See aidlc-docs/decisions/2026-08-27-fail-closed-on-claims-not-completion-correction.md.
  const [pendingClarification, setPendingClarification] = useState<{ candidates: CandidateParcel[]; reason: ClarificationReason } | null>(null);
  const [parcelId, setParcelId] = useState<string | null>(null);
  const [boundaryPolygon, setBoundaryPolygon] = useState<Polygon | null>(null);
  const [boundaryPolygonWgs84, setBoundaryPolygonWgs84] = useState<GeographicPoint[] | null>(null);
  const [qualityCaveat, setQualityCaveat] = useState<string | null>(null);

  // Unit 4 (BR-U4-9, corrected) - which project types the TYPE step may publicly offer. Fetched
  // from the server rather than assumed; defaults to shed-only until the fetch resolves, matching
  // PC-1's "absent means absent" (never a disabled/"coming soon" garage button while unknown).
  const [availableProjectTypes, setAvailableProjectTypes] = useState<string[]>([ProjectType.SHED]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/screening-requests/available-project-types")
      .then((res) => res.json())
      .then((result) => {
        if (!cancelled && Array.isArray(result.availableProjectTypes)) setAvailableProjectTypes(result.availableProjectTypes);
      })
      .catch(() => {
        /* leave the shed-only default in place - fail closed, never assume garage is available */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [screeningRequestId, setScreeningRequestId] = useState<string | null>(null);
  const [projectType, setProjectType] = useState<SelectedProjectType>(null);
  const [dimensions, setDimensions] = useState({ widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false });
  // Garage-only intake facts (domain-entities.md's GarageProjectConfiguration). Never defaulted -
  // `undefined` means "not answered," an explicit `0`/`false` means a deliberate assertion
  // (business-rules.md BR-U4-3 / L6's required-facts note).
  const [existingStructuresChoice, setExistingStructuresChoice] = useState<"UNANSWERED" | "ENTER" | "ZERO">("UNANSWERED");
  const [existingStructuresValue, setExistingStructuresValue] = useState(0);
  const existingStructuresFootprintSqFt = existingStructuresChoice === "ENTER" ? existingStructuresValue : existingStructuresChoice === "ZERO" ? 0 : undefined;
  const [stackedDwellingUnits, setStackedDwellingUnits] = useState<TriState>(undefined);
  const [placement, setPlacement] = useState<PlacementSelection | null>(null);
  const [lotLineSelection, setLotLineSelection] = useState<LotLineSelection | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [authorizedMessage, setAuthorizedMessage] = useState<string | null>(null);

  /** Shared by both the algorithmically-CONFIRMED path and the user-confirmation path below -
   * neither is a "more trusted" way to reach the TYPE step; both produce a real, identified
   * parcel, honestly labeled at the resolution layer (identityProvenance). */
  async function proceedWithParcel(parcelId: string) {
    setParcelId(parcelId);
    const boundaryRes = await fetch(`/api/parcels/${encodeURIComponent(parcelId)}/boundary`);
    const boundaryResult = await boundaryRes.json();
    if (boundaryResult.error) {
      setAddressError(boundaryResult.error);
      return;
    }
    setBoundaryPolygon(boundaryResult.boundaryPolygon);
    setBoundaryPolygonWgs84(boundaryResult.boundaryPolygonWgs84);
    setQualityCaveat(boundaryResult.qualityCaveat);
    setStep("TYPE");
  }

  async function submitAddress() {
    setAddressError(null);
    setPendingClarification(null);
    const res = await fetch("/api/parcels/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
    const result = await res.json();

    if (result.status === ParcelResolutionStatus.CONFIRMED) {
      await proceedWithParcel(result.confirmedParcel.parcelId);
      return;
    }

    if (result.status === ParcelResolutionStatus.CLARIFICATION_REQUIRED && result.candidates?.length > 0) {
      // A real, identifiable candidate (or candidates) exists - ask the user to confirm rather
      // than dead-ending the flow (the founder's own reported 26/26 real-address regression).
      setPendingClarification({ candidates: result.candidates, reason: result.clarificationReason });
      return;
    }

    if (result.status === ParcelResolutionStatus.RESOLUTION_UNAVAILABLE) {
      // A genuine infrastructure/runtime failure - a legitimate hard stop.
      setAddressError("We couldn't reach the parcel data source right now. Please try again in a moment.");
      return;
    }

    // NO_MATCH, or CLARIFICATION_REQUIRED with zero candidates - no parcel to confirm; the
    // property genuinely could not be identified from this input.
    setAddressError("We couldn't find a parcel for this address. Please check it and try again.");
  }

  function confirmParcelCandidate(chosen: CandidateParcel) {
    if (!pendingClarification) return;
    const result = confirmCandidate(chosen, pendingClarification.candidates);
    setPendingClarification(null);
    if (result.status === ParcelResolutionStatus.CONFIRMED) {
      void proceedWithParcel(result.confirmedParcel.parcelId);
    }
  }

  async function selectProjectType(type: typeof ProjectType.SHED | typeof ProjectType.GARAGE) {
    const res = await fetch("/api/screening-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmedParcelId: parcelId, projectType: type }),
    });
    const result = await res.json();
    setProjectType(type);
    setScreeningRequestId(result.id);
    setStep("DETAILS");
  }

  async function submitPlacement() {
    if (!screeningRequestId || !placement || !lotLineSelection) return;
    setServerErrors([]);
    const res = await fetch(`/api/screening-requests/${screeningRequestId}/project-details`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...dimensions,
        ...(projectType === ProjectType.GARAGE ? { existingStructuresFootprintSqFt, stackedDwellingUnits } : {}),
        proposedPlacement: placement,
        lotLineRoleAssignment: { ...lotLineSelection, method: "USER_INDICATED" },
        distanceInputMode: DistanceInputMode.MAP_PLACEMENT,
      }),
    });
    const result = await res.json();
    if (result.issues) {
      setServerErrors(result.issues);
      return;
    }
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

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1>Permit Preflight - Screening (Prototype)</h1>

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

      {step === "TYPE" && (
        <section>
          <p>Parcel confirmed: {parcelId}</p>
          {availableProjectTypes.includes(ProjectType.SHED) && (
            <button type="button" onClick={() => selectProjectType(ProjectType.SHED)}>Screen a shed / accessory structure</button>
          )}
          {availableProjectTypes.includes(ProjectType.GARAGE) && (
            <button type="button" onClick={() => selectProjectType(ProjectType.GARAGE)}>Screen a detached garage</button>
          )}
        </section>
      )}

      {step === "DETAILS" && (
        <section>
          <h2>{projectType === ProjectType.GARAGE ? "Detached garage details" : "Shed details"}</h2>
          <label>Width (ft) <input type="number" value={dimensions.widthFt} onChange={(e) => setDimensions((d) => ({ ...d, widthFt: Number(e.target.value) }))} /></label>
          <label>Depth (ft) <input type="number" value={dimensions.depthFt} onChange={(e) => setDimensions((d) => ({ ...d, depthFt: Number(e.target.value) }))} /></label>
          <label>Height (ft) <input type="number" value={dimensions.heightFt} onChange={(e) => setDimensions((d) => ({ ...d, heightFt: Number(e.target.value) }))} /></label>
          <label><input type="checkbox" checked={dimensions.alleyAdjacent} onChange={(e) => setDimensions((d) => ({ ...d, alleyAdjacent: e.target.checked }))} /> Rear lot line is alley-adjacent</label>

          {projectType === ProjectType.GARAGE && (
            <>
              <fieldset>
                <legend>Existing structures on this parcel</legend>
                <p>
                  Enter the combined square footage of existing structures on this parcel that would count
                  toward SMC lot-coverage - garages, sheds, other accessory buildings, and the principal
                  dwelling - excluding underground portions, minor eave/roof overhangs, low decks, and small
                  unenclosed porches/steps. An approximate figure is fine. This is self-reported and the
                  resulting lot-coverage finding will always be marked &quot;requires verification,&quot;
                  regardless of what you enter (business-rules.md BR-U4-3).
                </p>
                <label>
                  <input type="radio" name="existingStructuresChoice" checked={existingStructuresChoice === "ENTER"} onChange={() => setExistingStructuresChoice("ENTER")} />
                  Enter square footage
                </label>
                {existingStructuresChoice === "ENTER" && (
                  <input
                    type="number"
                    min={0}
                    value={existingStructuresValue}
                    onChange={(e) => setExistingStructuresValue(Number(e.target.value))}
                    aria-label="Existing structures countable square footage"
                  />
                )}
                <label>
                  <input type="radio" name="existingStructuresChoice" checked={existingStructuresChoice === "ZERO"} onChange={() => setExistingStructuresChoice("ZERO")} />
                  There are no existing structures on this parcel
                </label>
                <label>
                  <input type="radio" name="existingStructuresChoice" checked={existingStructuresChoice === "UNANSWERED"} onChange={() => setExistingStructuresChoice("UNANSWERED")} />
                  I don&apos;t know / skip this
                </label>
              </fieldset>

              <fieldset>
                <legend>Stacked dwelling units</legend>
                <p>Does this lot currently have stacked dwelling units (e.g. an apartment/condo-style building with units stacked vertically - not a single-family home, duplex, or attached townhomes)?</p>
                <label><input type="radio" name="stackedDwellingUnits" checked={stackedDwellingUnits === true} onChange={() => setStackedDwellingUnits(true)} /> Yes</label>
                <label><input type="radio" name="stackedDwellingUnits" checked={stackedDwellingUnits === false} onChange={() => setStackedDwellingUnits(false)} /> No</label>
                <label><input type="radio" name="stackedDwellingUnits" checked={stackedDwellingUnits === undefined} onChange={() => setStackedDwellingUnits(undefined)} /> I don&apos;t know</label>
              </fieldset>
            </>
          )}

          <button type="button" onClick={() => setStep("PLACEMENT")}>Next: place on parcel</button>
        </section>
      )}

      {step === "PLACEMENT" && boundaryPolygon && boundaryPolygonWgs84 && (
        <section>
          <h2>Approximate placement</h2>
          {qualityCaveat && <p><em>{qualityCaveat}</em></p>}
          <ParcelPlacementMap
            boundaryPolygon={boundaryPolygon}
            boundaryPolygonWgs84={boundaryPolygonWgs84}
            onPlacementChange={setPlacement}
            onLotLineRolesChange={setLotLineSelection}
          />
          {lotLineSelection?.status === LotLineRoleStatus.INSUFFICIENT && (
            <p role="alert">Lot-line roles could not be determined for this parcel shape - setback findings depending on them will show as REQUIRES VERIFICATION rather than a guess.</p>
          )}
          {serverErrors.length > 0 && <ul role="alert">{serverErrors.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          <button type="button" onClick={submitPlacement} disabled={!placement}>Next: review</button>
        </section>
      )}

      {step === "SUMMARY" && (
        <section>
          <h2>Review</h2>
          <p>Parcel: {parcelId}</p>
          <p>
            {projectType === ProjectType.GARAGE ? "Detached garage" : "Shed"}: {dimensions.widthFt}ft x {dimensions.depthFt}ft x {dimensions.heightFt}ft
            {dimensions.alleyAdjacent ? " (alley-adjacent)" : ""}
          </p>
          {projectType === ProjectType.GARAGE && (
            <p>
              Existing structures: {existingStructuresFootprintSqFt === undefined ? "not answered" : `${existingStructuresFootprintSqFt} sq ft (self-reported)`}
              {" - "}
              Stacked dwelling units: {stackedDwellingUnits === undefined ? "not answered" : stackedDwellingUnits ? "yes" : "no"}
            </p>
          )}
          <button type="button" onClick={checkout}>Continue to payment</button>
          {authorizedMessage && <p role="alert">{authorizedMessage}</p>}
        </section>
      )}
    </main>
  );
}
