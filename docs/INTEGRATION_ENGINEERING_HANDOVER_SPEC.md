# ALOAPI — Universal Autonomous Credential Preparation, Integration Engineering & Client Handover Specification

**Date:** 2026-11-17  
**Branch:** `arena/5f91888f-alosocalapi`  
**Scope:** Independent AI Integration Engineering Workspace (`src/lib/engineering/`, `src/app/api/engineering/`, `src/components/engineering/engineering-hub.tsx`, `/engineering`) layered cleanly alongside ALOAPI's 131 external provider adapters (`src/lib/intelligence/`) and 20 first-party AI marketing platforms (`src/lib/factory/`), without touching legacy ALOAPI CRM records (`Lead`, `Contact`, `CrmTask`).

---

## 1. End-to-End Pipeline Architecture

```
Client Website URL (https://...)
   │
   ▼  src/lib/engineering/website-discovery.ts (SSRF-hardened fetch / HTML snapshot + JSON-LD + Tech Fingerprint)
IntegrationProject + WebsiteDiscoveryReport (extracted brand, contacts, social, policies, exact missingFields)
   │
   ▼  src/lib/engineering/provider-adapters.ts (All 131 external adapters, 10 Dev-Setup determinations, Execution & Handover Modes)
   ▼  src/lib/engineering/credential-engineering.ts (OAuth App Registry + Webhook/DNS + 4-Origin Credential Ledger + AES-256-GCM Vault)
OAuthAppRegistryEntry + CredentialPreparationRecord + VaultCredential (ALOAPI-GENERATED Ed25519/HMAC/JWT keys encrypted at rest)
   │
   ▼  src/lib/engineering/verification-coordinator.ts (Minimal Owner Gates: Email/OTP/MFA/CAPTCHA/Domain/App Review)
VerificationCheckpoint ──► Auto-resumes OnboardingWorkflow (20-state machine) upon owner verification
   │
   ▼  src/app/api/engineering/providers (action: test_connection -> honest read-only probe)
   ▼  src/lib/engineering/handover-packager.ts (17-section Client Handover Package + ZIP + Client Import Validator)
ClientHandoverPackage (Secret-Free Default ZIP / JSON + Optional Owner-Authorized AES-256-GCM Vault Transfer)
```

---

## 2. Credential Origin Classification Matrix (4 Origins × 11 Types × 7 Statuses)

| Origin Classification | Owner | Example Types | Stored In | Export Default |
| :--- | :--- | :--- | :--- | :--- |
| **`ALOAPI-GENERATED`** | `aloapi_platform` | `webhook_signing_secret`, `jwt_signing_key`, Ed25519 `key_pair`, `api_key` | Encrypted `VaultCredential` (AES-256-GCM); public metadata in `CredentialPreparationRecord` | Excluded; public keys & env var names exported only |
| **`PROVIDER-ISSUED`** | `shared_delegated` | `access_token`, `refresh_token`, `api_key` | Encrypted `VaultCredential` once issued via official OAuth/portal | Excluded (`CLIENT_ACTIVATION_REQUIRED` / `PROVIDER_APPROVAL_REQUIRED` if unissued) |
| **`CLIENT-OWNED`** | `client_owner` | `oauth_client_id`, `oauth_client_secret`, `app_secret`, `service_account` | Encrypted `VaultCredential` under client tenant ID | Excluded; handover instructions specify Client Reissuance or Official Delegation |
| **`PREPARED-CONFIGURATION`** | `client_owner` | `config_value`, Redirect URIs, Callback URLs, Webhook URLs, DNS TXT/SPF/DKIM/DMARC | `CredentialPreparationRecord` + `OAuthAppRegistryEntry` | Included cleanly in `.env.template` & `client-project-import.json` |

---

## 3. Portability & Client Handover Modes (Modes 1–4)

| Handover Mode | When Applied | Transfer Behavior |
| :--- | :--- | :--- |
| **Mode 1 — `DIRECT_TRANSFER`** | Platforms supporting collaborator/organization app ownership transfer (`github_api`, `vercel_api`, `shopify_admin`) & `ALOAPI-GENERATED` keys | Full configuration + optional owner-authorized AES-256-GCM vault backup export |
| **Mode 2 — `CLIENT_ACCOUNT_REISSUANCE`** | Account-bound API keys, service accounts, bot tokens (`sendgrid_api`, `stripe_api`, `telegram_bot_api`, CRM keys) | Client imports `client-project-import.json` + `.env.template` and issues replacement credentials in their own account |
| **Mode 3 — `AUTHORIZED_DELEGATION`** | Business Manager / Ad / Messaging portfolios (`meta_facebook_pages`, `whatsapp_cloud_api`, `google_ads`, `linkedin_marketing_api`) | Client retains Business Manager ownership and grants official partner/team role permissions |
| **Mode 4 — `CONFIGURATION_ONLY`** | Non-secret webhook specs, DNS instructions, OAuth redirect templates, and schema maps | Zero-secret ZIP package delivered with verified SHA-256 checksum & minimal remaining checklist |

---

## 4. Universal Provider Adapter Execution Modes & Honest Truth Policy

All 131 external providers expose `executionMode` (`FULLY_AUTOMATED`, `OFFICIAL_API_AUTOMATION`, `AUTHORIZED_BROWSER_AUTOMATION`, `SUPERVISED_PORTAL_HANDOFF`, `OWNER_ACTION_REQUIRED`, `CONFIGURATION_ONLY`, `UNSUPPORTED`). Because third-party developer portals (`Meta`, `Google`, `TikTok`, `LinkedIn`, `X`, etc.) prohibit unauthenticated automated app creation or credential scraping, adapters honestly mark `hasOfficialAppCreationApi: false`, prepare 100% of redirect URIs, webhooks, scopes, DNS instructions, and signature verifiers ahead of time, and minimize owner verification actions.

---

## 5. Security Guarantees & Legacy CRM Isolation

1. **Zero Secret Leaks:** Private keys, JWT keys, HMAC secrets, and tokens are stored strictly in AES-256-GCM `VaultCredential`. Default JSON/ZIP handover packages enforce `secretsIncluded: false`.
2. **No Password/OTP Harvesting:** `completeCheckpointAndResumeWorkflow` explicitly blocks any payload property matching `password`, `otp`, `verification_code`, `pin`, or `recovery_code`.
3. **SSRF Defense:** `validateWebsiteDiscoveryUrl` rejects RFC 1918 private networks, cloud metadata (`169.254.169.254`), non-HTTP schemes, and loopback addresses (except when explicitly enabled in isolated test mode).
4. **Legacy CRM Untouched:** `tests/integration-engineering.test.cjs` asserts `db.lead.count() === 0`, `db.contact.count() === 0`, and `db.crmTask.count() === 0` after complete end-to-end discovery, credential preparation, handover export, and client import validation.

---

## 6. Authorized Autonomous Client API Execution Engine (`src/lib/engineering/client-api-executor.ts`)

| Impact Level | Matching Criteria | Approval Gate | Credential & Domain Guard |
| :--- | :--- | :--- | :--- |
| **`READ_ONLY`** | `GET` / `HEAD` methods (when not matching mutation verbs) | Not required beyond admin/operator session + project binding | Secret resolved server-side from AES-256-GCM `VaultCredential` (`access_token` / `api_key`); URL validated against provider `apiBaseUrls` |
| **`LOW_IMPACT_WRITE`** | Non-destructive `POST`/`PUT`/`PATCH` draft operations | Session + CSRF verified | Same Vault + HTTPS allowlist; response redacted via `redactSecretText` |
| **`HIGH_IMPACT_ACTION`** | `DELETE` HTTP method OR action tokens (`publish`, `send`, `broadcast`, `spend`, `billing`, `charge`, `invoice`, `delete`, `revoke`, `permission`, `role`, `transfer`, `dns`, `webhook_mutate`, `payout`, `ad_launch`) | **MANDATORY EXPLICIT APPROVAL GATE:** Refuses execution (`HTTP 403`, `APPROVAL_REQUIRED`, `AgentExecutionRun.complianceDecision = 'DENIED_APPROVAL_REQUIRED'`) unless `ownerApprovalGranted === true` AND a valid `VerificationCheckpoint` ID or explicit `approvalReference` is supplied | Fails honestly with `CLIENT_ACTIVATION_REQUIRED` when Vault has no issued client credential |

See `docs/PROVIDER_CAPABILITY_PORTABILITY_MATRIX.md` for the full tabulated capability, execution mode, and handover portability matrix across all **131 external providers** and **20 first-party AI marketing platforms**.

