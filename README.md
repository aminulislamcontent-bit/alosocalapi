# ALO Education BD — CRM, Automation & Universal Growth Engine

Full-stack Next.js application for ALO Education BD: client credential portal, CRM, automations, SetupBot platform library, and a Universal AI Lead Discovery & Customer Acquisition Engine (industry-agnostic, country-agnostic, multi-tenant, free-first).

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma ORM + SQLite (`db/custom.db`, created at runtime)
- scrypt password hashing, DB-backed httpOnly-cookie sessions
- Bengali-first UI with English engine tabs

## What is inside

| Area | Highlights |
|---|---|
| Client Access Portal | Temp-credential login, 13-platform credential knowledge base (49 fields, Bengali guides), auto-logout, activity audit |
| CRM | Clients, tasks, notes, pipeline APIs (`/api/crm/*`) |
| Growth Engine | Dual-mode discovery (universal + targeted campaigns), 19-provider free-first registry with live verification, provenance on every lead, explainable 7-component scoring, 11-state pipeline, DNC/opt-out governance, approval gates, USD cost ledger, audit events |
| SetupBot | Platform credential library with per-field guides |

## Run it

```bash
bun install                 # or npm install
cp .env.example .env        # DATABASE_URL="file:./db/custom.db"
bun run db:push             # create schema
node scripts/seed-alo-info.mjs
node scripts/seed-engine.mjs
bun run dev                 # http://localhost:3000
```

## Security notes

- Demo admin credentials are dev-only defaults; change them before any real deployment.
- `.env`, the SQLite database, and all runtime data are git-ignored.
- The Growth Engine never fabricates data: unverified providers are shown as unavailable, and outbound contact is impossible without governance + explicit approval.
