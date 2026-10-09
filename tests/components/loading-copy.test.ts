/**
 * The waiting-experience copy is pure and deterministic (app/components/loading-copy.ts): rotation, holding, long-run phases, and the honesty rules (no percentage, no
 * completion claims, no approval/legal/professional-review/SDCI wording, never an instruction to refresh or pay again).
 */
import { describe, expect, it } from "vitest";
import {
  GENERATION_MESSAGES,
  LONG_RUN_AFTER_MS,
  LOOKUP_COPY,
  MESSAGE_DWELL_MS,
  VERY_LONG_RUN_AFTER_MS,
  generationAnnouncement,
  generationCopy,
} from "../../app/components/loading-copy.js";

describe("generation copy", () => {
  it("starts on the first message and advances one message per dwell period", () => {
    expect(generationCopy(0).message).toBe(GENERATION_MESSAGES[0]);
    expect(generationCopy(MESSAGE_DWELL_MS - 1).message).toBe(GENERATION_MESSAGES[0]);
    expect(generationCopy(MESSAGE_DWELL_MS).message).toBe(GENERATION_MESSAGES[1]);
    expect(generationCopy(MESSAGE_DWELL_MS * 2).message).toBe(GENERATION_MESSAGES[2]);
  });
  it("cycles through the messages instead of advancing to an end (no last step to reach, so no apparent progress)", () => {
    const n = GENERATION_MESSAGES.length;
    expect(generationCopy(MESSAGE_DWELL_MS * n).message).toBe(GENERATION_MESSAGES[0]);
    expect(generationCopy(MESSAGE_DWELL_MS * (n + 1)).message).toBe(GENERATION_MESSAGES[1]);
    expect(generationCopy(LONG_RUN_AFTER_MS - 1).phase).toBe("WORKING");
  });
  it("acknowledges a long wait, then reassures without asking for a refresh or a second payment", () => {
    const long = generationCopy(LONG_RUN_AFTER_MS);
    expect(long.phase).toBe("LONG");
    expect(long.message).toBe("Still working — some property checks can take a little longer.");
    const veryLong = generationCopy(VERY_LONG_RUN_AFTER_MS);
    expect(veryLong.phase).toBe("VERY_LONG");
    expect(veryLong.detail).toMatch(/order is saved/i);
    expect(veryLong.detail).toMatch(/try to email/i);
    expect(veryLong.detail).not.toMatch(/will (also )?email/i); // email delivery can fail (EMAIL_FAILED): never guaranteed
    for (const t of [long, veryLong]) expect(`${t.message} ${t.detail ?? ""}`).not.toMatch(/refresh|reload|pay again|try again/i);
  });
  it("tolerates bad input", () => {
    expect(generationCopy(-5).message).toBe(GENERATION_MESSAGES[0]);
    expect(generationCopy(Number.NaN).message).toBe(GENERATION_MESSAGES[0]);
  });
  it("never shows a percentage, claims a step is complete, or implies approval or review", () => {
    const all = [...GENERATION_MESSAGES, ...Object.values(LOOKUP_COPY), generationCopy(LONG_RUN_AFTER_MS).message, generationCopy(VERY_LONG_RUN_AFTER_MS).message, generationCopy(VERY_LONG_RUN_AFTER_MS).detail ?? "", generationAnnouncement("WORKING"), generationAnnouncement("LONG"), generationAnnouncement("VERY_LONG")];
    for (const t of all) {
      expect(t, t).not.toMatch(/%|\bpercent/i);
      expect(t, t).not.toMatch(/\b(done|complete|completed|finished|verified|approved|approval|confirmed by|reviewed by|professional|legal|SDCI|certified)\b/i);
    }
  });
  it("lookup copy names what is happening", () => {
    expect(LOOKUP_COPY.RESOLVING).toBe("Looking up the property…");
    expect(LOOKUP_COPY.LOADING_PARCEL).toMatch(/parcel/);
  });
});
