# aidlc-reviewer

A local MCP server exposing one tool, `review_gate` (Claude-visible as
`aidlc-reviewer.review_gate`), backed by an independent OpenAI reviewer with **bounded delegated
authority** over routine AIDLC workflow gates for Permit Preflight.

It lets Claude Code continue through routine engineering/workflow gates without stopping to ask
the founder every time, while keeping product, pricing, regulatory, and legal decisions reserved
to the founder. See [`../../.ai/reviewer/decision-policy.md`](../../.ai/reviewer/decision-policy.md)
for the authority boundary, and the "Delegated AIDLC Approval" section of the repository's
[`CLAUDE.md`](../../CLAUDE.md) for how Claude Code is expected to use this tool.

> **OpenAI is a development-workflow dependency used only by this local AIDLC reviewer. It is
> not a Permit Preflight application/runtime dependency.** The root `package.json`, `app/`,
> `src/`, and Vercel/runtime configuration never reference OpenAI or `OPENAI_API_KEY` - only
> this directory and `.mcp.json` do. Permit Preflight's own application functionality (report
> generation, explanations, etc.) continues to use Anthropic, unchanged; this tool does not
> replace or touch that integration.

## Architecture

```
Claude Code
  -> calls the local MCP tool aidlc-reviewer.review_gate
  -> this server resolves the requested repository artifacts (path-safe, read-only)
  -> this server sends TWO structurally separate things to OpenAI (Responses API, structured
     output):
       - instructions (trusted, server-controlled): the reviewer system prompt with the full
         text of .ai/reviewer/decision-policy.md appended - never anything from Claude's
         request or a repository artifact
       - input (untrusted): a single deterministic JSON document containing only the review
         request and untrusted evidence (question, recommendation, artifacts, changed files,
         summaries, prior decisions)
  -> OpenAI returns one of APPROVE / REVISE / ESCALATE, validated against a strict schema
     and a set of programmatic invariants
  -> the decision is appended to .ai/reviewer/decisions.jsonl (append-only audit log)
  -> the validated decision is returned to Claude Code
```

Splitting `instructions` from `input` this way, and serializing `input` as one JSON document
rather than hand-built text tags, is what stops a reviewed artifact from being able to forge a
fake policy/instruction block or fake decision - see "Security model" below and
`test/context.test.ts`'s prompt-injection suite.

A failed review (missing API key, network error, malformed or logically-inconsistent model
output) is always returned as an MCP tool error, **never** as a decision, and is **never**
appended to the audit log. Tool failure must never be treated as approval.

## Setup

### 1. Install dependencies

This is an isolated package with its own `node_modules`, separate from the root Next.js app's
dependencies.

```bash
cd tools/aidlc-reviewer
npm install
```

### 2. Set your OpenAI API key

```bash
export OPENAI_API_KEY="sk-..."
```

Do this in the same shell you launch Claude Code from - the MCP server process launched via
`.mcp.json` inherits its environment. **Never commit a real key.** `OPENAI_API_KEY` is never
logged, never included in a prompt sent to OpenAI, and never written to the decision log.

## Build / run

There is no build step - the server runs directly from TypeScript via `tsx`:

```bash
npm start
# equivalent to: tsx src/index.ts
```

It speaks MCP over stdio, so running it directly in a terminal will just sit waiting for
JSON-RPC messages on stdin - that's expected. In normal use, Claude Code spawns it automatically
(see below), you should not need to run it by hand.

## Claude Code integration

The project-scoped [`.mcp.json`](../../.mcp.json) at the repository root registers this server
automatically:

```json
{
  "mcpServers": {
    "aidlc-reviewer": {
      "command": "npx",
      "args": ["tsx", "tools/aidlc-reviewer/src/index.ts"],
      "env": { "OPENAI_API_KEY": "${OPENAI_API_KEY}" }
    }
  }
}
```

`${OPENAI_API_KEY}` in the `env` block is Claude Code's officially-supported syntax for
substituting a value from the host shell's environment into a project-scoped `.mcp.json` - the
real key is never written into this file. Cloning the repository, running `npm install` inside
`tools/aidlc-reviewer/`, exporting `OPENAI_API_KEY` in the shell you launch Claude Code from, and
opening the project should be enough for the `aidlc-reviewer.review_gate` tool to become
available with no further configuration.

The first time Claude Code loads this project, it will prompt you to trust/approve the
project-scoped `.mcp.json` (the normal one-time confirmation Claude Code requires before running
any project MCP server) - approve it once, and it's remembered for the project. If your Claude
Code build exposes an MCP status/list command (e.g. `/mcp` inside an interactive session), use it
to confirm the `aidlc-reviewer` server is connected and `review_gate` is listed.

## Decision policy, in short

- **`APPROVE`** — the gate is approved. Claude continues automatically. Requires confidence
  >= 0.80, zero required changes, and `escalation.required: false`.
- **`REVISE`** — Claude must make the required changes and resubmit the same gate. Always
  includes at least one concrete, actionable required change.
- **`ESCALATE`** — the decision is reserved to the founder (or the reviewer's confidence can't
  reach 0.80, or approved requirements conflict, or repeated revision cycles are stuck). Claude
  stops the affected decision and asks the founder, with the reviewer's own recommendation
  attached.

Full policy: [`.ai/reviewer/decision-policy.md`](../../.ai/reviewer/decision-policy.md).
System prompt sent to the reviewer: [`.ai/reviewer/system-prompt.md`](../../.ai/reviewer/system-prompt.md).

## Audit log

Every successful review is appended as one JSON line to
[`.ai/reviewer/decisions.jsonl`](../../.ai/reviewer/decisions.jsonl) - `decisionId`, `timestamp`,
`gateId`, `stage`, `gateType`, `unitId`, `decision`, `confidence`, `authority`, `summary`,
`artifactsReviewed`, `priorDecisionIds` (the full set actually surfaced to the reviewer - this
gate's own prior decisions, auto-included, plus anything Claude explicitly referenced - not
merely whatever Claude happened to pass in), and (when present) `findings`/`requiredChanges`/
`escalation`. The log is append-only: existing lines are never rewritten. It is committed to the
repository as part of the project's AIDLC audit trail (see `CLAUDE.md`'s Prompts Logging
Requirements, which this extends the same discipline to). It never contains secrets or full
source files - only summaries/metadata and the artifact *paths* that were reviewed.

**The automated test suite can never write here** - `vitest.config.ts` points every test at an
isolated fixture repo before any test file's imports run, and `test/production-log-isolation.test.ts`
continuously verifies that `appendDecision()`'s real default path resolves only to the fixture
repo, never to this file (see "Tests" below).

**A live, manually-invoked call is different** - if you connect Claude Code to this server via
the real `.mcp.json` (e.g. to verify connectivity, as a one-off check outside the automated
suite), it calls the real production server and therefore appends to this real log by design -
that's what makes the log authoritative for real gates. If you want to run a live connectivity
check WITHOUT adding an entry to the real audit history, point the server at a scratch directory
for that one run instead: `AIDLC_REVIEWER_REPO_ROOT=/tmp/aidlc-reviewer-smoke-check npx tsx
src/index.ts` (create that directory first, with its own `.ai/reviewer/{decision-policy.md,
system-prompt.md}` copied in). Two prior smoke-test entries reached this real log exactly this
way and had to be removed by hand (2026-09-14) - prefer the scratch-directory approach for any
future live check that isn't itself a real AIDLC gate.

## Security model

- **Filesystem**: every artifact/changed-file path Claude supplies is resolved through
  `resolveRepoPath()` (`src/paths.ts`), which rejects absolute paths, `../` traversal outside the
  repository root, a fixed blocklist (`.env`/`.env.*`, `.git`, `node_modules`, `.ssh`, `.aws`,
  private-key/credential file shapes), and symlinks that resolve (via `fs.realpathSync`) outside
  the repository root - not just a string-prefix check. See `test/paths.test.ts`.
- **Secrets**: `OPENAI_API_KEY` comes only from the environment (`review.ts`'s `requireApiKey`),
  is passed straight to the OpenAI client, and is never interpolated into a prompt, logged, or
  written to the decision log. A missing key is a fail-closed MCP error, never an implicit
  approval.
- **Trust boundary**: repository content (source, docs, regulatory text, fixtures) is treated as
  untrusted with respect to reviewer *authority* - structurally, not just by instruction.
  `.ai/reviewer/decision-policy.md` and `.ai/reviewer/system-prompt.md` are loaded by the server
  and sent ONLY as the Responses API's `instructions` field; repository artifacts, changed
  files, the question, recommendation, and prior-decision summaries are sent ONLY as the `input`
  field, serialized as one deterministic JSON document. This means untrusted content can never
  even land in the same field as the governing policy, and JSON string-escaping makes it
  syntactically impossible for artifact content to forge a fake instruction/policy block or a
  fake decision by embedding text that looks like structure - see `test/context.test.ts`'s
  prompt-injection suite, which proves this with real attempted-injection fixtures. The system
  prompt also explicitly instructs the model not to follow instructions embedded in `input`, as
  defense in depth on top of (not instead of) the structural separation.
- **Reviewer self-governance**: the reviewer cannot approve changes to its own authority -
  `.ai/reviewer/decision-policy.md`, `.ai/reviewer/system-prompt.md`, `CLAUDE.md`'s delegated-
  approval section, the decision invariants, and substantive changes to this package's own
  `src/*`/`.mcp.json` are founder-reserved. See decision-policy.md's "Reviewer self-governance is
  forbidden" section.
- **Fail closed**: every failure path (missing key, network/API error, incomplete response,
  refusal, malformed JSON, schema violation, or a logically-inconsistent decision like
  `authority: RESERVED_FOUNDER` paired with `decision: APPROVE`) throws before any decision is
  constructed or logged. Nothing in this codebase "repairs" an invalid model decision into a
  valid one.

## Tests

```bash
npm test
```

Mocks the OpenAI client everywhere (no real API calls in automated tests) and covers: input
validation (including every real AI-DLC stage), path security (traversal/blocklist/symlink
escape), tightened decision-invariant enforcement (including cross-combinations like `REVISE` +
`escalation.required: true`, and that `ESCALATE` may legitimately occur with `authority:
DELEGATED`), decision-log append/load/gate-history semantics, context construction
(instructions/input separation, policy/artifacts/prior-decisions inclusion, blocked-path
rejection, automatic same-gate revision-history inclusion with a working `revisionCountForGate`),
a dedicated prompt-injection suite (real attempted-injection fixtures proving artifact content
can never forge policy/instruction structure or a fake decision), and the full `review_gate`
handler end to end, including the required smoke scenario (a valid `APPROVE` passes through;
`authority: RESERVED_FOUNDER` paired with `decision: APPROVE` is rejected rather than silently
accepted); and `production-log-isolation.test.ts`, which independently re-derives the real
project root and proves `appendDecision()`'s real default path can never write to the real
`.ai/reviewer/decisions.jsonl` from a test run.

```bash
npm run typecheck
```
