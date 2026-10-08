"use client";

/**
 * Unit 11 (ADUs) - the ADU DETAILS step (a new detached ADU). The footprint's position is collected in the
 * next (map) step exactly as for a shed; this step collects what only the customer knows. Nothing is
 * silently defaulted: counts and size start unanswered, and "not sure" stays `undefined`. Client-side
 * validation reuses the exact server boundary schema (AduProjectConfigurationSchema).
 */

import { useState } from "react";
import { Button } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { AduProjectConfigurationSchema, AduTypeValue } from "../../src/screening-request/types.js";
import type { AduProjectConfiguration } from "../../src/screening-request/types.js";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const RADIO_CLASS = "h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500";

type YesNoUnsure = "YES" | "NO" | "UNSURE";

function parseNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** The declared part of an ADU configuration; placement, lot-line roles and dwelling selection are added by the map step. */
export type AduDeclaredDetails = Omit<AduProjectConfiguration, "proposedPlacement" | "lotLineRoleAssignment" | "distanceInputMode" | "primaryDwellingSelection">;

export interface AduDetailsFormProps {
  onSubmit: (details: AduDeclaredDetails) => void;
  onBack: () => void;
  serverErrors?: string[];
  /** Restores the previous answers when the customer comes back to this step. */
  initial?: AduDeclaredDetails;
}

export function AduDetailsForm({ onSubmit, onBack, serverErrors = [], initial }: AduDetailsFormProps) {
  const [widthFt, setWidthFt] = useState(initial ? String(initial.widthFt) : "");
  const [depthFt, setDepthFt] = useState(initial ? String(initial.depthFt) : "");
  const [stories, setStories] = useState(initial ? String(initial.stories) : "");
  const [bedrooms, setBedrooms] = useState(initial ? String(initial.bedrooms) : "");
  const [heightFt, setHeightFt] = useState(initial ? String(initial.heightFt) : "");
  const [alley, setAlley] = useState<boolean | undefined>(initial?.alleyAdjacent);
  const [principalUnits, setPrincipalUnits] = useState(initial ? String(initial.existingPrincipalDwellingUnits) : "");
  const [existingAdus, setExistingAdus] = useState(initial ? String(initial.existingAduCount) : "");
  const [pre1982, setPre1982] = useState<YesNoUnsure>(initial?.existingHouseBuiltBefore1982 === undefined ? "UNSURE" : initial.existingHouseBuiltBefore1982 ? "YES" : "NO");
  const [floorArea, setFloorArea] = useState(initial?.existingChargeableFloorAreaSqFt !== undefined ? String(initial.existingChargeableFloorAreaSqFt) : "");
  const [issues, setIssues] = useState<string[]>([]);

  function submit() {
    const missing: string[] = [];
    if (parseNumber(widthFt) === undefined || parseNumber(depthFt) === undefined) missing.push("Enter the ADU's footprint width and depth in feet.");
    if (parseNumber(stories) === undefined) missing.push("Enter how many stories above ground the ADU has.");
    if (parseNumber(bedrooms) === undefined) missing.push("Enter the number of bedrooms (0 for a studio).");
    if (parseNumber(heightFt) === undefined) missing.push("Enter the ADU's height in feet.");
    if (alley === undefined) missing.push("Say whether the rear of the lot is on an alley.");
    if (parseNumber(principalUnits) === undefined) missing.push("Enter how many houses or dwelling units are already on the lot (not counting ADUs).");
    if (parseNumber(existingAdus) === undefined) missing.push("Enter how many ADUs are already on the lot (0 if none).");
    if (missing.length > 0) {
      setIssues(missing);
      return;
    }
    const candidate = {
      aduType: AduTypeValue.DETACHED_NEW,
      widthFt: parseNumber(widthFt),
      depthFt: parseNumber(depthFt),
      stories: parseNumber(stories),
      bedrooms: parseNumber(bedrooms),
      heightFt: parseNumber(heightFt),
      alleyAdjacent: alley,
      existingPrincipalDwellingUnits: parseNumber(principalUnits),
      existingAduCount: parseNumber(existingAdus),
      ...(pre1982 === "YES" ? { existingHouseBuiltBefore1982: true } : pre1982 === "NO" ? { existingHouseBuiltBefore1982: false } : {}),
      ...(parseNumber(floorArea) !== undefined ? { existingChargeableFloorAreaSqFt: parseNumber(floorArea) } : {}),
    };
    const parsed = AduProjectConfigurationSchema.safeParse(candidate);
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((i) => `${i.path.join(".") || "details"}: ${i.message}`));
      return;
    }
    setIssues([]);
    onSubmit(parsed.data);
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-900">Detached ADU details</h1>
      <p className="mt-1 text-sm text-slate-500">
        This checks a new detached accessory dwelling unit (a backyard cottage) against Seattle&apos;s Neighborhood Residential rules. You&apos;ll place it on the map next. Please answer as accurately as you can; the report shows what it rests on.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">
          Footprint width (ft)
          <input type="number" min={0} step="0.5" value={widthFt} onChange={(e) => setWidthFt(e.target.value)} aria-label="ADU footprint width in feet" className={INPUT_CLASS} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Footprint depth (ft)
          <input type="number" min={0} step="0.5" value={depthFt} onChange={(e) => setDepthFt(e.target.value)} aria-label="ADU footprint depth in feet" className={INPUT_CLASS} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Height (ft)
          <input type="number" min={0} step="0.5" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} aria-label="ADU height in feet" className={INPUT_CLASS} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Stories above ground
          <input type="number" min={1} max={3} step="1" value={stories} onChange={(e) => setStories(e.target.value)} aria-label="ADU stories above ground" className={INPUT_CLASS} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Bedrooms
          <input type="number" min={0} step="1" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} aria-label="ADU bedrooms" className={INPUT_CLASS} />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">Floor area is estimated as footprint times stories. An ADU may be up to 1,000 sq ft (up to two bedrooms) or 1,200 sq ft (three or more).</p>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Is the rear of the lot on an alley?</legend>
        <div className="mt-2 flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="alley" checked={alley === true} onChange={() => setAlley(true)} className={RADIO_CLASS} />
            Yes
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="alley" checked={alley === false} onChange={() => setAlley(false)} className={RADIO_CLASS} />
            No
          </label>
        </div>
      </fieldset>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Houses or dwelling units already on the lot
          <input type="number" min={1} step="1" value={principalUnits} onChange={(e) => setPrincipalUnits(e.target.value)} aria-label="Existing dwelling units on the lot" className={INPUT_CLASS} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Not counting any ADUs. Usually 1.</span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          ADUs already on the lot
          <input type="number" min={0} step="1" value={existingAdus} onChange={(e) => setExistingAdus(e.target.value)} aria-label="Existing ADUs on the lot" className={INPUT_CLASS} />
          <span className="mt-1 block text-xs font-normal text-slate-500">A lot may have at most two ADUs.</span>
        </label>
      </div>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Was the existing house built before 1982?</legend>
        <p className="text-xs text-slate-500">A single new unit added to a house that existed on January 1, 1982 does not need amenity area.</p>
        <div className="mt-2 flex gap-6">
          {(
            [
              ["YES", "Yes"],
              ["NO", "No"],
              ["UNSURE", "Not sure"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="pre1982" checked={pre1982 === value} onChange={() => setPre1982(value)} className={RADIO_CLASS} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 block text-sm font-medium text-slate-700">
        Total floor area of everything already on the lot (sq ft) - optional
        <input type="number" min={0} step="10" value={floorArea} onChange={(e) => setFloorArea(e.target.value)} aria-label="Existing chargeable floor area in square feet" className={INPUT_CLASS} />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          House plus any garage or other buildings, leaving out basements and underground floors. Without it the report can show your floor-area limit but not how much room is left.
        </span>
      </label>

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
          Next: place on parcel
        </Button>
      </div>
    </Card>
  );
}
