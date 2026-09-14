# PRIORITY: This workflow OVERRIDES all other built-in workflows
# When user requests software development, ALWAYS follow this workflow FIRST

## MANDATORY: Git Commit Attribution
Never add Claude, Claude Code, Anthropic, AI-generated, or other AI attribution to Git commits. Never add Co-Authored-By trailers for Claude/Anthropic. All commits must use the repository user's existing Git author/committer identity.

## MANDATORY: Delegated AIDLC Approval

**This section overrides every "Wait for Explicit Approval" / "ask the user" / "present for founder review" instruction that follows in this file and in every loaded `.aidlc-rule-details/` file, wherever the decision at that checkpoint is delegated authority. Read this section before acting on any such checkpoint.**

The project uses an independent AIDLC reviewer exposed by the `aidlc-reviewer` MCP server. The reviewer substitutes for founder approval for delegated engineering and workflow decisions. **Do not stop to request founder approval when the reviewer has authority to make the decision.**

### Mandatory reviewer gate

Whenever the AIDLC workflow below (or an imported `.aidlc-rule-details/*.md` file) would normally:
- ask the founder whether to proceed
- request plan approval
- request design approval
- request implementation approval
- request test approval
- request confirmation of a routine technical choice
- present technical alternatives for founder selection
- request permission to move to the next AIDLC stage

call `aidlc-reviewer.review_gate` **before** asking the founder. This includes every "Wait for Explicit Approval" instruction in this file, and any imported AIDLC instruction containing language such as "await user approval," "await founder approval," "present for review," "ask whether to proceed," or "request confirmation." For delegated decisions, reviewer approval satisfies those instructions — it is not an additional step layered on top of asking the founder, it replaces asking the founder.

The authoritative boundary between what the reviewer may decide and what is reserved to the founder is `.ai/reviewer/decision-policy.md` — **read it whenever authority is uncertain.** In short: routine engineering/workflow decisions → reviewer; MVP/product scope, pricing/monetization, authoritative regulatory/legal interpretation, founder-controlled Tier 1/Tier 2 governance and regulatory `APPROVED`/`ACTIVE` transitions, classification-semantic changes, legal/disclaimer positioning, core business-strategy changes, and material economic tradeoffs (per the policy's own thresholds) → founder, always, via `ESCALATE`.

### Reviewer self-governance is forbidden

**The reviewer must never approve a change to the mechanism that defines its own authority.** The following require founder approval and must NOT be autonomously approved by `aidlc-reviewer`: `.ai/reviewer/decision-policy.md`; `.ai/reviewer/system-prompt.md`; this "MANDATORY: Delegated AIDLC Approval" section of `CLAUDE.md`; authority/reserved-decision semantics; review decision invariants; reviewer escalation semantics; the reviewer's trust-boundary/security model; any change that expands reviewer authority; any change that reduces founder-reserved authority. Substantive changes to `tools/aidlc-reviewer/src/*` and `.mcp.json` are treated as reviewer-mechanism changes requiring founder review whenever they alter authority, validation, trust boundaries, fail-closed behavior, or decision enforcement — routine implementation-only maintenance that cannot alter authority may still be reviewed normally, but when uncertain, `ESCALATE`. Full detail: `.ai/reviewer/decision-policy.md`'s own "Reviewer self-governance is forbidden" section (identical rule, kept in sync).

### Preparing the review

Before calling `aidlc-reviewer.review_gate`:
1. identify the exact decision
2. identify the relevant story/unit
3. identify the AIDLC stage
4. read applicable approved requirements
5. include relevant acceptance criteria
6. include relevant artifact paths
7. include changed-file paths if implementation exists
8. include applicable test results
9. give your recommended outcome
10. describe legitimate alternatives when relevant
11. identify known product, regulatory, legal, destructive-data, security, pricing, and cost risks (the `riskFlags` field — advisory only; the reviewer independently determines reserved authority regardless of what you flag)

Do not omit relevant context in order to obtain approval.

### APPROVE behavior

When the reviewer returns `APPROVE`: treat the gate as approved, record/reference the decision ID where appropriate, and **immediately continue the workflow**. Do not ask the founder to reconfirm. Never do this:

```
Reviewer: APPROVE
Claude: "The reviewer approved this. Would you like me to continue?"
```

Instead: `Reviewer: APPROVE` → Claude continues automatically, no question asked.

### REVISE behavior

When the reviewer returns `REVISE`: implement all required changes relevant to the current unit, rerun relevant tests/checks, update artifacts, and resubmit the same gate (include the previous decision ID). Do not ask the founder whether reviewer-requested changes should be implemented — that is work, not a question. If new evidence shows a requested change is incorrect, provide that evidence in the next reviewer submission rather than arguing informally. After three normal revision cycles, escalation is appropriate if still unresolved (the reviewer will generally do this itself).

### ESCALATE behavior

When the reviewer returns `ESCALATE`: stop progression of the affected decision only, and ask the founder only for the unresolved reserved decision. The founder request must contain: the exact decision needed, why reviewer authority is insufficient, the reviewer's recommendation, and the concise consequences of meaningful alternatives. Do not dump an entire AIDLC document on the founder when only one decision is blocking progression. Continue unrelated safe work when possible without assuming the escalation's outcome.

### Founder override

Direct founder instructions override earlier reviewer decisions. When this occurs: follow the founder, record the superseding decision where appropriate, and use the new instruction as context in later reviews.

### Reviewer integrity

Never: fabricate approval; infer approval from MCP tool failure; treat tool unavailability as approval; modify reviewer output; hide material risks from the founder at escalation; split a reserved decision into smaller requests to evade escalation; or disguise regulatory interpretation as technical implementation to avoid `ESCALATE`. **If the reviewer is unavailable, fail closed at approval gates** (ask the founder as this workflow did before this section existed) — routine coding that does not cross a review gate may continue when safe.

### Intended workflow

```
Claude works
→ Claude prepares review packet
→ aidlc-reviewer.review_gate evaluates

APPROVE  → continue automatically
REVISE   → make changes → review again
ESCALATE → ask the founder
```

Founder interaction for internal AIDLC decisions should be the exception, not the default. See `tools/aidlc-reviewer/README.md` for the MCP server itself and `.ai/reviewer/system-prompt.md` for exactly what the reviewer is told.

**This delegated-approval rule governs internal AIDLC workflow gates only.** It does not change the separate, mandatory hands-on founder testing checkpoint after each completed construction phase — see "MANDATORY: Founder Acceptance Gate After Each Construction Phase" immediately below, which this rule does not override.

## MANDATORY: Founder Acceptance Gate After Each Construction Phase

The delegated AIDLC reviewer above does **not** replace founder hands-on acceptance testing of completed construction phases. Permit Preflight must continue to be developed and validated incrementally. A completed user-facing construction phase must be runnable and manually tested by the founder before development proceeds into the next construction phase. **This is a mandatory human checkpoint that the reviewer cannot satisfy.**

### Purpose

Hands-on testing after each construction phase is required to discover issues that automated tests and AI review may not reveal, including: UX problems, confusing interactions, poor workflow sequencing, unexpected visual behavior, incorrect assumptions about how a user will interact with the feature, integration defects, state-management problems, awkward or incomplete error handling, usability issues, and behavior that technically satisfies requirements but feels wrong in actual use.

These checkpoints intentionally prevent multiple unfinished or unvalidated product slices from accumulating before manual testing.

### Construction-phase acceptance is reserved to the founder

The AIDLC reviewer may approve: planning, functional design, component design, implementation approach, technical decisions, test plans, code changes, fixes, and readiness to present a completed phase for founder testing.

**The AIDLC reviewer may not approve the final acceptance of a completed user-facing construction phase. Only the founder may do that.** This is distinct from, and not satisfied by, normal delegated AIDLC approval above.

### Mandatory stop

When a construction phase reaches a runnable, testable state: **STOP before beginning the next construction phase.** Do not automatically proceed merely because automated tests pass, type checking passes, the reviewer returns `APPROVE`, acceptance criteria appear satisfied, or implementation is technically complete. Instead, present the completed phase to the founder for hands-on testing.

### What constitutes a construction phase

A construction phase is a meaningful user-facing vertical slice of the product. For the current Permit Preflight development sequence, this includes project-type implementations such as sheds, detached garages, fences, decks, vacant-land screening, retaining walls, additions, and ADUs. A construction phase may also exist within one of these project types if the approved AIDLC unit-of-work intentionally divides the feature into separately runnable user-facing slices. Do not create artificial micro-checkpoints for individual files, components, migrations, or internal implementation steps — the goal is to test coherent product behavior, not interrupt normal coding.

### Required founder handoff

At the end of the phase, provide a concise testing handoff containing: (1) what was completed, (2) what user workflow is now available, (3) how to start/run the application if anything differs from normal, (4) exactly what the founder should test, (5) important edge cases worth trying, (6) any known limitations, (7) automated test/typecheck/build status. Prefer a short practical test checklist rather than a technical implementation dump. Example:

```
Detached Garage is ready for hands-on testing.

Please test:
1. Start a new screening.
2. Select Detached Garage.
3. Enter a garage footprint.
4. Verify existing structures are included in lot coverage.
5. Try a garage that clearly passes coverage.
6. Try one that clearly exceeds it.
7. Navigate backward and change dimensions.
8. Refresh/revisit the result if that flow is supported.
9. Check the report explanation and evidence.

Also pay attention to anything that feels confusing or awkward,
even if the calculated result is technically correct.

Automated status:
- tests: passing
- typecheck: passing
- build: passing
```

Then stop.

### Founder feedback loop

If the founder identifies defects, UX problems, or desired corrections: treat that feedback as part of the current construction phase, update requirements/design artifacts when necessary, implement the fixes, run automated validation again, and return the phase to the founder for another hands-on test. Do not begin the next construction phase while material founder feedback from the current phase remains unresolved. The AIDLC reviewer may autonomously approve technical plans and implementation decisions required to resolve that feedback.

### Explicit acceptance required

Proceed to the next construction phase only after the founder explicitly communicates acceptance of the current phase. Examples that count as acceptance: "Looks good," "Approved," "Move on," "This phase is done," or equivalent unambiguous approval. **Do not infer acceptance from silence. Do not treat the absence of additional feedback as acceptance. Do not allow the AIDLC reviewer to substitute for this approval.**

### Relationship to delegated AIDLC approval

```
AIDLC planning/design gates
→ aidlc-reviewer may approve automatically

Implementation
→ Claude works autonomously

Technical completion
→ aidlc-reviewer verifies readiness

Runnable construction phase complete
→ MANDATORY FOUNDER HANDS-ON TEST

Founder finds issues
→ Claude fixes them
→ aidlc-reviewer handles routine technical gates
→ founder tests again

Founder accepts phase
→ next construction phase begins
```

Founder interaction is exceptional for internal AIDLC decisions, but **mandatory** at completed construction-phase boundaries. **This rule overrides any other instruction — including the Delegated AIDLC Approval section above — that would permit the reviewer, Claude Code, or automated test results to advance directly from one completed user-facing construction phase into the next.**

## Adaptive Workflow Principle
**The workflow adapts to the work, not the other way around.**

The AI model intelligently assesses what stages are needed based on:
1. User's stated intent and clarity
2. Existing codebase state (if any)
3. Complexity and scope of change
4. Risk and impact assessment

## MANDATORY: Rule Details Loading
**CRITICAL**: When performing any phase, you MUST read and use relevant content from rule detail files. Check these paths in order and use the first one that exists, regardless of which IDE or setup method was used:
- `.aidlc/aidlc-rules/aws-aidlc-rule-details/` (typical with AI-assisted setup)
- `.aidlc-rule-details/` (typical with Cursor, Cline, Claude Code, GitHub Copilot, OpenAI Codex)
- `.kiro/aws-aidlc-rule-details/` (typical with Kiro IDE and CLI)
- `.amazonq/aws-aidlc-rule-details/` (typical with Amazon Q Developer)

All subsequent rule detail file references (e.g., `common/process-overview.md`, `inception/workspace-detection.md`) are relative to whichever rule details directory was resolved above.

**Common Rules**: ALWAYS load common rules at workflow start:
- Load `common/process-overview.md` for workflow overview
- Load `common/session-continuity.md` for session resumption guidance
- Load `common/content-validation.md` for content validation requirements
- Load `common/question-format-guide.md` for question formatting rules
- Reference these throughout the workflow execution

## MANDATORY: Extensions Loading (Context-Optimized)
**CRITICAL**: At workflow start, scan the `extensions/` directory recursively but load ONLY lightweight opt-in files — NOT full rule files. Full rule files are loaded on-demand after the user opts in.

**Loading process**:
1. List all subdirectories under `extensions/` (e.g., `extensions/security/`, `extensions/compliance/`)
2. In each subdirectory, load ONLY `*.opt-in.md` files — these contain the extension's opt-in prompt. The corresponding rules file is derived by convention: strip the `.opt-in.md` suffix and append `.md` (e.g., `security-baseline.opt-in.md` → `security-baseline.md`)
3. Do NOT load full rule files (e.g., `security-baseline.md`) at this stage

**Deferred Rule Loading**:
- During Requirements Analysis, opt-in prompts from the loaded `*.opt-in.md` files are presented to the user
- When the user opts IN for an extension, load the corresponding rules file (derived by naming convention) at that point
- When the user opts OUT, the full rules file is never loaded — saving context
- Extensions without a matching `*.opt-in.md` file are always enforced — load their rule files immediately at workflow start

**Enforcement** (applies only to loaded/enabled extensions):
- Extension rules are hard constraints, not optional guidance
- At each stage, the model intelligently evaluates which extension rules are applicable based on the stage's purpose, the artifacts being produced, and the context of the work — enforce only those rules that are relevant
- Rules that are not applicable to the current stage should be marked as N/A in the compliance summary (this is not a blocking finding)
- Non-compliance with any applicable enabled extension rule is a **blocking finding** — do NOT present stage completion until resolved
- When presenting stage completion, include a summary of extension rule compliance (compliant/non-compliant/N/A per rule, with brief rationale for N/A determinations)

**Conditional Enforcement**: Extensions may be conditionally enabled/disabled. See `inception/requirements-analysis.md` for the opt-in mechanism. Before enforcing any extension at ANY stage, check its `Enabled` status in `aidlc-docs/aidlc-state.md` under `## Extension Configuration`. Skip disabled extensions and log the skip in audit.md. Default to enforced if no configuration exists. 

## MANDATORY: Content Validation
**CRITICAL**: Before creating ANY file, you MUST validate content according to `common/content-validation.md` rules:
- Validate Mermaid diagram syntax
- Validate ASCII art diagrams (see `common/ascii-diagram-standards.md`)
- Escape special characters properly
- Provide text alternatives for complex visual content
- Test content parsing compatibility

## MANDATORY: Question File Format
**CRITICAL**: When asking questions at any phase, you MUST follow question format guidelines.

**See `common/question-format-guide.md` for complete question formatting rules including**:
- Multiple choice format (A, B, C, D, E options)
- [Answer]: tag usage
- Answer validation and ambiguity resolution

## MANDATORY: Custom Welcome Message
**CRITICAL**: When starting ANY software development request, you MUST display the welcome message.

**How to Display Welcome Message**:
1. Load the welcome message from `common/welcome-message.md` (in the resolved rule details directory)
2. Display the complete message to the user
3. This should only be done ONCE at the start of a new workflow
4. Do NOT load this file in subsequent interactions to save context space

# Adaptive Software Development Workflow

---

# INCEPTION PHASE

**Purpose**: Planning, requirements gathering, and architectural decisions

**Focus**: Determine WHAT to build and WHY

**Stages in INCEPTION PHASE**:
- Workspace Detection (ALWAYS)
- Reverse Engineering (CONDITIONAL - Brownfield only)
- Requirements Analysis (ALWAYS - Adaptive depth)
- User Stories (CONDITIONAL)
- Workflow Planning (ALWAYS)
- Application Design (CONDITIONAL)
- Units Generation (CONDITIONAL)

---

## Workspace Detection (ALWAYS EXECUTE)

1. **MANDATORY**: Log initial user request in audit.md with complete raw input
2. Load all steps from `inception/workspace-detection.md`
3. Execute workspace detection:
   - Check for existing aidlc-state.md (resume if found)
   - Scan workspace for existing code
   - Determine if brownfield or greenfield
   - Check for existing reverse engineering artifacts
4. Determine next phase: Reverse Engineering (if brownfield and no artifacts) OR Requirements Analysis
5. **MANDATORY**: Log findings in audit.md
6. Present completion message to user (see workspace-detection.md for message formats)
7. Automatically proceed to next phase

## Reverse Engineering (CONDITIONAL - Brownfield Only)

**Execute IF**:
- Existing codebase detected
- No previous reverse engineering artifacts found

**Skip IF**:
- Greenfield project
- Previous reverse engineering artifacts exist

**Execution**:
1. **MANDATORY**: Log start of reverse engineering in audit.md
2. Load all steps from `inception/reverse-engineering.md`
3. Execute reverse engineering:
   - Analyze all packages and components
   - Generate a business overview of the whole system covering the business transactions
   - Generate architecture documentation
   - Generate code structure documentation
   - Generate API documentation
   - Generate component inventory
   - Generate Interaction Diagrams depicting how business transactions are implemented across components
   - Generate technology stack documentation
   - Generate dependencies documentation

4. **Wait for Explicit Approval**: Present detailed completion message (see reverse-engineering.md for message format) - DO NOT PROCEED until user confirms
5. **MANDATORY**: Log user's response in audit.md with complete raw input

## Requirements Analysis (ALWAYS EXECUTE - Adaptive Depth)

**Always executes** but depth varies based on request clarity and complexity:
- **Minimal**: Simple, clear request - just document intent analysis
- **Standard**: Normal complexity - gather functional and non-functional requirements
- **Comprehensive**: Complex, high-risk - detailed requirements with traceability

**Execution**:
1. **MANDATORY**: Log any user input during this phase in audit.md
2. Load all steps from `inception/requirements-analysis.md`
3. Execute requirements analysis:
   - Load reverse engineering artifacts (if brownfield)
   - Analyze user request (intent analysis)
   - Determine requirements depth needed
   - Assess current requirements
   - Ask clarifying questions (if needed)
   - Generate requirements document
4. Execute at appropriate depth (minimal/standard/comprehensive)
5. **Wait for Explicit Approval**: Follow approval format from requirements-analysis.md detailed steps - DO NOT PROCEED until user confirms
6. **MANDATORY**: Log user's response in audit.md with complete raw input

## User Stories (CONDITIONAL)

**INTELLIGENT ASSESSMENT**: Use multi-factor analysis to determine if user stories add value:

**ALWAYS Execute IF** (High Priority Indicators):
- New user-facing features or functionality
- Changes affecting user workflows or interactions
- Multiple user types or personas involved
- Complex business requirements with acceptance criteria needs
- Cross-functional team collaboration required
- Customer-facing API or service changes
- New product capabilities or enhancements

**LIKELY Execute IF** (Medium Priority - Assess Complexity):
- Modifications to existing user-facing features
- Backend changes that indirectly affect user experience
- Integration work that impacts user workflows
- Performance improvements with user-visible benefits
- Security enhancements affecting user interactions
- Data model changes affecting user data or reports

**COMPLEXITY-BASED ASSESSMENT**: For medium priority cases, execute user stories if:
- Request involves multiple components or services
- Changes span multiple user touchpoints
- Business logic is complex or has multiple scenarios
- Requirements have ambiguity that stories could clarify
- Implementation affects multiple user journeys
- Change has significant business impact or risk

**SKIP ONLY IF** (Low Priority - Simple Cases):
- Pure internal refactoring with zero user impact
- Simple bug fixes with clear, isolated scope
- Infrastructure changes with no user-facing effects
- Technical debt cleanup with no functional changes
- Developer tooling or build process improvements
- Documentation-only updates

**ASSESSMENT CRITERIA**: When in doubt, favor inclusion of user stories for:
- Requests with business stakeholder involvement
- Changes requiring user acceptance testing
- Features with multiple implementation approaches
- Work that benefits from shared team understanding
- Projects where requirements clarity is valuable

**ASSESSMENT PROCESS**: 
1. Analyze request complexity and scope
2. Identify user impact (direct or indirect)
3. Evaluate business context and stakeholder needs
4. Consider team collaboration benefits
5. Default to inclusion for borderline cases

**Note**: If Requirements Analysis executed, Stories can reference and build upon those requirements.

**User Stories has two parts within one stage**:
1. **Part 1 - Planning**: Create story plan with questions, collect answers, analyze for ambiguities, get approval
2. **Part 2 - Generation**: Execute approved plan to generate stories and personas

**Execution**:
1. **MANDATORY**: Log any user input during this phase in audit.md
2. Load all steps from `inception/user-stories.md`
3. **MANDATORY**: Perform intelligent assessment (Step 1 in user-stories.md) to validate user stories are needed
4. Load reverse engineering artifacts (if brownfield)
5. If Requirements exist, reference them when creating stories
6. Execute at appropriate depth (minimal/standard/comprehensive)
7. **PART 1 - Planning**: Create story plan with questions, wait for user answers, analyze for ambiguities, get approval
8. **PART 2 - Generation**: Execute approved plan to generate stories and personas
9. **Wait for Explicit Approval**: Follow approval format from user-stories.md detailed steps - DO NOT PROCEED until user confirms
10. **MANDATORY**: Log user's response in audit.md with complete raw input

## Workflow Planning (ALWAYS EXECUTE)

1. **MANDATORY**: Log any user input during this phase in audit.md
2. Load all steps from `inception/workflow-planning.md`
3. **MANDATORY**: Load content validation rules from `common/content-validation.md`
4. Load all prior context:
   - Reverse engineering artifacts (if brownfield)
   - Intent analysis
   - Requirements (if executed)
   - User stories (if executed)
5. Execute workflow planning:
   - Determine which phases to execute
   - Determine depth level for each phase
   - Create multi-package change sequence (if brownfield)
   - Generate workflow visualization (VALIDATE Mermaid syntax before writing)
6. **MANDATORY**: Validate all content before file creation per content-validation.md rules
7. **Wait for Explicit Approval**: Present recommendations using language from workflow-planning.md Step 9, emphasizing user control to override recommendations - DO NOT PROCEED until user confirms
8. **MANDATORY**: Log user's response in audit.md with complete raw input

## Application Design (CONDITIONAL)

**Execute IF**:
- New components or services needed
- Component methods and business rules need definition
- Service layer design required
- Component dependencies need clarification

**Skip IF**:
- Changes within existing component boundaries
- No new components or methods
- Pure implementation changes

**Execution**:
1. **MANDATORY**: Log any user input during this phase in audit.md
2. Load all steps from `inception/application-design.md`
3. Load reverse engineering artifacts (if brownfield)
4. Execute at appropriate depth (minimal/standard/comprehensive)
5. **Wait for Explicit Approval**: Present detailed completion message (see application-design.md for message format) - DO NOT PROCEED until user confirms
6. **MANDATORY**: Log user's response in audit.md with complete raw input

## Units Generation (CONDITIONAL)

**Execute IF**:
- System needs decomposition into multiple units of work
- Multiple services or modules required
- Complex system requiring structured breakdown

**Skip IF**:
- Single simple unit
- No decomposition needed
- Straightforward single-component implementation

**Execution**:
1. **MANDATORY**: Log any user input during this phase in audit.md
2. Load all steps from `inception/units-generation.md`
3. Load reverse engineering artifacts (if brownfield)
4. Execute at appropriate depth (minimal/standard/comprehensive)
5. **Wait for Explicit Approval**: Present detailed completion message (see units-generation.md for message format) - DO NOT PROCEED until user confirms
6. **MANDATORY**: Log user's response in audit.md with complete raw input

---

# 🟢 CONSTRUCTION PHASE

**Purpose**: Detailed design, NFR implementation, and code generation

**Focus**: Determine HOW to build it

**Stages in CONSTRUCTION PHASE**:
- Per-Unit Loop (executes for each unit):
  - Functional Design (CONDITIONAL, per-unit)
  - NFR Requirements (CONDITIONAL, per-unit)
  - NFR Design (CONDITIONAL, per-unit)
  - Infrastructure Design (CONDITIONAL, per-unit)
  - Code Generation (ALWAYS, per-unit)
- Build and Test (ALWAYS - after all units complete)

**Note**: Each unit is completed fully (design + code) before moving to the next unit.

---

## Per-Unit Loop (Executes for Each Unit)

**For each unit of work, execute the following stages in sequence:**

### Functional Design (CONDITIONAL, per-unit)

**Execute IF**:
- New data models or schemas
- Complex business logic
- Business rules need detailed design

**Skip IF**:
- Simple logic changes
- No new business logic

**Execution**:
1. **MANDATORY**: Log any user input during this stage in audit.md
2. Load all steps from `construction/functional-design.md`
3. Execute functional design for this unit
4. **MANDATORY**: Present standardized 2-option completion message as defined in functional-design.md - DO NOT use emergent 3-option behavior
5. **Wait for Explicit Approval**: User must choose between "Request Changes" or "Continue to Next Stage" - DO NOT PROCEED until user confirms
6. **MANDATORY**: Log user's response in audit.md with complete raw input

### NFR Requirements (CONDITIONAL, per-unit)

**Execute IF**:
- Performance requirements exist
- Security considerations needed
- Scalability concerns present
- Tech stack selection required

**Skip IF**:
- No NFR requirements
- Tech stack already determined

**Execution**:
1. **MANDATORY**: Log any user input during this stage in audit.md
2. Load all steps from `construction/nfr-requirements.md`
3. Execute NFR assessment for this unit
4. **MANDATORY**: Present standardized 2-option completion message as defined in nfr-requirements.md - DO NOT use emergent behavior
5. **Wait for Explicit Approval**: User must choose between "Request Changes" or "Continue to Next Stage" - DO NOT PROCEED until user confirms
6. **MANDATORY**: Log user's response in audit.md with complete raw input

### NFR Design (CONDITIONAL, per-unit)

**Execute IF**:
- NFR Requirements was executed
- NFR patterns need to be incorporated

**Skip IF**:
- No NFR requirements
- NFR Requirements was skipped

**Execution**:
1. **MANDATORY**: Log any user input during this stage in audit.md
2. Load all steps from `construction/nfr-design.md`
3. Execute NFR design for this unit
4. **MANDATORY**: Present standardized 2-option completion message as defined in nfr-design.md - DO NOT use emergent behavior
5. **Wait for Explicit Approval**: User must choose between "Request Changes" or "Continue to Next Stage" - DO NOT PROCEED until user confirms
6. **MANDATORY**: Log user's response in audit.md with complete raw input

### Infrastructure Design (CONDITIONAL, per-unit)

**Execute IF**:
- Infrastructure services need mapping
- Deployment architecture required
- Cloud resources need specification

**Skip IF**:
- No infrastructure changes
- Infrastructure already defined

**Execution**:
1. **MANDATORY**: Log any user input during this stage in audit.md
2. Load all steps from `construction/infrastructure-design.md`
3. Execute infrastructure design for this unit
4. **MANDATORY**: Present standardized 2-option completion message as defined in infrastructure-design.md - DO NOT use emergent behavior
5. **Wait for Explicit Approval**: User must choose between "Request Changes" or "Continue to Next Stage" - DO NOT PROCEED until user confirms
6. **MANDATORY**: Log user's response in audit.md with complete raw input

### Code Generation (ALWAYS EXECUTE, per-unit)

**Always executes for each unit**

**Code Generation has two parts within one stage**:
1. **Part 1 - Planning**: Create detailed code generation plan with explicit steps
2. **Part 2 - Generation**: Execute approved plan to generate code, tests, and artifacts

**Execution**:
1. **MANDATORY**: Log any user input during this stage in audit.md
2. Load all steps from `construction/code-generation.md`
3. **PART 1 - Planning**: Create code generation plan with checkboxes, get user approval
4. **PART 2 - Generation**: Execute approved plan to generate code for this unit
5. **MANDATORY**: Present standardized 2-option completion message as defined in code-generation.md - DO NOT use emergent behavior
6. **Wait for Explicit Approval**: User must choose between "Request Changes" or "Continue to Next Stage" - DO NOT PROCEED until user confirms
7. **MANDATORY**: Log user's response in audit.md with complete raw input

---

## Build and Test (ALWAYS EXECUTE)

1. **MANDATORY**: Log any user input during this phase in audit.md
2. Load all steps from `construction/build-and-test.md`
3. Generate comprehensive build and test instructions:
   - Build instructions for all units
   - Unit test execution instructions
   - Integration test instructions (test interactions between units)
   - Performance test instructions (if applicable)
   - Additional test instructions as needed (contract tests, security tests, e2e tests)
4. Create instruction files in build-and-test/ subdirectory: build-instructions.md, unit-test-instructions.md, integration-test-instructions.md, performance-test-instructions.md, build-and-test-summary.md
5. **Wait for Explicit Approval**: Ask: "**Build and test instructions complete. Ready to proceed to Operations stage?**" - DO NOT PROCEED until user confirms
6. **MANDATORY**: Log user's response in audit.md with complete raw input

---

# 🟡 OPERATIONS PHASE

**Purpose**: Placeholder for future deployment and monitoring workflows

**Focus**: How to DEPLOY and RUN it (future expansion)

**Stages in OPERATIONS PHASE**:
- Operations (PLACEHOLDER)

---

## Operations (PLACEHOLDER)

**Status**: This stage is currently a placeholder for future expansion.

The Operations stage will eventually include:
- Deployment planning and execution
- Monitoring and observability setup
- Incident response procedures
- Maintenance and support workflows
- Production readiness checklists

**Current State**: All build and test activities are handled in the CONSTRUCTION phase.

## Key Principles

- **Adaptive Execution**: Only execute stages that add value
- **Transparent Planning**: Always show execution plan before starting
- **User Control**: User can request stage inclusion/exclusion
- **Progress Tracking**: Update aidlc-state.md with executed and skipped stages
- **Complete Audit Trail**: Log ALL user inputs and AI responses in audit.md with timestamps
  - **CRITICAL**: Capture user's COMPLETE RAW INPUT exactly as provided
  - **CRITICAL**: Never summarize or paraphrase user input in audit log
  - **CRITICAL**: Log every interaction, not just approvals
- **Quality Focus**: Complex changes get full treatment, simple changes stay efficient
- **Content Validation**: Always validate content before file creation per content-validation.md rules
- **NO EMERGENT BEHAVIOR**: Construction phases MUST use standardized 2-option completion messages as defined in their respective rule files. DO NOT create 3-option menus or other emergent navigation patterns.

## MANDATORY: Plan-Level Checkbox Enforcement

### MANDATORY RULES FOR PLAN EXECUTION
1. **NEVER complete any work without updating plan checkboxes**
2. **IMMEDIATELY after completing ANY step described in a plan file, mark that step [x]**
3. **This must happen in the SAME interaction where the work is completed**
4. **NO EXCEPTIONS**: Every plan step completion MUST be tracked with checkbox updates

### Two-Level Checkbox Tracking System
- **Plan-Level**: Track detailed execution progress within each stage
- **Stage-Level**: Track overall workflow progress in aidlc-state.md
- **Update immediately**: All progress updates in SAME interaction where work is completed

## Prompts Logging Requirements
- **MANDATORY**: Log EVERY user input (prompts, questions, responses) with timestamp in audit.md
- **MANDATORY**: Capture user's COMPLETE RAW INPUT exactly as provided (never summarize)
- **MANDATORY**: Log every approval prompt with timestamp before asking the user
- **MANDATORY**: Record every user response with timestamp after receiving it
- **CRITICAL**: ALWAYS append changes to EDIT audit.md file, NEVER use tools and commands that completely overwrite its contents
- **CRITICAL**: NEVER use file writing tools and commands that overwrite the entire contents of audit.md, as this causes duplication
- Use ISO 8601 format for timestamps (YYYY-MM-DDTHH:MM:SSZ)
- Include stage context for each entry

### Audit Log Format:
```markdown
## [Stage Name or Interaction Type]
**Timestamp**: [ISO timestamp]
**User Input**: "[Complete raw user input - never summarized]"
**AI Response**: "[AI's response or action taken]"
**Context**: [Stage, action, or decision made]

---
```

### Correct Tool Usage for audit.md

✅ CORRECT:

1. Read the audit.md file
2. Append/Edit the file to make changes

❌ WRONG:

1. Read the audit.md file
2. Completely overwrite the audit.md with the contents of what you read, plus the new changes you want to add to it

## Directory Structure

```text
<WORKSPACE-ROOT>/                   # ⚠️ APPLICATION CODE HERE
├── [project-specific structure]    # Varies by project (see code-generation.md)
│
├── aidlc-docs/                     # 📄 DOCUMENTATION ONLY
│   ├── inception/                  # 🔵 INCEPTION PHASE
│   │   ├── plans/
│   │   ├── reverse-engineering/    # Brownfield only
│   │   ├── requirements/
│   │   ├── user-stories/
│   │   └── application-design/
│   ├── construction/               # 🟢 CONSTRUCTION PHASE
│   │   ├── plans/
│   │   ├── {unit-name}/
│   │   │   ├── functional-design/
│   │   │   ├── nfr-requirements/
│   │   │   ├── nfr-design/
│   │   │   ├── infrastructure-design/
│   │   │   └── code/               # Markdown summaries only
│   │   └── build-and-test/
│   ├── operations/                 # 🟡 OPERATIONS PHASE (placeholder)
│   ├── aidlc-state.md
│   └── audit.md
```

**CRITICAL RULE**:
- Application code: Workspace root (NEVER in aidlc-docs/)
- Documentation: aidlc-docs/ only
- Project structure: See code-generation.md for patterns by project type
