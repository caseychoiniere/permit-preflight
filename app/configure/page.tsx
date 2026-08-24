"use client";

/**
 * ProjectConfigurationFlow (PC-1, PC-2, Workflow 1/2). A linear, revisitable wizard: address ->
 * project type (shed only) -> dimensions -> map placement + lot-line roles -> summary -> authorize.
 * No commercial scope (no checkout) - "authorize" here is the internal/founder-facing trigger
 * (Question 1), not a customer-facing purchase action.
 */

import { useState } from "react";
import { ParcelPlacementMap, type PlacementSelection, type LotLineSelection } from "../components/ParcelPlacementMap.js";
import type { GeographicPoint, Polygon } from "../../src/spatial-analysis/types.js";
import { DistanceInputMode, LotLineRoleStatus, ProjectType } from "../../src/screening-request/types.js";
import { ParcelResolutionStatus } from "../../src/parcel-resolution/types.js";

type Step = "ADDRESS" | "TYPE" | "DETAILS" | "PLACEMENT" | "SUMMARY";

export default function ConfigurePage() {
  const [step, setStep] = useState<Step>("ADDRESS");
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [parcelId, setParcelId] = useState<string | null>(null);
  const [boundaryPolygon, setBoundaryPolygon] = useState<Polygon | null>(null);
  const [boundaryPolygonWgs84, setBoundaryPolygonWgs84] = useState<GeographicPoint[] | null>(null);
  const [qualityCaveat, setQualityCaveat] = useState<string | null>(null);

  const [screeningRequestId, setScreeningRequestId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false });
  const [placement, setPlacement] = useState<PlacementSelection | null>(null);
  const [lotLineSelection, setLotLineSelection] = useState<LotLineSelection | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [authorizedMessage, setAuthorizedMessage] = useState<string | null>(null);

  async function submitAddress() {
    setAddressError(null);
    const res = await fetch("/api/parcels/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
    const result = await res.json();
    if (result.status !== ParcelResolutionStatus.CONFIRMED) {
      setAddressError(`Could not confirm this address (${result.status}). This prototype only proceeds from a confirmed parcel.`);
      return;
    }
    setParcelId(result.confirmedParcel.parcelId);

    const boundaryRes = await fetch(`/api/parcels/${encodeURIComponent(result.confirmedParcel.parcelId)}/boundary`);
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

  async function selectShedType() {
    const res = await fetch("/api/screening-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmedParcelId: parcelId, projectType: ProjectType.SHED }),
    });
    const result = await res.json();
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

  async function authorize() {
    if (!screeningRequestId) return;
    const res = await fetch(`/api/screening-requests/${screeningRequestId}/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authorizedBy: "founder@permitpreflight.example" }),
    });
    const result = await res.json();
    if (result.error) {
      setAuthorizedMessage(`Not authorized: ${result.error}`);
      return;
    }
    setAuthorizedMessage("Report generation authorized - it will complete shortly. (Prototype: this is an internal trigger, not a real purchase.)");
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1>Permit Preflight - Shed Screening (Prototype)</h1>

      {step === "ADDRESS" && (
        <section>
          <label>
            Property address
            <input value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Property address" />
          </label>
          <button type="button" onClick={submitAddress}>Find parcel</button>
          {addressError && <p role="alert">{addressError}</p>}
        </section>
      )}

      {step === "TYPE" && (
        <section>
          <p>Parcel confirmed: {parcelId}</p>
          <button type="button" onClick={selectShedType}>Screen a shed / accessory structure</button>
        </section>
      )}

      {step === "DETAILS" && (
        <section>
          <h2>Shed details</h2>
          <label>Width (ft) <input type="number" value={dimensions.widthFt} onChange={(e) => setDimensions((d) => ({ ...d, widthFt: Number(e.target.value) }))} /></label>
          <label>Depth (ft) <input type="number" value={dimensions.depthFt} onChange={(e) => setDimensions((d) => ({ ...d, depthFt: Number(e.target.value) }))} /></label>
          <label>Height (ft) <input type="number" value={dimensions.heightFt} onChange={(e) => setDimensions((d) => ({ ...d, heightFt: Number(e.target.value) }))} /></label>
          <label><input type="checkbox" checked={dimensions.alleyAdjacent} onChange={(e) => setDimensions((d) => ({ ...d, alleyAdjacent: e.target.checked }))} /> Rear lot line is alley-adjacent</label>
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
          <p>Shed: {dimensions.widthFt}ft x {dimensions.depthFt}ft x {dimensions.heightFt}ft{dimensions.alleyAdjacent ? " (alley-adjacent)" : ""}</p>
          <p>This is a prototype - report generation is triggered internally, not by payment.</p>
          <button type="button" onClick={authorize}>Authorize report generation (prototype)</button>
          {authorizedMessage && <p role="status">{authorizedMessage}</p>}
        </section>
      )}
    </main>
  );
}
