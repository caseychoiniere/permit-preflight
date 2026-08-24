# Unit 2 — Tech Stack Decisions

Product-level stack already fixed (requirements.md §9): Next.js, TypeScript, PostgreSQL, PostGIS,
Drizzle ORM. This document covers only the genuinely open, Unit-2-scoped tooling choices. Per the
pragmatic construction standard, these are reversible, low-risk decisions — not approval-blocking
architecture, revisitable as implementation provides evidence.

## Map Rendering
**Decision**: MapLibre GL JS.

**Rationale**: fits the approved TypeScript/Next.js stack; supports everything `ParcelPlacementMap`
and `ReportMap` need (GeoJSON polygon display, click/tap placement, rotation interaction, layered
overlays) with no new paid vendor relationship. Open-source, no API key/account required — matches
the category A/B proportionality instruction (no new commercial dependency for a pre-Commercial-GO
prototype).

**Explicitly separate decision, deferred**: the basemap/tile source. MapLibre is a rendering
library, not a data provider — a basemap still has to come from somewhere. OpenStreetMap's public
`tile.openstreetmap.org` is best-effort and usage-restricted, so it is not selected as a production
dependency here. Infrastructure Design selects a basemap source with usage terms/capacity
appropriate for the deployed prototype. The parcel polygon itself is unaffected by this choice — it
continues to come from the approved King County source (Functional Design Question 2), not the
basemap.

## PDF Generation
**Decision**: server-side, headless-browser-based HTML-to-PDF rendering, sharing the same report
presentation model/components as the web view wherever practical (not a literal render of the
interactive web page — print-specific layout is expected, especially replacing the interactive
MapLibre map with a static map image derived from the same stored geometry).

**Rationale**: guarantees both renderings draw from the same immutable `EvidenceReportArtifact`
and the same underlying report-data templates (BR-U2-6) — eliminates the drift risk of two
independently-authored templates, while still allowing a genuinely print-appropriate layout rather
than forcing an interactive web page into a PDF unchanged.

**Deferred to NFR Design/Infrastructure Design**: the specific headless-browser package/runtime
integration (e.g., which library, whether it runs in-process or as a separate rendering step) —
this depends on hosting/runtime constraints not yet fixed.

## Report Access Token Generation
**Decision**: Node's built-in `crypto.randomBytes()` (256 bits / 32 bytes, base64url-encoded). No
additional token-generation dependency.

**Rationale**: Node's `crypto` module provides cryptographically strong random byte generation
already available in the existing runtime — no new dependency justified for this.

## UI Testing
**Decision**: component-test framework consistent with the chosen Next.js/React setup (exact
library — e.g. Vitest's existing runner plus a React component-testing library — decided during
Code Generation, not fixed here) for the component layer; Playwright (or an equivalent browser-
automation tool) for the deliberately small end-to-end smoke suite (NFR-U2-6).

**Rationale**: Playwright is a mainstream, well-supported choice for the single highest-value
browser path this unit needs to prove (map interaction, token-based access, client/server
integration) — no exotic tooling required for a deliberately narrow smoke suite.

## Deferred to Infrastructure Design (Next Stage)
Hosting/deployment target for the first real running Next.js app, the concrete rate-limiting
mechanism for report-access lookups (NFR-U2-4), the basemap/tile-source provider, and any
provider-specific configuration remain out of scope for this document, per the same pattern Unit
1's NFR Requirements used.
