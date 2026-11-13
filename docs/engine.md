# Universal Lead Discovery & Customer Acquisition Engine

Implementation notes, verification status, migration/rollback, and known limitations.

## What was built (extending, not rebuilding)

The engine lives **alongside** the existing ALO Education BD app (credential portal + CRM + SetupBot Pro) and reuses its auth (`PortalSession`, `getSessionUser`), tenant model (`ClientAccount` = workspace), and UI conventions.

| Spec section | Implementation |
|---|---|
| §2 Industry/country config | `IndustryTaxonomy` (DB-driven, bilingual bn/en, admin-extensible via API — zero code rewrites) + `GeoCountry` (249 ISO-3166 entries from the maintained `world-countries` dataset) + `GeoArea` (admin-added regions/cities/postal, Nominatim-geocoded) |
| §3 Two modes | Mode A `POST /api/engine/universal` (market scans → `OpportunityReport`) + Mode B profiles/campaigns → `POST /api/engine/discovery` |
| §4 Provider registry | 19 providers seeded from `src/lib/engine/provider-catalog.json` with access method, data fields, free/paid tier, rate limits, licence, coverage. Status changes **only** through live verification (`POST /api/engine/providers/verify`) |
| §5 Google module | PageSpeed Insights = **real, working**. Search Console / GA4 / Keyword Planner / GBP = `requires_credentials` (OAuth), never claimed connected; first-party vs public discovery separated in the dashboard response (`googleFirstParty`) |
| §6 Public lead discovery | Wikidata SPARQL (CC0, verified live) + import API with **mandatory provenance** (`sourceProviderKey` + `sourceUrl` rejected otherwise); every lead stores evidence + restrictions + freshness |
| §7 Intent & scoring | 7-component explainable scorer (`src/lib/engine/scorer.ts`); intent evidence counted only from stored evidence types — no invented buying intent |
| §8 CRM pipeline | `AcqLead` with the full 17-state pipeline, dedupe fingerprints (domain > name+city), activities, DNC/opt-out registry (`ContactGovernance`), consent + lawful-basis fields |
| §9 Website growth | Real PSI audits (`WebsiteAudit`) + rule-mapped recommendations from actual Lighthouse audits |
| §10 Social growth | Content calendar with approval-gated publish; explicit no-fake-followers / no-auto-engagement policy; platform analytics marked unavailable until official OAuth |
| §11 Admin + isolation | Engine guard `requireEngineScope`: client sessions hard-scoped to own tenant; admin acts globally with audit; verified by E2E (403 on cross-tenant reads) |
| §12 Approvals | `ApprovalRequest` workflow (paid_usage, bulk_export, outbound_contact, public_publish, credential_change, integration_change); only global admin decides; content publish + contact execution require it |
| §13 Cost | `ProviderUsage` + `CostLedger` (USD), daily self-limits, warnings at ≥70%; free-first budget modes enforced in the discovery runner |
| §14 Security | Server-side only calls, UA identification, timeouts, bounded retries, immutable `AuditEvent` trail, contact gate (DNC → consent → approval) |
| §15 Dashboards | `/api/engine/dashboard` aggregates — every metric from stored data; `unavailable[]` lists honestly what is not connected |

## Live provider verification (from this sandbox)

| Provider | Status | Note |
|---|---|---|
| google_trends (RSS) | **verified** | 200 OK, real trending queries |
| google_news_rss | **verified** | 200 OK, real headlines |
| osm_nominatim | **verified** | 200 OK geocoding |
| wikidata_sparql | **verified** | real BD/IN business entities with official websites (~2s/query) |
| pagespeed_insights | rate_limited | reachable; 429 from datacenter IP — honest handling, works with free API key |
| wikimedia_pageviews | rate_limited | reachable; 429 backoff |
| osm_overpass | blocked_here | all mirrors unreachable from sandbox; adapter ready for open networks |
| reddit_public | blocked_here | 403 without OAuth; adapter supports tenant Bearer token |

Re-verify anytime: admin → গ্রোথ ইঞ্জিন → ডেটা সোর্স → "রিয়েল ভেরিফিকেশন চালান".

## Migration

Additive-only `prisma db push` on `db/custom.db` (SQLite): 17 new tables + 7 back-relations on `ClientAccount`. No existing column was modified or dropped; existing data untouched (verified by `e2e-crm.sh` regression, all PASS).

Rollback:
```bash
# 1. Restore schema (drops only the new tables)
git checkout <pre-engine-commit> -- prisma/schema.prisma
npx prisma db push --accept-data-loss   # “--accept-data-loss” only affects the new empty tables
# 2. Regenerate client
npx prisma generate
# 3. Remove engine code paths (all isolated under):
#    src/lib/engine/**  src/app/api/engine/**  src/components/engine/**
#    scripts/seed-engine.mjs  scripts/e2e-engine.sh
```

## Known limitations (documented, not hidden)

1. Google first-party sources (GSC/GA4/KP/GBP), Meta, LinkedIn, YouTube API, Product Hunt: not connected — need tenant OAuth credentials; status is honest in UI/API.
2. Reddit/Overpass unreachable from this hosting network; adapters ready, statuses recorded as `blocked_here`.
3. Content drafts are rule-based templates (origin `rule_template`) — the project has no AI config (`.z-ai-config`); drafts are meant for human editing. Nothing is labeled "AI-generated" that isn't.
4. Contact recording is a governed workflow record — the engine never auto-sends messages; real sending happens through official channels by humans/approved integrations.
5. Wikidata public lead discovery covers entities registered in Wikidata with official websites — coverage varies by country (BD/IN verified; some countries sparse).
6. Bengali country names fall back to English where the dataset lacks `ben` translations.
7. `.env` and `db/custom.db` remain git-tracked in this staging repo (pre-existing issue — recommend untracking; not changed in this task to avoid touching deployment assumptions).
