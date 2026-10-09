/**
 * Customer-facing copy and timing for the two waiting experiences (parcel lookup, report generation). Pure, so it is unit-tested without a DOM.
 *
 * Honesty rules (product decision, 2026-10-09): no percentage, no step "done" claims, no wording that implies approval, legal or professional review, or
 * SDCI confirmation - this is automated screening. The backend exposes only coarse order states (payment confirmed, report ready, refund), no durable
 * generation stages, so the generation messages are an indeterminate sequence of what the system is doing, advanced by elapsed time and then held.
 */

export type LookupStage = "RESOLVING" | "LOADING_PARCEL";

export const LOOKUP_COPY: Record<LookupStage, string> = {
  RESOLVING: "Looking up the property…",
  LOADING_PARCEL: "Loading the parcel map and nearby buildings…",
};

export const GENERATION_MESSAGES = [
  "Confirming property information…",
  "Checking zoning…",
  "Measuring your proposed project…",
  "Evaluating Seattle requirements…",
  "Reviewing constraints…",
  "Building your screening report…",
] as const;

/** How long each message stays before the next one. The last message is held, never looped back to the first (a loop would suggest repeated work). */
export const MESSAGE_DWELL_MS = 5000;
/** After this long the copy acknowledges the wait. */
export const LONG_RUN_AFTER_MS = 45_000;
/** After this long it also tells the customer the order is saved and a link will be emailed; it never asks them to refresh or pay again. */
export const VERY_LONG_RUN_AFTER_MS = 150_000;

export type GenerationPhase = "WORKING" | "LONG" | "VERY_LONG";

export interface GenerationCopy {
  phase: GenerationPhase;
  /** The headline status line. */
  message: string;
  /** Optional reassurance under the headline. */
  detail?: string;
}

export function generationCopy(elapsedMs: number): GenerationCopy {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (elapsed >= VERY_LONG_RUN_AFTER_MS) {
    return {
      phase: "VERY_LONG",
      message: "Still working — this is taking longer than usual.",
      detail: "Your payment has been received and your order is saved. You can keep this page open, and we will also email you a secure link when your report is ready.",
    };
  }
  if (elapsed >= LONG_RUN_AFTER_MS) {
    return { phase: "LONG", message: "Still working — some property checks can take a little longer.", detail: "Your payment has been received. Your report will appear here when it is ready." };
  }
  const index = Math.min(Math.floor(elapsed / MESSAGE_DWELL_MS), GENERATION_MESSAGES.length - 1);
  return { phase: "WORKING", message: GENERATION_MESSAGES[index]! };
}

/** The message a screen reader is told. Only the phase changes are announced (not every rotating line), so the status region is not noisy. */
export function generationAnnouncement(phase: GenerationPhase): string {
  return phase === "WORKING" ? "Payment received. Your report is being generated." : phase === "LONG" ? "Still working. Some property checks can take a little longer." : "Still working. This is taking longer than usual. Your order is saved.";
}
