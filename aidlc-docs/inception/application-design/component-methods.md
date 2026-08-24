# Permit Preflight — Component Methods

High-level method names, purpose, and input/output **concepts** per component — not full
implementation signatures, exact types, or business-rule detail, per the approved scope guidance.

**Revised 2026-08-19** — added methods for Screening Request, Report Generation Job, Regulatory
Source Access; corrected Property Intelligence (no classification output), Regulatory Rules
Engine (explicit classification ownership), Order & Payment (payment-state-only scope), Rule
Research Assistant (evidence-bundle input), and Account (added `authorizeReportAccess`).

---

## Parcel Resolution
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `resolveByAddress` | Match a free-text address to candidate parcel(s) | address string | resolution result: single confirmed match, ambiguous candidate set, or no-match |
| `resolveByIdentifier` | Match a parcel ID/other supported identifier directly | parcel identifier | resolution result (same shape as above) |
| `confirmCandidate` | Record the user's disambiguation choice | resolution-in-progress state + chosen candidate | confirmed parcel reference |
| `getParcelCharacteristics` | Return structural parcel facts relevant to resolution (corner lot, merged/split, condo) | confirmed parcel reference | parcel-identity characteristics |

## Screening Request *(NEW)*
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `createRequest` | Start a new screening request for a workflow type | workflow type + confirmed parcel reference + (authenticated account, if any) | screening request (draft state) |
| `updateRequest` | Set/update project type and project-specific inputs, or vacant-land intake fields | screening request reference + field updates | updated screening request (draft state) |
| `validateRequest` | Check completeness/correctness without evaluating anything | screening request reference | validation result (valid / invalid with reasons) — consumed by PO-0 |
| `saveForLater` / `resumeRequest` | Persist/retrieve an in-progress request for an authenticated user | screening request reference (+ account) | saved/resumed screening request |
| `snapshotRequest` | Freeze the request into an immutable form at checkout time | validated screening request reference | immutable screening request snapshot (what payment is for and what generation evaluates) |

## Property Intelligence *(revised)*
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `buildPropertyContext` | Aggregate authoritative data into the normalized PropertyContext | confirmed parcel reference | `PropertyContext`: facts with evidence-quality state (value, provenance, retrieval timestamp, confidence, freshness/staleness, source-health, or explicit unavailable/insufficient state) |
| `getFactWithEvidenceQuality` | Retrieve a single property fact with its full evidence-quality record | parcel reference + fact type | fact value (or unavailable/insufficient marker) + evidence-quality state |

*Property Intelligence never returns a KNOWN/INFERRED/REQUIRES VERIFICATION classification — that
determination is made downstream by the Regulatory Rules Engine, which consumes these
evidence-quality states as input.*

## Data Source Registry
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `getSourceHealth` | Return current health/freshness for a source | source identifier | health state, last successful retrieval, freshness status |
| `recordIngestionResult` | Record a successful or failed retrieval attempt | source identifier + outcome | updated health state |
| `setManualOverride` | Operator marks a source healthy/unhealthy manually | source identifier + override state | updated health state |
| `listUnhealthySources` | Return all currently-unhealthy sources | (none) | list of unhealthy sources |
| `isKnownUnhealthy` | Cheap existing-state check (no live retrieval) | source identifier | boolean — used by the PO-0 readiness check |

## Spatial Analysis
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `checkContainment` | Is a geometry within the parcel? | parcel geometry + candidate geometry | boolean + measurement detail |
| `calculateSetbackDistance` | Distance from a proposed structure to a parcel boundary/yard line | parcel geometry + structure geometry + boundary type | distance value |
| `calculateLotCoveragePercentage` | % of parcel covered by structure(s) | parcel geometry + structure geometries | percentage |
| `checkCriticalAreaIntersection` | Does a geometry intersect a critical area layer? | geometry + critical-area layer reference | intersection result + affected percentage |
| `calculateBuildableEnvelope` | Derive a preliminary buildable area from constraints | parcel geometry + applicable constraint geometries | buildable-area geometry, or an explicit "not defensible" signal |
| `validateGeometry` | Confirm a geometry is well-formed | geometry input | validation result |

*Invoked exclusively by Report Generation Orchestrator Service, post-payment.*

## Regulatory Rules Engine *(revised)*
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `evaluateProject` | Evaluate a structure project type against ACTIVE rules and produce classified findings | Screening Request snapshot + PropertyContext (with evidence-quality states) + spatial results | classified findings (KNOWN / INFERRED / REQUIRES VERIFICATION) with supporting evidence |
| `evaluateVacantLand` | Evaluate zoning/constraints for vacant-land screening and produce classified findings + scenarios | Screening Request snapshot + PropertyContext + spatial results | classified findings + plausible-use scenarios |
| `getApplicableActiveRules` | Return the ACTIVE rule set relevant to a project type/zone | project type + zone | list of ACTIVE rule versions (with citation metadata) |

*This is the sole owner of the classification decision. It reads Property Intelligence's
evidence-quality states and Spatial Analysis's results as inputs; an unavailable/insufficient/stale
fact or an unhealthy source never silently produces a passing (KNOWN-favorable) finding.*

## Regulatory Rule Governance
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `acceptCandidatePackage` | Ingest a DRAFTED candidate rule package | candidate rule package (from Rule Research Assistant) | rule record at DRAFTED state |
| `recordTriage` | Founder confirms Tier 1/Tier 2 | rule record + tier decision + founder identity | rule record at TRIAGED state |
| `recordSourceVerification` | Record founder (Tier 1) or professional-informed founder (Tier 2) verification | rule record + verifier identity + verification notes | rule record at SOURCE VERIFIED state |
| `recordTestResults` | Attach automated test outcomes | rule record + test results | rule record at TESTED state (or rejected) |
| `approveRule` | Founder final approval | rule record + approver identity | rule record at APPROVED state |
| `activateRule` | Publish an APPROVED rule as ACTIVE | rule record | rule record at ACTIVE state, now consumable by Regulatory Rules Engine |
| `supersedeRule` | Replace an ACTIVE rule with a new version | prior rule reference + new rule record | old rule marked SUPERSEDED, new rule ACTIVE |
| `disableRule` | Emergency-stop an ACTIVE rule | rule reference + reason | rule marked disabled |

## Regulatory Source Access *(NEW)*
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `acquireSourceMaterial` | Obtain permitted-access source material for a rule-research need | target rule need (e.g. project type + constraint type) | permitted-source evidence bundle (source excerpts/summaries used for research, with citation/effective-date metadata) — never bulk-copied Municode text |
| `getOrdinanceHistory` | Retrieve amendment/change history for a code section | SMC section reference | ordinance history (numbers, effective dates) from City Clerk/Legistar |
| `getSourceCitation` | Return canonical citation metadata for a piece of source material | source material reference | citation (section, ordinance number, effective date) |

*Supplies Rule Research Assistant; never interprets or approves regulatory meaning.*

## AI Service / AI Provider Adapter
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `completeStructured` | Request schema-constrained model output | prompt/context + output schema | validated structured output, or a typed failure (invalid/unavailable) |
| `getModelConfig` | Resolve which model/tier to use for a given call class | call-class identifier (e.g. "report-explanation," "rule-research") | model/tier configuration |

## Report Explanation
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `explainFindings` | Produce plain-language narrative for a set of deterministic findings | finalized findings + evidence | narrative text referencing finding/evidence IDs, or "unavailable" signal |
| `explainVacantLandAssessment` | Produce the "preliminary screening assessment" narrative | finalized vacant-land findings | narrative text (explanation only) |
| `suggestDiligenceQuestions` | Generate suggested next diligence steps | finalized findings (esp. REQUIRES VERIFICATION items) | list of suggested questions/next steps |

## Rule Research Assistant *(revised)*
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `researchCandidateRule` | Synthesize a candidate rule from a permitted-source evidence bundle | permitted-source evidence bundle (from Regulatory Source Access) + target rule need | candidate rule package (spec, citations, reasoning, proposed tests, suggested tier) |

*Does not acquire source material itself — always consumes a bundle already supplied by
Regulatory Source Access.*

## Evidence & Report Artifact
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `assembleReport` | Create the immutable report snapshot | findings + evidence + (optional) explanation narrative + rule/data versions used | immutable report artifact |
| `renderWebReport` | Produce the web-report representation | report artifact reference | web-renderable report data |
| `renderPdf` | Produce the PDF representation | report artifact reference | PDF file/binary |
| `getReport` | Retrieve an existing report (internal use — see Account's `authorizeReportAccess`) | report reference | immutable report artifact |

## Report Generation Job *(NEW)*
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `createJob` | Idempotently create a job after verified payment | Screening Request snapshot reference + order reference | job record, state QUEUED |
| `claimJob` | Executor claims a pending job | job reference | job record, state IN_PROGRESS (or "already claimed" signal) |
| `recordRetryAttempt` | Log a retry after a transient failure | job reference + failure detail | updated job record |
| `completeJob` | Mark a job successfully finished | job reference + report artifact reference | job record, state COMPLETE |
| `failJob` | Mark a job as terminally failed | job reference + failure reason | job record, state FAILED (explicit terminal state) |
| `getJobStatus` | Read current job state | job reference | job record — used by customer-facing status display and by Admin/Support Service (ADM-4) |

## Order & Payment *(revised — payment state only)*
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `createCheckoutSession` | Create a Stripe Checkout Session | Screening Request snapshot reference + server-determined price | Checkout Session reference |
| `handleVerifiedWebhook` | Process a signature-verified Stripe webhook event | webhook event | idempotent payment-state transition (PENDING→PAID) |
| `getPaymentState` | Retrieve current payment/order state | order reference | payment state (PENDING / PAID / REFUNDED / failure-cancellation, exact enum deferred) |
| `processRefund` | Issue a refund | order reference + reason | refund confirmation + updated payment state |

*Does not read or write Report Generation Job state. A UI-facing "fulfillment status," if useful,
is derived by a caller reading both this component and Report Generation Job — never stored here.*

## Account *(revised — added authorizeReportAccess)*
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `createAccount` | Create an optional account | minimal account info | account reference |
| `linkGuestPurchase` | Link a prior guest purchase to an account | account reference + proof-of-control token/verification | linked report-ownership record |
| `getReportHistory` | List an authenticated user's own reports | authenticated account reference | list of owned report references (server-enforced ownership) |
| `authorizeReportAccess` *(NEW)* | The single report-access authorization boundary | report reference + (authenticated account OR guest access credential) | authorized / denied — never satisfied by a bare client-supplied report ID |
| `deleteAccount` | Delete an account per retention policy | account reference | deletion confirmation |

## Support Case
| Method | Purpose | Input concept | Output concept |
|---|---|---|---|
| `openCase` | Record a new support/investigation case | linked references (report/order/generation-job/rule) + description | case record |
| `recordOutcome` | Record investigation outcome and resulting action | case reference + outcome + action taken | updated case record |
| `getCase` | Retrieve a case for review | case reference | case record with full history |
