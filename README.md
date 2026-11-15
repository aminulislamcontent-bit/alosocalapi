# ALOAPI — private CRM, Growth Engine & integration intelligence

ALOAPI continues the existing Next.js/TypeScript/Prisma application. It keeps the existing CRM and Growth Engine, and adds a local-first administration CLI, encrypted write-only credential handling, administrator security controls, provider documentation/permission guidance, a WhatsApp webhook-signature helper, and offline integration handoff exports.

## Stack

- Node.js 22.5+ and npm (the checked-in `package-lock.json` is the reproducible install source)
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

`aloapi` (or `aloapi start`) creates `.env` on first launch if missing, applies reviewed SQLite migrations, generates Prisma Client, safely encrypts any legacy plaintext credential rows, builds the standalone app when needed, starts the managed local service on `127.0.0.1:47831`, waits for `/api/health`, and opens `http://localhost:47831` in your default browser (reusing the running instance without opening duplicate tabs on subsequent runs).

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

See [docs/CLI_LAUNCHER.md](docs/CLI_LAUNCHER.md) for installation details, WSL2/macOS/Linux browser integration, and troubleshooting.

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

```bash
npm run dev                    # loopback-only service on port 47831
npm run typecheck
npm run lint
npm test                       # CLI, vault, registry, migration, and export-package tests
DATABASE_URL='file:./db/custom.db' npm run db:validate
```

All production migrations are checked into `prisma/migrations/`. The normal startup path uses `prisma migrate deploy`; there is intentionally no `db push --accept-data-loss` or reset script. `vault:migrate:credentials` is idempotent, authenticates already-encrypted rows before writing, encrypts legacy values in bounded transactions, compares old values before replacing them, and never prints credential contents.

## Product boundaries and provider state

- Growth Engine, CRM, SetupBot and existing portal functionality remain part of this repository. Provider manifest entries report local checkout/environment presence, not a running service or authorization.
- Integration Intelligence is a documentation and manual-setup assistant. Catalog entries, required-scope lists, identifiers in environment templates, and local records are not proof of a provider grant. No OAuth authorization or live provider verification is performed by this workspace.
- The WhatsApp workflow directs the owner to Meta's official business/developer interfaces. This deployment does not collect WhatsApp phone numbers, WABA IDs, Phone Number IDs, or access tokens and does not infer authorization from a phone number. A separate write-only vault can hold only the Meta app webhook-signature secret and a locally chosen webhook verification token. The webhook handler checks signatures and records event names only; it does not store webhook bodies, send messages, or authorize an account.
- Integration exports are offline documentation packages with blank environment templates, official documentation pointers, setup requirements, scopes, endpoint/webhook notes, aggregate state metadata, and checksums. They exclude credential values, ciphertext, identifiers, phone numbers, OTPs, and raw webhook payloads.
- ALOAPI does not connect to or modify any external CRM or its database. Exports are intended for owner-managed, manual handoff.

## Submodules

The seven pinned provider submodules under `providers/` are retained at their existing commits. They are not automatically initialized, installed, launched, or connected.
