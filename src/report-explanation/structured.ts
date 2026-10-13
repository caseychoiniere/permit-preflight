/**
 * Structured report explanation (2026-10-13). The model explains deterministic findings; it may NOT strengthen them. The guarantees are structural, and the part that
 * cannot be (free prose) is kept small, conservative and droppable:
 *
 * STRUCTURAL (code decides, the model cannot influence it):
 *  - Which section a finding is explained under: its deterministic classification (definite failure -> issues, REQUIRES_VERIFICATION -> verification, pass -> satisfied).
 *  - Item titles: the finding's own subject. The model supplies no titles.
 *  - Coverage: every definite failure and every verification finding always appears, as its own item, whether or not the model wrote anything about it. Citing a finding
 *    cannot hide it. Met requirements are listed too (up to a cap).
 *  - The first summary paragraph is a deterministic statement of the overall result (counts, and which requirements are not met).
 *  - "About this screening" is fixed text.
 *  - Evidence references are durable: indices into the artifact's own immutable findings array (see remapEvidenceRefs), plus the subjects.
 *
 * CONSERVATIVE ACCEPTANCE (free prose; anything not accepted is replaced by the finding's own basis, so the failure mode is "plainer", never "stronger"):
 *  - A model note about a finding is accepted only if it adds no quantity the finding does not contain, keeps every quantity of a definite failure, carries the
 *    finding's polarity (a failure reads as unmet; an unresolved item reads as unresolved), and makes no approval or compliance claim.
 *  - A model summary paragraph is accepted only if it makes no approval claim and introduces no quantity that appears in no finding.
 *  These are text checks and are a safety net, not a proof; the structural items above are what the customer can rely on.
 *
 * Stored shape (version 2) is what the web report and the PDF both render, through one view model (buildExplanationView). Reports generated before this change hold
 * `{ text, referencedFindingIds }`; when the artifact's findings are supplied their prose is replaced by a findings-derived view (it cannot be validated), otherwise they
 * render as sections.
 */

import { z } from "zod";
import { ComplianceOutcome, FindingClassification } from "../regulatory-rules-engine/types.js";
// The same boundary the pipeline applies to the explanation input: per-hazard critical-area findings have their own report section.
import { isCriticalAreaFinding } from "../regulatory-rules-engine/evaluate.js";

/** The few fields of a finding the explanation reads. Both the rules engine's Finding and the report view's own finding type satisfy it. */
export interface FindingLike {
  subject: string;
  classification: string;
  complianceOutcome?: string;
  explanationBasis: string;
  supportingEvidence: string[];
}

// ---- schemas -----------------------------------------------------------------------------------------------------------------------------------------------

/** What the model must return: context for the summary, and a plain-language note about each finding it chooses to explain. No titles, no grouping, no sections. */
export const ModelExplanationSchema = z.object({
  summary: z.string().trim().min(1).max(8000),
  notes: z.array(
    z.object({
      /** Index into the finding list the model was given (the [N] labels in the prompt). */
      ref: z.number().int().min(0),
      text: z.string().trim().min(1).max(8000),
    })
  ),
});
export type ModelExplanation = z.infer<typeof ModelExplanationSchema>;

/**
 * No length caps here, deliberately: the stored text can be a finding's own full basis (used whenever a note is not accepted), which is longer than anything a model
 * is asked to write. A cap would make a valid stored explanation fail to parse at render time and vanish from the report.
 */
const StoredItemSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  /** Indices into the artifact's `findings` array (immutable once stored). Before remapEvidenceRefs runs they index the list the model was given. */
  evidenceRefs: z.array(z.number().int().min(0)),
  /** The subjects of the cited findings, for display and as a fallback when a reference cannot be resolved. */
  subjects: z.array(z.string()),
});

/** What is stored in the artifact and rendered. */
export const ExplanationSchema = z.object({
  version: z.literal(2),
  summary: z.string().min(1),
  satisfied: z.array(StoredItemSchema),
  issues: z.array(StoredItemSchema),
  requiresVerification: z.array(StoredItemSchema),
  additionalConsiderations: z.array(StoredItemSchema),
  aboutScreening: z.string().min(1),
});
export type Explanation = z.infer<typeof ExplanationSchema>;
export type ExplanationItem = z.infer<typeof StoredItemSchema>;

/** Reports generated before the structured contract. */
export const LegacyExplanationSchema = z.object({ text: z.string(), referencedFindingIds: z.array(z.string()).optional() });

export type SectionKey = "satisfied" | "issues" | "requiresVerification" | "additionalConsiderations";

// ---- deterministic status ----------------------------------------------------------------------------------------------------------------------------------

export type FindingSeverity = "FAIL" | "VERIFY" | "PASS" | "INFO";

export function findingSeverity(f: FindingLike): FindingSeverity {
  if (f.complianceOutcome === ComplianceOutcome.FAIL) return "FAIL";
  if (f.classification === FindingClassification.REQUIRES_VERIFICATION) return "VERIFY";
  if (f.complianceOutcome === ComplianceOutcome.PASS) return "PASS";
  return "INFO";
}

const SECTION_FOR_SEVERITY: Record<FindingSeverity, SectionKey> = { FAIL: "issues", VERIFY: "requiresVerification", PASS: "satisfied", INFO: "additionalConsiderations" };

export type OverallStatus = "HAS_FAILURE" | "HAS_VERIFICATION" | "ALL_MET" | "NOTHING_CHECKED";

export interface StatusCounts {
  fail: number;
  verify: number;
  pass: number;
  info: number;
}

export function countFindings(findings: FindingLike[]): StatusCounts {
  const c: StatusCounts = { fail: 0, verify: 0, pass: 0, info: 0 };
  for (const f of findings) {
    const s = findingSeverity(f);
    if (s === "FAIL") c.fail++;
    else if (s === "VERIFY") c.verify++;
    else if (s === "PASS") c.pass++;
    else c.info++;
  }
  return c;
}

export function overallStatus(findings: FindingLike[]): OverallStatus {
  const c = countFindings(findings);
  if (c.fail > 0) return "HAS_FAILURE";
  if (c.verify > 0) return "HAS_VERIFICATION";
  return c.pass > 0 ? "ALL_MET" : "NOTHING_CHECKED";
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function listSubjects(subjects: string[]): string {
  const shown = subjects.slice(0, 3);
  const rest = subjects.length - shown.length;
  const joined = shown.length <= 1 ? shown.join("") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${joined}, and ${rest} more` : joined;
}

/**
 * The first paragraph of every summary, built from the deterministic findings alone: what the overall result is, and which requirements are not met. It says nothing
 * a finding does not say, and it is shown whatever the model returns, so no summary can lead with a stronger claim than the findings support.
 */
export function deterministicSummary(findings: FindingLike[]): string {
  const c = countFindings(findings);
  const status = overallStatus(findings);
  const failing = findings.filter((f) => findingSeverity(f) === "FAIL").map((f) => f.subject);
  if (status === "HAS_FAILURE") {
    return `This screening found ${plural(c.fail, "requirement", "requirements")} this proposal does not currently meet (${listSubjects(failing)})${c.verify > 0 ? ` and ${plural(c.verify, "more that needs", "more that need")} verification` : ""}. ${plural(c.pass, "requirement appears", "requirements appear")} to be met. Start with the issues below, then the items that need verification.`;
  }
  if (status === "HAS_VERIFICATION") {
    return `No requirement was found to be unmet, but ${plural(c.verify, "item still needs", "items still need")} verification before this proposal can be considered feasible. ${plural(c.pass, "requirement appears", "requirements appear")} to be met. Start with the items below that need verification.`;
  }
  if (status === "ALL_MET") return "Every requirement this screening could check appears to be met. This is a screening, not a permit decision.";
  return "This screening did not reach a result on any requirement. The details are below.";
}

/** Fixed text: nothing in it is model output, so it cannot assert a claim no finding supports. */
export const ABOUT_SCREENING_TEXT =
  "This is an automated screening based on public data and the details you entered, using the rules in effect when it was generated. It is not a permit decision. SDCI makes the final determination.";

// ---- text checks (a safety net; see the module comment) ----------------------------------------------------------------------------------------------------

/** Approval of a project or proposal. A use being allowed in a zone ("ADUs are an allowed residential use in this zoning context") does not match; "this ADU is allowed" does. */
const BROAD_APPROVAL: RegExp[] = [
  /\byou(?:'re|’re| are)\s+(?:allowed|permitted|able|free|clear|good)\s+to\s+(?:build|construct|add|install|put|proceed|go)\b/i,
  /\byou\s+(?:can|may|could)\s+(?:safely\s+|simply\s+|go ahead and\s+)?(?:build|construct|proceed|move forward)\b/i,
  /\b(?:this|your|the)\s+(?:proposed\s+)?(?:project|proposal|adu|accessory dwelling unit|shed|garage|fence|deck|design|plan|structure|property)\s+(?:is|are|appears?\s+to\s+be|looks?|seems?\s+to\s+be)\s+(?:fully\s+|completely\s+|currently\s+)?(?:allowed|permitted|approved|compliant|feasible|buildable|viable|code[- ]compliant|good to go|ready|in compliance)\b/i,
  /\b(?:project|proposal|adu|shed|garage|fence|deck|design|plan)\s+(?:is|are)\s+(?:clear|cleared)\s+to\b/i,
  /\bgood to go\b/i,
  /\b(?:fully|completely|entirely)\s+(?:compliant|permitted|allowed|code[- ]compliant)\b/i,
  /\bcompl(?:y|ies) with (?:all|every|the code|code|the zoning)\b/i,
  /\bmeets? (?:all|every|the) (?:the )?(?:code|zoning code|requirements|standards|rules)\b/i,
  /\bnothing (?:prevents|stops|blocks|stands in the way)\b/i,
  /\b(?:no|without any)\s+(?:obstacles|barriers|problems|issues|concerns)\b/i,
  /\bsafe to (?:build|proceed|move forward)\b/i,
  /\b(?:green light|go ahead)\b/i,
  /\bfree and clear\b/i,
  // Project-level eligibility is a conclusion no finding states; "ADUs are allowed in this zoning context" (a finding about the use) is the narrow form that is permitted.
  /\b(?:property|lot|site|parcel|home|house|project|proposal|adu|shed|garage|fence|deck)\s+(?:\w+\s+){0,2}(?:is|are|appears?(?:\s+to\s+be)?|seems?(?:\s+to\s+be)?|looks?(?:\s+to\s+be)?)\s+(?:\w+\s+)?(?:eligible|qualified|entitled)\b/i,
  /\bqualif(?:y|ies|ied)\s+(?:for|to)\b/i,
];

/** Promises about the outcome of the city's review. */
const NEVER_STATE: RegExp[] = [/\b(?:will|would|should)\s+(?:be\s+|likely be\s+)?(?:approved|qualify|pass)\b/i, /\bis\s+approved\b/i, /\bguarantee[sd]?\b/i, /\bwill\s+(?:be\s+)?(?:granted|issued)\b/i];

/**
 * In a note about a failure or an unresolved item, a statement that it is satisfied or allowed strengthens the finding it explains. Negated forms ("does not meet",
 * "is not compliant", "cannot comply") are not claims and are removed before checking; so is a remedy ("increase the separation to comply"), because only the third-person
 * claims ("complies", "meets", "is allowed", "is met", "approved") are tested.
 */
const NEGATED_COMPLIANCE =
  /\b(?:does not|doesn't|do not|don't|did not|cannot|can't|could not|couldn't|not|never|no longer|fails? to|failed to|unable to)\s+(?:yet\s+|currently\s+|fully\s+|clearly\s+|be\s+)?(?:meet|meets|satisfy|satisfies|comply|complies|conform|conforms|compliant|in compliance|allowed|permitted|acceptable|satisfied|met|approved)\b|\bnon-?compliant\b/gi;
const COMPLIANCE_CLAIM: RegExp[] = [/\b(?:complies|compliant|in compliance)\b/i, /\b(?:is|are)\s+(?:allowed|permitted|acceptable|fine|satisfied|met)\b/i, /\bwill\s+qualify\b/i, /\b(?:is|are|was|been)\s+(?:already\s+)?approved\b/i, /\b(?:meets|satisfies)\b/i];
const claimsCompliance = (text: string): boolean => matchesAny(text.replace(NEGATED_COMPLIANCE, " "), COMPLIANCE_CLAIM);

/** A note about a definite failure must read as unmet; about an unresolved item, as unresolved. */
const ADVERSE_MARKER = /\b(?:not|no|only|less than|short of|shorter|closer|under|below|exceed(?:s|ed)?|over|beyond|more than|fails?|failed|too|violat\w*|insufficient|does not|doesn't|isn't|aren't)\b/i;
const UNCERTAIN_MARKER = /\b(?:could not|couldn't|cannot|can't|unable|not (?:known|available|confirmed|determined|clear|certain|yet)|unclear|unknown|unresolved|depends?|depending|need(?:s)?|verify|verification|confirm|review|may|might|whether|if)\b/i;

const matchesAny = (text: string, patterns: RegExp[]): boolean => patterns.some((p) => p.test(text));

/** Exported for tests: does this text claim approval of the whole proposal, or promise the city's decision? */
export function claimsBroadApproval(text: string): boolean {
  return matchesAny(text, BROAD_APPROVAL) || matchesAny(text, NEVER_STATE);
}

/** Numbers that state a quantity (a number followed by a unit), bound to a normalized unit: "5 ft" does not authorize "5 stories". Citations such as "SMC 23.44.100" are not quantities. */
const QUANTITY = /(\d[\d,]*(?:\.\d+)?)\s*(?:-|\s)?(sq\.?\s?ft|square feet|square foot|ft|feet|foot|%|percent|inches|inch|in\b|stories|story|units?|bedrooms?|trees?)/gi;
const UNIT_CLASS: [RegExp, string][] = [[/^(?:sq|square)/i, "sqft"], [/^(?:ft|feet|foot)$/i, "ft"], [/^(?:%|percent)$/i, "pct"], [/^(?:in|inch|inches)$/i, "in"], [/^stor/i, "story"], [/^unit/i, "unit"], [/^bedroom/i, "bedroom"], [/^tree/i, "tree"]];
export function quantitiesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(QUANTITY)) {
    const unit = UNIT_CLASS.find(([re]) => re.test(m[2]!))?.[1] ?? m[2]!.toLowerCase();
    out.add(`${Number(m[1]!.replace(/,/g, ""))} ${unit}`);
  }
  return out;
}

// ---- extractive grounding ------------------------------------------------------------------------------------------------------------------------------------
// A note is a plain-language rewording of ONE finding, so it must stay close to that finding's own words in both directions: it keeps most of the finding's content
// words (the substance is retained, so a vague note cannot replace the reason a finding failed or is unresolved), and it adds almost no content words the finding
// does not contain (it cannot introduce an unsupported claim). Summary paragraphs are held to the same standard against all findings together.

const STOPWORDS = new Set(
  "about above after again against also although always among another because been before being below between both but cannot could does doing done down during each either else even ever every from further have having here however into itself just least less like made make many more most much must neither never none nor not only other otherwise ought over rather same shall should since some such than that their them then there these they this those though through thus under until upon very were what when where whether which while whom whose will with within without would your yours you".split(" ")
);
/** Words a plain-language rewording adds that carry no claim of their own. */
const GLUE = new Set(
  "means mean system remains remain unresolved requirement requirements proposal proposed need needs needed attention entered reported therefore limit limits required requires resolved confirmed determined information available data further review verify verified verification applies apply still additional details specific current currently seattle report this-screening screening homeowner overall problem issue issues items item residential zoning context zone meet minimum maximum comply complying compliant compliance".split(" ")
);

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .map((w) => (w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/** Share of the source's content words that the text keeps (substance retained), and share of the text's content words that the source supports (nothing added). */
export function groundingScores(text: string, source: string): { coverage: number; precision: number } {
  const src = new Set(contentTokens(source));
  const tokens = new Set(contentTokens(text));
  if (src.size === 0 || tokens.size === 0) return { coverage: 1, precision: 1 };
  let kept = 0;
  for (const t of src) if (tokens.has(t)) kept++;
  const claimBearing = [...tokens].filter((t) => !GLUE.has(t));
  let supported = 0;
  for (const t of claimBearing) if (src.has(t)) supported++;
  return { coverage: kept / src.size, precision: claimBearing.length === 0 ? 1 : supported / claimBearing.length };
}

const MIN_NOTE_COVERAGE = 0.5;
const MIN_NOTE_PRECISION = 0.7;
const MIN_SUMMARY_PRECISION = 0.7;

function findingText(f: FindingLike): string {
  return [f.subject, f.explanationBasis, ...f.supportingEvidence].join(" ");
}

/** Markdown markers are removed rather than shown: the report renders real headings and lists. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/`/g, "")
    .trim();
}

/** Why a note about this finding is not accepted, or undefined when it is. Pure. */
export function rejectNote(note: string, finding: FindingLike): string | undefined {
  const severity = findingSeverity(finding);
  if (claimsBroadApproval(note)) return "approval claim";
  const source = quantitiesIn(findingText(finding));
  const noteQuantities = quantitiesIn(note);
  for (const q of noteQuantities) if (!source.has(q)) return "new quantity";
  const grounding = groundingScores(note, findingText(finding));
  if (grounding.precision < MIN_NOTE_PRECISION) return "adds claims the finding does not make";
  if (severity === "FAIL" || severity === "VERIFY") {
    // The reason a finding failed or is unresolved is its substance: a note that drops most of it does not replace it.
    if (grounding.coverage < MIN_NOTE_COVERAGE) return "drops the substance of the finding";
    if (claimsCompliance(note)) return "compliance claim on an adverse finding";
    // A definite failure keeps every figure it rests on.
    if (severity === "FAIL") for (const q of quantitiesIn(finding.explanationBasis)) if (!noteQuantities.has(q)) return "dropped quantity";
    if (severity === "FAIL" && !ADVERSE_MARKER.test(note)) return "does not read as unmet";
    if (severity === "VERIFY" && !UNCERTAIN_MARKER.test(note)) return "does not read as unresolved";
  }
  return undefined;
}

// ---- building the stored explanation -----------------------------------------------------------------------------------------------------------------------

export interface EnforcementReport {
  /** Notes that were not accepted (the finding's own basis is shown instead). */
  rejectedNotes: number;
  /** Notes citing a finding that does not exist, or a finding already noted. */
  ignoredNotes: number;
  /** Model summary paragraphs not accepted. */
  rejectedSummaryParagraphs: number;
}

/** Above this many met requirements, only those the model explained are listed. */
const MAX_UNNOTED_PASSES = 8;
const MAX_MODEL_SUMMARY_PARAGRAPHS = 2;
const MAX_MODEL_SUMMARY_PARAGRAPH_CHARS = 1200;

function paragraphsOf(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Builds the stored explanation from the deterministic findings and the model's output. The structure is decided here; the model contributes only the notes and
 * summary paragraphs that pass acceptance. `evidenceRefs` index `findings` (the list the model was given); the pipeline remaps them to the stored findings array. Pure.
 */
export function buildExplanation(model: ModelExplanation, findings: FindingLike[]): { explanation: Explanation; report: EnforcementReport } {
  const report: EnforcementReport = { rejectedNotes: 0, ignoredNotes: 0, rejectedSummaryParagraphs: 0 };

  const notes = new Map<number, string>();
  for (const n of model.notes) {
    if (!findings[n.ref] || notes.has(n.ref)) {
      report.ignoredNotes++;
      continue;
    }
    notes.set(n.ref, stripMarkdown(n.text));
  }

  const sections: Record<SectionKey, ExplanationItem[]> = { satisfied: [], issues: [], requiresVerification: [], additionalConsiderations: [] };
  // What appears feasible matters to the customer, so met requirements are always listed (with the finding's own text when the model wrote nothing accepted), unless there
  // are so many that listing them all would bury the rest; then only the ones the model chose to explain appear.
  const listAllPasses = findings.filter((f) => findingSeverity(f) === "PASS").length <= MAX_UNNOTED_PASSES;
  findings.forEach((f, i) => {
    const severity = findingSeverity(f);
    const note = notes.get(i);
    // Definite failures and unresolved findings are always present. Informational findings appear when the model chose to explain them.
    if (severity !== "FAIL" && severity !== "VERIFY" && note === undefined && !(severity === "PASS" && listAllPasses)) return;
    let text = f.explanationBasis;
    if (note !== undefined) {
      const why = rejectNote(note, f);
      if (why === undefined) text = note;
      else report.rejectedNotes++;
    }
    sections[SECTION_FOR_SEVERITY[severity]].push({ title: f.subject, text, evidenceRefs: [i], subjects: [f.subject] });
  });

  const allText = findings.map(findingText).join(" ");
  const allQuantities = quantitiesIn(allText);
  const accepted: string[] = [];
  for (const raw of paragraphsOf(stripMarkdown(model.summary))) {
    if (accepted.length >= MAX_MODEL_SUMMARY_PARAGRAPHS) break;
    const newQuantity = [...quantitiesIn(raw)].some((q) => !allQuantities.has(q));
    const unsupported = groundingScores(raw, allText).precision < MIN_SUMMARY_PRECISION;
    if (claimsBroadApproval(raw) || newQuantity || unsupported || raw.length > MAX_MODEL_SUMMARY_PARAGRAPH_CHARS) {
      report.rejectedSummaryParagraphs++;
      continue;
    }
    accepted.push(raw);
  }

  return { explanation: { version: 2, summary: [deterministicSummary(findings), ...accepted].join("\n\n"), ...sections, aboutScreening: ABOUT_SCREENING_TEXT }, report };
}

/** Every identity-relevant field of a finding, so copies are told apart by more than subject and basis. */
const identity = (f: FindingLike): string => JSON.stringify([f.subject, f.classification, f.complianceOutcome ?? null, f.explanationBasis, f.supportingEvidence]);

/**
 * Makes `evidenceRefs` durable: from indices into the list the model was given (filtered, in generation order) to indices into the artifact's own findings array, which
 * is immutable once stored. Resolution is exact and one-to-one: each explained finding is matched to a distinct stored finding, by object identity first, then by every
 * identity-relevant field (consuming matches, in order, so findings that are equal in every field still resolve one-to-one). A reference that cannot be resolved is
 * dropped; the item keeps its subjects.
 */
export function remapEvidenceRefs(explanation: Explanation, explained: FindingLike[], persisted: FindingLike[]): Explanation {
  const used = new Set<number>();
  const mapping = new Map<number, number>();
  explained.forEach((f, i) => {
    const at = persisted.indexOf(f);
    if (at >= 0 && !used.has(at)) {
      used.add(at);
      mapping.set(i, at);
    }
  });
  explained.forEach((f, i) => {
    if (mapping.has(i)) return;
    const key = identity(f);
    const at = persisted.findIndex((p, j) => !used.has(j) && identity(p) === key);
    if (at >= 0) {
      used.add(at);
      mapping.set(i, at);
    }
  });
  const remap = (items: ExplanationItem[]): ExplanationItem[] =>
    items.map((item) => ({ ...item, evidenceRefs: item.evidenceRefs.map((r) => mapping.get(r)).filter((x): x is number => x !== undefined) }));
  return { ...explanation, satisfied: remap(explanation.satisfied), issues: remap(explanation.issues), requiresVerification: remap(explanation.requiresVerification), additionalConsiderations: remap(explanation.additionalConsiderations) };
}

// ---- view model (shared by the web report and the PDF) -----------------------------------------------------------------------------------------------------

export interface ExplanationViewItem {
  title?: string;
  text: string;
  /** Subjects of the findings this item rests on (omitted when the title already says it). */
  basedOn: string[];
}
export interface ExplanationViewSection {
  key: SectionKey | "legacy";
  heading: string;
  items: ExplanationViewItem[];
}
export interface ExplanationView {
  summaryParagraphs: string[];
  sections: ExplanationViewSection[];
  about: string;
}

export const SECTION_HEADINGS: Record<SectionKey, string> = {
  satisfied: "Requirements that appear satisfied",
  issues: "Issues that need attention",
  requiresVerification: "Requires verification",
  additionalConsiderations: "Other requirements to be aware of",
};
export const SECTION_ORDER: SectionKey[] = ["satisfied", "issues", "requiresVerification", "additionalConsiderations"];
export const SUMMARY_HEADING = "Overall assessment";
export const ABOUT_HEADING = "About this screening";


/**
 * A pre-structure explanation, formatting only: split its `**Heading**` / `#` lines and bullets into real sections instead of showing the markers. Used only when the
 * report's findings are not available to build the safe view from (see buildExplanationView).
 */
function legacyView(text: string): ExplanationView {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const summaryParagraphs: string[] = [];
  const sections: ExplanationViewSection[] = [];
  let current: ExplanationViewSection | undefined;
  let buffer: string[] = [];
  const flush = () => {
    const joined = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    if (!joined) return;
    if (current) current.items.push({ text: joined, basedOn: [] });
    else summaryParagraphs.push(joined);
  };
  const clean = (s: string) => s.replace(/\*\*/g, "").replace(/__/g, "").trim();
  for (const raw of lines) {
    const line = raw.trim();
    const heading = /^\*\*(.+?)\*\*:?$/.exec(line) ?? /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      current = { key: "legacy", heading: clean(heading[1]!).replace(/\s*[\u2013-]\s*/, " - "), items: [] };
      sections.push(current);
    } else if (line === "") {
      flush();
    } else if (/^[-*\u2022]\s+/.test(line)) {
      flush();
      buffer.push(clean(line.replace(/^[-*\u2022]\s+/, "")));
      flush();
    } else {
      buffer.push(clean(line));
    }
  }
  flush();
  return { summaryParagraphs: summaryParagraphs.length > 0 ? summaryParagraphs : paragraphsOf(clean(text)), sections: sections.filter((s) => s.items.length > 0), about: "" };
}

/**
 * Normalizes whatever is stored for a report's explanation into what is rendered. Empty sections are never produced. Null when there is nothing to show.
 * `findings` (the artifact's own) replace a pre-structure explanation with a findings-derived view; they are not needed for version 2, which was built from the findings already.
 */
export function buildExplanationView(raw: unknown, findings?: FindingLike[]): ExplanationView | null {
  const v2 = ExplanationSchema.safeParse(raw);
  if (v2.success) {
    const e = v2.data;
    const sections: ExplanationViewSection[] = [];
    for (const key of SECTION_ORDER) {
      const items = e[key];
      if (items.length > 0) sections.push({ key, heading: SECTION_HEADINGS[key], items: items.map((i) => ({ title: i.title, text: i.text, basedOn: i.subjects.filter((subject) => subject !== i.title) })) });
    }
    return { summaryParagraphs: paragraphsOf(e.summary), sections, about: e.aboutScreening };
  }
  const legacy = LegacyExplanationSchema.safeParse(raw);
  if (legacy.success && legacy.data.text.trim() !== "") {
    // Nothing a pre-structure explanation says (summary, headings, paragraphs, bullets) can be validated against the findings, so with the findings available it is not
    // shown at all: the view is built from the findings (deterministic result, each finding under its classification, with its own basis). Formatting-only rendering
    // is the fallback for a caller that has no findings to build from.
    const explained = (findings ?? []).filter((f) => !isCriticalAreaFinding(f.subject));
    if (explained.length > 0) return buildExplanationView(buildExplanation({ summary: "", notes: [] }, explained).explanation);
    return legacyView(legacy.data.text);
  }
  return null;
}
