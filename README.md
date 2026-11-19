# ALOAPI — local-first integration engineering & credential preparation

ALOAPI is a self-hosted, browser-based integration engineering workspace. Run `aloapi` from a terminal to start the local service and open its dashboard. The workspace brings together business/website discovery, provider and channel mapping, OAuth authorization lifecycle, webhook preparation and signature checks, encrypted credential storage, supported live read-only verification, workflow orchestration, and client-ready handover packages. Provider-specific automation depends on each provider's documented API and supported adapter capabilities; ALOAPI never fabricates provider-issued credentials or bypasses account-owner verification.

## Stack

- Node.js 22.x starting at 22.17.0, or Node.js 24 and later, with npm (the checked-in `package-lock.json` is the reproducible install source)
- Next.js App Router, React, TypeScript, Tailwind CSS
- Prisma ORM with SQLite; checked-in, additive migrations
- scrypt password hashes, revocable database sessions, optional TOTP MFA, login throttling, and same-origin mutation guards

## Local install and startup

Install the global `aloapi` terminal command (macOS, Linux, and WSL2):

```bash
./scripts/install.sh
```

Then from any directory, run:

```bash
aloapi
```

`aloapi` (or `aloapi start`) creates `.env` on first launch if missing, applies reviewed SQLite migrations, generates Prisma Client, safely encrypts any legacy plaintext credential rows, builds the standalone app when needed, starts the managed local service on `127.0.0.1:47831`, waits for `/api/health`, and opens `http://localhost:47831` in your default browser. If the service is already running, `aloapi` reuses it and still opens the dashboard.

Available lifecycle commands:

```bash
aloapi                # start service and open http://localhost:47831
aloapi start          # same as `aloapi` (supports --dev, --no-open, --rebuild)
aloapi stop           # stop only the matching managed ALOAPI process
aloapi restart        # stop and restart the managed service
aloapi status         # inspect running state, PID, port, and database health
aloapi logs [-f]      # view or follow ~/.aloapi/aloapi.log
aloapi doctor         # run non-destructive environment, security, and port checks
aloapi setup          # create private .env and one-time admin credentials only
```

See [docs/CLI_LAUNCHER.md](docs/CLI_LAUNCHER.md) for installation details, WSL2/macOS/Linux browser integration, and troubleshooting. ALOAPI runs as a local Node.js service, not a GitHub Pages app. If legacy Pages publishing from `main:/` is enabled, `_config.yml` limits Jekyll to the README and launcher guide instead of processing the application and provider submodules. If you do not want a documentation site, select **None** under **Settings → Pages → Branch**.

`setup` creates a private `.env` only if one does not already exist. It generates a random vault key and one-time administrator password and prints the bootstrap credentials once. Store those securely; after first login remove `ADMIN_BOOTSTRAP_USERNAME` and `ADMIN_BOOTSTRAP_PASSWORD` from `.env`. Do not change `ALOAPI_VAULT_KEY` after values have been encrypted unless they are re-encrypted with the original key. If you want to require administrator MFA, first leave `ALOAPI_REQUIRE_ADMIN_MFA=false`, sign in locally and enroll MFA in Security, then set it to `true`; requiring it before enrollment blocks initial login.

By default it binds only to `127.0.0.1:47831`; the CLI rejects non-loopback host values unless `ALOAPI_ALLOW_PUBLIC_BIND="true"` is explicitly set. Use `--no-open` to suppress automatic browser launch, or `--dev` for the development server. The `npm run aloapi -- <command>` wrapper also remains supported.

The foreground `npm start` command is for a process manager/container after the production build and migrations have been prepared. Do not expose the admin app directly to the public Internet. An owner-managed, reviewed HTTPS reverse proxy is required for any external webhook callback; the default service itself remains loopback-only.

### Existing SQLite database

A database made by the old, migration-less version must be strictly compared with the checked-in baseline before Prisma can apply the new additive migration. Back up the database first, then run:

```bash
npm run aloapi -- baseline-existing
```

The normal startup preflight opens an existing SQLite file read-only and allows automatic migration only for a fresh database or a schema matching this repository's known, completed migration history. A migration-less database is refused before Prisma migration commands run. This baseline command checks tables, columns, defaults, indexes, foreign keys, and migration history without changing rows. It refuses schema drift. Only after the exact original schema matches does it record the baseline and apply the checked-in additive migration. The workflow never runs `db push`, reset, drop, or data deletion. A mismatch is a stop condition for a separately reviewed migration.

## Development and verification

With nvm, run `nvm install` from the repository root to select the default Node.js line in `.nvmrc`. CI checks that line and Node.js 24.x using `npm ci`.

The application release number comes from `package.json` (installer, `aloapi version`, and `GET /api`). When changing it, update the plain-text `VERSION` file and the npm lockfile in the same change; `npm test` checks that they agree.

```bash
npm ci
npm run dev                    # loopback-only service on port 47831
npm run typecheck
npm run lint
npm test                       # CLI, vault, registry, migration, and export-package tests
DATABASE_URL='file:./db/custom.db' npm run db:validate
```

All production migrations are checked into `prisma/migrations/`. The normal startup path uses `prisma migrate deploy`; there is intentionally no `db push --accept-data-loss` or reset script. `vault:migrate:credentials` is idempotent, authenticates already-encrypted rows before writing, encrypts legacy values in bounded transactions, compares old values before replacing them, and never prints credential contents.

## Integration workflow, provider boundaries and security

- **Discovery:** the onboarding APIs create and retain provider-specific discovery snapshots. Website/provider discovery is a preparation aid; it is not proof that an account is connected.
- **OAuth:** the onboarding OAuth service supports authorization-flow creation, callback processing, token refresh and revocation where a provider adapter is configured. Provider-issued client IDs, secrets, consent, scopes and approvals must come from that provider's official developer platform. A local generated secret is not a substitute for a provider-issued credential.
- **Webhooks:** ALOAPI prepares challenge verification and supports configured signature self-tests/verified event ingestion. Production callback reachability, provider-side webhook registration and provider-specific signing requirements must be completed through authorized provider settings.
- **Credential vault:** supported credential types can be stored encrypted at rest, listed as metadata, rotated, revoked and backed up through the authenticated admin API. Secret values must not be committed to Git or included in ordinary handover exports.
- **Verification:** only configured adapters can run live checks. The discovery endpoint exposes a live read-only verification action; other providers may remain in a preparation/manual state until a real adapter and authorized credential exist. A catalog entry or prepared workflow is never represented as a successful provider grant.
- **Handover:** provider bundles and client project handover packages are generated with secrets excluded by default. Encrypted transfer is a separate owner-authorized operation and requires explicit approval.
- **Owner-controlled steps:** business identity, billing, MFA/OTP, CAPTCHA, provider review, app publication, external permission changes, message sending, payments and other high-impact actions remain with the authorized owner. ALOAPI must not bypass these controls.
- **Isolation:** ALOAPI is an independent integration engineering workspace. It does not silently connect to or modify a client's external CRM, database, source repository or production deployment.

## Submodules

The seven pinned provider submodules under `providers/` are retained at their existing commits. They are not automatically initialized, installed, launched, or connected.

Before any database migration, follow the [database and vault recovery drill](docs/DATABASE_AND_VAULT_RECOVERY.md).
