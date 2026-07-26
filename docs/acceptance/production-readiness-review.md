# Production-Readiness Review

Date: 2026-07-22. Scope: full Dizkarte monorepo (shared packages, mobile app,
Admin app, Supabase backend). This review is **evidence-based**: every "verified"
claim below cites a command run in this repository. It deliberately separates
three states:

- **VERIFIED** — implemented and confirmed by a command/output in this repo.
- **AUTHORED (not executed)** — source written and statically reviewed, but not
  run against a live dependency (applies to SQL/RLS: no local Postgres/Supabase).
- **BLOCKED (client-owned)** — cannot be completed in source: needs Client
  accounts, approved policies, credentials, or store/legal artifacts.

## Overall recommendation

**Not production-ready — and not claimed to be.** This is a verified
development/synthetic build with a fully authored, statically-reviewed secure
backend. Production acceptance is gated on (a) executing the database migrations
and SQL/RLS test suites against a real Supabase/Postgres instance, and (b) the
Client-owned release blockers B1–B10 (payments, maps, push, store, legal). No
live payment, map, push, store, or "production-ready" status is claimed.

## 1. Verification evidence (this session)

| Check                     | Command                       | Result                                                       |
| ------------------------- | ----------------------------- | ------------------------------------------------------------ |
| Formatting                | `npm run format`              | VERIFIED — all files pass Prettier                           |
| Lint                      | `npm run lint`                | VERIFIED — ESLint clean                                      |
| Types (all workspaces)    | `npm run typecheck:all`       | VERIFIED — shared + Admin + mobile pass                      |
| Unit/integration tests    | `npm run test:all`            | VERIFIED — 316 passed (93 + 83 + 140)                        |
| Shared build              | `npm run build`               | VERIFIED — tsc project refs build                            |
| Admin production build    | `npm run admin:build`         | VERIFIED — compiled + static pages                           |
| Expo config               | `npm run mobile:config-check` | VERIFIED — public config resolves                            |
| Mobile static export      | `npm run mobile:export`       | VERIFIED — 38 static routes exported                         |
| Database migrations + SQL | `supabase db reset` + tests   | VERIFIED — 0001–0014 apply; suites pass 4/4, 3/3, 30/30 (§7) |

Test breakdown: shared domain/config **93**, Admin **83** (incl. new Admin E2E),
mobile **140** (incl. new mobile E2E). Two deterministic end-to-end lifecycle
tests were added this session (user journey + Admin resolution); the Admin E2E
surfaced and fixed a real ticket-lifecycle defect (see change-log).

## 2. Security, authorization, RLS, storage

- **Authorization ≠ authentication.** Capabilities are server-issued; the client
  session never self-grants. RLS predicates re-check ownership/capability.
  VERIFIED at the domain/config/adapter layer by unit tests; **AUTHORED** at the
  database layer (`0009`–`0013`).
- **Sensitive-surface access (chat, exact location, ID docs, case narrative,
  evidence)** is assignment-scoped in `0013`: an active, unrevoked, explicitly
  **assigned** Admin only; super is not an implicit grant; disputes are
  finance/super only; every sensitive read/storage authorization is audited with
  actor, time, target, capability, and a bounded reason, exactly-once per key
  behind a transaction advisory lock. New RPCs revoke PUBLIC/anon/authenticated/
  service_role then re-grant only intended roles. VERIFIED by executing
  `supabase/tests/security_hardening.sql` (30/30 pass) against a local Postgres.
- **Storage** buckets are private; object reads bind to a real owned row; Admin
  object access requires `admin_authorize_object_read` + a server-role signed
  URL. **AUTHORED.**
- **Secret hygiene.** `parsePublicConfig` rejects secret-named keys in public
  config (VERIFIED by `packages/config` tests). This session confirmed the
  mobile `.env.local` holds a **publishable** key (client-safe), corrected its
  variable name to `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and confirmed no service-role
  secret is present in any `EXPO_PUBLIC_*`/`NEXT_PUBLIC_*` value.
- **Network-exposed surface.** The Admin app enforces a server-side session +
  capability guard on protected routes (VERIFIED by `session.test.ts`). The
  payment webhook validates signature/idempotency before any effect (AUTHORED).

## 3. Payments, ledger, refund, payout authority

- Money is integer centavos; the ledger is append-only and balanced-to-zero;
  balances are derived. VERIFIED in domain tests; **AUTHORED** at the DB layer
  (balanced-constraint + immutability triggers).
- **Client checkout is never authoritative**; only the provider webhook confirms
  a booking. VERIFIED by mobile tests + the new mobile E2E.
- **Refund/payout fail closed.** `admin_refund` records intent only; provider
  finalizers are service-role-only and idempotent; released funds cannot be
  reversed. VERIFIED at the synthetic Admin layer (`code === PROVIDER_UNAVAILABLE`)
  and asserted in SQL (**AUTHORED**).
- Fee defaults to **zero**; no illustrative hard-coded percentage.

## 4. Accessibility

- Frontend components use semantic elements, labeled inputs, real buttons/links,
  visible focus, and the 39-token light/dark contrast contract. Implemented in
  the mobile/Admin passes; **not independently re-audited in this session**.
  Recommend a dedicated WCAG audit (axe/Lighthouse) plus manual keyboard/screen-
  reader passes before acceptance (see risk register R9/B9 acceptance protocol).

## 5. Dependencies, config, secrets

- Tooling versions are pinned exactly in the root `package.json` devDependencies.
- **Finding (minor):** `@supabase/supabase-js` is declared with a caret range
  (`^2.110.8`). Recommend pinning to an exact version and committing/verifying a
  lockfile in CI (`npm ci`) so builds are reproducible.
- `.env.example` files carry safe placeholders only; server secrets are never
  prefixed with a public bundle prefix. Config fails closed in staging/production.

## 6. Performance, query bounds, indexes

- Search/discovery enforces validated bounds (pageSize ceiling, budget min≤max,
  schedule window ordering, radius requires an origin). VERIFIED by mobile tests.
- Indexes exist for audit lookups and hot query paths; the one-active-booking
  partial unique index prevents double booking. **AUTHORED** (DB); execution/
  `EXPLAIN` validation pending a running Postgres. No production load/perf targets
  are defined yet (blocker B9).

## 7. Database execution — COMPLETED

The migrations (`0001`–`0014`) and SQL suites (`ledger_and_constraints.sql`,
`rls_enabled.sql`, `security_hardening.sql`) have been **executed against a real
Supabase/Postgres local stack** (pinned Supabase CLI v2.109.1 + Docker). All
migrations apply cleanly via `supabase db reset` and every suite passes:
`ledger_and_constraints` 4/4, `rls_enabled` 3/3, `security_hardening` 30/30.

Defects that only real execution surfaced (all fixed; see the change log):

- **Migration ordering** — `0001` defined SQL helpers reading tables created in
  `0002`; relocated to the end of `0002`.
- **Missing `grant usage on schema app`** — added in `0001` (RLS predicates
  call `app.*`).
- **Missing API-role table grants** — new `0014_api_role_grants.sql` grants
  `authenticated` DML / `service_role` ALL (anon none); RLS remains the row gate.
- **Webhook/refund RPC** — explicit `::provider_event_status` cast and correct
  in-memory `DUPLICATE` replay reporting in `process_payment_event` /
  `process_refund_event`.

Tasks **3.12** and **3.13** are now satisfied by this execution. For the record,
the two equivalent environments in which these suites can be run are:

1. **Local (preferred):** start Docker Desktop's Linux engine, install a pinned
   Supabase CLI, run `supabase db reset` on an ephemeral local project, then run
   the three SQL suites. (Requires approval to install the CLI.)
2. **Hosted:** provide DB-admin credentials (connection string / service-role)
   **and** explicit approval to apply migrations to an isolated project; then run
   the suites. Applying schema to a hosted DB is a schema-mutating action and is
   not performed without confirmation.

## 8. Operations: backup, restore, rollback, runbooks

Documented in `docs/operations/deployment-backup-rollback.md`: forward-only
migrations, PITR + snapshot-before-migration, restore rehearsal, webhook
reconciliation via `provider_events`, provider-outage fail-closed behavior, and
secret-free incident logging. **Procedures documented; production execution
blocked (B1).**

## 9. Release blockers (client-owned)

See `docs/acceptance/risk-register.md` B1–B10: Supabase/hosting (B1), lawful
payment/payout model + provider (B2), map provider (B3), push credentials (B4),
store/signing accounts (B5), privacy/consent/retention policies (B6), money
policies (B7), approved legal/safety copy (B8), performance/UAT targets (B9),
executed agreement + document versions (B10). None are resolvable in source.

## 10. Go / no-go summary

| Dimension                     | State                              |
| ----------------------------- | ---------------------------------- |
| Code quality (fmt/lint/type)  | VERIFIED green                     |
| Automated tests (316)         | VERIFIED green                     |
| Frontend builds/exports       | VERIFIED green                     |
| Backend security design       | VERIFIED — RLS/authz suites pass   |
| Database/RLS execution        | VERIFIED — 0001–0014 + suites pass |
| Live payments/maps/push/store | BLOCKED — client-owned (B1–B10)    |
| Accessibility formal audit    | Recommended before acceptance      |

**Decision: NO-GO for production.** The code, tests, frontend builds, and the
database/RLS/security layer are now all verified locally. Production remains
gated NOT on implementation but on the Client-owned blockers B1–B10 (a lawful
payment/payout provider and model, maps/push credentials, store/signing
accounts, and approved privacy/money/legal policies), plus a staging run against
Client infrastructure and a formal accessibility audit.
