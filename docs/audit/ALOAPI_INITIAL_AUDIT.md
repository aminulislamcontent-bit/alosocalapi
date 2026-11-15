# ALOAPI Initial Existing-Project Audit

**Audit date:** 2026-11-15 (UTC)

**Repository:** `aminulislamcontent-bit/alosocalapi`

**Branch / baseline:** `arena/f3946bcf-alosocalapi` at `056dd3816d7abdd6938338b3e664f200baccfbfe`
**Audit scope:** discovery only; no application source, database, migration, deployment, or submodule pointer was changed during discovery. Dependencies were installed locally for checks (`node_modules/` is ignored).

## Executive summary

This is an existing Next.js 16 / React / TypeScript application, not an empty repository. It contains a substantial ALO Education BD client-credential portal, a CRM/automation dashboard, a SetupBot credential-collection flow, a free-first lead-discovery engine, and metadata for seven pinned provider submodules. These features and their database schema must be preserved.

The repository does **not yet contain the requested standalone `aloapi` terminal service or an API/social integration-intelligence product**. The submodule gitlinks and `.gitmodules` entries exist, but the seven provider working trees are not initialized in this checkout. Authentication has a usable demo flow but lacks production-safe bootstrap, MFA, throttling/lockout, hardened cookie settings, session/device management, and recovery. More critically, existing credential entries are stored and returned as plaintext; the AES-GCM helper is used by one export path only and does not encrypt the database. The current UI also includes mock OAuth/token/OTP values that look like real credentials.

Baseline verification found a working dependency installation, but checks are not green: ESLint reports 42 errors, TypeScript reports 10 errors, production build fails trying to fetch Google Fonts, Prisma client generation is blocked by the sandbox's denied `binaries.prisma.sh` network host, and the checked-in shell test helpers reference a missing `.zscripts/` directory. Historical worklog/compliance claims are useful context, but are not a substitute for rerunning tests against this checkout.

## Repository and preservation findings

- The initial worktree was clean; `origin` points to `https://github.com/aminulislamcontent-bit/alosocalapi.git`. The current branch is the active Arena branch above; local `main` and `origin/main` point at the same baseline commit.
- No `.env`, SQLite database, or Prisma migration directory is checked in. `.env.example` contains a relative SQLite URL and optional automation-service URLs.
- `.gitmodules` contains all seven requested submodules. Their gitlinks are pinned at the following commits; `git submodule status --recursive` prefixes each with `-`, which means the sources were **not initialized** in this checkout. The pins/config were not changed.

| Upstream repository | Path | Pinned gitlink |
|---|---|---|
| `jnMetaCode/agency-orchestrator` | `providers/agency-orchestrator` | `8fa9963e4f835efeb5e4481a861689dc99d5ce8d` |
| `msitarzewski/agency-agents` | `providers/agency-agents` | `8ae6164602c95ca78828b148b9052460ee426885` |
| `jnMetaCode/agency-agents-zh` | `providers/agency-agents-zh` | `6fff7433442b25ccc96dd9aee01618a899ec772a` |
| `Anas-Khan93/ai-agency-agents` | `providers/ai-agency-agents` | `1c06454211dc5ba301f278fb8c884ea2664ddf46` |
| `YouBTech01/YBT-Army-135M` | `providers/ybt-army-135m` | `475d63bb2d67b2142f9ea31d025446d16a017dfd` |
| `obsproject/obs-studio` | `providers/obs-studio` | `fe1ed7955f300efd17fc59f65938388e43d8bb06` |
| `nginx/nginx` | `providers/nginx` | `2a3a19c6fdcdc9bd618b81c4a6d9a80ed67d50da` |

`providers/README.md` and `providers/providers.json` document those repositories, their intended separate-process integration, and known license cautions (notably YBT-Army-135M's unclear license and OBS's GPL-2.0). They are inventory/metadata, not proof that the upstream source has been fetched, built, deployed, or security-reviewed. The existing `scripts/providers.sh` offers explicit init/status/update/doctor operations; automatic updates must remain disabled.

## Existing architecture

- **Web/runtime:** Next.js App Router, React 19, TypeScript, Tailwind, standalone output; UI starts at `src/app/page.tsx` and chooses guest/client/admin views using `/api/auth/me`.
- **Persistence:** Prisma with SQLite. `prisma/schema.prisma` holds auth, client portal, CRM, automation, lead-discovery/growth, approval, provider-usage, and audit models. There is no checked-in migration history; README uses `prisma db push`.
- **Authentication:** `AdminUser`, `ClientAccount`, and DB-backed `PortalSession`; scrypt password hashes; SHA-256 hashes of random session tokens; httpOnly cookie; 12-hour admin and 4-hour client expiry.
- **Existing product areas:** client credential portal (`/api/portal/*`); admin client management (`/api/admin/clients/*`); CRM and workflow APIs (`/api/crm/*`); SetupBot catalog, entries, validation and export (`/api/setupbot/*`); lead discovery/growth APIs (`/api/engine/*`); automation-provider status (`/api/automation/providers`).
- **Discovery/growth engine:** `src/lib/engine/` has source adapters for Google Trends/News, PageSpeed, Wikidata, Nominatim, Overpass, Reddit, and Wikimedia, plus scoring, provenance, governance, approval, cost/audit, and an existing 19-provider metadata catalog. Some catalog entries are research-only or require OAuth; no social-platform OAuth flow was found.
- **Credential collection:** legacy 13-platform client templates plus a larger nine-category SetupBot template library. Existing setup validation is a mixture of format checks and limited live checks, not a general OAuth integration verifier.
- **Automation providers:** seven pinned upstream sources plus manifest/environment status; no general automation execution platform is installed by the application. The separate external orchestrator is optional.
- **Packaging/deployment:** one `Caddyfile`, an example NGINX config, Next standalone build, provider scripts, and shell E2E scripts. No `aloapi` executable, systemd unit, installer/upgrade flow, or default port-47831 service was found.

## Existing features and observed status

| Area | Existing implementation | Audit status |
|---|---|---|
| Client access portal | Temporary client credentials, assigned platform templates, per-field progress, account lock/completion and logs | Implemented; credentials currently plaintext at rest and returned in API payloads |
| Admin console / CRM | Client management, contacts, leads, tasks, interactions, knowledge base and automation rules | Present; preserve as-is while adding isolated intelligence functionality |
| SetupBot | Platform catalog, guided collection, field validation and JSON handoff | Present; no proof of full provider authorization; plaintext storage and mock-data concerns remain |
| Growth/lead engine | Provider registry/adapters, dual discovery paths, lead provenance/scoring, tenant scoping, approvals, cost/audit | Substantial prior implementation; live source availability is environment-dependent; do not equate catalog metadata with an authorized social integration |
| Sessions | Random server-side token, stored hash, role, IP/UA and expiry; logout deletes the current session | Basic mechanisms work by inspection; hardening and device/revocation UX incomplete |
| Provider submodules | Seven immutable gitlinks plus manifests and scripts | Pinned, but not fetched in this working checkout; source-level audit pending/limited |
| Integration intelligence / social API collector | Existing provider catalogs contain partial data-source metadata | Missing as a complete, versioned provider catalog with statuses, account setup, Webhooks, OAuth inventory and package export |
| Terminal-to-browser | None found | Missing: no `aloapi` command, service lifecycle, port check, health route, browser launch or install/upgrade scripts |
| Independent export package | SetupBot has a single JSON export with an encrypted-secret field format | Missing: requested multi-file report/manifest package, JSON/Markdown/CSV/YAML, redaction guarantee, manifest and integrity checksum |

## Broken, incomplete, or unverified functionality found

1. **Production build is currently blocked by external fonts.** `src/app/layout.tsx` imports `Geist`/`Geist_Mono` via `next/font/google`; the baseline production build attempted Google Fonts and failed because this environment cannot reach `fonts.googleapis.com`. The layout also links Google Fonts at runtime.
2. **TypeScript is not green.** Baseline `npx tsc --noEmit` reports missing Socket.IO example dependencies, engine typing problems, and errors in `upload/tech360_oauth_credential_security_manager.tsx`.
3. **Lint is not green.** Baseline `npm run lint` reports 42 errors (including effects/hooks rules and an empty interface) and six warnings.
4. **Prisma generation could not be verified.** `npx prisma generate` attempts to download its engine from `binaries.prisma.sh`; the host is not reachable under this sandbox's network policy. Installed package versions resolved to Next 16.4.6, React 19.3.1 and Prisma 6.19.3 from semver ranges, not an npm lockfile.
5. **Shell-test harnesses are stale in this checkout.** `tests/database-runtime-build.sh` and Python helper tests compute a `.zscripts` directory that is absent. Several E2E scripts target port 3000 and demo-seeded CRM data and should be retained, but require a running service and initialized test database.
6. **Build scripts can hide command failures.** `package.json` pipes dev/start output through `tee` without `pipefail`; the build script copies files only after `next build`, and `next.config.ts` sets `typescript.ignoreBuildErrors: true`, allowing type errors to be ignored by Next.
7. **No formal database migration history or production migration plan exists.** README's `db:push` is acceptable for a new local database but is not a reviewed production migration strategy. The `db:push` script explicitly includes `--accept-data-loss`, which must not be run on existing production data.
8. **No verified install/deploy/backup/restore lifecycle exists.** The current Caddyfile proxies to port 3000 and listens on port 81; the NGINX example listens on port 80 and is explicitly not turnkey. Neither by itself provides a private-only administrative deployment or documented SSH/VPN administration.

## Security findings (priority)

### Critical / high

- **Credential fields are stored as plaintext.** `CredentialEntry.value` is a plain `String`; `/api/portal/entries`, `/api/setupbot/entries`, and `/api/admin/clients/[id]` return raw values. The AES-256-GCM code in `src/lib/crypto.ts` is only used to encrypt sensitive fields in SetupBot's download response; it does not protect database-at-rest values.
- **Mock credentials and OTPs are bundled into browser code.** `src/lib/vault-data.ts` exports `INITIAL_ENV_VALUES`, `INITIAL_TOKENS`, and `INITIAL_OTP_FEED` with realistic-looking IDs, client secrets, access tokens and OTP codes. These are demo placeholders, but the UI can present them as real and they must not be treated as credentials or connected to accounts.
- **Known default admin credentials are auto-created by a login request.** `src/lib/auth.ts` exports `alamin` / `alamin2026`; `ensureSeed()` also creates the demo client. The login route calls it unconditionally. README calls these development-only, but production code does not enforce that distinction.
- **Login has no rate limiting, progressive delay, or lockout.** Password checks are exposed to unlimited attempts; the client-supplied `X-Forwarded-For` value is used as the IP audit key without trusted-proxy validation.

### Medium / hardening

- No MFA, password recovery flow, secure admin bootstrap, session inventory/revocation UI, or account-level lockout was found. Sessions record user-agent/IP but no device list endpoint uses them.
- Cookie settings omit `Secure` in production. `SameSite=Lax` and `HttpOnly` are present, but a consistent CSRF/origin policy is not evident for state-changing routes.
- Password change updates the hash without revoking other active sessions. `getSessionUser()` checks expiry and account existence but does not re-check a client's current status on every request.
- `generateTempPassword()` and usernames use `Math.random`; the temporary password has low entropy compared with a cryptographically generated password.
- `src/lib/db.ts` enables Prisma query logging (`log: ['query']`) in all environments, which can expose queries/values in logs and adds production overhead.
- The encryption fallback stores a randomly generated key in `db/.setupbot-key`; losing it makes encrypted handoff values unrecoverable. Environment key validation/rotation and encrypted database credential storage are absent. Export values should not be assumed safely transferable just because they're encrypted.
- The default administrative service is not explicitly bound to loopback; deployment samples can put the dashboard behind a public HTTP listener. Port obscurity is not a security control.
- No configured security headers, CSP, or explicit production-only host/origin protection was found in the Next config.

## Dependency and operational notes

- Tracked dependency metadata is `package.json` + `bun.lock`; npm lockfile is absent and Bun is not installed in this environment. A local npm install was done without creating `package-lock.json` for baseline checks. Semver ranges therefore resolve to newer minor/patch versions under npm and may differ from a Bun install.
- The installed tree reports deprecation notices for the IntersectionObserver polyfill and Recharts 2; neither alone proves an exploitable vulnerability. A complete audit requires a reproducible lockfile/install and a supported advisory audit.
- Next, React, Prisma and numerous packages use caret ranges. `next-auth`, `next-intl`, and `z-ai-web-dev-sdk` are installed but not evidenced as the core auth/AI implementation; the app implements its own sessions and its growth-engine AI module can operate as template/rule drafts.
- `package.json`'s production `start` uses Bun although the repository README also says npm is acceptable; no Bun runtime was available here.
- Runtime fonts depend on Google, and Prisma engine installation depends on an external binary host; both are environment/deployment prerequisites.

## Missing requirements from the requested ALOAPI scope

- CLI lifecycle (`aloapi`, start/stop/restart/status/logs/doctor/secure/export/version), loopback binding on port 47831, port collision handling, health check, graceful shutdown, browser open, installer/upgrade scripts.
- An ALOAPI-scoped integration intelligence store and API/UI for provider facts, official documentation URLs, OAuth/scopes, API surfaces, webhook metadata, account requirements, restrictions, collection/verification status and timestamps.
- Coverage for the requested social/business platforms (Meta family including WhatsApp/Threads, TikTok, LinkedIn, YouTube, X, Pinterest, Snapchat, Reddit, Telegram, Discord, Google Business/GA4/Search Console/Ads/Merchant, Microsoft Ads) as official-API **documentation**, clearly separated from actual account authorization.
- A guided, no-password/no-OTP-in-chat setup workflow. No platform account discovery or OAuth callback/credential verification for the requested integration set was found. WhatsApp-specific discovery/configuration and its seven environment-variable names are absent.
- Encrypted-at-rest secrets with non-exportable defaults, redacted logs, access policies, safe manual/official OAuth flows, security audit trail, retention settings and secure cleanup.
- A multi-format, integrity-checked ALOAPI export package and the required reports/manifests/environment templates; no automatic connection to or write into another CRM must be introduced.
- A documented evaluation of the requested automation products (n8n, Activepieces, Node-RED, Huginn, Windmill, Temporal, Airflow, Mautic, Listmonk) alongside the preserved provider submodules.
- Focused automated tests for CLI lifecycle, auth/MFA, session revocation, catalog verification semantics, export integrity/redaction, encryption, and safe failure paths.

## Baseline checks performed

| Check | Result |
|---|---|
| Git status / submodule pointers | Clean initial worktree; all seven configured pinned submodules uninitialized |
| `npm install --package-lock=false --no-audit --no-fund` | Passed locally; 839 packages installed (not a production lockfile) |
| `npx prisma generate` | Blocked: engine download from `binaries.prisma.sh` failed due network policy |
| `npx tsc --noEmit` | Failed: 10 TypeScript errors (Socket.IO examples, engine types, uploaded component) |
| `npm run lint` | Failed: 42 errors and 6 warnings |
| `DATABASE_URL=file:./db/custom.db npm run build` | Failed: Next attempted to fetch Geist fonts from Google Fonts, inaccessible here |
| E2E/API/browser/database tests | Not executed in discovery; requires generated Prisma engine/client, an initialized DB and running server |

## Recommended repair sequence

1. Keep CRM/client-portal routes and the seven submodule gitlinks intact; add ALOAPI intelligence under separate routes/modules/models and never write to an external CRM.
2. Make the build deterministic/offline-friendly (self-hosted/system fonts, fixed dependency/runtime contract, real type checking, pipefail) and restore clean lint/type gates without changing product behavior unnecessarily.
3. Implement loopback-only CLI/service lifecycle and a health endpoint; validate port conflicts and ensure browser launch goes to the existing login gate.
4. Harden bootstrap/authentication first: production admin setup, secure cookies, rate limiting/lockout, MFA, session inventory/revocation, audit, and CSRF/origin checks.
5. Add a reviewed, additive-only integration catalog/store, official API metadata and status semantics; retain honest distinctions between documented, configured, authorized, verified, blocked and user-action-required.
6. Add independent discovery/setup workflows that never ask for passwords or OTPs in chat and never fabricate identifiers or credentials; user-only actions stay in official provider surfaces.
7. Protect credential material at rest, remove mock secret/OTP content, redact logs and make ordinary exports secret-free.
8. Add API/automation evaluations and the multi-format export package with manifest/checksum; test that it remains an offline handoff only.
9. Run focused unit/API/CLI tests, existing CRM regression tests, build/type/lint, document unavailable live provider checks, and prepare a private-only deployment guide. Do not run `db:push --accept-data-loss` or change production services without explicit approval.
