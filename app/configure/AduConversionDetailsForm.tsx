"use client";

/**
 * Unit 11 Slice 4 - the DETAILS step for converting an existing garage or shed into a detached ADU
 * (SMC 23.42.022.H). The building itself is chosen on the map in the next step; this step collects what
 * only the customer knows. Nothing is silently defaulted: counts start unanswered and "not sure" stays
 * `undefined` (which the report treats as "the conversion allowance cannot be relied on"). Client-side
 * validation reuses the server boundary schema.
 */

import { useState } from "react";
import { Button } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { AduProjectConfigurationSchema, AduTypeValue } from "../../src/screening-request/types.js";
import type { AduConversionConfiguration } from "../../src/screening-request/types.js";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const RADIO_CLASS = "h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500";

type YesNoUnsure = "YES" | "NO" | "UNSURE";

function parseNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
function toTri(v: boolean | undefined): YesNoUnsure {
  return v === undefined ? "UNSURE" : v ? "YES" : "NO";
}
function fromTri(v: YesNoUnsure): boolean | undefined {
  return v === "UNSURE" ? undefined : v === "YES";
}

function Tri({ name, value, onChange, labels }: { name: string; value: YesNoUnsure; onChange: (v: YesNoUnsure) => void; labels: [string, string, string] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-6">
      {(["YES", "NO", "UNSURE"] as const).map((v, i) => (
        <label key={v} className="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} className={RADIO_CLASS} />
          {labels[i]}
        </label>
      ))}
    </div>
  );
}

/** The declared part of a conversion; the building choice, lot-line roles and main-house selection are added by the map step. */
export type AduConversionDeclaredDetails = Omit<AduConversionConfiguration, "convertedStructure" | "lotLineRoleAssignment" | "distanceInputMode" | "primaryDwellingSelection">;

export interface AduConversionDetailsFormProps {
  onSubmit: (details: AduConversionDeclaredDetails) => void;
  onBack: () => void;
  serverErrors?: string[];
  initial?: AduConversionDeclaredDetails;
}

export function AduConversionDetailsForm({ onSubmit, onBack, serverErrors = [], initial }: AduConversionDetailsFormProps) {
  const [existed, setExisted] = useState<YesNoUnsure>(toTri(initial?.existedBeforeJuly2023));
  const [keeps, setKeeps] = useState<YesNoUnsure>(toTri(initial?.keepsFootprintAndHeight));
  const [stories, setStories] = useState(initial ? String(initial.stories) : "");
  const [bedrooms, setBedrooms] = useState(initial ? String(initial.bedrooms) : "");
  const [alley, setAlley] = useState<boolean | undefined>(initial?.alleyAdjacent);
  const [principalUnits, setPrincipalUnits] = useState(initial ? String(initial.existingPrincipalDwellingUnits) : "");
  const [existingAdus, setExistingAdus] = useState(initial ? String(initial.existingAduCount) : "");
  const [pre1982, setPre1982] = useState<YesNoUnsure>(toTri(initial?.existingHouseBuiltBefore1982));
  const [floorArea, setFloorArea] = useState(initial?.existingChargeableFloorAreaSqFt !== undefined ? String(initial.existingChargeableFloorAreaSqFt) : "");
  const [issues, setIssues] = useState<string[]>([]);

  function submit() {
    const missing: string[] = [];
    if (parseNumber(stories) === undefined) missing.push("Enter how many stories above ground the converted building would have.");
    if (parseNumber(bedrooms) === undefined) missing.push("Enter the number of bedrooms (0 for a studio).");
    if (alley === undefined) missing.push("Say whether the rear of the lot is on an alley.");
    if (parseNumber(principalUnits) === undefined) missing.push("Enter how many houses or dwelling units are already on the lot (not counting ADUs).");
    if (parseNumber(existingAdus) === undefined) missing.push("Enter how many ADUs are already on the lot (0 if none).");
    if (missing.length > 0) {
      setIssues(missing);
      return;
    }
    const existedValue = fromTri(existed);
    const keepsValue = fromTri(keeps);
    const pre = fromTri(pre1982);
    const candidate = {
      aduType: AduTypeValue.CONVERSION_EXISTING,
      stories: parseNumber(stories),
      bedrooms: parseNumber(bedrooms),
      alleyAdjacent: alley,
      existingPrincipalDwellingUnits: parseNumber(principalUnits),
      existingAduCount: parseNumber(existingAdus),
      ...(existedValue !== undefined ? { existedBeforeJuly2023: existedValue } : {}),
      ...(keepsValue !== undefined ? { keepsFootprintAndHeight: keepsValue } : {}),
      ...(pre !== undefined ? { existingHouseBuiltBefore1982: pre } : {}),
      ...(parseNumber(floorArea) !== undefined ? { existingChargeableFloorAreaSqFt: parseNumber(floorArea) } : {}),
    };
    const parsed = AduProjectConfigurationSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.aduType !== AduTypeValue.CONVERSION_EXISTING) {
      setIssues(parsed.success ? ["details: unexpected ADU type."] : parsed.error.issues.map((i) => `${i.path.join(".") || "details"}: ${i.message}`));
      return;
    }
    setIssues([]);
    onSubmit(parsed.data);
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-900">Convert an existing building to an ADU</h1>
      <p className="mt-1 text-sm text-slate-500">
        Seattle lets an accessory building that existed before July 23, 2023 (a garage or shed, for example) become a detached ADU even if it doesn&apos;t meet today&apos;s setbacks or lot-coverage limit, provided it meets the Housing Code minimum standards. You&apos;ll choose the building on the map next.
      </p>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Did the building exist before July 23, 2023?</legend>
        <p className="text-xs text-slate-500">Permit records and dated aerial photos can show this. If you&apos;re not sure, the report will say the allowance can&apos;t be relied on yet.</p>
        <Tri name="existed" value={existed} onChange={setExisted} labels={["Yes", "No", "Not sure"]} />
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Will the conversion keep the building&apos;s footprint and height as they are?</legend>
        <p className="text-xs text-slate-500">Rebuilding it in the same place at the same size counts as keeping it. Adding to it, enlarging it or moving it means the new part must meet the regular ADU standards.</p>
        <Tri name="keeps" value={keeps} onChange={setKeeps} labels={["Yes, same footprint and height", "No, it would be added to, enlarged or moved", "Not sure"]} />
      </fieldset>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Stories above ground (after conversion)
          <input type="number" min={1} max={3} step="1" value={stories} onChange={(e) => setStories(e.target.value)} aria-label="Converted building stories above ground" className={INPUT_CLASS} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Bedrooms
          <input type="number" min={0} step="1" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} aria-label="ADU bedrooms" className={INPUT_CLASS} />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">Floor area is estimated as the building&apos;s mapped footprint times stories. An ADU may be up to 1,000 sq ft (up to two bedrooms) or 1,200 sq ft (three or more).</p>

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
        <Tri name="pre1982" value={pre1982} onChange={setPre1982} labels={["Yes", "No", "Not sure"]} />
      </fieldset>

      <label className="mt-6 block text-sm font-medium text-slate-700">
        Total floor area of everything already on the lot (sq ft) - optional
        <input type="number" min={0} step="10" value={floorArea} onChange={(e) => setFloorArea(e.target.value)} aria-label="Existing chargeable floor area in square feet" className={INPUT_CLASS} />
        <span className="mt-1 block text-xs font-normal text-slate-500">House plus the building you would convert and any others, leaving out basements and underground floors.</span>
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
          Next: choose the building
        </Button>
      </div>
    </Card>
  );
}
