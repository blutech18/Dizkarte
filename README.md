# Dizkarte Platform

Philippines-focused mobile task marketplace. This repository is a TypeScript
modular monolith: shared domain/config packages, a Supabase-backed system of
record with governed privileged functions, and Expo mobile and Next.js Admin
apps.

> Status: **foundation + backend + full mobile and Admin frontend** implemented
> and verified. Non-database checks pass (format, lint, strict typecheck, 316
> unit/integration + E2E tests, shared/Admin builds, Expo config/export). The
> Supabase backend (migrations `0001`–`0014`, RLS, storage, privileged RPCs,
> security hardening) has now been **executed against a real Postgres** via the
> Supabase CLI on a local stack: all migrations apply cleanly and the three SQL
> suites pass (`ledger_and_constraints` 4/4, `rls_enabled` 3/3,
> `security_hardening` 30/30) — see `docs/acceptance/production-readiness-review.md`.
> Still not production-ready: live payments/maps/push/store and legal policies
> are Client-owned blockers (B1–B10).

## Repository layout

```
apps/
  admin/      Next.js Admin web (protected dashboard, cases, finance, categories)
  mobile/     Expo mobile app (auth, marketplace, booking, paid chat, reviews, support)
packages/
  config/     environment contract, exact 39-key brand tokens, shared limits
  domain/     IDs, statuses, DTOs, Zod schemas, money, state rules, ports, adapters
supabase/
  migrations/ extensions, schema, constraints, indexes, RLS, storage, RPCs
  functions/  Edge Functions (payment-webhook, health)
  tests/      database self-check SQL
docs/
  architecture/  operations/  acceptance/
.github/workflows/  CI
```

## Prerequisites

- Node.js >= 20.11 (developed on 22.x) and npm >= 10
- (Optional, for the database) Supabase CLI + Docker for local Postgres

## Install

```bash
npm install
```

## Everyday commands (run from the repo root)

```bash
npm run build       # tsc project-reference build of config + domain
npm run typecheck   # strict typecheck (forced rebuild)
npm test            # Vitest unit tests
npm run lint        # ESLint (bans `any`, enforces type-only imports)
npm run format      # Prettier check
npm run format:write
```

## Environment

Copy the examples and fill in values locally:

```bash
cp .env.example .env
cp apps/admin/.env.example apps/admin/.env
cp apps/mobile/.env.example apps/mobile/.env
```

All configuration is parsed and validated by `@dizkarte/config`:

- `parsePublicConfig` — client-safe values; rejects any leaked secret key.
- `parseServerConfig` — server values; **fails closed** in staging/production
  when a synthetic adapter is selected or a required credential is missing.

Synthetic adapters are deterministic, clearly labeled, and can never run in
production (enforced in code and again in the database/edge boundary).

## Database

Migrations are plain, ordered SQL under `supabase/migrations/`. With the Supabase
CLI installed:

```bash
supabase start
supabase db reset            # applies migrations + seed.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ledger_and_constraints.sql
```

See `docs/operations/setup.md` for details. The Supabase CLI is **not** required
to build/test the TypeScript packages.

## Security highlights

- Row Level Security on every user-facing/sensitive table; privileged commands
  use `SECURITY DEFINER` functions that re-check authorization.
- Exact location, contact, and chat are gated until authoritative payment
  confirmation.
- Append-only, balanced-to-zero double-entry ledger; balances are derived.
- Private storage buckets with owner-partitioned object policies.
- Service-role and provider secrets never enter client/mobile bundles.

See `docs/acceptance/traceability.md` for requirement→implementation mapping and
`docs/acceptance/risk-register.md` / `decision-register.md` for open items and
release blockers.

## What is NOT done here (release blockers)

Live payments/payouts, maps, push, and store deployment require Client-owned
accounts, an approved payment model, and approved policies. These are documented
as blockers and are **never** replaced with fake production behavior.
