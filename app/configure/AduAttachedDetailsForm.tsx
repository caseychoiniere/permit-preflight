"use client";

/**
 * Unit 11 Slice 5 - the DETAILS step for an ADU inside or attached to the existing house (a basement, attic,
 * garage or room conversion, or an addition). It is declared, not placed (like a fence or deck): nothing is
 * drawn on the map. Nothing is silently defaulted; "not sure" stays `undefined`. Client-side validation
 * reuses the server boundary schema.
 */

import { useState } from "react";
import { Button } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { AduProjectConfigurationSchema, AduTypeValue } from "../../src/screening-request/types.js";
import type { AduAttachedConfiguration } from "../../src/screening-request/types.js";

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

export type AduAttachedDeclaredDetails = Omit<AduAttachedConfiguration, "lotLineRoleAssignment">;

export interface AduAttachedDetailsFormProps {
  onSubmit: (details: AduAttachedDeclaredDetails) => void;
  onBack: () => void;
  serverErrors?: string[];
  initial?: AduAttachedDeclaredDetails;
}

export function AduAttachedDetailsForm({ onSubmit, onBack, serverErrors = [], initial }: AduAttachedDetailsFormProps) {
  const [floorArea, setFloorArea] = useState(initial ? String(initial.grossFloorAreaSqFt) : "");
  const [bedrooms, setBedrooms] = useState(initial ? String(initial.bedrooms) : "");
  const [addition, setAddition] = useState<boolean | undefined>(initial?.includesAddition);
  const [existed, setExisted] = useState<YesNoUnsure>(toTri(initial?.portionExistedBeforeJuly2023));
  const [principalUnits, setPrincipalUnits] = useState(initial ? String(initial.existingPrincipalDwellingUnits) : "");
  const [existingAdus, setExistingAdus] = useState(initial ? String(initial.existingAduCount) : "");
  const [pre1982, setPre1982] = useState<YesNoUnsure>(toTri(initial?.existingHouseBuiltBefore1982));
  const [existingArea, setExistingArea] = useState(initial?.existingChargeableFloorAreaSqFt !== undefined ? String(initial.existingChargeableFloorAreaSqFt) : "");
  const [issues, setIssues] = useState<string[]>([]);

  function submit() {
    const missing: string[] = [];
    if (parseNumber(floorArea) === undefined) missing.push("Enter the ADU's floor area in square feet.");
    if (parseNumber(bedrooms) === undefined) missing.push("Enter the number of bedrooms (0 for a studio).");
    if (addition === undefined) missing.push("Say whether any part of the ADU would be in a new addition.");
    if (parseNumber(principalUnits) === undefined) missing.push("Enter how many houses or dwelling units are already on the lot (not counting ADUs).");
    if (parseNumber(existingAdus) === undefined) missing.push("Enter how many ADUs are already on the lot (0 if none).");
    if (missing.length > 0) {
      setIssues(missing);
      return;
    }
    const existedValue = fromTri(existed);
    const pre = fromTri(pre1982);
    const candidate = {
      aduType: AduTypeValue.ATTACHED_TO_HOUSE,
      grossFloorAreaSqFt: parseNumber(floorArea),
      bedrooms: parseNumber(bedrooms),
      includesAddition: addition,
      existingPrincipalDwellingUnits: parseNumber(principalUnits),
      existingAduCount: parseNumber(existingAdus),
      ...(existedValue !== undefined ? { portionExistedBeforeJuly2023: existedValue } : {}),
      ...(pre !== undefined ? { existingHouseBuiltBefore1982: pre } : {}),
      ...(parseNumber(existingArea) !== undefined ? { existingChargeableFloorAreaSqFt: parseNumber(existingArea) } : {}),
    };
    const parsed = AduProjectConfigurationSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.aduType !== AduTypeValue.ATTACHED_TO_HOUSE) {
      setIssues(parsed.success ? ["details: unexpected ADU type."] : parsed.error.issues.map((i) => `${i.path.join(".") || "details"}: ${i.message}`));
      return;
    }
    setIssues([]);
    onSubmit(parsed.data);
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-900">ADU inside or attached to the house</h1>
      <p className="mt-1 text-sm text-slate-500">
        This checks an accessory dwelling unit made inside your existing house (a basement, attic, garage or rooms) or attached to it, against Seattle&apos;s Neighborhood Residential rules. It is checked from the details you enter here; nothing is placed on a map.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          ADU floor area (sq ft)
          <input type="number" min={0} step="10" value={floorArea} onChange={(e) => setFloorArea(e.target.value)} aria-label="ADU gross floor area in square feet" className={INPUT_CLASS} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Leave out underground floors and up to 250 sq ft of an attached garage. An ADU may be up to 1,000 sq ft (up to two bedrooms) or 1,200 sq ft (three or more); the limit may not apply to a part of the house that existed before July 23, 2023.</span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Bedrooms
          <input type="number" min={0} step="1" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} aria-label="ADU bedrooms" className={INPUT_CLASS} />
        </label>
      </div>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Would any part of the ADU be in a new addition?</legend>
        <p className="text-xs text-slate-500">A new addition or expansion of the house must meet the setback, height and lot-coverage standards; an ADU inside the existing walls adds none.</p>
        <div className="mt-2 flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="addition" checked={addition === false} onChange={() => setAddition(false)} className={RADIO_CLASS} />
            No, inside the existing house
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="addition" checked={addition === true} onChange={() => setAddition(true)} className={RADIO_CLASS} />
            Yes, part is in an addition
          </label>
        </div>
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Did the part of the house the ADU would be in exist before July 23, 2023?</legend>
        <Tri name="existed" value={existed} onChange={setExisted} labels={["Yes", "No", "Not sure"]} />
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
        <input type="number" min={0} step="10" value={existingArea} onChange={(e) => setExistingArea(e.target.value)} aria-label="Existing chargeable floor area in square feet" className={INPUT_CLASS} />
        <span className="mt-1 block text-xs font-normal text-slate-500">House plus any garage or other buildings, leaving out basements and underground floors.</span>
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
          Next: review
        </Button>
      </div>
    </Card>
  );
}
