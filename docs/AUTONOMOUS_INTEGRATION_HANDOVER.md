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
