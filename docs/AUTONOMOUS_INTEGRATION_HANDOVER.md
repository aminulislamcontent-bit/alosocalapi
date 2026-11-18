# Autonomous Integration Handover — implementation contract

## Product outcome
A client supplies a provider selection plus one starting identity (public page/account URL, international phone number, or account identifier). ALOAPI prepares a provider-specific integration handover package so the implementation team does not have to manually research every API field.

## Required agent workflow
1. Normalize the supplied identity and identify the selected provider; never infer ownership from a public URL or phone number alone.
2. Discover official prerequisites, API version, authentication method, required scopes, endpoints, rate limits, webhook requirements, pricing, regional availability, app-review and business-verification requirements.
3. Detect existing tenant/provider credentials and accounts before creating anything; prefer reuse over duplicate account/app creation.
4. Prepare official developer-portal steps and redirect/webhook configuration.
5. Use official OAuth/API flows where supported. Any interactive login must happen directly on the provider's official origin; ALOAPI must not collect account passwords, OTPs, MFA codes, recovery codes, or session cookies.
6. Pause for owner action for CAPTCHA, MFA, business verification, app review, legal acceptance, billing, scope elevation, publishing, messaging consent, and irreversible changes.
7. Store only provider-issued credentials in the encrypted tenant vault. Never fabricate credentials or log plaintext values.
8. Run a real least-privilege read-only API probe. Report the actual HTTP result; never equate saved credentials with a verified integration.
9. Produce a tenant-scoped handover manifest with credential metadata, setup status, limitations, approval requirements, and secret-free configuration export.

## Important boundary
The new `POST /api/onboarding/handover` endpoint generates a provider-specific manifest from a supplied identity, catalog, workflow state, and encrypted-vault metadata. It can optionally create a supervised official-portal checkpoint. This endpoint does not yet claim fully autonomous browser-based developer-app creation or credential extraction. Those require persistent headed-browser lifecycle support and provider-specific, tested portal automations.

## Acceptance criteria
- Phone numbers are normalized as E.164; URLs must be HTTPS.
- Provider identity is explicit and tenant-scoped.
- Manifest includes provider setup checklist, scopes, credential types, OAuth, webhook, API endpoint, approval and compliance requirements.
- Secret values never appear in the response or export.
- A credential is marked collected only when matching active encrypted-vault metadata exists.
- VERIFIED is reported only when the onboarding workflow is actually VERIFIED.
- All owner checkpoints remain visible and cannot be bypassed by automation.

## Implementation & verification status (2026-11-18)

`POST /api/onboarding/handover` now covers the implemented steps of the contract above:

1. **Identity normalization:** phone inputs are normalized to real E.164 (`+8801712345678`) from `+880 (171) 234-5678`, `00880…`, unicode dashes and bare international numbers. National numbers without a country code are rejected. URL inputs must be HTTPS, must parse as a URL, and may not contain embedded user-info credentials. Account identifiers are length-checked and trimmed.
2. **Discovery:** a persisted, hash-indexed catalog discovery snapshot is created and its `snapshotId`, `docHash` and honest `SNAPSHOT_CATALOG_SYNCED` fetch status are returned. Nothing is represented as a live provider fetch.
3. **Credential detection:** active encrypted-vault metadata is tenant/provider scoped and listed as status only; a credential is `COLLECTED_ENCRYPTED` only when a matching `ACTIVE` vault record exists. Plaintext values never appear in the manifest or response.
4. **Owner gates:** `requiredOwnerActions` (deduplicated) and four explicit `ownerCheckpoints` are surfaced in both `preparation` and `handover`. Passwords, OTPs, MFA codes, recovery codes, cookies, CAPTCHA, KYC, app review, legal consent, billing and irreversible actions remain owner-controlled.
5. **Optional supervised checkpoint:** `startOfficialPortal: true` creates a `WAITING_FOR_OWNER` browser session on the provider's official HTTPS origin, with an honest note that no login or app creation was automated.
6. **Optional real verification probe (contract step 8):** `runLiveProbe: true` invokes the existing least-privilege read-only verifier. It reports the real `executed`, `verified`, `status`, `httpStatus`, `checkedEndpoint`, `testedAt` and `message` values. With no authorized credential it returns `OWNER_ACTION_REQUIRED` without making an outbound call. The result never fabricates a `VERIFIED` manifest; `verification.verified` is still derived only from the onboarding workflow state.

### Automated evidence

- `tests/integration-handover.test.cjs` (wired into `npm run test:unit`): E.164/URL/account normalization, tenant isolation, secret-free manifest, credential-status honesty, `VERIFIED` claim gating, owner-checkpoint visibility, unknown-provider refusal.
- `tests/e2e-onboarding-runtime.test.cjs` § 11c: real production standalone HTTP server — `401` unauthenticated, `403` cross-origin, `400` invalid inputs, `200` phone normalization, secret-free response, discovery snapshot, optional supervised portal checkpoint visible in the admin overview, and honest opt-in live probe.
- `npm run test:e2e` also executes the real Playwright/Chromium click-through acceptance suite.

### Boundary that still holds

Persistent headed-browser lifecycle control, automatic provider developer-app creation, universal credential extraction, live third-party OAuth/KYC approval, DNS ownership verification and external message/email/SMS/call delivery are **not** implemented here. They require owner-issued provider credentials, official portal access, and provider-specific tested automations. ALOAPI never substitutes a local generated value for a provider-issued credential and never bypasses owner verification.
