"use client";

import { useEffect, useRef, useState } from "react";
import { GENERATION_MESSAGES, LONG_RUN_AFTER_MS, VERY_LONG_RUN_AFTER_MS, generationAnnouncement, generationCopy } from "./loading-copy.js";

/** Every variant the copy block can show; all are laid out together so the block never changes height. */
const COPY_VARIANTS = [
  { key: "WORKING", message: GENERATION_MESSAGES[GENERATION_MESSAGES.length - 1]!, detail: undefined as string | undefined },
  { key: "LONG", ...generationCopy(LONG_RUN_AFTER_MS) },
  { key: "VERY_LONG", ...generationCopy(VERY_LONG_RUN_AFTER_MS) },
  { key: "READY", message: "Your report is ready.", detail: undefined as string | undefined },
] as const;

/**
 * The report-generation waiting experience: a parcel outline draws, measurement lines extend from the proposed structure, a checklist fills in and the report
 * pages settle - looping while the report is built, then resting on the finished state (`done`). Indeterminate by design: there is NO percentage and no line that says a
 * step finished, because the backend exposes no durable generation stages (only "payment received" and "ready"). The headline rotates through what the system
 * is doing, then holds; after a while it acknowledges the wait. Screen readers hear only the long-wait and ready changes (not every rotating line).
 * The frame has a fixed height so nothing jumps when the copy changes or the scene finishes.
 */
export function ReportGenerationProgress({ done = false, initialElapsedMs = 0 }: { done?: boolean; /** Dev preview only: start the wait clock part-way through. */ initialElapsedMs?: number }) {
  const startedAt = useRef<number>(Date.now() - initialElapsedMs);
  const [elapsed, setElapsed] = useState(initialElapsedMs);
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => clearInterval(id);
  }, [done]);
  const copy = generationCopy(elapsed);

  return (
    <div className="flex flex-col items-center text-center" aria-busy={!done}>
      <div className="w-full max-w-md" aria-hidden="true">
        <svg viewBox="0 0 320 180" focusable="false" className="pp-scene block h-auto w-full" data-state={done ? "done" : "working"}>
          <rect x="1" y="1" width="318" height="178" rx="14" fill="#f8fafc" stroke="#e2e8f0" />
          {/* map panel with faint street grid */}
          <g stroke="#e2e8f0" strokeWidth="1">
            <path d="M16 60 H176 M16 110 H176 M16 150 H176 M58 16 V164 M120 16 V164" />
          </g>
          {/* parcel outline */}
          <path d="M30 138 L50 48 L128 36 L168 96 L140 146 Z" pathLength={1} className="pp-draw" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" />
          {/* existing building and the proposed structure */}
          <rect x="62" y="56" width="42" height="26" rx="2" className="pp-pop" fill="#cbd5e1" />
          <rect x="94" y="102" width="24" height="18" rx="2" className="pp-pop" fill="#a5b4fc" stroke="#4f46e5" strokeWidth="1.5" />
          {/* measurement lines with end ticks */}
          <g fill="none" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round">
            <path d="M94 111 H44" pathLength={1} className="pp-measure" />
            <path d="M44 106 V116" pathLength={1} className="pp-measure" />
            <path d="M106 102 V84" pathLength={1} className="pp-measure" />
            <path d="M101 84 H111" pathLength={1} className="pp-measure" />
          </g>
          {/* map pin */}
          <g className="pp-pin">
            <path d="M150 74 c-6 -8 -9 -12 -9 -16 a9 9 0 0 1 18 0 c0 4 -3 8 -9 16 z" fill="#4f46e5" />
            <circle cx="150" cy="58" r="3.2" fill="#fff" />
          </g>
          {/* report document: two pages and a checklist */}
          <g className="pp-page" style={{ ["--i" as string]: 0 }}>
            <rect x="204" y="30" width="86" height="120" rx="6" fill="#e2e8f0" transform="rotate(4 247 90)" />
          </g>
          <g className="pp-page" style={{ ["--i" as string]: 1 }}>
            <rect x="198" y="26" width="86" height="120" rx="6" fill="#fff" stroke="#cbd5e1" />
            <rect x="208" y="36" width="40" height="6" rx="2" fill="#6366f1" />
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <rect x="208" y={56 + i * 22} width="10" height="10" rx="2" fill="none" stroke="#cbd5e1" />
                <path d={`M210 ${61 + i * 22} l3 3 l5 -6`} pathLength={1} className="pp-check" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ ["--i" as string]: i }} />
                <rect x="224" y={58 + i * 22} width={48 - (i % 2) * 12} height="4" rx="2" fill="#e2e8f0" />
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Visible headline (rotates) - hidden from assistive tech; the status region below speaks only on phase changes. Every copy variant is laid out in the
          same grid cell and only the current one is visible, so the frame is always as tall as the tallest variant at any width: nothing moves when the copy changes. */}
      <div className="mt-4 grid w-full max-w-md" aria-hidden="true">
        {COPY_VARIANTS.map((variant) => {
          const current = done ? "READY" : copy.phase;
          const shown = variant.key === current;
          const message = variant.key === "WORKING" && shown ? copy.message : variant.message;
          return (
            <div key={variant.key} className={`col-start-1 row-start-1 ${shown ? "" : "invisible"}`}>
              <p className="text-base font-semibold text-slate-900">{message}</p>
              {variant.detail && <p className="mt-1 text-sm text-slate-600">{variant.detail}</p>}
              {variant.key !== "READY" && <p className="mt-2 text-xs text-slate-500">This is an automated screening, not a permit decision.</p>}
            </div>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {/* The page announces "payment received / generating" itself; this region speaks only when the wait gets long (or the report is ready). */}
        {done ? "Your report is ready." : copy.phase === "WORKING" ? "" : generationAnnouncement(copy.phase)}
      </p>
    </div>
  );
}
