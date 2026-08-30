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
import { ParcelPlacementMap, type PlacementSelection, type LotLineSelection, type ExistingStructureDisplay, type DwellingSelection } from "../components/ParcelPlacementMap.js";
import { checkPlacementCompleteness } from "../components/parcel-placement-helpers.js";
import type { GeographicPoint, Polygon } from "../../src/spatial-analysis/types.js";
import { DistanceInputMode, LotLineRoleStatus, ProjectType } from "../../src/screening-request/types.js";
import { ParcelResolutionStatus, type CandidateParcel, type ClarificationReason } from "../../src/parcel-resolution/types.js";
import { confirmCandidate } from "../../src/parcel-resolution/resolve.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { SampleReportPreview } from "../components/SampleReportPreview.js";
import { ReviewPlacementMap } from "../components/ReviewPlacementMap.js";

type Step = "ADDRESS" | "TYPE" | "DETAILS" | "PLACEMENT" | "SUMMARY";
type SelectedProjectType = typeof ProjectType.SHED | typeof ProjectType.GARAGE | null;
/** undefined = not answered (never coerced to a concrete value); tri-state matches
 * frontend-components.md's explicit 3-choice contract for both garage-only fields. */
type TriState = boolean | undefined;

const STEPS: { key: Step; label: string }[] = [
  { key: "ADDRESS", label: "Address" },
  { key: "TYPE", label: "Project type" },
  { key: "DETAILS", label: "Details" },
  { key: "PLACEMENT", label: "Placement" },
  { key: "SUMMARY", label: "Review" },
];

/** Purely visual step tracker - reads `step` only, never drives navigation or validation. */
function StepTracker({ step }: { step: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="mb-8 flex items-center gap-2 text-xs font-medium text-slate-400 sm:text-sm">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={
              i < currentIndex
                ? "flex items-center gap-1.5 text-emerald-600"
                : i === currentIndex
                  ? "flex items-center gap-1.5 text-indigo-600"
                  : "flex items-center gap-1.5 text-slate-400"
            }
          >
            <span
              className={
                i < currentIndex
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px]"
                  : i === currentIndex
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white"
                    : "flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px]"
              }
            >
              {i + 1}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-4 bg-slate-200 sm:w-8" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

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
  // Building intelligence v1 - fetched alongside the parcel boundary (same request); best-effort,
  // never blocks the flow if it comes back empty or the server-side fetch failed.
  const [existingStructures, setExistingStructures] = useState<ExistingStructureDisplay[]>([]);
  const [dwellingSelection, setDwellingSelection] = useState<DwellingSelection | null>(null);

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

  /** Placement-step UX pass (2026-08-30) - a real customer previously purchased a report without
   * ever confirming the dwelling, because "Next: review" was gated on `placement` alone. This is
   * the single source of truth both the Next button's disabled state and the "Before continuing:"
   * checklist read from, so they can never disagree. `lotLineSelection !== null` already means the
   * front/rear picking process reached a definite outcome (ASSIGNED or the equally-legitimate
   * INSUFFICIENT - see checkPlacementCompleteness's own doc comment for why INSUFFICIENT must
   * still count as "decided," not "blocked"). Shed-only for the dwelling requirement, matching
   * DWELLING_SEPARATION's own shed-only scope - existingStructures is always [] for garage. */
  const placementCompleteness = checkPlacementCompleteness({
    lotLineDecided: lotLineSelection !== null,
    hasPlacement: placement !== null,
    hasBuildingsToAskAbout: projectType === ProjectType.SHED && existingStructures.length > 0,
    dwellingAnswered: dwellingSelection !== null,
  });

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
    setExistingStructures(Array.isArray(boundaryResult.existingStructures) ? boundaryResult.existingStructures : []);
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
        // Building intelligence v1 - shed-only (mirrors distanceToDwellingFt's own shed-only
        // scope). Omitted entirely when the user was never shown a dwelling-confirmation prompt at
        // all (existingStructures was empty) - never fabricated as UNKNOWN in that case; the
        // pipeline's own fresh fetch already resolves "nothing to select" the same way either way.
        ...(projectType === ProjectType.SHED && dwellingSelection ? { primaryDwellingSelection: { ...dwellingSelection, method: "USER_CONFIRMED" } } : {}),
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

  /** Purely a navigation change - every step's own state (address, dimensions, placement, ...) is
   * already held in this component's state and is never cleared on a step change, so moving back
   * and then forward again shows exactly what the user already entered. Never re-submits anything
   * to the server by itself. */
  function goToPreviousStep() {
    const currentIndex = STEPS.findIndex((s) => s.key === step);
    if (currentIndex > 0) setStep(STEPS[currentIndex - 1]!.key);
  }

  return (
    // Layout pass (2026-08-30) - the Placement step specifically needs more horizontal room than
    // Container's shared max-w-3xl (768px) allows, for its two-column map+controls layout
    // (ParcelPlacementMap.tsx targets ~1000px internally). Widening Container itself would widen
    // EVERY step/page that uses it - out of scope ("prefer widening this Placement-step layout
    // specifically") - so this inlines Container's own classes with a step-conditional max-width
    // instead, touching nothing else.
    <div className={`mx-auto w-full px-4 py-8 sm:px-6 lg:px-8 ${step === "PLACEMENT" ? "max-w-[1000px]" : "max-w-3xl"}`}>
      <StepTracker step={step} />

      {step === "ADDRESS" && (
        <Card>
          <h1 className="text-lg font-semibold text-slate-900">Where is the project?</h1>
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

      {step === "TYPE" && (
        <Card>
          <p className="text-sm text-slate-500">
            Parcel confirmed: <span className="font-medium text-slate-900">{parcelId}</span>
          </p>
          <h1 className="mt-2 text-lg font-semibold text-slate-900">What are you planning to build?</h1>
          <div className="mt-4 flex flex-col items-start gap-2">
            {availableProjectTypes.includes(ProjectType.SHED) && (
              <Button variant="primary" onClick={() => selectProjectType(ProjectType.SHED)}>
                Screen a shed / accessory structure
              </Button>
            )}
            {availableProjectTypes.includes(ProjectType.GARAGE) && (
              <Button variant="primary" onClick={() => selectProjectType(ProjectType.GARAGE)}>
                Screen a detached garage
              </Button>
            )}
          </div>
          <Button variant="secondary" className="mt-4" onClick={goToPreviousStep}>
            &larr; Previous
          </Button>
        </Card>
      )}

      {step === "DETAILS" && (
        <Card>
          <h1 className="text-lg font-semibold text-slate-900">{projectType === ProjectType.GARAGE ? "Detached garage details" : "Shed details"}</h1>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700">
              Width (ft)
              <input
                type="number"
                value={dimensions.widthFt}
                onChange={(e) => setDimensions((d) => ({ ...d, widthFt: Number(e.target.value) }))}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Depth (ft)
              <input
                type="number"
                value={dimensions.depthFt}
                onChange={(e) => setDimensions((d) => ({ ...d, depthFt: Number(e.target.value) }))}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Height (ft)
              <input
                type="number"
                value={dimensions.heightFt}
                onChange={(e) => setDimensions((d) => ({ ...d, heightFt: Number(e.target.value) }))}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={dimensions.alleyAdjacent}
              onChange={(e) => setDimensions((d) => ({ ...d, alleyAdjacent: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Rear lot line is alley-adjacent
          </label>

          {projectType === ProjectType.GARAGE && (
            <>
              <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">Existing structures on this parcel</legend>
                <p className="text-sm text-slate-500">
                  Enter the combined square footage of existing structures on this parcel that would count
                  toward SMC lot-coverage - garages, sheds, other accessory buildings, and the principal
                  dwelling - excluding underground portions, minor eave/roof overhangs, low decks, and small
                  unenclosed porches/steps. An approximate figure is fine. This is self-reported and the
                  resulting lot-coverage finding will always be marked &quot;requires verification,&quot;
                  regardless of what you enter (business-rules.md BR-U4-3).
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="existingStructuresChoice"
                      checked={existingStructuresChoice === "ENTER"}
                      onChange={() => setExistingStructuresChoice("ENTER")}
                      className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Enter square footage
                  </label>
                  {existingStructuresChoice === "ENTER" && (
                    <input
                      type="number"
                      min={0}
                      value={existingStructuresValue}
                      onChange={(e) => setExistingStructuresValue(Number(e.target.value))}
                      aria-label="Existing structures countable square footage"
                      className="ml-6 block w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  )}
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="existingStructuresChoice"
                      checked={existingStructuresChoice === "ZERO"}
                      onChange={() => setExistingStructuresChoice("ZERO")}
                      className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    There are no existing structures on this parcel
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="existingStructuresChoice"
                      checked={existingStructuresChoice === "UNANSWERED"}
                      onChange={() => setExistingStructuresChoice("UNANSWERED")}
                      className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    I don&apos;t know / skip this
                  </label>
                </div>
              </fieldset>

              <fieldset className="mt-4 rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">Stacked dwelling units</legend>
                <p className="text-sm text-slate-500">
                  Does this lot currently have stacked dwelling units (e.g. an apartment/condo-style building with units stacked vertically - not a single-family home, duplex, or attached townhomes)?
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="stackedDwellingUnits"
                      checked={stackedDwellingUnits === true}
                      onChange={() => setStackedDwellingUnits(true)}
                      className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Yes
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="stackedDwellingUnits"
                      checked={stackedDwellingUnits === false}
                      onChange={() => setStackedDwellingUnits(false)}
                      className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    No
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="stackedDwellingUnits"
                      checked={stackedDwellingUnits === undefined}
                      onChange={() => setStackedDwellingUnits(undefined)}
                      className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    I don&apos;t know
                  </label>
                </div>
              </fieldset>
            </>
          )}

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={goToPreviousStep}>
              &larr; Previous
            </Button>
            <Button variant="primary" onClick={() => setStep("PLACEMENT")}>
              Next: place on parcel
            </Button>
          </div>
        </Card>
      )}

      {step === "PLACEMENT" && boundaryPolygon && boundaryPolygonWgs84 && (
        <Card>
          <h1 className="text-lg font-semibold text-slate-900">Approximate placement</h1>
          {qualityCaveat && <p className="mt-1 text-sm italic text-slate-500">{qualityCaveat}</p>}
          <div className="mt-4">
            <ParcelPlacementMap
              boundaryPolygon={boundaryPolygon}
              boundaryPolygonWgs84={boundaryPolygonWgs84}
              widthFt={dimensions.widthFt}
              depthFt={dimensions.depthFt}
              onPlacementChange={setPlacement}
              onLotLineRolesChange={setLotLineSelection}
              initialPlacement={placement ?? undefined}
              initialLotLineSelection={lotLineSelection ?? undefined}
              existingStructures={projectType === ProjectType.SHED ? existingStructures : []}
              onDwellingSelectionChange={setDwellingSelection}
              initialDwellingSelection={dwellingSelection ?? undefined}
            />
          </div>
          {lotLineSelection?.status === LotLineRoleStatus.INSUFFICIENT && (
            <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Lot-line roles could not be determined for this parcel shape - setback findings depending on them will show as REQUIRES VERIFICATION rather than a guess.
            </p>
          )}
          {serverErrors.length > 0 && (
            <ul role="alert" className="mt-4 list-inside list-disc rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverErrors.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {/* Placement-step UX pass (2026-08-30, regression item 10) - makes incomplete
           * requirements VISIBLE rather than silently disabling Next with no explanation; only
           * ever shows whichever items are still missing. */}
          {!placementCompleteness.complete && (
            <div role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">Before continuing:</p>
              <ul className="mt-1 list-inside list-disc">
                {placementCompleteness.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={goToPreviousStep}>
              &larr; Previous
            </Button>
            <Button variant="primary" onClick={submitPlacement} disabled={!placementCompleteness.complete}>
              Next: review
            </Button>
          </div>
        </Card>
      )}

      {step === "SUMMARY" && (
        <>
          <Card>
            <h1 className="text-lg font-semibold text-slate-900">Review</h1>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Parcel</dt>
                <dd className="font-medium text-slate-900">{parcelId}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">{projectType === ProjectType.GARAGE ? "Detached garage" : "Shed"}</dt>
                <dd className="font-medium text-slate-900">
                  {dimensions.widthFt}ft x {dimensions.depthFt}ft x {dimensions.heightFt}ft
                  {dimensions.alleyAdjacent ? " (alley-adjacent)" : ""}
                </dd>
              </div>
              {projectType === ProjectType.GARAGE && (
                <>
                  <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                    <dt className="text-slate-500">Existing structures</dt>
                    <dd className="font-medium text-slate-900">
                      {existingStructuresFootprintSqFt === undefined ? "not answered" : `${existingStructuresFootprintSqFt} sq ft (self-reported)`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 pb-2">
                    <dt className="text-slate-500">Stacked dwelling units</dt>
                    <dd className="font-medium text-slate-900">
                      {stackedDwellingUnits === undefined ? "not answered" : stackedDwellingUnits ? "yes" : "no"}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {boundaryPolygonWgs84 && placement && (
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <ReviewPlacementMap
                  boundaryPolygonWgs84={boundaryPolygonWgs84}
                  anchor={placement.anchor}
                  orientationDeg={placement.orientationDeg}
                  widthFt={dimensions.widthFt}
                  depthFt={dimensions.depthFt}
                  existingStructures={projectType === ProjectType.SHED ? existingStructures : []}
                  selectedDwellingOutlineId={dwellingSelection?.status === "SELECTED" ? dwellingSelection.outlineId : undefined}
                  frontEdgeRef={lotLineSelection?.frontEdgeRef}
                  rearEdgeRef={lotLineSelection?.rearEdgeRef}
                />
              </div>
            )}
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
          <SampleReportPreview />
        </>
      )}
    </div>
  );
}
