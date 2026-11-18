# ALOAPI — Full Repository Verification & Completion Report

**Date:** 2026-11-18 (UTC)
**Branch:** `arena/41ff2279-alosocalapi`
**Base commit:** `9bc8842d0e7d63b5657495ff2f070771d25c315f`
**Honesty rule:** every result below was executed in this checkout. No third-party SaaS authorization, external OAuth grant, DNS ownership change, SMS/email/call delivery, or provider-issued credential is claimed.

---

## 1. What "full check" covered

| Area | Scope executed |
| :--- | :--- |
| Dependencies | `npm ci --no-audit --no-fund` from the checked-in `package-lock.json` (899 packages), `npm run db:generate` |
| Schema / migrations | `npm run db:validate`, migration-safety unit tests (all 5 checked-in additive migrations), baseline/preflight refusal tests |
| Static checks | `npm run typecheck` over the whole TS project, `npm run lint` over the whole repo |
| Automated tests | `npm test` (47 unit/integration + 1 integration-package), `npm run test:e2e` (5 real production-server / Playwright suites) |
| Production build | `npm run build`, `cmp VERSION .next/standalone/VERSION`, `test ! -e .next/standalone/.git` |
| CLI runtime | `aloapi doctor --json`, `aloapi version`, `aloapi status`, CLI fixture tests (start/stop/restart/status/logs/doctor/setup/backup/restore/import-validate) |
| Generated artifacts | `npm run matrix:generate` compared against the checked-in 131-provider / 20-module matrix (content identical; only `generatedAt` differs) |
| API surface | All **79** `src/app/api/**/route.ts` files swept for authentication/authorization guards |
| Newest feature | `POST /api/onboarding/handover` exercised against a real standalone server before and after the fixes |
| CI parity | The complete CI chain re-run on **Node.js 22.22.3** and **Node.js 24.22.3** |

---

## 2. Real defects found at the start (not previously reported as broken)

| # | Check | Observed baseline failure | Root cause |
| :-: | :--- | :--- | :--- |
| 1 | `npm run typecheck` | **FAIL** — 2 errors: `TS2322` at `src/app/api/onboarding/handover/route.ts:39` and `TS2339` at `:53` | `let browserSession = null` inferred as type `null`; assignment of the supervised-portal summary was impossible and `browserSession?.id` was `never`. Introduced by the newest handover endpoint. |
| 2 | `npm run lint` | **FAIL** — 2 errors in `src/components/engineering/engineering-hub.tsx`: `react-hooks/preserve-manual-memoization` (line 173) and `react-hooks/set-state-in-effect` (line 190) | React Compiler could not preserve a `useCallback` whose dependency list used `activeProject?.clientId` while inference wanted `activeProject`; the follow-up effect called a state-setting function synchronously. |
| 3 | `npm test` | **FAIL** — `1/45` unit tests: `admin:reset-password …` with `ERR_MODULE_NOT_FOUND: scripts/version.mjs` | The reset-password test fixture copied `aloapi.mjs` + `migrations.mjs` only, but the CLI now imports `./version.mjs` (added later). |
| 4 | Handover phone handling | **Broken logic, undetected by any test** | `handover-package.ts` used double-escaped regexes (`/[\\s().-]/g`, `/^\\+?[1-9]\\d{7,14}$/`), so no phone number could ever validate and no E.164 `+` prefix was produced — despite the documented acceptance criterion. |
| 5 | Handover owner gates | **Computed but discarded** | `requiredOwnerActions` was built and never returned; the manifest had no explicit owner-checkpoint list, although the contract requires all owner checkpoints to remain visible. |
| 6 | Handover contract step 8 | **Not implemented** | The contract requires a real least-privilege read-only API probe with the actual HTTP result; the endpoint only wrote a catalog snapshot and listed "run a verification" as a next step. |
| 7 | Newest endpoint coverage | **Zero automated tests** | Neither `tests/` nor the runtime suites called `/api/onboarding/handover`. |

---

## 3. Work actually delivered

1. **Type-safe handover route** — explicit `BrowserSessionSummary` type; `browserSession` and `liveVerification` are correctly typed and included in the admin audit metadata.
2. **React Compiler-clean Engineering Hub** — removed the incompatible manual memoization, made `loadVaultCredentials` take explicit `clientId`/`providerKey` arguments, and moved the initial load into a cancellable promise callback so no state is set synchronously inside an effect.
3. **CLI fixture self-check** — `tests/aloapi-cli.test.cjs` now copies `version.mjs` and asserts that *every* relative import of `aloapi.mjs` exists in the fixture, so a future runtime dependency cannot silently break this test again.
4. **Real E.164 + HTTPS normalization** — `normalizeIdentity` is exported and now strips whitespace/NBSP/parentheses/dots/unicode dashes, converts `00…` to `+…`, requires an international country code, rejects national numbers, malformed URLs, non-HTTPS schemes and embedded URL credentials.
5. **Owner gates surfaced** — deduplicated `requiredOwnerActions` plus four explicit `OWNER_CHECKPOINTS` are returned in both `preparation` and `handover`.
6. **Contract step 8 implemented honestly** — optional `runLiveProbe: true` calls the existing `runLiveReadOnlyVerification` and returns its real `executed`/`verified`/`status`/`httpStatus`/`checkedEndpoint`/`testedAt`/`message`. It never marks the manifest `VERIFIED`; with no authorized credential it returns `OWNER_ACTION_REQUIRED` without an outbound call.
7. **New automated coverage** — `tests/integration-handover.test.cjs` (2 tests, added to `test:unit`) and section 11c of `tests/e2e-onboarding-runtime.test.cjs` (unauth `401`, cross-origin `403`, invalid inputs `400`, `200` E.164 normalization, secret-free response, discovery snapshot, tenant isolation, supervised portal checkpoint visible in admin overview, honest opt-in live probe).
8. **Documentation** — `docs/AUTONOMOUS_INTEGRATION_HANDOVER.md` now records exact implemented capabilities, automated evidence and the boundary that still holds.

---

## 4. Final verification results

| Command / check | Node.js 22.22.3 | Node.js 24.22.3 |
| :--- | :--- | :--- |
| `npm ci` | PASS (899 packages) | same locked install reused |
| `npm run db:validate` | PASS | PASS |
| `npm run typecheck` | PASS (0 diagnostics) | PASS |
| `npm run lint` | PASS (0 errors, 0 warnings) | PASS |
| `npm test` | **47/47 unit + 1/1 package** | **47/47 unit + 1/1 package** |
| `npm run build` | PASS (all routes incl. `/api/onboarding/handover`) | PASS |
| `cmp VERSION .next/standalone/VERSION` | PASS | PASS |
| `test ! -e .next/standalone/.git` | PASS | PASS |
| `npm run test:e2e` | **5/5** including real Playwright/Chromium click-through | **5/5** |
| `node scripts/aloapi.mjs doctor --json` | `ok: true`, `failures: 0` (3 environment warnings: launcher not in `PATH`, no `xdg-open`, `.env` not created yet) | not re-run (environment-only check) |
| `npm run matrix:generate` | 131 external adapters + 20 first-party modules; JSON identical, MD differs only by generated date | not re-run (source-identical) |

**Aggregate:** 53 automated test executions per Node lane, all passing (48 unit/integration-package + 5 runtime/browser). Zero TypeScript diagnostics, zero ESLint findings, zero migration failures, zero 5xx responses in the browser acceptance run.

### API guard sweep
All 79 route files were inspected. Administrative routes use `requireAdminApi`; engine routes use `requireEngineScope`; factory routes use `requireFactoryAccess`; SetupBot uses `requireAdminOrClient`; legacy CRM/portal/auth routes use `getSessionUser` + `isSameOriginRequest`. Deliberately public endpoints are `/api`, `/api/health`, the signed WhatsApp webhook, the RFC 8058 one-click unsubscribe endpoint, the state-validated OAuth callback and login. No unprotected administrative data route was found.

### Live endpoint exercise (before automated coverage)
A fresh migrated SQLite database and real standalone server were used: admin login `200`, client tenant creation `200`, E.164 handover `200`, `http://` identity `400`, HTTPS + `startOfficialPortal` `200`, unknown provider `400`. The supervised portal session was created with an official HTTPS URL and `WAITING_FOR_OWNER` status.

---

## 5. Honest remaining boundaries

- **Owner action required:** real Meta/Google/SendGrid/etc. developer accounts, provider-issued OAuth client IDs/secrets/tokens, app review, business/KYC verification, DNS/SPF/DKIM/DMARC ownership, payment/billing, and messaging consent. ALOAPI does not fabricate them.
- **External delivery:** live SMTP, SIP/telephony, carrier SMS, WhatsApp Cloud API sends and social publishing remain credential-gated and are represented by mocked adapters only where explicitly labeled `MOCKED`.
- **Browser automation:** headless Playwright/Chromium acceptance now runs and passes in this environment; persistent *headed* third-party portal control and provider-specific portal automations are still not implemented.
- **Sandbox network:** outbound access is limited to package/GitHub registries, so live third-party API probes can only return honest blocked/`OWNER_ACTION_REQUIRED` results here.
- **Legacy shell proofs:** `scripts/e2e-engine.sh`, `e2e-crm.sh`, `e2e-workflow.sh` and `e2e-setupbot.sh` are historical staging scripts pinned to `http://localhost:3000` and old demo credentials; they are not part of CI, which now runs the maintained Node-based runtime suites listed above.
- **Submodules:** the seven `providers/*` gitlinks remain uninitialized by design; no submodule pointer changed.
- **Environment warnings:** `aloapi doctor` reports no failures, but the CLI is not installed into `PATH`, there is no Linux browser launcher, and `.env` is created only on first `aloapi` / `aloapi setup`.

---

## 6. Files changed

| File | Change |
| :--- | :--- |
| `src/app/api/onboarding/handover/route.ts` | Typed browser-session summary, optional real live probe, audit metadata |
| `src/lib/onboarding/handover-package.ts` | Exported/fixed identity normalization, owner checkpoints, surfaced deduplicated owner actions |
| `src/components/engineering/engineering-hub.tsx` | React Compiler-compliant vault credential loading |
| `tests/aloapi-cli.test.cjs` | Fixture copies `version.mjs` and asserts all CLI relative imports exist |
| `tests/integration-handover.test.cjs` | **New** unit/integration coverage for the handover contract |
| `tests/e2e-onboarding-runtime.test.cjs` | **New** §11c production-HTTP coverage for the handover endpoint |
| `package.json` | Adds `tests/integration-handover.test.cjs` to `test:unit` |
| `docs/AUTONOMOUS_INTEGRATION_HANDOVER.md` | Implementation status, evidence and honest boundary |
| `docs/audit/ALOAPI_FULL_VERIFICATION_2026-11-18.md` | This report |
| `worklog.md` | Task 12 record |


---

## 7. Addendum — live `aloapi` launcher verification (same day, after PR #19)

The user asked to confirm the real terminal workflow: run `aloapi`, open the project in a browser, and have every request actually work. This was executed rather than assumed.

### Live service
- Ran the actual CLI: `aloapi start --foreground` with `ALOAPI_HOST=0.0.0.0`, `ALOAPI_ALLOW_PUBLIC_BIND=true`, `ALOAPI_TRUST_PROXY=true` so the hosted preview can reach it. The CLI created `.env`, applied all 5 reviewed SQLite migrations, generated Prisma Client, ran the idempotent credential-vault migration, built the standalone app and started it on `0.0.0.0:47831`.
- `/api/health` → `{"status":"ok","database":"reachable"}`; `GET /api` → `version 0.2.1`.
- Plain `aloapi` (no flags) correctly detected the running service, reused it, and attempted `xdg-open http://localhost:47831`. In this headless Linux sandbox no `xdg-open` exists, so it honestly printed `Open http://localhost:47831 in your browser.`; the hosted live preview supplies the browser view.
- Simulated preview-origin POSTs (`Host: 47831-…e2b.app` + matching `Origin`, and `X-Forwarded-Host`/`X-Forwarded-Proto`) → **200**. A genuine `Origin: https://evil.example.com` → **403** `Cross-origin request rejected.`

### Three more real defects found and fixed
| # | Defect | Evidence | Fix |
| :-: | :--- | :--- | :--- |
| 8 | `aloapi` printed bootstrap credentials that **did not work** when `ADMIN_BOOTSTRAP_USERNAME`/`PASSWORD` were set in the environment | First run printed `aloapi-admin` / random password; login with them returned `401`, while env-supplied credentials returned `200` | `writeInitialEnv()` now honours `ADMIN_BOOTSTRAP_*` and `ALOAPI_VAULT_KEY` from the environment, writes the same values to `.env`, prints them, and explains their source. Added `aloapi setup` regression test. |
| 9 | `next build` copied the private `.env` (vault key + admin password) into `.next/standalone/.env` | Confirmed the live vault key was present in the build artifact; this also made the "missing vault key → DEGRADED" e2e test fail (`vaultReady: true` instead of `false`) | `next.config.ts` `outputFileTracingExcludes` for `.env*`; `scripts/copy-standalone-assets.mjs` defensively strips every private `.env*` from the standalone tree and restores only `.env.example`; CI now asserts `! -e .next/standalone/.env` and `-f .next/standalone/.env.example`; added a unit test for the cleanup. |
| 10 | Browser acceptance test used a fixed 100 ms wait before asserting tab content | Failed once with `Admin view should render after navigation: অটোমেশন ও নলেজ বেস` under concurrent load; passed when re-run alone | Replaced the timer with `page.waitForFunction()` on real `main` content (10 s timeout). |

### Live request proof (final build)
| Check | Result |
| :--- | :--- |
| Fresh first-run login using the credentials `aloapi` printed | **200** (`initialization.overallStatus: READY_WITH_NOTICES`, 12/13 init steps passed, 131 catalog providers) |
| Full HTTP sweep of **77** API requests (all GET routes + 10 real write actions incl. tenant creation, onboarding, E.164 handover with portal checkpoint + live probe, website discovery, factory workspace/AI, CRM contact, taxonomy, SetupBot validation) | **0 × 5xx**, 0 unexpected `401`; only `/api/portal/entries` refuses an admin cookie by design (client-session-only). Other 4xx are honest guards: missing webhook token, duplicate slug, nonexistent lead id, missing OAuth callback params, client-only SetupBot context. |
| Real Playwright/Chromium browser: open project → admin login → **19** admin tabs → `/engineering`, `/factory`, `/factory/email_marketing`, `/factory/voice_call_center` | **95 API responses**, **0 × 5xx**, **0 uncaught page errors** |
| Complete CI chain re-run on Node.js 22.22.3 **and** Node.js 24.22.3 | `db:validate` PASS · `typecheck` 0 errors · `lint` 0 findings · `npm test` **49/49 + 1/1** · `build` PASS · standalone `VERSION`/`.git`/no-private-`.env`/`.env.example` PASS · `test:e2e` **5/5** (55 tests per lane) |

### Additional files in this addendum
`scripts/aloapi.mjs`, `next.config.ts`, `scripts/copy-standalone-assets.mjs`, `tests/aloapi-cli.test.cjs`, `tests/e2e-browser-playwright.test.cjs`, `.github/workflows/node.js.yml`, `docs/CLI_LAUNCHER.md`, `worklog.md` (Task 13), and this report.
