/**
 * The waiting experiences, rendered to static markup (no DOM needed): what the report-generation scene claims in each state, that failure states carry no animation
 * and keep the order context, that the screen-reader region speaks only when it should, and that prefers-reduced-motion neutralizes EVERY animated element.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ReportGenerationProgress } from "../../app/components/ReportGenerationProgress.js";
import { LookupLoading } from "../../app/components/LookupLoading.js";
import { GenerationPanel, RefundPanel, refundPanelCopy } from "../../app/components/OrderStatusPanels.js";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const srRegion = (markup: string) => /<p role="status" aria-live="polite" class="sr-only">([^<]*)<\/p>/.exec(markup)?.[1] ?? "";
const visibleBlocks = (markup: string) => [...markup.matchAll(/<div class="col-start-1 row-start-1 (invisible)?">/g)].map((m) => m[1] === undefined);

describe("report generation scene", () => {
  it("while the report is being built there are NO completion marks, a neutral scan runs, and nothing is announced (the page announces payment received)", () => {
    const m = html(createElement(ReportGenerationProgress, {}));
    expect(m).not.toContain("pp-check");
    expect(m).toContain("pp-scan");
    expect(m).toContain('data-state="working"');
    expect(srRegion(m)).toBe("");
    expect(m).toContain('aria-busy="true"');
  });
  it("only the finished state draws checkmarks, and it adds no second announcement (the page already says the report is ready)", () => {
    const m = html(createElement(ReportGenerationProgress, { done: true }));
    expect(m).toContain("pp-check");
    expect(m).toContain('data-state="done"');
    expect(srRegion(m)).toBe("");
    expect(m).toContain('aria-busy="false"');
  });
  it("a long wait is announced once per phase, in plain words, without asking for a refresh", () => {
    const long = srRegion(html(createElement(ReportGenerationProgress, { initialElapsedMs: 50_000 })));
    const veryLong = srRegion(html(createElement(ReportGenerationProgress, { initialElapsedMs: 160_000 })));
    expect(long).toMatch(/still working/i);
    expect(veryLong).toMatch(/order is saved/i);
    for (const t of [long, veryLong]) expect(t).not.toMatch(/refresh|reload|pay again/i);
  });
  it("every copy variant is laid out in one grid cell and exactly one is visible in each phase (so the frame never changes height)", () => {
    for (const [props, expectedVisibleIndex] of [[{}, 0], [{ initialElapsedMs: 50_000 }, 1], [{ initialElapsedMs: 160_000 }, 2], [{ done: true }, 3]] as const) {
      const flags = visibleBlocks(html(createElement(ReportGenerationProgress, props)));
      expect(flags).toHaveLength(4);
      expect(flags.filter(Boolean)).toHaveLength(1);
      expect(flags.indexOf(true)).toBe(expectedVisibleIndex);
    }
  });
  it("the graphic is hidden from assistive technology and the copy states this is automated screening, not a permit decision", () => {
    const m = html(createElement(ReportGenerationProgress, {}));
    expect(m).toMatch(/<div class="w-full max-w-md" aria-hidden="true"><svg/);
    expect(m).toContain("This is an automated screening, not a permit decision.");
  });
});

describe("parcel lookup state", () => {
  it("is idle with an always-mounted live region and a reserved height; shows the stage text; shows the error only when no lookup is running", () => {
    const idle = html(createElement(LookupLoading, { stage: null }));
    expect(idle).toContain('role="status"');
    expect(idle).toContain("min-h-[4.5rem]");
    const busy = html(createElement(LookupLoading, { stage: "RESOLVING", error: "x" }));
    expect(busy).toContain("Looking up the property…");
    expect(busy).not.toContain('role="alert"');
    expect(html(createElement(LookupLoading, { stage: null, error: "We couldn't find it." }))).toContain('role="alert"');
  });
});

describe("failure and refund states", () => {
  it("a refund panel has no animation, shows the order reference, scopes the wording to this order, and never implies a new screening is free", () => {
    for (const status of ["REFUND_PENDING", "REFUNDED", "REFUND_REQUIRES_SUPPORT"] as const) {
      const m = html(createElement(RefundPanel, { status, orderReference: "11111111-2222-3333-4444-555555555555" }));
      expect(m).not.toContain("pp-scene");
      expect(m).not.toContain("<svg");
      expect(m).toContain("11111111-2222-3333-4444-555555555555");
      expect(refundPanelCopy(status)).toMatch(/for this order/);
      expect(refundPanelCopy(status)).not.toMatch(/new screening|whenever you like|free/i);
    }
  });
  it("manual-review refunds say how to reach support: a mailto link with the reference when a support address is configured, plain instructions when not", () => {
    const withMail = html(createElement(RefundPanel, { status: "REFUND_REQUIRES_SUPPORT", orderReference: "abc", supportEmail: "help@example.test" }));
    expect(withMail).toContain('href="mailto:help@example.test?');
    expect(withMail).toContain(encodeURIComponent("Order reference: abc"));
    const without = html(createElement(RefundPanel, { status: "REFUND_REQUIRES_SUPPORT", orderReference: "abc" }));
    expect(without).not.toContain("mailto:");
    expect(without).toContain("Contact support with the reference above.");
  });
  it("the generation panel shows the scene while payment is confirmed and the finished scene (plus a loading line) once ready", () => {
    expect(html(createElement(GenerationPanel, { ready: false }))).toContain('data-state="working"');
    const ready = html(createElement(GenerationPanel, { ready: true }));
    expect(ready).toContain('data-state="done"');
    expect(ready).toContain("Loading your report...");
  });
});

describe("prefers-reduced-motion", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const animated = [...css.matchAll(/\.pp-scene (\.pp-[a-z]+)[^{]*\{[^}]*animation:\s*pp-/g)].map((m) => m[1]!);
  const reducedBlock = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

  it("finds every animated scene element", () => {
    expect(new Set(animated)).toEqual(new Set([".pp-draw", ".pp-measure", ".pp-scan", ".pp-check", ".pp-pop", ".pp-pin", ".pp-page", ".pp-ripple"]));
  });
  it("the reduced-motion block turns the animation off for every one of them", () => {
    expect(reducedBlock.length).toBeGreaterThan(0);
    for (const cls of new Set(animated)) {
      const rule = new RegExp(`\\.pp-scene ${cls.replace(".", "\\.")}[^{]*\\{[^}]*animation:\\s*none`);
      expect(rule.test(reducedBlock), `${cls} is neutralized under prefers-reduced-motion`).toBe(true);
    }
  });
  it("the button spinner also stops under reduced motion", () => {
    const src = readFileSync(new URL("../../app/components/LookupLoading.tsx", import.meta.url), "utf8");
    expect(src).toContain("motion-reduce:animate-none");
  });
});
