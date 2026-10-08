"use client";

/**
 * Unit 7 (Fences) - the fence DETAILS step. A fence is a line, not a placed rectangle, so there is no
 * map placement: every answer is declared here and labeled "what you told us" in the report. Nothing
 * is silently defaulted - height and the three yes/no-style questions start unanswered; "not sure"
 * stays `undefined`, never coerced to a value (same convention as the shed/garage intake).
 *
 * Client-side validation reuses the exact server boundary schema (FenceProjectConfigurationSchema), so
 * the form can never accept something the server would reject, and the server still re-validates.
 */

import { useState } from "react";
import { Button } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { FenceLocation, FenceProjectConfigurationSchema, FenceWallRelation } from "../../src/screening-request/types.js";
import type { FenceProjectConfiguration } from "../../src/screening-request/types.js";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const RADIO_CLASS = "h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500";

const LOCATION_OPTIONS: { value: FenceLocation; label: string; help: string }[] = [
  {
    value: FenceLocation.FRONT_SETBACK,
    label: "Front setback",
    help: "The area within the required front setback (generally 15 feet from the front lot line), across the whole width of the lot - including where a side fence runs through that front area.",
  },
  {
    value: FenceLocation.STREET_SIDE_SETBACK,
    label: "Street-side setback (corner lot)",
    help: "The setback along a side of the lot that faces a street, running the full depth of the lot.",
  },
  {
    value: FenceLocation.OTHER_SIDE_OR_REAR_SETBACK,
    label: "Side or rear setback",
    help: "A required side or rear setback that is not in either of the two areas above.",
  },
  {
    value: FenceLocation.OUTSIDE_REQUIRED_SETBACKS,
    label: "Outside required setbacks",
    help: "No setback is required where the fence runs - for example along an alley edge, or inside the buildable area.",
  },
];

const WALL_OPTIONS: { value: FenceWallRelation; label: string }[] = [
  { value: FenceWallRelation.NONE, label: "No retaining wall or bulkhead" },
  { value: FenceWallRelation.ON_NEW_WALL_RAISING_GRADE, label: "On top of a new wall that raises the ground level" },
  { value: FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD, label: "On top of another retaining wall or bulkhead" },
  { value: FenceWallRelation.SET_BACK_FROM_CUT_WALL, label: "Set back from a wall that holds back a cut into the ground" },
];

type YesNoUnsure = "YES" | "NO" | "UNSURE";

function parseNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export interface FenceDetailsFormProps {
  onSubmit: (config: FenceProjectConfiguration) => void;
  onBack: () => void;
  /** Issues returned by the server's own validation of the submitted configuration. */
  serverErrors?: string[];
}

export function FenceDetailsForm({ onSubmit, onBack, serverErrors = [] }: FenceDetailsFormProps) {
  const [heightFt, setHeightFt] = useState("");
  const [locations, setLocations] = useState<FenceLocation[]>([]);
  const [siteSlopes, setSiteSlopes] = useState<boolean | undefined>(undefined);
  const [tallestPortionFt, setTallestPortionFt] = useState("");
  const [hasFeature, setHasFeature] = useState<boolean | undefined>(undefined);
  const [featureFt, setFeatureFt] = useState("");
  const [wallRelation, setWallRelation] = useState<FenceWallRelation | undefined>(undefined);
  const [wallHeightFt, setWallHeightFt] = useState("");
  const [cutWallSetbackFt, setCutWallSetbackFt] = useState("");
  const [masonry, setMasonry] = useState<YesNoUnsure>("UNSURE");
  const [issues, setIssues] = useState<string[]>([]);

  function toggleLocation(location: FenceLocation) {
    setLocations((current) => (current.includes(location) ? current.filter((l) => l !== location) : [...current, location]));
  }

  function submit() {
    const missing: string[] = [];
    if (parseNumber(heightFt) === undefined) missing.push("Enter the fence height.");
    if (locations.length === 0) missing.push("Choose where the fence is (at least one).");
    if (siteSlopes === undefined) missing.push("Say whether the fence follows a sloping site.");
    if (hasFeature === undefined) missing.push("Say whether there is an arbor or trellis on top.");
    if (hasFeature === true && parseNumber(featureFt) === undefined) missing.push("Enter the height of the arbor or trellis.");
    if (wallRelation === undefined) missing.push("Say whether the fence is on or near a retaining wall or bulkhead.");
    if (wallRelation !== undefined && wallRelation !== FenceWallRelation.NONE && parseNumber(wallHeightFt) === undefined) missing.push("Enter the wall height.");
    if (wallRelation === FenceWallRelation.SET_BACK_FROM_CUT_WALL && parseNumber(cutWallSetbackFt) === undefined) missing.push("Enter how far the fence is from the wall.");
    if (missing.length > 0) {
      setIssues(missing);
      return;
    }

    const candidate = {
      heightFt: parseNumber(heightFt),
      locations,
      siteSlopes,
      wallRelation,
      ...(hasFeature ? { openFeatureHeightFt: parseNumber(featureFt) } : {}),
      ...(siteSlopes && parseNumber(tallestPortionFt) !== undefined ? { tallestPortionHeightFt: parseNumber(tallestPortionFt) } : {}),
      ...(wallRelation !== FenceWallRelation.NONE ? { wallHeightFt: parseNumber(wallHeightFt) } : {}),
      ...(wallRelation === FenceWallRelation.SET_BACK_FROM_CUT_WALL ? { cutWallSetbackFt: parseNumber(cutWallSetbackFt) } : {}),
      ...(masonry === "YES" ? { hasMasonryOrConcreteAbove6Ft: true } : masonry === "NO" ? { hasMasonryOrConcreteAbove6Ft: false } : {}),
    };
    const parsed = FenceProjectConfigurationSchema.safeParse(candidate);
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((i) => i.message));
      return;
    }
    setIssues([]);
    onSubmit(parsed.data);
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-900">Fence details</h1>
      <p className="mt-1 text-sm text-slate-500">
        A fence is checked from the details you enter here, not from measurements of your site. Please answer every question as accurately as you can.
      </p>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Fence height (ft)
        <input type="number" min={0} step="0.25" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} aria-label="Fence height in feet" className={INPUT_CLASS} />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          Measured from the existing or finished ground, whichever is lower, to the top of the fence. On a slope, use the greatest average height over any 6-foot-long section.
        </span>
      </label>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Where is the fence?</legend>
        <p className="text-sm text-slate-500">Choose every area the fence runs through. Each is checked separately.</p>
        <div className="mt-3 flex flex-col gap-3">
          {LOCATION_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={locations.includes(o.value)} onChange={() => toggleLocation(o.value)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="block text-xs text-slate-500">{o.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Does the fence follow a sloping site?</legend>
        <div className="mt-2 flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="siteSlopes" checked={siteSlopes === true} onChange={() => setSiteSlopes(true)} className={RADIO_CLASS} />
            Yes
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="siteSlopes" checked={siteSlopes === false} onChange={() => setSiteSlopes(false)} className={RADIO_CLASS} />
            No
          </label>
        </div>
        {siteSlopes === true && (
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Tallest point of the fence (ft) - optional
            <input type="number" min={0} step="0.25" value={tallestPortionFt} onChange={(e) => setTallestPortionFt(e.target.value)} aria-label="Tallest portion in feet" className={INPUT_CLASS} />
            <span className="mt-1 block text-xs font-normal text-slate-500">Leave blank if you don&apos;t know; the report will say that part could not be checked.</span>
          </label>
        )}
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Is there an arbor or trellis on top?</legend>
        <div className="mt-2 flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="hasFeature" checked={hasFeature === false} onChange={() => setHasFeature(false)} className={RADIO_CLASS} />
            No
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="hasFeature" checked={hasFeature === true} onChange={() => setHasFeature(true)} className={RADIO_CLASS} />
            Yes
          </label>
        </div>
        {hasFeature === true && (
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Height of the arbor or trellis (ft)
            <input type="number" min={0} step="0.25" value={featureFt} onChange={(e) => setFeatureFt(e.target.value)} aria-label="Top feature height in feet" className={INPUT_CLASS} />
          </label>
        )}
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Is the fence on or near a retaining wall or bulkhead?</legend>
        <div className="mt-2 flex flex-col gap-2">
          {WALL_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="wallRelation" checked={wallRelation === o.value} onChange={() => setWallRelation(o.value)} className={RADIO_CLASS} />
              {o.label}
            </label>
          ))}
        </div>
        {wallRelation !== undefined && wallRelation !== FenceWallRelation.NONE && (
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Wall height (ft)
            <input type="number" min={0} step="0.25" value={wallHeightFt} onChange={(e) => setWallHeightFt(e.target.value)} aria-label="Wall height in feet" className={INPUT_CLASS} />
          </label>
        )}
        {wallRelation === FenceWallRelation.SET_BACK_FROM_CUT_WALL && (
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Distance from the fence to the wall (ft)
            <input type="number" min={0} step="0.25" value={cutWallSetbackFt} onChange={(e) => setCutWallSetbackFt(e.target.value)} aria-label="Distance from the wall in feet" className={INPUT_CLASS} />
          </label>
        )}
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Will any part of the fence above 6 feet be masonry or concrete?</legend>
        <div className="mt-2 flex gap-6">
          {(
            [
              ["YES", "Yes"],
              ["NO", "No"],
              ["UNSURE", "Not sure / doesn't apply"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="masonry" checked={masonry === value} onChange={() => setMasonry(value)} className={RADIO_CLASS} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {(issues.length > 0 || serverErrors.length > 0) && (
        <ul role="alert" className="mt-4 list-inside list-disc rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {[...issues, ...serverErrors].map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          &larr; Previous
        </Button>
        <Button variant="primary" onClick={submit}>
          Next: review
        </Button>
      </div>
    </Card>
  );
}
