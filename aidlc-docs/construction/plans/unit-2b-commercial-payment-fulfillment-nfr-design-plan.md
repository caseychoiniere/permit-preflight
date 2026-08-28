# Unit 2B: Commercial Payment & Fulfillment — NFR Design Plan

**Status: APPROVED 2026-08-24**, with one targeted correction applied post-generation per founder
review: a new **Pattern 9 (Durable Commercial Fulfillment Reconciliation)** closing a
crash-sensitivity gap in the transition-time-only side effects (report delivery, automatic refund
initiation, refund Stripe submission), extending the existing Report Generation Job poller rather
than introducing new infrastructure; Pattern 1's Checkout Session reuse logic clarified to retrieve
live Stripe state before reuse (three sub-cases: still open, paid-but-unreconciled, expired-but-
unreconciled — the latter two return a new `RECONCILING` status, never a locally-forged
transition); Pattern 4 hardened with `Cache-Control: no-store`, no unnecessary logging of the full
Checkout Session ID/URL, and no third-party analytics on the status page. See
`nfr-design-patterns.md` Patterns 1, 4, and 9, and `logical-components.md`'s extended poller row.
Proceeding to Infrastructure Design — no further NFR Design review held, per the founder's explicit
instruction.

**NFR Requirements consumed**: nfr-requirements.md, tech-stack-decisions.md (approved 2026-08-24).

**Governing constraint (per the user's explicit instruction, reaffirmed this stage)**: NFR Design
expresses the logical patterns needed to implement already-approved requirements — it does not
invent new infrastructure. No queue, outbox, new `OrderState`, or general payment-operation
framework unless this stage demonstrates one is genuinely necessary; none is found to be necessary
below.

**Three new requirement sets carried into this stage, already fully specified by the founder**
(checkout-session creation resumability/idempotency, guest status-page authorization via an
unguessable read-only capability, and precise `EMAIL_SENT` semantics) — see the Clarifying
Questions section for why each resolves to a direct design decision rather than a question.

---

## NFR Design Checklist
- [x] Evaluate all 5 mandatory categories (Resilience, Scalability, Performance, Security, Logical
      Components) for genuine ambiguity — see Clarifying Questions section below for the
      per-category justification. **No questions asked this stage**: the founder's own NFR
      Requirements approval message specified every open design point in enough concrete detail
      (7 numbered resumability behaviors, an explicit list of what the status response must/must
      not expose, exact `EMAIL_SENT` wording, a concrete testing list) that no genuine ambiguity
      remained to ask about — each resolves to a direct design decision below, consistent with the
      pragmatic construction standard's "don't manufacture process for its own sake."
- [x] Create `nfr-design-patterns.md` — idempotent/resumable Checkout Session creation (BR-U2B-14
      extended), atomic multi-table payment fulfillment via a real interactive transaction
      (BR-U2B-15), concurrency-safe Order uniqueness under a race (BR-U2B-1's partial unique
      indexes plus the application-level conflict-handling shape), guest status-read capability
      (new), refund's idempotent/asynchronous lifecycle (BR-U2B-5/6/7), webhook ledger + raw-body
      signature verification (BR-U2B-2/4), guest report-access delivery with rotation-on-uncertain-
      delivery and precise `EMAIL_SENT` semantics (BR-U2B-10), bearer-link confidentiality
      hardening (NFR-U2B-4, extends Unit 2's Pattern 1)
- [x] Create `logical-components.md` — `order-payment` (new), `checkout-fulfillment` (new),
      `report-access` (extended) plus a new `email-delivery` adapter module, the `db/client.ts`
      driver swap (modified, not a new component)
- [x] Explicitly confirm, per pattern, "why this doesn't need new infrastructure" — matches Unit
      2's established discipline

---

## Clarifying Questions

**No questions asked this stage.** Per-category evaluation, as the process mandates:

- **Resilience Patterns**: the founder's carry-forward requirement fully specifies checkout-session
  creation resumability (7 numbered behaviors: stable per-Order idempotency key, resume-not-
  duplicate on retry, reuse an existing usable session, never insert a second `PENDING` order,
  idempotent persistence of the session ID once obtained, `orderId` always in
  `client_reference_id`/metadata, no second chargeable session from an uncertain retry) and
  explicitly forbids a queue/outbox/new state/general framework absent demonstrated need. Directly
  designed as Pattern 1 below — no genuine ambiguity remained.
- **Scalability Patterns**: unchanged from NFR Requirements' prototype-scale framing; nothing new
  to design here.
- **Performance Patterns**: unchanged from NFR Requirements' soft targets; nothing new to design
  here.
- **Security Patterns**: the founder fully specified the guest status-page authorization model
  (unguessable customer-held correlation/capability value, Stripe's Checkout Session identifier
  explicitly pre-approved as an acceptable choice, status-reads-only scope, an explicit
  expose/don't-expose field list) and the bearer-link confidentiality requirements (already
  captured in NFR Requirements, reaffirmed here as a pattern). Directly designed as Patterns 4 and
  8 below.
- **Logical Components**: resolved by mapping each pattern onto the existing, already-approved
  component boundaries (Order & Payment, Checkout & Fulfillment Service, Account) from
  Application Design — no new component type is warranted beyond what those boundaries already
  imply, and the founder's own message confirms this ("acceptable if NFR Design chooses it," not
  "design a new subsystem").

Since no `[Answer]:` tags exist to wait on, this plan proceeds directly to artifact generation in
the same turn, consistent with the adaptive-workflow principle of not holding a stage open when it
would add no value.
