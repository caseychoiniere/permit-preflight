"use client";

import { LOOKUP_COPY, type LookupStage } from "./loading-copy.js";

/**
 * The parcel-search waiting state: a small parcel outline that draws itself with a map pin that drops on it, and one line of plain copy. It lives in a
 * region that always occupies the same height (and the live region is always mounted), so starting or finishing a lookup never moves the page; screen readers
 * hear the line once per stage via role="status". Respects prefers-reduced-motion (the graphic is then static). Decorative graphic is aria-hidden.
 */
export function LookupLoading({ stage, error }: { stage: LookupStage | null; error?: string | null }) {
  return (
    <div className="min-h-[4.5rem]">
      <div role="status" aria-live="polite">
      {stage && (
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 72 48" className="pp-scene h-12 w-[4.5rem] shrink-0">
            <rect x="1" y="1" width="70" height="46" rx="6" fill="#f8fafc" stroke="#e2e8f0" />
            <path d="M8 38 L22 12 L52 8 L64 30 L46 40 Z" pathLength={1} className="pp-draw" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
            <rect x="28" y="20" width="14" height="10" rx="1.5" className="pp-pop" fill="#c7d2fe" />
            <circle cx="35" cy="25" r="8" className="pp-ripple" fill="none" stroke="#6366f1" strokeWidth="1.5" />
            <g className="pp-pin">
              <path d="M35 24 c-4 -5 -6 -7.5 -6 -10 a6 6 0 0 1 12 0 c0 2.5 -2 5 -6 10 z" fill="#4f46e5" />
              <circle cx="35" cy="14" r="2.2" fill="#fff" />
            </g>
          </svg>
          <p className="text-sm font-medium text-slate-700">{LOOKUP_COPY[stage]}</p>
        </div>
      )}
      </div>
      {!stage && error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** A small inline spinner for a busy button. Static under prefers-reduced-motion. */
export function ButtonSpinner() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-4 w-4 animate-spin motion-reduce:animate-none">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
