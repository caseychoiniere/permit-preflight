"use client";

/**
 * Unit 8 (Decks) - the deck DETAILS step. A deck is declared, not placed, so there is no map step:
 * every answer is labeled "what you told us" in the report. Nothing is silently defaulted: height, size,
 * attachment, what is below and where the deck is start unanswered; "not sure" stays `undefined`.
 * Client-side validation reuses the exact server boundary schema (DeckProjectConfigurationSchema).
 */

import { useState } from "react";
import { Button } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { DeckAttachment, DeckBuildingRelation, DeckProjectConfigurationSchema, DeckSetbackLocation } from "../../src/screening-request/types.js";
import type { DeckProjectConfiguration } from "../../src/screening-request/types.js";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const RADIO_CLASS = "h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500";

const LOCATION_OPTIONS: { value: DeckSetbackLocation; label: string; help: string }[] = [
  { value: DeckSetbackLocation.FRONT_SETBACK, label: "Front setback", help: "Within the required front setback (generally 15 feet from the front lot line)." },
  { value: DeckSetbackLocation.STREET_SIDE_SETBACK, label: "Street-side setback (corner lot)", help: "Within the required setback along a side of the lot that faces a street." },
  { value: DeckSetbackLocation.SIDE_SETBACK, label: "Side setback", help: "Within a required side setback (generally 5 feet average, 3 feet minimum)." },
  { value: DeckSetbackLocation.REAR_SETBACK, label: "Rear setback", help: "Within the required rear setback (generally 15 feet, less on some lots)." },
  { value: DeckSetbackLocation.OUTSIDE_REQUIRED_SETBACKS, label: "Outside required setbacks", help: "No setback is required where the deck is - for example inside the buildable area." },
];

const RELATION_OPTIONS: { value: DeckBuildingRelation; label: string }[] = [
  { value: DeckBuildingRelation.OPEN_GROUND_BELOW, label: "Open ground below (no basement or story under it)" },
  { value: DeckBuildingRelation.OVER_BASEMENT_OR_STORY_BELOW, label: "Over a basement, garage or other story below" },
  { value: DeckBuildingRelation.ROOF_DECK, label: "A roof deck (on top of part of the building)" },
];

type YesNoUnsure = "YES" | "NO" | "UNSURE";

function parseNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export interface DeckDetailsFormProps {
  onSubmit: (config: DeckProjectConfiguration) => void;
  onBack: () => void;
  serverErrors?: string[];
}

export function DeckDetailsForm({ onSubmit, onBack, serverErrors = [] }: DeckDetailsFormProps) {
  const [heightIn, setHeightIn] = useState("");
  const [widthFt, setWidthFt] = useState("");
  const [depthFt, setDepthFt] = useState("");
  const [attachment, setAttachment] = useState<DeckAttachment | undefined>(undefined);
  const [relation, setRelation] = useState<DeckBuildingRelation | undefined>(undefined);
  const [locations, setLocations] = useState<DeckSetbackLocation[]>([]);
  const [solid, setSolid] = useState<YesNoUnsure>("UNSURE");
  const [beamFt, setBeamFt] = useState("");
  const [rearDistanceFt, setRearDistanceFt] = useState("");
  const [dwellingDistanceFt, setDwellingDistanceFt] = useState("");
  const [issues, setIssues] = useState<string[]>([]);

  function toggleLocation(location: DeckSetbackLocation) {
    setLocations((current) => (current.includes(location) ? current.filter((l) => l !== location) : [...current, location]));
  }

  const rearSelected = locations.includes(DeckSetbackLocation.REAR_SETBACK);

  function submit() {
    const missing: string[] = [];
    if (parseNumber(heightIn) === undefined) missing.push("Enter how high the deck is above the ground, in inches.");
    if (parseNumber(widthFt) === undefined || parseNumber(depthFt) === undefined) missing.push("Enter the deck's width and depth in feet.");
    if (attachment === undefined) missing.push("Say whether the deck is attached to the house.");
    if (relation === undefined) missing.push("Say what is below the deck.");
    if (locations.length === 0) missing.push("Choose where the deck is (at least one).");
    if (missing.length > 0) {
      setIssues(missing);
      return;
    }
    const candidate = {
      heightAboveGradeIn: parseNumber(heightIn),
      widthFt: parseNumber(widthFt),
      depthFt: parseNumber(depthFt),
      attachment,
      buildingRelation: relation,
      setbackLocations: locations,
      ...(solid === "YES" ? { solidFlooring: true } : solid === "NO" ? { solidFlooring: false } : {}),
      ...(parseNumber(beamFt) !== undefined ? { longestBeamFt: parseNumber(beamFt) } : {}),
      ...(rearSelected && parseNumber(rearDistanceFt) !== undefined ? { distanceFromRearLotLineFt: parseNumber(rearDistanceFt) } : {}),
      ...(rearSelected && attachment === DeckAttachment.DETACHED && parseNumber(dwellingDistanceFt) !== undefined ? { distanceFromDwellingFt: parseNumber(dwellingDistanceFt) } : {}),
    };
    const parsed = DeckProjectConfigurationSchema.safeParse(candidate);
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((i) => i.message));
      return;
    }
    setIssues([]);
    onSubmit(parsed.data);
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-900">Deck details</h1>
      <p className="mt-1 text-sm text-slate-500">A deck is checked from the details you enter here, not from measurements of your site. Please answer every question as accurately as you can.</p>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Height above the ground (inches)
        <input type="number" min={0} step="1" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} aria-label="Deck height above the ground in inches" className={INPUT_CLASS} />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          The greatest height of the deck surface above the existing or finished ground, whichever is lower. 18 inches and 36 inches are the key thresholds.
        </span>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Width (ft)
          <input type="number" min={0} step="0.5" value={widthFt} onChange={(e) => setWidthFt(e.target.value)} aria-label="Deck width in feet" className={INPUT_CLASS} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Depth (ft)
          <input type="number" min={0} step="0.5" value={depthFt} onChange={(e) => setDepthFt(e.target.value)} aria-label="Deck depth in feet" className={INPUT_CLASS} />
        </label>
      </div>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Is the deck attached to the house?</legend>
        <div className="mt-2 flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="attachment" checked={attachment === DeckAttachment.ATTACHED_TO_DWELLING} onChange={() => setAttachment(DeckAttachment.ATTACHED_TO_DWELLING)} className={RADIO_CLASS} />
            Yes
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="attachment" checked={attachment === DeckAttachment.DETACHED} onChange={() => setAttachment(DeckAttachment.DETACHED)} className={RADIO_CLASS} />
            No, it stands alone
          </label>
        </div>
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">What is below the deck?</legend>
        <div className="mt-2 flex flex-col gap-2">
          {RELATION_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="relation" checked={relation === o.value} onChange={() => setRelation(o.value)} className={RADIO_CLASS} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Where is the deck?</legend>
        <p className="text-sm text-slate-500">Choose every area the deck is in. Each is checked separately.</p>
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
        {rearSelected && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Distance from the rear lot line (ft) - optional
              <input type="number" min={0} step="0.5" value={rearDistanceFt} onChange={(e) => setRearDistanceFt(e.target.value)} aria-label="Distance from the rear lot line in feet" className={INPUT_CLASS} />
            </label>
            {attachment === DeckAttachment.DETACHED && (
              <label className="block text-sm font-medium text-slate-700">
                Distance from the house (ft) - optional
                <input type="number" min={0} step="0.5" value={dwellingDistanceFt} onChange={(e) => setDwellingDistanceFt(e.target.value)} aria-label="Distance from the dwelling in feet" className={INPUT_CLASS} />
              </label>
            )}
            <p className="text-xs text-slate-500 sm:col-span-2">These only help settle whether a deck over 18 inches can use the rear-setback allowance; leave them blank if you don&apos;t know.</p>
          </div>
        )}
      </fieldset>

      <fieldset className="mt-6 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Is the decking solid, with no gaps between boards?</legend>
        <div className="mt-2 flex gap-6">
          {(
            [
              ["YES", "Yes, solid"],
              ["NO", "No, there are gaps"],
              ["UNSURE", "Not sure"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="solid" checked={solid === value} onChange={() => setSolid(value)} className={RADIO_CLASS} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 block text-sm font-medium text-slate-700">
        Longest beam (ft) - optional
        <input type="number" min={0} step="0.5" value={beamFt} onChange={(e) => setBeamFt(e.target.value)} aria-label="Longest beam in feet" className={INPUT_CLASS} />
        <span className="mt-1 block text-xs font-normal text-slate-500">Leave blank if you don&apos;t know; the report will say the review path could not be confirmed.</span>
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
