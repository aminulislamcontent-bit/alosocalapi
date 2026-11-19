# ALOAPI Terminal Launcher

The `aloapi` CLI lets you launch, manage, inspect, and troubleshoot the local ALOAPI service from any directory using a single command:

```bash
aloapi
```

Dashboard URL: `http://localhost:47831`

---

## Installation (macOS, Linux, and WSL2)

Run the installer from the repository root:

```bash
./scripts/install.sh
```

Or via npm:

```bash
npm run install:cli
```

What the installer does:
1. Verifies Node.js (22.x starting at 22.17.0, or 24 and later) and `npm`. With nvm, `nvm install` in the repository root selects the default version from `.nvmrc`.
2. Installs dependencies via `npm ci` if `node_modules` is missing.
3. Persists the repository path in `~/.aloapi/project-root` (mode `0600` inside `0700` `~/.aloapi`).
4. Registers an executable `aloapi` command in your `PATH`:
   - Uses a writable `PATH` directory (`/usr/local/bin`, `/opt/homebrew/bin`, or `npm prefix -g`/bin), or
   - Installs into `~/.local/bin/aloapi` and idempotently adds `~/.local/bin` to `~/.zshrc` / `~/.bashrc` / `~/.profile` if needed.

Verify installation from any directory outside the repository:

```bash
cd ~
aloapi version
aloapi doctor
```

---

## Commands

| Command | Description |
|---|---|
| `aloapi` | Start ALOAPI on `http://localhost:47831` and open the dashboard in your default browser |
| `aloapi start [--dev] [--no-open] [--rebuild] [--foreground]` | Start the managed service and open the dashboard (reuses an existing healthy instance) |
| `aloapi stop` | Gracefully stop only the managed ALOAPI process matching the tracked `instanceId` |
| `aloapi restart [--dev] [--open] [--no-open] [--rebuild]` | Stop the managed ALOAPI service and start a fresh instance |
| `aloapi status [--json]` | Show service state, dashboard URL, bind address, PID, mode, and database reachability |
| `aloapi logs [-n N] [-f] [--path]` | Display or follow `~/.aloapi/aloapi.log` (sensitive env values are redacted) |
| `aloapi doctor [--json]` | Run read-only checks on Node.js, PATH, `.env`, vault key, migrations, port `47831`, and browser launcher |
| `aloapi open` | Explicitly open `http://localhost:47831` in your default browser |
| `aloapi setup` | Create private `.env` with generated `ALOAPI_VAULT_KEY` and one-time bootstrap credentials |
| `aloapi baseline-existing` | Strictly verify a legacy migration-less SQLite schema before applying additive migrations |
| `aloapi version` | Print CLI version and resolved repository root |

---

## First-run credentials & environment overrides

On the first launch `aloapi` creates a private `.env` (mode `0600`) and prints a one-time administrator username/password plus a generated `ALOAPI_VAULT_KEY`. Those exact values are written to `.env`, so subsequent launches reuse them. Keep them in a password manager and remove the bootstrap username/password from `.env` after the first login.

If you supply `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_PASSWORD`, or `ALOAPI_VAULT_KEY` in the environment before the first launch, the CLI uses **those** values, prints them, and saves them to `.env` as well. The printed credentials therefore always match the credentials the service actually accepts. Values containing newlines or both quote styles are refused rather than written into a malformed `.env`.

`npm run build` never ships private runtime configuration: `next.config.ts` excludes `.env*` from standalone file tracing and `scripts/copy-standalone-assets.mjs` defensively removes any such file from `.next/standalone`, restoring only the public `.env.example` template.

---

## Platform & Browser Behavior

- **macOS:** opens `http://localhost:47831` with `open`.
- **Linux:** opens `http://localhost:47831` with `xdg-open`.
- **WSL2:** detects WSL2 (`WSL_DISTRO_NAME`, `WSL_INTEROP`, or `/proc/version`) and opens the Windows host default browser via `wslview` (if `wslu` is installed), `cmd.exe /c start`, or `powershell.exe Start-Process`.
- If ALOAPI is already running on port `47831`, running `aloapi` or `aloapi start` reuses the service and opens the dashboard in your browser. Pass `--no-open` to start/reuse the service without opening a browser tab.

---

## Security Guarantees

- **Loopback-only by default:** binds only to `127.0.0.1:47831` (`http://localhost:47831`). Non-loopback `ALOAPI_HOST` values are rejected unless `ALOAPI_ALLOW_PUBLIC_BIND="true"` is explicitly configured (only behind a TLS-terminating reverse proxy with authentication).
- **Zero secret leaks:** `aloapi status`, `aloapi doctor`, `aloapi logs`, and error messages never print `ALOAPI_VAULT_KEY`, passwords, or tokens. The production standalone bundle contains no private `.env` file.
- **Non-destructive lifecycle:**
  - `aloapi start` checks port `47831` first and refuses to terminate unrelated processes occupying the port.
  - `aloapi stop` verifies both the PID and `/api/health` `instanceId` before signalling `SIGTERM`.
  - Database readiness is checked read-only before running `prisma migrate deploy` (`db push --accept-data-loss` is never used).

---

## Troubleshooting

### `aloapi: command not found`
- Reload your shell (`source ~/.bashrc` or `source ~/.zshrc`) or ensure `~/.local/bin` is in `PATH`:
  ```bash
  export PATH="$HOME/.local/bin:$PATH"
  ```
- Re-run `./scripts/install.sh` from the repository root.

### Port `47831` is already in use by another process
- Free port `47831`, or configure another loopback port in `.env`:
  ```env
  ALOAPI_PORT="47832"
  ```
- `aloapi` never terminates unrelated processes.

### Browser does not open automatically
- **Linux headless / minimal desktop:** install `xdg-utils` (`xdg-open`) or open `http://localhost:47831` manually.
- **WSL2:** ensure Windows interop is enabled or install `wslu` (`sudo apt install wslu`) for `wslview`. Run `aloapi doctor` to see which launcher was detected.

### Prisma engine download / offline environment errors
- `aloapi start` runs `npm run db:migrate:deploy` and `npm run db:generate`. In offline or firewalled environments where `binaries.prisma.sh` cannot be reached, ensure Prisma engines are pre-cached or reachable on the target machine before starting.

### Existing SQLite database error
- Back up your SQLite file first, then inspect and baseline it safely:
  ```bash
  aloapi baseline-existing
  ```

### Recovery and callback proxy

Use the [isolated SQLite and vault recovery drill](DATABASE_AND_VAULT_RECOVERY.md) before upgrades. The supplied Caddyfile is a **callback-only** TLS site, not an admin reverse proxy. Set `ALOAPI_CALLBACK_HOST` to the reviewed public DNS name and `ALOAPI_PUBLIC_WEBHOOK_BASE_URL` to its HTTPS origin. Validate with `caddy validate --config Caddyfile`. Only the WhatsApp webhook and OAuth callback route to `127.0.0.1:47831`; other paths must stay private. OAuth browser callbacks require the initiating administrator's authenticated session on the registered origin; a private loopback callback is preferable where the provider permits it. Do not forward admin/login routes publicly to work around a missing session.
