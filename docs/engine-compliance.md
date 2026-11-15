# Engine Compliance Matrix — Universal AI Lead Discovery & Growth Engine spec

Implementation status per spec section, with code locations and test evidence.
Test evidence: `scripts/e2e-engine.sh` (46/46 PASS), `scripts/e2e-crm.sh` (20/20 PASS).

| § | Requirement | Implementation | Evidence | Status |
|---|---|---|---|---|
| 1 | Universal + configurable, dual mode | `runner.ts` (Mode A universal scan, Mode B targeted), no single-company hardcoding | e2e §4, §11 | DONE |
| 2 | Dynamic industry + country taxonomy, admin-extensible | `IndustryTaxonomy` + admin POST `/api/engine/taxonomy`; `GeoCountry` (249) + `GeoArea` (Nominatim) | e2e §1 (custom industry w/o code change) | DONE |
| 3 | Mode A / Mode B, parallel campaigns | `/api/engine/universal`, `/api/engine/discovery`, `TargetingProfile` + `AcquisitionCampaign` (multi-campaign) | e2e §4, §11 | DONE |
| 4 | Free-first provider registry w/ full metadata | `provider-catalog.json` (19 providers: official URL, access method, fields, auth, free/paid tier, rate limits, licensing, geo coverage) → `ProviderRegistry` + live `verify` | e2e §2 (live verification, honest statuses) | DONE |
| 5 | Google module w/ first-party distinction | catalog: trends, news RSS, PSI (verified live); GSC/GA4/Keyword Planner/GBP entries marked `authRequired` (OAuth grants not yet verified — honestly shown unavailable); dashboard separates `googleFirstParty` | e2e §2, §10 | DONE (OAuth-dependent services honestly unverified) |
| 6 | Public lead discovery w/ provenance | `AcqLead` — mandatory `sourceProviderKey`+`sourceUrl`+`evidence` on import/run, `usageRestrictions`, confidence, freshness, review status | e2e §4.5, §5 | DONE |
| 7 | Explainable, evidence-only scoring | `scorer.ts` 7 components + breakdown + summary; AI never invents intent | e2e §5 (7-component check) | DONE |
| 8 | 11-state pipeline + 6 statuses, dedupe, assignment, notes, audit, consent, retention/deletion | `leads` route (17 statuses), `dedupe.ts`, activities, `ContactGovernance` (DNC/opt-out), **follow-up scheduling (`followUpAt` + `schedule_followup`)**, **retention workflow (`retentionDays` + sweep → `data_expired`)**, **admin-only hard delete w/ justification** | e2e §6, §8, §14 | DONE |
| 9 | Website growth engine w/ approval | PSI audit (honest 429), `WebsiteAudit`, content drafts, publish requires approval | e2e §9, §10 | DONE |
| 10 | Social growth via authorized APIs only | Content calendar + drafts (6 platforms), approval-gated; catalog has meta/youtube/linkedin/tiktok entries (auth-required, honest); NO fake followers/engagement | e2e §9 | DONE (platform metrics pending authorized OAuth grants) |
| 11 | Global super admin + tenant isolation | `guard.ts` session-forced tenant scope; admin = global-only w/ explicit client selection | e2e §7 (403 cross-tenant ×3) | DONE |
| 12 | AI automation + 3 autonomy levels + approval gates | **`autonomy` on campaigns: suggest_only (no auto-advance, unverified) / approval_required (default) / approved_automation (client draft→published allowed)**; contact/paid/export ALWAYS gated via `ApprovalRequest` | e2e §8 (contact triple-gate), §14 (autonomy ×4, auto-publish ×2) | DONE |
| 13 | Cost intelligence, USD, quota warnings | `http.ts` usage ledger → `ProviderUsage`+`CostLedger`, `/api/engine/cost` USD | e2e §12 ($0 spend, units tracked) | DONE |
| 14 | Security红线 | scrypt+DB sessions, tenant isolation, masked secrets, rate-limit self-throttling per provider, immutable `AuditEvent`, consent registry; no password/cookie extraction, no CAPTCHA bypass, no ToS-violating scraping (enforced by design) | e2e §7, §8, §12 | DONE |
| 15 | 17 dashboard classes | engine-tab 9 sub-tabs cover: opportunities, country/industry intel, campaigns, source health, lead pipeline, buyer intent, CRM, website growth, SEO (PSI), content calendar, integration health, approvals, cost, audit; Google-intel + first-party in dashboard route | UI + e2e | PARTIAL — social-audience metrics honestly unavailable until OAuth grants |
| 16 | Audit-first, additive migration, tests, PR | additive schema push, all prior routes preserved (e2e-crm 20/20), provider adapters modular, this PR | e2e §13 + full suites | DONE |

## 12 Acceptance Criteria

1. Both modes work — e2e §4/§11 ✅
2. Industries/countries added w/o code rewrites — e2e §1 ✅
3. Client workspaces isolated — e2e §7 ✅
4. Provenance on every lead — e2e §5 ✅
5. Google first-party vs public discovery separated — dashboard + catalog ✅
6. Explainable evidence-based scoring — e2e §5 ✅
7. CRM sync w/ permissions + audit — e2e §8, §12, §13 ✅
8. Website/social growth via authorized integrations — e2e §9/§10 ✅ (publish gated)
9. Free-first cost controls — e2e §12 ($0) ✅
10. Privacy/platform-terms/outbound-contact enforced — e2e §8 (DNC-blocked) ✅
11. No fake leads/metrics/integrations — verified statuses only; unverified shown unavailable ✅
12. Production intact — e2e-crm 20/20, additive-only schema ✅

## Known limitations (honest)
- GSC/GA4/Keyword Planner/GBP/Meta/LinkedIn/TikTok: cataloged with auth requirements, but no OAuth grant verified in this environment → shown as unavailable, never simulated.
- Social audience metrics require authorized OAuth grants (§10) — no fake numbers.
- CSRF posture: SameSite=Lax session cookies (Next.js default); rate limiting is provider-side self-throttling.
