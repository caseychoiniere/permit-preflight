/**
 * Structured report explanation (2026-10-13). The model explains deterministic findings and may not strengthen them. The guarantees are structural (sections, titles,
 * coverage, the leading summary paragraph, durable references) with conservative acceptance of the model's own prose on top (a note about a finding, summary paragraphs).
 * Includes the regression fixture for the manually observed LR1(M) ADU report and the bypasses an adversarial review found: unsafe titles, citation laundering, ALL_MET
 * overclaims, paraphrases, unsafe legacy prose, and references into filtered / reordered / duplicate-subject lists.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { explainFindings } from "../../src/report-explanation/index.js";
import {
  ABOUT_SCREENING_TEXT,
  ExplanationSchema,
  buildExplanation,
  buildExplanationView,
  claimsBroadApproval,
  deterministicSummary,
  overallStatus,
  groundingScores,
  quantitiesIn,
  rejectNote,
  remapEvidenceRefs,
  type ModelExplanation,
} from "../../src/report-explanation/structured.js";
import { explanationHtml } from "../../src/report-pdf-rendering/explanation-html.js";
import { ExplanationSections } from "../../app/components/ExplanationSections.js";
import type { Finding } from "../../src/regulatory-rules-engine/types.js";

const pass = (subject: string, basis = `${subject} is met.`): Finding => ({ subject, classification: "KNOWN", complianceOutcome: "PASS", explanationBasis: basis, supportingEvidence: [] });
const fail = (subject: string, basis = `${subject} is not met.`): Finding => ({ subject, classification: "KNOWN", complianceOutcome: "FAIL", explanationBasis: basis, supportingEvidence: [] });
const verify = (subject: string, basis = `${subject} could not be determined.`): Finding => ({ subject, classification: "REQUIRES_VERIFICATION", explanationBasis: basis, supportingEvidence: [] });
const info = (subject: string, basis = `${subject} applies.`): Finding => ({ subject, classification: "KNOWN", explanationBasis: basis, supportingEvidence: [] });
const model = (summary: string, notes: [number, string][] = []): ModelExplanation => ({ summary, notes: notes.map(([ref, text]) => ({ ref, text })) });

/** The manually observed ADU report: LR1(M), use and unit count permitted, setbacks and FAR met, principal-structure separation FAILS, size/height/second-structure/design/tree/ECA unresolved. */
const aduFindings: Finding[] = [
  pass("Accessory dwelling units allowed on this lot", "Seattle's Lowrise zones allow accessory dwelling units on this lot (SMC 23.42.022)."), // 0
  pass("ADU setbacks", "The ADU would be 8 ft from the nearest side lot line, which meets the 5 ft minimum."), // 1
  pass("ADU floor area ratio", "The proposed floor area is well under the FAR limit."), // 2
  fail("Separation from the principal structure", "The ADU is 3.2 ft from the principal structure; at least 5 ft is required (SMC 23.45.519.A)."), // 3
  verify("ADU size", "Maximum ADU size depends on the lot, which could not be confirmed."), // 4
  verify("ADU height", "The height limit depends on roof form, which could not be confirmed."), // 5
  verify("Separation from a second accessory structure", "Whether another accessory structure stands nearby could not be determined."), // 6
  verify("ADU design standards", "Design standards need a site-specific review."), // 7
  verify("Tree protection", "Tree protection requirements could not be determined."), // 8
  verify("Critical areas", "Environmentally critical area status could not be fully determined."), // 9
];

/** What a model plausibly returns for that report, including the observed overclaim. */
const goodNotes: [number, string][] = [
  [3, "The ADU would be only 3.2 ft from the principal structure, and at least 5 ft is required, so this requirement is not met."],
  [4, "The maximum size depends on the lot, which could not be confirmed, so size is unresolved."],
];

describe("overall deterministic status and the leading summary paragraph", () => {
  it("any definite failure dominates, then any verification item, else all met", () => {
    expect(overallStatus(aduFindings)).toBe("HAS_FAILURE");
    expect(overallStatus([pass("a"), verify("b")])).toBe("HAS_VERIFICATION");
    expect(overallStatus([pass("a"), pass("b")])).toBe("ALL_MET");
    expect(overallStatus([info("n")])).toBe("NOTHING_CHECKED");
  });
  it("says only what the findings say: counts, and which requirements are not met", () => {
    const s = deterministicSummary(aduFindings);
    expect(s).toMatch(/1 requirement this proposal does not currently meet \(Separation from the principal structure\)/);
    expect(s).toMatch(/6 more that need verification/);
    expect(s).toMatch(/3 requirements appear to be met/);
    expect(claimsBroadApproval(s)).toBe(false);
    expect(deterministicSummary([fail("A"), fail("B"), fail("C"), fail("D")])).toMatch(/\(A, B and C, and 1 more\)/);
    expect(deterministicSummary([pass("a"), verify("b")])).toMatch(/before this proposal can be considered feasible/);
  });
});

describe("structure is decided by code, not by the model", () => {
  const { explanation } = buildExplanation(model("Context.", goodNotes), aduFindings);
  const subjects = (items: { subjects: string[] }[]) => items.flatMap((i) => i.subjects);

  it("sections follow the deterministic classification; titles are the findings' own subjects", () => {
    expect(subjects(explanation.issues)).toEqual(["Separation from the principal structure"]);
    expect(subjects(explanation.requiresVerification)).toEqual(["ADU size", "ADU height", "Separation from a second accessory structure", "ADU design standards", "Tree protection", "Critical areas"]);
    // Met requirements are always listed (the finding's own text when the model wrote nothing), so the customer sees what appears feasible.
    expect(subjects(explanation.satisfied)).toEqual(["Accessory dwelling units allowed on this lot", "ADU setbacks", "ADU floor area ratio"]);
    expect(explanation.satisfied[2]!.text).toBe(aduFindings[2]!.explanationBasis);
    for (const item of Object.values(explanation).flatMap((v) => (Array.isArray(v) ? v : []))) expect(item.title).toBe(item.subjects[0]);
  });
  it("every failure and every unresolved finding is present even when the model writes nothing about it", () => {
    const empty = buildExplanation(model("Context."), aduFindings).explanation;
    expect(empty.issues).toHaveLength(1);
    expect(empty.requiresVerification).toHaveLength(6);
    expect(empty.issues[0]!.text).toBe(aduFindings[3]!.explanationBasis);
  });
  it("passing findings are all listed up to a cap, then only those the model explained; informational ones go under 'other requirements' when explained", () => {
    const r = buildExplanation(model("Context.", [[1, "The ADU would be 8 ft from the nearest side lot line, which is more than the 5 ft minimum."]]), [...aduFindings, info("Design standards notice")]).explanation;
    expect(subjects(r.satisfied)).toEqual(["Accessory dwelling units allowed on this lot", "ADU setbacks", "ADU floor area ratio"]);
    expect(r.additionalConsiderations).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => pass(`Met ${i}`, `Requirement ${i} is met.`));
    const capped = buildExplanation(model("Context.", [[3, "Requirement 3 is met."]]), many).explanation;
    expect(subjects(capped.satisfied)).toEqual(["Met 3"]);
    const r2 = buildExplanation(model("Context.", [[10, "These standards apply."]]), [...aduFindings, info("Design standards notice")]).explanation;
    expect(subjects(r2.additionalConsiderations)).toEqual(["Design standards notice"]);
  });
  it("a note citing a missing finding, or a second note for the same finding, is ignored", () => {
    const { report } = buildExplanation(model("Context.", [[99, "x"], ...goodNotes, [3, "A second note that must not replace the first."]]), aduFindings);
    expect(report.ignoredNotes).toBe(2);
  });
  it("the first summary paragraph is always the deterministic result, 'about' is fixed text, and the stored shape validates", () => {
    expect(explanation.summary.startsWith(deterministicSummary(aduFindings))).toBe(true);
    expect(explanation.aboutScreening).toBe(ABOUT_SCREENING_TEXT);
    expect(ExplanationSchema.safeParse(explanation).success).toBe(true);
  });
});

describe("citation laundering: citing a finding does not hide it", () => {
  it("unrelated, vague or empty-of-substance prose about a failure is not accepted: the finding's own basis (subject, figures, citation) is shown", () => {
    for (const vague of ["Review the design.", "Siting details need a look.", "Everything here is fine.", "This is a minor matter."]) {
      const { explanation, report } = buildExplanation(model("Context.", [[3, vague]]), aduFindings);
      expect(explanation.issues[0]!.title).toBe("Separation from the principal structure");
      expect(explanation.issues[0]!.text).toBe(aduFindings[3]!.explanationBasis);
      expect(report.rejectedNotes, vague).toBe(1);
    }
  });
  it("a note for an unresolved finding that reads as resolved is replaced by its basis", () => {
    const { explanation } = buildExplanation(model("Context.", [[5, "The height is within the limit."]]), aduFindings);
    expect(explanation.requiresVerification.find((i) => i.title === "ADU height")!.text).toBe(aduFindings[5]!.explanationBasis);
  });
  it("a mixed or duplicate citation cannot merge a failure into a passing item: each finding is its own item under its own section", () => {
    const { explanation } = buildExplanation(model("Context.", [[0, "ADUs are allowed in this zoning context."], [3, goodNotes[0]![1]]]), aduFindings);
    expect(explanation.satisfied.map((i) => i.evidenceRefs)).toEqual([[0], [1], [2]]); // met findings keep their own items
    expect(explanation.issues.map((i) => i.evidenceRefs)).toEqual([[3]]);
  });
});

describe("acceptance of the model's note about one finding", () => {
  const sep = aduFindings[3]!;
  const size = aduFindings[4]!;
  it("accepts a faithful note about a failure and about an unresolved finding", () => {
    expect(rejectNote(goodNotes[0]![1], sep)).toBeUndefined();
    expect(rejectNote(goodNotes[1]![1], size)).toBeUndefined();
  });
  it("negation and remedies are not compliance claims: 'does not meet', 'is not compliant', 'to comply' are accepted on an adverse finding", () => {
    for (const ok of [
      "This requirement is not met. The ADU is 3.2 ft from the principal structure, but at least 5 ft is required.",
      "At 3.2 ft from the principal structure the ADU does not meet the 5 ft separation that is required.",
      "The ADU is not compliant: it is only 3.2 ft from the principal structure and 5 ft is required.",
    ])
      expect(rejectNote(ok, sep), ok).toBeUndefined();
    // An approval remark the finding never makes is an added claim, whatever its polarity.
    expect(rejectNote("The maximum ADU size depends on the lot, which could not be confirmed, so it needs to be approved as part of review.", size)).toBeDefined();
    // Advice of the model's own ("increase this separation to comply") is an added claim: the finding's own text is shown instead.
    expect(rejectNote("The ADU is 3.2 ft from the principal structure, but at least 5 ft is required. You will need to increase this separation to comply.", sep)).toBeDefined();
    // ...but a positive claim still is.
    for (const bad of ["The ADU is 3.2 ft from the principal structure and 5 ft is required, and it complies.", "The 5 ft requirement is met even at 3.2 ft.", "This separation meets the standard, not the 5 ft one."])
      expect(rejectNote(bad, sep), bad).toBeDefined();
  });
  it.each([
    ["an approval claim", "ADUs are allowed here, so this ADU is allowed.", aduFindings[0]!],
    ["a promise about the city's decision", "The ADU will be approved.", aduFindings[1]!],
    ["a new quantity", "The ADU is 3.2 ft from the principal structure, not the 5 ft required, a 1.8 ft shortfall of 36%.", sep],
    ["a dropped quantity on a failure", "The ADU is too close to the principal structure, which is not allowed.", sep],
    ["a failure that reads as met", "The ADU is 3.2 ft from the principal structure and 5 ft is required, which is fine.", sep],
    ["compliance wording on an unresolved finding", "The size complies with the limit, depending on the lot.", size],
    ["an unresolved finding that reads as settled", "The size is acceptable.", size],
  ])("rejects %s", (_why, note, finding) => expect(rejectNote(note, finding)).toBeDefined());
  it("quantities are numbers with a unit; citations are not quantities", () => {
    expect([...quantitiesIn("3.2 ft from it; at least 5 feet; 1,344 sq ft; 30% (SMC 23.45.519.A) and 2 units")].sort()).toEqual(["1344 sqft", "2 unit", "3.2 ft", "30 pct", "5 ft"]);
  });
});

describe("notes are extractive: they keep the finding's substance and add no claims (RC-6, RC-7)", () => {
  const noQuantityFail = fail("Visibility triangle", "A fence over three feet tall inside the corner visibility triangle is not allowed here (SMC 23.54.030.G).");
  const noQuantityVerify = verify("Tree protection", "Tree protection requirements could not be determined from the data available for this parcel.");
  it("a vague note never replaces the reason a finding failed or is unresolved, even when the finding has no quantities", () => {
    expect(rejectNote("This requirement is not met.", noQuantityFail)).toBeDefined();
    expect(rejectNote("This needs verification.", noQuantityVerify)).toBeDefined();
    const built = buildExplanation(model("Context.", [[0, "This requirement is not met."], [1, "This needs verification."]]), [noQuantityFail, noQuantityVerify]).explanation;
    expect(built.issues[0]!.text).toBe(noQuantityFail.explanationBasis);
    expect(built.requiresVerification[0]!.text).toBe(noQuantityVerify.explanationBasis);
  });
  it("a faithful rewording that keeps the key terms is accepted", () => {
    expect(rejectNote("A fence taller than three feet inside the corner visibility triangle is not allowed, so this requirement is not met.", noQuantityFail)).toBeUndefined();
    expect(rejectNote("The tree protection requirements could not be determined from the data available, so this is unresolved.", noQuantityVerify)).toBeUndefined();
  });
  it("a note that adds claims of its own is rejected, for passing and informational findings too", () => {
    const met = pass("ADU setbacks", "The ADU would be 8 ft from the nearest side lot line, which meets the 5 ft minimum.");
    expect(rejectNote("The ADU would be 8 ft from the nearest side lot line, which meets the 5 ft minimum.", met)).toBeUndefined();
    for (const bad of ["Setbacks are met, and no building permit is needed for a structure this small.", "The side lot line is fine and neighbors cannot object to it under city rules."]) expect(rejectNote(bad, met), bad).toBeDefined();
    expect(rejectNote("Visibility rules apply, and a variance is easy to get from SDCI.", info("Visibility triangle notice", "Visibility triangle rules apply near corners."))).toBeDefined();
  });
  it("a faithful-sounding note that drops what the finding is about is replaced by the finding's own text", () => {
    expect(rejectNote("At 3.2 ft the ADU does not meet the 5 ft minimum.", aduFindings[3]!)).toBe("drops the substance of the finding");
  });
  it("quantities are bound to their units: 5 ft does not authorize 5 stories or 5%", () => {
    const sep = fail("Separation", "The ADU is 3.2 ft from the principal structure; at least 5 ft is required.");
    expect(rejectNote("The ADU is 3.2 ft from the principal structure; at least 5 ft is required, so it is not met.", sep)).toBeUndefined();
    for (const bad of ["The ADU is 3.2 ft from the principal structure; at least 5 stories is required, so it is not met.", "The ADU is 3.2 ft from the principal structure; at least 5% is required, so it is not met."]) expect(rejectNote(bad, sep), bad).toBe("new quantity");
    expect(quantitiesIn("5 ft")).not.toEqual(quantitiesIn("5 stories"));
  });
  it("grounding is measured against the finding's own words in both directions", () => {
    const g = groundingScores("This requirement is not met.", "A fence over three feet tall inside the corner visibility triangle is not allowed here.");
    expect(g.coverage).toBeLessThan(0.5);
    expect(groundingScores("A fence over three feet tall inside the corner visibility triangle is not allowed here.", "A fence over three feet tall inside the corner visibility triangle is not allowed here.").coverage).toBe(1);
  });
});

describe("the summary: deterministic lead first, then only accepted model paragraphs", () => {
  const withSummary = (text: string, findings = aduFindings) => buildExplanation(model(text), findings);
  it("the observed overclaim \"You're allowed to build this ADU on your lot\" is dropped; the deterministic result leads", () => {
    const { explanation, report } = withSummary("You're allowed to build this ADU on your lot. Everything looks fine overall.\n\nADUs are an allowed residential use in this zoning context, but this specific proposal still has requirements that need attention.");
    expect(explanation.summary).not.toMatch(/allowed to build/i);
    expect(explanation.summary.startsWith(deterministicSummary(aduFindings))).toBe(true);
    expect(explanation.summary).toMatch(/ADUs are an allowed residential use in this zoning context, but this specific proposal still has requirements that need attention\./);
    expect(report.rejectedSummaryParagraphs).toBe(1);
  });
  it("approval wording is dropped in every status, including when everything checked is met", () => {
    for (const t of ["Your project is approved.", "This proposal meets the code.", "Nothing prevents construction.", "You can build this project.", "Your permit will be approved.", "The design complies with all the zoning requirements."]) {
      const met = withSummary(t, [pass("a"), pass("b")]);
      expect(met.explanation.summary, t).toBe(deterministicSummary([pass("a"), pass("b")]));
      expect(withSummary(t).report.rejectedSummaryParagraphs, t).toBe(1);
    }
  });
  it("a paragraph that introduces a figure found in no finding is dropped, and at most two model paragraphs are kept", () => {
    const { explanation } = withSummary("The ADU is 9 ft from the house.\n\nSetbacks are met.\n\nSize could not be confirmed.\n\nThree.");
    expect(explanation.summary.split("\n\n")).toEqual([deterministicSummary(aduFindings), "Setbacks are met.", "Size could not be confirmed."]);
  });
  it("an over-long paragraph is dropped by the length limit itself (a single paragraph beyond it, before any paragraph cap is reached)", () => {
    const long = "The ADU separation is not met and size could not be confirmed. ".repeat(25); // well-grounded wording, > 1200 chars
    expect(long.length).toBeGreaterThan(1200);
    const { explanation, report } = withSummary(long);
    expect(report.rejectedSummaryParagraphs).toBe(1);
    expect(explanation.summary).toBe(deterministicSummary(aduFindings));
  });
  it("an unsupported NON-numeric claim is dropped (no figure involved)", () => {
    for (const t of ["No permit is required for this project.", "The city usually waives separation rules for backyard cottages.", "You should hire a surveyor before anything else."]) {
      const { explanation, report } = withSummary(t);
      expect(report.rejectedSummaryParagraphs, t).toBe(1);
      expect(explanation.summary).toBe(deterministicSummary(aduFindings));
    }
  });
  it("literal markdown from the model is removed", () => {
    const { explanation } = buildExplanation(model("**Heads up** the context.", [[3, "**Not met:** " + goodNotes[0]![1]]]), aduFindings);
    expect(JSON.stringify(explanation)).not.toContain("**");
  });
});

describe("what counts as broad approval", () => {
  it.each([
    "You're allowed to build this ADU on your lot.",
    "You can build this project.",
    "Your project is allowed.",
    "This ADU is permitted here.",
    "The proposed garage is compliant.",
    "Your design is good to go.",
    "This will be approved.",
    "It will qualify.",
    "This proposal meets the code.",
    "Nothing prevents construction.",
    "It is safe to proceed.",
    "The property appears eligible for ADU development, but this proposed design has unresolved or noncompliant conditions.",
    "Your lot is eligible for an ADU.",
    "This project qualifies for the exemption.",
  ])("%s", (t) => expect(claimsBroadApproval(t)).toBe(true));
  it.each([
    "ADUs are allowed in this zoning context.",
    "ADUs are an allowed residential use in this zoning context, but this specific proposal still has requirements that need attention.",
    "The rear setback requirement is met.",
    "The ADU is 3.2 ft from the principal structure; at least 5 ft is required.",
  ])("not: %s", (t) => expect(claimsBroadApproval(t)).toBe(false));
});

describe("durable evidence references", () => {
  // The stored findings array has a per-hazard critical-area finding (filtered out of the model's input) and two findings that share a subject.
  const persisted: Finding[] = [pass("Setback", "Front setback is 20 ft."), info("Critical area: wetlands", "Mapped wetland nearby."), fail("Setback", "Side setback is 2 ft; 5 ft is required."), verify("Height", "Height could not be confirmed.")];
  const explained = [persisted[0]!, persisted[2]!, persisted[3]!]; // filtered (critical area removed), same order as generated
  it("resolves the model's indices into indices of the stored findings, by identity, even with duplicate subjects", () => {
    const built = buildExplanation(model("Context.", [[0, "The front setback is 20 ft."], [1, "The side setback is only 2 ft, and 5 ft is required, so it is not met."]]), explained).explanation;
    expect(built.satisfied[0]!.evidenceRefs).toEqual([0]); // before remap: indices into the explained list
    expect(built.issues[0]!.evidenceRefs).toEqual([1]);
    const durable = remapEvidenceRefs(built, explained, persisted);
    expect(durable.satisfied[0]!.evidenceRefs).toEqual([0]);
    expect(durable.issues[0]!.evidenceRefs).toEqual([2]); // the FAIL "Setback", not the PASS "Setback"
    expect(durable.requiresVerification[0]!.evidenceRefs).toEqual([3]);
    for (const item of [...durable.satisfied, ...durable.issues, ...durable.requiresVerification]) expect(persisted[item.evidenceRefs[0]!]!.subject).toBe(item.subjects[0]);
    expect(persisted[durable.issues[0]!.evidenceRefs[0]!]!.explanationBasis).toBe("Side setback is 2 ft; 5 ft is required.");
  });
  it("still resolves when the stored findings are structurally equal copies (matched by subject and basis), and drops a reference it cannot resolve", () => {
    const built = buildExplanation(model("Context."), explained).explanation;
    const copies = persisted.map((f) => ({ ...f }));
    expect(remapEvidenceRefs(built, explained, copies).issues[0]!.evidenceRefs).toEqual([2]);
    const unrelated = remapEvidenceRefs(built, explained, [pass("Something else")]);
    expect(unrelated.issues[0]!.evidenceRefs).toEqual([]);
    expect(unrelated.issues[0]!.subjects).toEqual(["Setback"]); // the item stays traceable by subject
  });
  it("copies that share subject and basis but differ elsewhere (supporting evidence, classification) resolve one-to-one to the intended stored finding", () => {
    const a: Finding = { subject: "Setback", classification: "KNOWN", complianceOutcome: "FAIL", explanationBasis: "Too close.", supportingEvidence: ["distance=2"] };
    const b: Finding = { subject: "Setback", classification: "KNOWN", complianceOutcome: "FAIL", explanationBasis: "Too close.", supportingEvidence: ["distance=1"] };
    const c: Finding = { subject: "Setback", classification: "REQUIRES_VERIFICATION", explanationBasis: "Too close.", supportingEvidence: ["distance=2"] };
    const stored = [c, b, a];
    const copies = stored.map((f) => ({ ...f })); // none is the object the model saw
    const explainedList = [a, b, c];
    const built = buildExplanation(model("Context."), explainedList).explanation;
    const durable = remapEvidenceRefs(built, explainedList, copies);
    // issues are a then b (explained order), verification is c: a -> stored index 2, b -> 1, c -> 0
    expect(durable.issues.map((i) => i.evidenceRefs)).toEqual([[2], [1]]);
    expect(durable.requiresVerification.map((i) => i.evidenceRefs)).toEqual([[0]]);
  });
  it("findings equal in every field still resolve one-to-one, in order, never to the same stored finding twice", () => {
    const x = (): Finding => ({ subject: "Setback", classification: "KNOWN", complianceOutcome: "FAIL", explanationBasis: "Too close.", supportingEvidence: [] });
    const explainedList = [x(), x()];
    const stored = [x(), x()];
    const built = buildExplanation(model("Context."), explainedList).explanation;
    expect(remapEvidenceRefs(built, explainedList, stored).issues.map((i) => i.evidenceRefs)).toEqual([[0], [1]]);
  });
  it("reordered stored findings still resolve to the right entries", () => {
    const built = buildExplanation(model("Context."), explained).explanation;
    const reordered = [persisted[3]!, persisted[2]!, persisted[1]!, persisted[0]!];
    const durable = remapEvidenceRefs(built, explained, reordered);
    expect(durable.issues[0]!.evidenceRefs).toEqual([1]);
    expect(durable.requiresVerification[0]!.evidenceRefs).toEqual([0]);
  });
});

describe("explainFindings builds the structured explanation from a real client response", () => {
  it("applies the structure and acceptance rules to what the model returns", async () => {
    const result = await explainFindings(aduFindings, { completeStructured: async () => model("You're allowed to build this ADU on your lot.", goodNotes) });
    expect(result.outcome).toBe("AVAILABLE");
    if (result.outcome === "AVAILABLE") {
      expect(result.explanation.version).toBe(2);
      expect(result.explanation.summary).not.toMatch(/allowed to build/i);
      expect(result.explanation.issues.map((i) => i.title)).toEqual(["Separation from the principal structure"]);
    }
  });
  it("the earlier grouped shape, or the old { text, referencedFindingIds } shape, is schema-invalid, so the report proceeds without an explanation", async () => {
    for (const bad of [{ text: "x", referencedFindingIds: ["0"] }, { summary: "x", satisfied: [], issues: [], requiresVerification: [], additionalConsiderations: [] }]) {
      expect((await explainFindings(aduFindings, { completeStructured: async () => bad })).outcome).toBe("UNAVAILABLE");
    }
  });
});

describe("rendering: the same real sections in the web report and the PDF", () => {
  const { explanation } = buildExplanation(model("A short note about what to watch.", goodNotes), aduFindings);
  const web = renderToStaticMarkup(createElement(ExplanationSections, { explanation }));
  const pdf = explanationHtml(explanation);
  const view = buildExplanationView(explanation)!;
  const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n+/g, "\n");

  it("renders multiple sections as headings, paragraphs and lists, never one blob and never markdown", () => {
    for (const html of [web, pdf]) {
      expect(html).not.toContain("**");
      expect(html).toContain("<ul");
      expect(html).toContain("<li");
      expect((html.match(/<h[34][^>]*>/g) ?? []).length).toBeGreaterThanOrEqual(4);
    }
    expect(view.sections.map((s) => s.heading)).toEqual(["Requirements that appear satisfied", "Issues that need attention", "Requires verification"]);
  });
  it("sections appear in the specified order; empty sections are not rendered", () => {
    const order = ["Overall assessment", "Requirements that appear satisfied", "Issues that need attention", "Requires verification", "About this screening"];
    for (const html of [text(web), text(pdf)]) {
      const at = order.map((h) => html.indexOf(h));
      expect(at.every((i) => i >= 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(html).not.toContain("Other requirements to be aware of"); // nothing informational in this report
    }
  });
  it("web and PDF carry identical content: every heading, item title, item text and summary paragraph appears in both", () => {
    const w = text(web);
    const p = text(pdf);
    for (const h of ["Overall assessment", ...view.sections.map((s) => s.heading), "About this screening"]) {
      expect(w).toContain(h);
      expect(p).toContain(h);
    }
    for (const s of view.sections)
      for (const item of s.items)
        for (const t of [item.title!, item.text, ...(item.basedOn.length > 0 ? [`Based on: ${item.basedOn.join("; ")}`] : [])]) {
          expect(w, t).toContain(t);
          expect(p, t).toContain(t);
        }
    for (const para of view.summaryParagraphs) {
      expect(w).toContain(para);
      expect(p).toContain(para);
    }
  });
  it("the separation failure renders under 'Issues that need attention' and size/height under 'Requires verification'", () => {
    const body = text(web);
    const issues = body.indexOf("Issues that need attention");
    const verification = body.indexOf("Requires verification");
    expect(body.indexOf("Separation from the principal structure", issues)).toBeLessThan(verification);
    expect(body.indexOf("ADU size", verification)).toBeGreaterThan(verification);
    expect(body.indexOf("ADU height", verification)).toBeGreaterThan(verification);
  });
  it("'Based on' is shown only when it adds something beyond the title (it does not: titles are subjects)", () => {
    expect(explanationHtml(explanation)).not.toContain("Based on");
  });
  it("model text is escaped (no HTML injection through the explanation)", () => {
    const evil = buildExplanation(model("<img src=x onerror=alert(1)>", [[0, "<script>x</script> could not be determined"]]), [verify("<b>v</b>")]).explanation;
    for (const html of [explanationHtml(evil), renderToStaticMarkup(createElement(ExplanationSections, { explanation: evil }))]) expect(html).not.toMatch(/<img|<script|<b>/);
  });
});

describe("a long finding basis is stored and rendered, not lost", () => {
  it("is not capped by the stored schema", () => {
    const long = "A very long basis. ".repeat(200);
    const { explanation } = buildExplanation(model("Short."), [verify("Long subject", long)]);
    expect(explanation.requiresVerification[0]!.text.length).toBeGreaterThan(1500);
    expect(ExplanationSchema.safeParse(explanation).success).toBe(true);
    expect(buildExplanationView(explanation)!.sections[0]!.items[0]!.text).toBe(long);
    expect(explanationHtml(explanation)).toContain("A very long basis.");
  });
});

describe("reports generated before the structured contract", () => {
  const legacy = {
    text: "You're allowed to build this ADU on your lot.\n\n**Good News - These Requirements Are Met**\n\nThe setbacks are met.\n\n**Issues That Need Attention**\n\n- The ADU is too close to the house.\n- Another problem.\n\n**About This Screening**\n\nThis is a screening.",
    referencedFindingIds: ["0"],
  };
  it("without the artifact's findings (formatting only) they render as real headings and items, with no ** markers", () => {
    const view = buildExplanationView(legacy)!;
    expect(view.sections.map((s) => s.heading)).toEqual(["Good News - These Requirements Are Met", "Issues That Need Attention", "About This Screening"]);
    expect(view.sections[1]!.items.map((i) => i.text)).toEqual(["The ADU is too close to the house.", "Another problem."]);
    expect(renderToStaticMarkup(createElement(ExplanationSections, { explanation: legacy }))).not.toContain("**");
  });
  it("with the findings, NOTHING the legacy explanation says is shown - summary, heading, paragraph or bullet - and the findings-derived view is used", () => {
    const hostile = {
      text: "**You're allowed to build this ADU**\n\nYour property is eligible and no permit is needed.\n\n**You can build this project**\n\n- This will be approved.\n- Nothing prevents construction.",
      referencedFindingIds: [],
    };
    for (const stored of [legacy, hostile]) {
      const view = buildExplanationView(stored, aduFindings)!;
      const shown = [...view.summaryParagraphs, ...view.sections.flatMap((s) => [s.heading, ...s.items.flatMap((i) => [i.title ?? "", i.text])])].join(" | ");
      for (const phrase of ["allowed to build", "eligible", "no permit", "can build this project", "will be approved", "Nothing prevents", "Good News", "Issues That Need Attention"]) expect(shown, phrase).not.toContain(phrase);
      expect(view.summaryParagraphs[0]).toBe(deterministicSummary(aduFindings));
      expect(view.sections.map((s) => s.heading)).toEqual(["Requirements that appear satisfied", "Issues that need attention", "Requires verification"]);
      for (const out of [renderToStaticMarkup(createElement(ExplanationSections, { explanation: stored, findings: aduFindings })), explanationHtml(stored, aduFindings)]) {
        expect(out).not.toMatch(/allowed to build|eligible|no permit|can build this project|will be approved|Nothing prevents/);
        expect(out).toContain("does not currently meet");
        expect(out).toContain("Separation from the principal structure");
      }
    }
  });
  it("nothing stored (or an unrecognized shape) shows the unavailable notice, never an error", () => {
    expect(buildExplanationView(null)).toBeNull();
    expect(buildExplanationView({ nope: 1 })).toBeNull();
    expect(explanationHtml(null)).toContain("temporarily unavailable");
    expect(renderToStaticMarkup(createElement(ExplanationSections, { explanation: null }))).toContain("temporarily unavailable");
  });
});

describe("every project type uses the one common explanation system", () => {
  const cases: [string, Finding[], ModelExplanation][] = [
    ["shed", [pass("Shed rear setback", "The shed would be 12 ft from the rear lot line."), verify("Shed height")], model("Your shed is allowed.", [[0, "The shed would be 12 ft from the rear lot line, which is more than the minimum."]])],
    ["garage", [fail("Garage separation from the principal structure", "The garage would be 3 ft from the house; 5 ft is required."), pass("Garage lot coverage")], model("You can build this garage.", [[0, "The garage would be 3 ft from the house, and 5 ft is required, so this is not met."]])],
    ["fence", [pass("Fence height"), info("Visibility triangle notice")], model("Fence height is met.", [[1, "Applies near corners."]])],
    ["deck", [verify("Deck height above grade"), pass("Deck setbacks")], model("The deck is approved.")],
    ["adu", aduFindings, model("You're allowed to build this ADU on your lot.", goodNotes)],
  ];
  it.each(cases)("%s: structured, rendered as sections in web and PDF, no approval claim, no hidden failure or unresolved item", (_t, findings, m) => {
    const { explanation } = buildExplanation(m, findings);
    expect(ExplanationSchema.safeParse(explanation).success).toBe(true);
    for (const paragraph of explanation.summary.split("\n\n")) expect(claimsBroadApproval(paragraph)).toBe(false);
    for (const html of [renderToStaticMarkup(createElement(ExplanationSections, { explanation })), explanationHtml(explanation)]) {
      expect(html).toContain("Overall assessment");
      expect(html).toContain("About this screening");
      expect(html).not.toContain("**");
    }
    findings.forEach((f, i) => {
      if (f.complianceOutcome === "FAIL") expect(explanation.issues.some((x) => x.evidenceRefs.includes(i))).toBe(true);
      if (f.classification === "REQUIRES_VERIFICATION") expect(explanation.requiresVerification.some((x) => x.evidenceRefs.includes(i))).toBe(true);
    });
  });
});
