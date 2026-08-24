# Permit Preflight — Inception Research Findings

**Status**: Verified/researched during Requirements Analysis, 2026-08-19. This document distinguishes
**VERIFIED** findings (fetched/confirmed from a primary or strong secondary source, with URL) from
**UNVERIFIED/PLAUSIBLE** (found via search but not independently confirmed) and **UNKNOWN** (could not
determine). Per the governing brief (Section 58), any finding that threatens product viability is
called out explicitly rather than engineered around silently.

---

## 1. Seattle / King County Data Landscape

### 1.1 King County Parcel/GIS Data
- **Publisher**: King County GIS Center. **Access**: ArcGIS Hub REST API / Shapefile / GeoJSON / CSV (gis-kingcounty.opendata.arcgis.com).
- **License**: VERIFIED — King County's terms permit copy/use/distribution of county GIS data, with one explicit carve-out: **resale of the raw data is prohibited without a written agreement**. Data is "AS IS," no warranty, no liability.
- **Assessment**: A paid report product that *uses* parcel data as an input to a synthesized report (not reselling the raw dataset) is plausibly compliant, but the line isn't crisply defined in the public terms — **flagged for legal review** (see Section 4).
- **Confidence**: License language verified; API/format specifics for the parcel layer itself UNVERIFIED (fetch attempts returned empty content — plausible based on standard ArcGIS Hub behavior only).

### 1.2 King County Assessor Data
- **Publisher**: King County Dept. of Assessments. **Access**: bulk mainframe file extracts (info.kingcounty.gov/assessor/datadownload) and "eReal Property Search."
- **License**: VERIFIED — **RCW 42.56.070(9)** prohibits using **lists of individuals' names** (i.e., owner names) from these records "for commercial purposes" defined as contacting named individuals for profit-seeking activity. This is a **narrow, specific restriction** (anti-marketing-list use), not a blanket ban on building a commercial product from assessor data — but it means owner-name fields need deliberate handling (e.g., not exposing raw owner-name lists, not using them as a marketing dataset) in a paid report.
- **Confidence**: RCW restriction verified. Format, update cadence, cost: UNKNOWN (download page appeared stale, last visible update ~2013).

### 1.3 City of Seattle Open Data (general)
- **Publisher**: Seattle GIS Program. **Portals**: data.seattle.gov (Socrata) and Seattle GeoData (ArcGIS Hub).
- **License**: Corroborated (not directly read in full) as **PDDL (Public Domain)** — the Building Permits dataset is explicitly tagged "Public Domain" in data.gov catalog metadata.
- **API**: VERIFIED — Socrata SODA REST API; free self-serve app tokens give 10 req/s (~1,000 req/hr); unauthenticated calls share a throttled IP pool.
- **Confidence**: Moderate-high (multiple corroborating sources); primary Terms-of-Use page itself did not load in full this session.

### 1.4 Seattle Zoning Data
- **Datasets**: "Current Land Use Zoning Detail" + "Current Land Use Zoning - Additional Overlay Areas" on Seattle GeoData / data.seattle.gov.
- **Important caveat**: VERIFIED — the dataset is explicitly labeled **"not an official zoning map"** in its own description. Official zoning determination is an SDCI staff/tool function, not this dataset.
- **Confidence**: Existence/URLs verified; license/update-cadence fields UNVERIFIED.

### 1.5 Seattle Environmentally Critical Areas (ECA)
- Multiple discrete layers exist (liquefaction, steep-slope, landslide-prone; wetlands/streams/shorelines likely exist as separate layers but were **not individually located this session — gap**).
- **Currency concern**: VERIFIED — the liquefaction layer was originally built in **1995** from USGS source data, hand-edited to 2-ft contours. This is a decades-old derived product — a real accuracy/currency concern for a "buildability screening" tool that should probably be surfaced to users as an evidence caveat.
- **Confidence**: Existence + liquefaction-layer provenance verified; other ECA layers unverified this session.

### 1.6 Seattle Permit Data
- **Live system**: Seattle Services Portal (Accela-based) — web UI only, **no confirmed public API**.
- **SDCI Permit History tool** (maps.seattle.gov) — web map only, no API, and VERIFIED to carry the same RCW commercial-use-of-individual-lists caveat plus a broad "as-is" disclaimer and a reservation of rights to alter/discontinue without notice.
- **Practical ingestion path**: VERIFIED — bulk Socrata datasets "Building Permits" (since 1990) and "Land Use Permits" ARE API-accessible. Pre-1990 records are microfilm/scanned, not structured.
- **Assessment**: Historical/comparable-permit search (useful for the vacant-land workflow) is feasible via the bulk datasets; **live real-time permit status is not** without an unconfirmed paid Accela API product.

### 1.7 Seattle Municipal Code Title 23 (Land Use Code)

**Revised 2026-08-19** after follow-up research distinguishing five separate questions (public accessibility, API/bulk-ingestion availability, Municode's contractual terms, safety of storing citations + independently-written rule representations, and availability of city-run provenance sources). The original framing of this as an architectural "red flag" conflated "no bulk API" with "problem" — that conflation doesn't hold once the intended workflow is curated (human-researched, human-approved) rather than pipeline-ingested, which is what the brief actually specifies (Section 15).

- **Public accessibility for research**: VERIFIED. Seattle's City Clerk explicitly names Municode as "our codifier" and directs the public there ([seattle.gov/city-clerk/.../seattle-municipal-code-and-city-charter](https://www.seattle.gov/city-clerk/legislation-and-research/seattle-municipal-code-and-city-charter)) — free to browse, no paywall. Historic versions are also available via the City Clerk's Research Room.
- **API/bulk export for automated ingestion**: VERIFIED — none exists officially. Unofficial third-party scrapers exist (e.g. GitHub `municode-scraper`) but operate against Municode's terms. **This remains true but is not a finding against the architecture** — the architecture does not require or want bulk ingestion.
- **Municode's terms on scraping/copying/storing/redistributing**: VERIFIED via search (municode.com/code/page/terms-use) — the terms restrict use of Municode's **website/platform content** to personal use, prohibit commercial exploitation, and prohibit creating derivative works "from the website or its content." This governs Municode's compiled, formatted *platform product*, not necessarily the underlying law itself (see next point). Direct fetch of the terms page and the Title 23 page both returned 403/CAPTCHA this session — exact clause text is corroborated via search snippets, not independently read in full; worth a manual browser check before finalizing any policy that depends on precise wording.
- **Storing citations + independently-written rule representations**: Under the **government edicts doctrine** — reaffirmed by the U.S. Supreme Court in *Georgia v. Public.Resource.Org* (2020, 5-4, Roberts) — works created by officials empowered to speak with the force of law (legislative enactments, ordinances) are not eligible for copyright, specifically so that "citizens must have unrestrained access to the laws that govern them." A citation ("SMC 23.44.014") and a legal fact ("rear setback = 5 ft in this zone") are law/facts, not protected expression. **Independently reading the primary source, writing your own structured rule specification in your own words, and citing the section is standard, well-established reg-tech/legal-tech practice** — it does not require reproducing Municode's specific compiled/annotated presentation. One genuine open nuance, not resolved by *Georgia v. PRO* (which addressed a state's *own* annotated code): whether a *private third-party codifier's* clickwrap terms could impose a contractual restriction narrower than what copyright law itself would allow, for someone who directly agreed to those terms by using the site. This is a real but narrow question — recommend a short confirmation from counsel, not a blocker.
- **City-run provenance/change-tracking sources independent of Municode**: VERIFIED — `clerk.seattle.gov` and `seattle.legistar.com` (Seattle City Council's Legistar instance) are the City's own official legislative records: full ordinance text searchable since 1996, with ordinance numbers, sponsorship, passage/effective dates, and legislative history. This is a **better-suited source than Municode for the brief's regulatory-change-management requirement** (Section 39): Municode shows current compiled state; Clerk/Legistar shows the actual enactment record (e.g. "SMC 23.44.014 amended by Ordinance 12xxxx, effective [date]") needed to detect and version regulatory changes.

**Revised assessment**: This is not an architectural blocker. The recommended provenance chain is: **Municode (current compiled text, human-read for research) + City Clerk/Legistar (ordinance-level change history, effective dates, authoritative citation trail) → human-written rule specification, citing section + ordinance number → typed implementation → tests → human approval → production rule** — which matches the workflow already specified in the brief and confirmed by the user. Rule-authoring velocity is bounded by human legal-research time (a real, ongoing cost — see Section 5), not by data-pipeline engineering, but that was always the brief's intent, not a newly discovered risk. Recommend: (a) never bulk-copy or store Municode's formatted/annotated text in the product; store only citations, ordinance numbers, effective dates, and independently-written rule summaries; (b) use Clerk/Legistar ordinance records as the source of truth for the rule-supersession/versioning mechanism; (c) get a short counsel confirmation on the narrow clickwrap-terms question above before scaling rule coverage, not before starting.

### 1.8 SDCI Guidance / Zoning Lookup Tools
- Director's Rules, tip sheets, Zoning Map Books, and web map tools ("Shaping Seattle," Property Information Map) exist — all VERIFIED as **web applications for human lookup, no API**.

### 1.9 FEMA Flood Hazard Data (NFHL)
- VERIFIED (fetched directly): REST/WMS/OGC WFS services, full bulk File Geodatabase download (~12GB), public federal data, no warranty, no commercial-use restriction. Caveat: the **digital NFHL is a convenience layer** — the hardcopy FIRM/FIS remains the legally official flood designation. Updated continuously via LOMR/LOMA.

### 1.10 Utility Data (SPU / Seattle City Light) — ⚠️ GAP
- Some SCL infrastructure layers exist as open data; **no easement layer found**.
- Side-sewer and detailed water/sewer maps are **viewer-only applications** (one explicitly excludes transmission mains for security reasons).
- Bulk/API utility data requires a **separate SPU GIS Data Order Form request, ~10 business day turnaround, negotiated/unconfirmed pricing** — this is a **manual, non-automatable path**, not a pipeline source. Utility availability confirmation should be modeled as a "REQUIRES VERIFICATION" evidence category for MVP, not an automated KNOWN fact.

### 1.11 Elevation/Imagery (USGS 3DEP LiDAR)
- VERIFIED (fetched directly): public domain, free, no commercial restrictions, LAZ point clouds via The National Map / AWS Requester-Pays bucket. King County/Seattle tile-level coverage plausible but not individually confirmed. Seattle orthoimagery likely exists on Seattle GeoData, unverified this session.

### Data Landscape — Confidence Summary

| Dataset | Existence | License/Commercial Terms | API/Format |
|---|---|---|---|
| King County Parcel GIS | Verified | Verified (resale restricted) | Unverified |
| King County Assessor | Verified | Verified (RCW individual-list restriction) | Unknown |
| Seattle Open Data (general) | Verified | Corroborated | Verified (Socrata) |
| Seattle Zoning GIS | Verified | Unverified ("not official map") | Unverified |
| Seattle ECA | Verified (partial) | Unverified | Partial (liquefaction provenance only) |
| Seattle Permit Data | Verified | Verified (RCW caveat, no live API) | Verified (bulk API only) |
| SMC Title 23 (+ Clerk/Legistar) | Verified | Verified — see 1.7 (Municode terms govern their platform; underlying law not copyrightable; narrow clickwrap nuance flagged for counsel) | Verified — no API by design; not needed for curated workflow |
| SDCI tools/guidance | Verified | N/A (web only) | Verified — no API |
| FEMA NFHL | Verified | Verified | Verified |
| SPU/SCL utilities | Verified | Verified (order-form process) | Verified — no self-serve API |
| USGS 3DEP LiDAR | Verified | Verified | Verified |

---

## 2. Anthropic Claude API — Pricing & Architecture Fit

**Confidence**: High (verified against live `platform.claude.com` docs, fetched 2026-08-19).

| Tier | Model | Input $/MTok | Output $/MTok |
|---|---|---|---|
| Fast/cheap | Claude Haiku 4.5 | $1.00 | $5.00 |
| Mid/balanced | Claude Sonnet 5 | $2.00 | $10.00 |
| Top capability | Claude Opus 5 | $5.00 | $25.00 |
| Highest capability (rarely needed) | Claude Fable 5 | $10.00 | $50.00 |

- **Prompt caching**: cache read = 0.1x base input rate (90% discount); cache write 1.25x (5-min) or 2.0x (1-hr). Minimum cacheable prefix 512–4,096 tokens depending on model. Directly applicable here since rule-context/system prompts repeat across the 2-4 calls/report.
- **Batch API**: 50% discount on input+output, stacks with caching. Useful for any non-realtime part of generation.
- **Structured output**: `output_config`/schema-constrained responses and `strict: true` tool calls are supported on current models — directly satisfies the brief's "schema-constrained, validated LLM output" requirement.
- **Rate limits (Start tier)**: 1,000 RPM, 2M ITPM / 400K OTPM across Sonnet 5/Opus 5/Haiku 4.5; monthly spend cap $500 at Start tier (auto-progresses with usage history). Cached tokens don't count against ITPM.
- **Data retention**: VERIFIED — commercial API content is not used for training without permission, and conversation content is not retained by default (exceptions: policy-violation flags up to 2 years; specific "Covered Models" not relevant here). Zero Data Retention available contractually via sales if a formal DPA is needed. Note: some third-party sources claim a blanket "30-day retention default" that conflicts with the primary doc — verify directly with Anthropic before any DPA language is finalized.

### Rough per-report LLM cost (2-4 calls, 3-8K input / 0.5-1.5K output tokens/call, no caching applied)

| Tier | Per-report range |
|---|---|
| Haiku 4.5 | ~$0.01–$0.06 |
| Sonnet 5 | ~$0.02–$0.12 |
| Opus 5 | ~$0.06–$0.31 |

**Finding**: LLM cost is 0.1%–3% of a $9.99 report even at the top tier. **Model choice is not the binding cost constraint** — the model-tier decision should be driven by output quality (does it correctly synthesize/explain without hallucinating), not cost. Caching stable system-prompt/rule-context content would reduce this further.

---

## 3. Payment & Infrastructure Cost Landscape

**Confidence**: High (verified against official pricing pages, fetched 2026-08-19).

- **Stripe**: 2.9% + $0.30 per US card transaction via Checkout (no extra fee for Checkout vs. raw API). On a $9.99 report: **$0.59/transaction**.
- **Postgres+PostGIS (Neon)**: free tier covers early volume; PostGIS supported on all plans; ~$25-50/mo at 1K-10K reports/month scale.
- **App hosting (Vercel)**: $20/mo Pro base + usage-based overage.
- **Geocoding**: Census Bureau geocoder is **free, no key, no meaningful rate limit** for this scale — recommended default. Google/Mapbox exist as paid fallbacks if match quality requires it.
- **Map tiles (MapTiler)**: free tier covers early volume; $30/mo Flex tier at higher volume.
- **Object storage (Cloudflare R2)**: $0.015/GB-month, **$0 egress** — notably better than S3 for PDF downloads.
- **Monitoring/email (Sentry, Resend)**: free tiers cover early volume; ~$46/mo combined at higher volume.

### Estimated monthly COGS (excluding LLM, which is separately ~$0.01-$0.31/report)

| | 1 report | 100/mo | 1,000/mo | 10,000/mo |
|---|---|---|---|---|
| Fixed costs | $20 | $20 | ~$71 | ~$146+ |
| Variable/report (Stripe fee dominates) | ~$0.59 | ~$0.59 | ~$0.59 | ~$0.59-0.60 |
| **Est. total COGS/report** | **~$20.59** | **~$0.79** | **~$0.66** | **~$0.60** |

**Biggest cost uncertainty flagged by research**: PDF generation compute cost if rendered via headless Chromium in serverless functions — could add anywhere from a few cents to $0.20+/report at high volume; none of the pricing pages made this concrete. This should be measured directly once a PDF rendering approach is chosen, not assumed.

**Preliminary economics read**: at $9.99/report and ~1,000+ reports/month, COGS lands around **$0.60-$0.70/report (excluding LLM, ~93% gross margin before payment-processing-adjacent overhead)** — even with the PDF-rendering uncertainty added, $9.99 appears to have comfortable room. The $9.99 hypothesis is **not threatened by infrastructure or LLM cost** at any modeled volume. (This does not account for the labor cost of regulatory rule research, which is a real cost but not a per-report COGS item — see Section 1.7 finding above.)

---

## 4. Comparable Products & Legal/Liability Landscape

**Disclaimer**: General informational research for the product team's own legal counsel to review — **not legal advice**, does not cover Washington-specific statutes/case law, not a substitute for counsel review before launch.

### 4.1 Comparable Products
- **ADUniverse** (UW eScience/DSSG, Seattle-specific, ArcGIS Hub-hosted) — free, academic/city-affiliated preliminary ADU feasibility score. **Closest existing functional analog** to the ADU use case, but free and ADU-only, not a paid general buildability product.
- **NW ADU Builders** — free AI-generated feasibility report as a lead-gen tool for their own construction services (not sold standalone).
- **Seattle SDCI's own GIS/zoning tools** — free, government-run, the baseline "alternative" any user could use instead of paying for this product (an important framing point for the value proposition: speed/synthesis, not access to otherwise-unavailable information).
- **Zoneomics** — zoning data/API platform, tiered subscription + per-report product, targets brokers/lenders/REITs, not Seattle-specific.
- **DeepBlocks** — computes buildable FAR/setbacks/massing across 126+ US cities; tiered $99-$5,999/mo, targets developers/investors — **validates the "pay per parcel report" pattern at a much higher price point** than $9.99, for a professional audience.
- **Finding**: No direct paid consumer competitor was found doing "$9.99 Seattle homeowner preliminary buildability report" specifically. This is either white space or a sign the segment doesn't support a standalone paid product at consumer price points — professional-tier products (DeepBlocks-style) clearly monetize at much higher prices for a smaller, higher-value audience. Relevant to the persona-prioritization question.

### 4.2 Legal/Liability Risk Categories (informational only)
- **Unauthorized practice (law/architecture/engineering/surveying)**: general pattern is that providing informational/software tools is distinguished from providing professional opinions requiring a license; risk rises with how "final/authoritative" output is framed. LegalZoom's repeated UPL litigation (NC bar dispute since 2011; new NJ class action 2024) is the clearest illustrative analog for algorithmically-generated, human-adjacent output.
- **Disclaimer patterns from comparable "estimate" products**:
  - Zillow Zestimate: "as-is/as-available," no warranty of accuracy, user bears all risk, explicit prohibition on using it in place of an appraisal "in any situation in which applicable law requires an appraisal."
  - Mortgage pre-qualification tools: explicit "not a loan approval or commitment to lend," non-binding due to unverified underlying data.
  - Both patterns map directly onto Permit Preflight's existing "not a permit guarantee" framing (brief Section 1) and should inform actual ToS/report-footer language.
- **Government open-data licensing risk**: the general pattern (confirmed here specifically for King County/Seattle in Section 1) is that open-data policies vary in practice — some municipal/county portals restrict scraping/redistribution/commercial derivative use even when nominally "open." Each dataset must be checked individually (done above), not assumed uniformly permissive.

---

## 5. Tier-2 Regulatory Rule Review — Professional Cost Landscape

**Requested 2026-08-19** after the risk-based rule-review model (requirements.md §3.2) was approved, to quantify what escalating an ambiguous/high-consequence candidate rule to a domain professional is likely to cost. Researched three distinct professional types, since different Tier 2 triggers call for different expertise.

| Professional type | Typical hourly rate | Flat/project alternative | Confidence |
|---|---|---|---|
| Land-use consultant / permit expediter | $50–$300/hr, most commonly $100–$250/hr | $1,500–$5,000+ packages exist but skew toward full permit management, not a single-question fit | General market range, not Seattle-verified |
| Architect (code-review/consultation, not design) | $150–$350/hr, Seattle sources cluster $175–$250/hr | Rare for narrow review; hourly is the standard mode for feasibility/peer-review/code-consultation scope | **Seattle-specific sources found** — moderate-high confidence |
| Land-use / real estate attorney | $200–$600/hr general land-use specialty; WA statewide average lawyer rate ~$346/hr (not land-use-specific) | Simple zoning questions often quoted $500–$1,500 flat; free/low-cost initial consult before hourly billing is common | General market range; WA figure not land-use-specialty-specific |

**Note**: No source specifically labeled "Seattle land-use attorney" or "Seattle land-use consulting firm" rates was found — only architect rates came back Seattle-specific. Attorney/consultant figures are general-market planning estimates, not verified local quotes. As a reference anchor (not a private-market comparable), Seattle's own SDCI charges **$292–$551/hr** for its own land-use application review labor (2026 fee schedule) — useful context for how the local jurisdiction itself prices this kind of work.

**Rough per-rule Tier 2 cost** (assuming 1-3 hours of professional time per escalated rule):
- Land-use consultant: **~$100–$750**
- Architect: **~$175–$1,050**
- Land-use attorney: **~$200–$1,800** hourly, or **~$500–$1,500 flat** for a simple question

**Fit mapping** (judgment call for the founder at triage time, not prescriptive):
- **Land-use consultant/planner** — "does this match the standard zoning process/formula" questions (lot coverage math, general zoning mechanics) — cheapest, closest to day-to-day permitting practice.
- **Architect** — where construction-practical judgment intersects the rule (ADU height/setback edge cases, "story" definitions, roof-form measurement disputes) — mid-range, strongest Seattle-specific data.
- **Land-use attorney** — genuinely ambiguous legal text, undefined terms, discretionary/administrative determinations — most expensive per hour, but flat "quick consult" pricing is common and fits occasional, per-rule use well.

**Assessment**: Tier 2 cost is real but bounded — a worst-case attorney escalation (~$1,800) is still a one-time cost amortized across every future report that rule ever supports, not a per-report cost. At even modest report volume for a given project type, this amortizes to a negligible per-report figure. This does not change the $9.99 pricing conclusion in §3 above; it's a real early-stage cash cost to budget for as a maintenance/rule-development line item, not a threat to unit economics.

---

## 6. Consolidated Findings Requiring Explicit Attention

1. **SMC Title 23 rule content is a curated legal-research workflow by design, not a data pipeline** — confirmed appropriate given the architecture (see revised 1.7). Provenance chain: Municode (current text, human-read) + City Clerk/Legistar (ordinance-level change history) → independently-written rule spec with citation → typed implementation → tests → approval. Rule-coverage velocity is bounded by human legal-research labor, not engineering effort — **this affects project-type sequencing and timeline expectations**, and is worth a narrow counsel confirmation on Municode's clickwrap terms before scaling, but is not a blocker.
2. **King County Assessor owner-name data carries a specific RCW commercial-use restriction** — needs explicit product design decision (e.g., don't display/export raw owner-name lists) and legal sign-off.
3. **Utility availability (SPU) has no automatable data path** — must be modeled as REQUIRES VERIFICATION, not KNOWN, for MVP.
4. **Seattle ECA liquefaction layer is a 1995-vintage derived product** — currency/accuracy caveat that should surface to users as evidence metadata, not be presented with false precision.
5. **$9.99 pricing is not threatened by infrastructure or LLM cost** at any modeled volume (COGS ~$0.60-$0.70/report at scale, excluding rule-research labor). The real cost driver is human regulatory-research time, which doesn't show up in per-report COGS but is a real fixed/ongoing cost.
6. **Tier 2 regulatory rule review has a real but bounded cost** (Section 5) — roughly $100-$1,800 per escalated rule depending on professional type and complexity, amortized across all future reports using that rule. Not a threat to unit economics; a real early-stage cash-planning item.
7. **No direct paid consumer competitor found at the $9.99 Seattle-homeowner price point** — closest analogs are either free/academic (ADUniverse) or professional-tier priced 10-500x higher (DeepBlocks, Zoneomics). This is a genuine open question for the persona/pricing decision, not just a risk — it could mean white space, or it could mean this exact segment/price hasn't proven out. Recommend treating this as supporting evidence for prioritizing the professional/prosumer persona (higher willingness to pay, precedent at higher price points) while still being honest that the consumer segment is unproven.

None of these findings indicate the product concept is fundamentally infeasible. They do materially inform MVP project-type sequencing, evidence-confidence modeling, and the persona/pricing recommendation in `requirements.md`.
