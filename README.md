# Permit Preflight

Seattle-first residential buildability screening. Permit Preflight helps a homeowner or land
buyer answer two expensive questions *before* paying for professional due diligence:

1. **Existing property** — "Can I build this here?" (e.g. a backyard shed / accessory structure)
2. **Vacant land** — "What could I reasonably build here?"

It aggregates authoritative property and regulatory data (parcel boundaries, zoning, critical
areas, existing structures), runs deterministic spatial and regulatory-rule analysis, surfaces
unknowns instead of guessing, and produces an evidence-backed preliminary feasibility report.

Permit Preflight is a **screening and due-diligence aid**. It does not guarantee permit approval
and does not replace an architect, engineer, surveyor, attorney, utility provider, or the
permitting authority itself.

> Full product vision, scope, and constraints: [docs/product/permit-preflight-inception-brief.md](docs/product/permit-preflight-inception-brief.md)

## Tech stack

- **Framework**: [Next.js](https://nextjs.org/) 16 (App Router) + React 19, TypeScript
- **Database**: Neon serverless PostgreSQL + PostGIS, via [Drizzle ORM](https://orm.drizzle.team/)
- **Mapping**: MapLibre GL JS + MapTiler
- **Payments**: Stripe (checkout + webhooks)
- **Email**: Resend
- **AI**: Anthropic (Rule Research Assistant, Report Explanation) — always degrades gracefully, never fabricates a result if unavailable
- **PDF generation**: Puppeteer / `@sparticuz/chromium`
- **Testing**: Vitest (unit + integration), Playwright (e2e)

## Project structure

```
app/            Next.js App Router pages, API routes, and UI components
src/            Domain logic, organized by bounded component (see below)
scripts/        Operational/dev scripts (DB seeding, staging tooling, prototype report generation)
tests/          Unit and integration tests, mirroring src/
e2e/            Playwright end-to-end tests
docs/           Product vision and planning documents
aidlc-docs/     AI-DLC process artifacts (requirements, design, construction, audit trail)
```

Each subdirectory under `src/` is an independently-testable domain component, e.g.
`parcel-resolution`, `property-intelligence`, `spatial-analysis`, `regulatory-rules-engine`,
`regulatory-rule-governance`, `rule-research-assistant`, `report-generation-orchestrator`,
`report-pdf-rendering`, `checkout-fulfillment`, `order-payment`, `account-auth`, `admin-auth`.

## Getting started

### Prerequisites

- Node.js 20+
- A Neon PostgreSQL database with PostGIS enabled

### Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` with real values — see [.env.example](.env.example) for what each variable is for
and which features need it. At minimum, `DATABASE_URL` is required to run the app; other keys
(Anthropic, MapTiler, Stripe, Resend, admin auth) unlock specific features and are otherwise
documented as optional/degraded in `.env.example` itself.

Deterministic unit tests require none of these variables. Integration tests require whichever
variables the specific test touches.

### Run the dev server

```bash
npm run dev
```

### Database migrations

```bash
npm run db:generate   # generate a Drizzle migration from schema changes
npm run db:migrate    # apply migrations
```

## Testing

```bash
npm test               # deterministic unit tests (vitest)
npm run test:watch     # unit tests in watch mode
npm run test:integration  # integration tests (touches real infrastructure per test)
npm run test:e2e       # Playwright end-to-end tests
npm run typecheck      # tsc --noEmit
npm run build          # production build
```

## License

Private and proprietary. All rights reserved.
