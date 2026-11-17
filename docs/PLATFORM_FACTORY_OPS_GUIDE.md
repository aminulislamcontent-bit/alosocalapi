# ALOAPI Platform Factory — Configuration, Architecture & Operations Guide

## 1. Two-Layer Ecosystem Architecture (Strict Boundary)

ALOAPI separates external SaaS integration intelligence from first-party operational software so that customer credentials, data models, and provider capabilities remain strictly isolated and transparent:

1. **Layer 1 — External Platform Integration Intelligence (`src/lib/intelligence/`, 131 providers across 11 categories)**
   - Catalogs verified official documentation, OAuth scopes, rate limits, webhooks, licensing/commercial notes, regional availability, and verification evidence for 131 external third-party platforms (including 10 telephony/SIP/voice AI providers in Category 11).
   - **Rule:** First-party ALOAPI modules are **never** inserted into `ALL_INTEGRATION_CATALOG`.
2. **Layer 2 — First-Party Platform Factory (`src/lib/factory/`, 20 modules + shared infrastructure)**
   - Provides 20 independently deployable marketing, communications, and automation platforms inside ALOAPI (`/factory` and `/factory/[moduleKey]`, backed by `/api/factory/**` and `/api/v1/factory`).
   - Consumes Layer 1 external providers **only** through `src/lib/factory/provider-bridge.ts`, which requires `explicitOwnerConsent === true`, RBAC `approve` permission, and active encrypted credentials in `CredentialVaultEntry`.

## 2. Shared Infrastructure Modules (`src/lib/factory/`)

| Module | File | Purpose |
| :--- | :--- | :--- |
| Tenancy & RBAC | `tenancy.ts` | Workspace creation (`FactoryWorkspace`), role-based access (`owner`, `admin`, `operator`, `analyst`, `viewer`), CSRF & session enforcement via `requireFactoryAccess`. |
| Billing & Usage Ledger | `billing.ts` | Tracks AI tokens, email volume, voice minutes, and estimated USD cost per workspace and billing period (`YYYY-MM`). |
| AI Router & Local Inference | `ai-router.ts` | Routes tasks across `local_deterministic` (no external dependency), `ollama_local_http` (loopback SSRF-protected local inference), and `openai_compatible` (Vault-backed external endpoint). |
| Explicit Provider Bridge | `provider-bridge.ts` | Enforces owner consent + Vault status before linking a Layer 1 external provider to a Layer 2 first-party module. |
| Job Queue & DLQ | `job-queue.ts` | Persistent job queue with idempotency deduplication, exponential backoff retries, Dead-Letter Queue (`dead_letter`), and manual DLQ recovery. |
| Portability & Backups | `portability.ts` | Secret-free workspace configuration JSON export (`secretsIncluded: false`, SHA-256 checksum) and validated restore. |

## 3. First-Party Platform Modules Inventory (All 20 Modules)

1. `email_marketing` (Priority) — Verified sending domain gate (`SPF`/`DKIM`/`DMARC` via live DNS lookup or explicit owner verification), consent/suppression registry, RFC 8058 one-click unsubscribe (`/api/factory/modules/email_marketing/unsubscribe`), bounce-rate reputation scoring & auto-pause, SMTP/Provider/Sandbox-Mock adapters.
2. `voice_call_center` (Priority) — Inbound/outbound voice orchestration supporting **Bangla (`bn`), English (`en`), Hindi (`hi`), Arabic (`ar`), Spanish (`es`)**, lawful calling-hours & timezone check, DNC/consent verification, mandatory recording disclosure turn before agent audio, SIP Trunk / Vault Provider / Mocked Telephony adapters, human handoff detection, and post-call summary.
3. `social_media_manager` — Multi-channel content scheduling, asset compliance check, owner approval queue.
4. `ai_crm` (Priority) — Isolated First-Party CRM (`FactoryCrmOrganization`, `FactoryCrmContact`, `FactoryCrmOpportunity`, `FactoryCrmActivity`) completely separate from legacy ALOAPI `CrmLead`/`CrmContact` tables.
5. `marketing_automation` (Priority) — Visual DAG workflow builder with cycle detection, trigger conditions, idempotency deduplication, human `approval_checkpoint` pause/resume, and failed run recovery.
6. `chatbot_support` — Knowledge-grounded multilingual assistant with automatic escalation triggers.
7. `ads_management` — Multi-network campaign budgeting, spend caps, and explicit external ad-account approval checkpoints.
8. `seo_content` — Keyword briefs, structured metadata, and multilingual AI draft generation.
9. `lead_generation` — Capture pipelines with explicit consent validation and deterministic lead scoring.
10. `creative_studio` — Campaign creative briefs, copy variations, and approval staging.
11. `sms_marketing` — Opt-in gating, GSM-7 / UCS-2 encoding & segment calculation (including Bangla Unicode), and STOP opt-out verification.
12. `whatsapp_marketing` — Template category validation (`UTILITY`, `MARKETING`, `AUTHENTICATION`) and 24-hour customer service window checks.
13. `landing_pages` — HTML landing page builder with `<script>` / inline-handler XSS neutralization.
14. `forms_surveys` — Schema-driven form definitions and submission storage with consent tracking.
15. `customer_journey` — Cross-channel touchpoint recording and attribution weighting.
16. `analytics_attribution` — Workspace-scoped metrics summarizing campaigns, voice sessions, automation runs, and CRM pipeline revenue.
17. `appointment_booking` — Double-booking conflict detection and schedule management.
18. `reputation_manager` — Review tracking, sentiment classification, negative-review escalation, and response drafts.
19. `affiliate_marketing` — Referral links, conversion events, and commission calculation (`pending` -> `approved`).
20. `marketing_intelligence` — Cross-channel workspace executive diagnostic recommendations via local AI router.

## 4. Database Schema & Migrations

- **Additive Migration #4:** `prisma/migrations/20261117000300_first_party_platform_factory/migration.sql` (22 new SQLite tables; zero destructive SQL).
- **Commands:**
  ```bash
  npm run db:validate
  npm run db:generate
  npm run db:migrate:deploy
  ```

## 5. Verification Commands

```bash
npm run typecheck
npm run lint
npm run build
npm test
node --test tests/e2e-onboarding-runtime.test.cjs
node --test tests/e2e-factory-runtime.test.cjs
node scripts/aloapi.mjs doctor --json
```
