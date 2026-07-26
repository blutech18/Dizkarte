# Change Log

Records material scope/implementation changes. Follows the Agreement + approved
written changes as the source of authority.

## 2026-07-22 — Database executed against real Postgres (local Supabase)

The full migration chain and SQL suites were run for the first time against a
real PostgreSQL/Supabase stack (pinned Supabase CLI v2.109.1 + Docker, local
ephemeral DB). Migrations `0001`–`0014` apply cleanly; all three suites pass:
`ledger_and_constraints` 4/4, `rls_enabled` 3/3, `security_hardening` 30/30.

Defects that only real execution surfaced, and their fixes:

- **Migration ordering.** `0001` defined `app.current_capabilities`/
  `app.has_capability`/`app.is_admin` (`language sql`) whose bodies read
  `public.user_capabilities`/`public.profiles` (created in `0002`). PostgreSQL
  validates SQL-function bodies at creation, so migration failed with "relation
  does not exist". The three helpers were relocated verbatim to the end of
  `0002`; `0001` keeps a pointer note.
- **Missing schema USAGE.** Nothing granted `usage on schema app`, so every RLS
  predicate calling `app.*` would fail with "permission denied for schema app".
  Added `grant usage on schema app to anon, authenticated, service_role;` in
  `0001`.
- **Missing base-table privileges.** The API roles had no table privileges, so
  `authenticated` requests failed with "permission denied for table ..." before
  RLS ran. New `0014_api_role_grants.sql` grants `authenticated`
  SELECT/INSERT/UPDATE/DELETE and `service_role` ALL on all public tables
  (RLS remains the row gate; anon gets nothing), plus the one RLS-predicate
  execute that `0013` missed (`app.admin_assigned_ticket`).
- **Webhook RPC (`process_payment_event`, `0011`; mirrored in
  `process_refund_event`, `0013`).** An explicit `::provider_event_status` cast
  was added (a `case` returned `text`), and replay now reports `DUPLICATE`
  in-memory without re-processing (the prior `update ... where
processing_status='RECEIVED'` was a no-op on replay).
- **Test-only.** One `<> any(enum_range(...))` membership check in
  `ledger_and_constraints.sql` was corrected to `<> all(...)`.

No test assertion was weakened; the `security_hardening` denial assertions
(cross-user/unassigned/other-assignee/wrong-capability zero-row, finance/super-
only disputes, audited-RPC-only sensitive reads, service-role-only finalizers)
all pass, proving the API-role grants did not widen the authorization boundary.

## 2026-07-22 — Hardening follow-up, synthetic E2E, validation, readiness review

Backend (Claude Opus 4.8 Max, `0013` + `security_hardening.sql`):

- Dispute queue/assignment/transition/read and all dispute-derived booking/chat/
  evidence access restricted to active **finance/super** only (support removed);
  a stale support assignment on a dispute now grants nothing.
- Audited sensitive reads + storage authorization persist the bounded **reason**
  (with actor/time/target/capability/key) and are exactly-once per key behind a
  transaction advisory lock.
- Explicit execute-grant boundaries: every new public RPC and internal helper
  revokes PUBLIC/anon/authenticated/service_role, then re-grants only intended
  roles; provider finalizers stay service-role-only; RLS-needed predicates keep
  authenticated execute. Tests expanded with support-denial, super-allow-after-
  assign, reason-persistence/replay, advisory-lock, and `has_function_privilege`
  ACL assertions.

Quality (this session):

- Added two deterministic synthetic E2E tests (mobile user journey + Admin
  resolution) over existing repositories; no network/provider I/O.
- Fixed an Admin data-layer defect surfaced by the Admin E2E: `assignCase` moved
  an OPEN ticket into the non-existent `TRIAGED` ticket status (bricking its
  lifecycle); now only reports triage and disputes go under review on assign.
- Corrected `apps/mobile/.env.local` key name to `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  (value untouched; confirmed publishable/client-safe — no service-role secret in
  any public bundle variable).

Validation (non-database, all green): `format`, `lint`, `typecheck:all`,
`test:all` (316 tests: 93 shared + 83 Admin + 140 mobile), `build`,
`admin:build`, `mobile:config-check`, `mobile:export` (38 routes). Database/RLS
execution remains blocked (tasks 3.12/3.13). Added
`docs/acceptance/production-readiness-review.md` (recommendation: NO-GO).

## 2026-07-22 — Backend security hardening (migration 0013)

Added `supabase/migrations/0013_security_hardening.sql` (additive, non-destructive
— replaces policies/functions only, drops no schema or data) and
`supabase/tests/security_hardening.sql`.

Changed:

- Sensitive chat, exact location, ID documents, case/dispute/ticket narrative,
  ticket messages, evidence, and their storage objects are now visible only to
  the owner/participants and the ONE Admin explicitly assigned to the relevant
  report/dispute/ticket/verification case. Broad `app.is_admin()` /
  unqualified-capability fallbacks were removed from these surfaces. Super-admin
  is no longer an implicit purpose assignment for sensitive content.
- New assignment-scoped, active-account, unrevoked-capability helper functions
  (`app.has_active_capability`, `app.admin_assigned_*`, `app.safe_uuid`,
  `app.storage_seg`) with fixed `search_path` and no caller-controlled bypass.
- Storage read policies now bind objects to real table rows (verification
  document, message media, task media, portfolio item, evidence) instead of
  trusting a guessed path; malformed paths parse to NULL and match nothing. The
  chat-media read path is corrected so the second participant can read (it
  previously could not) while unassigned Admins cannot.
- Capability-scoped queue metadata views (`admin_report_queue`,
  `admin_dispute_queue`, `admin_ticket_queue`, `admin_verification_queue`)
  expose only non-narrative columns so queues stay triageable without leaking
  content.
- Finance: `admin_refund` no longer authoritatively refunds — it records a
  REQUESTED refund and posts NO ledger movement / NO booking change, guards
  against refunding already-released/withdrawn funds, and fails closed. A new
  service-role `process_refund_event` finalizes refunds idempotently and
  fee-correctly only on a provider-authoritative event. `request_withdrawal`
  takes a per-user advisory lock and an active-account check to prevent
  concurrent over-reservation. New service-role `process_payout_result`
  performs exactly-once reserve reversal on payout failure. Raw finance/ledger
  reads now require an ACTIVE finance/super Admin.

Not executed: the SQL requires Supabase-local/Docker (absent here); tests are
authored and static-reviewed but not run against a live Postgres (task 3.12).

## 2026-07-21 — Foundation + backend

Added:

- npm-workspace monorepo, strict shared TypeScript, ESLint (bans `any`),
  Prettier, Vitest, and CI (format/lint/typecheck/test/build + secret-safe +
  migration static checks).
- `@dizkarte/config`: exact 39-key light/dark brand token contract + gradients,
  environment parser, and fail-closed production guard. Unit-tested.
- `@dizkarte/domain`: IDs, statuses, DTOs + privacy assertions, stable errors +
  API envelopes, integer-centavo money, double-entry ledger primitives, state
  machines + actor gates, provider/repository ports, and deterministic synthetic
  adapters (rejected in production). Unit-tested.
- Supabase migrations: extensions/enums, full schema with keys/checks/indexes/
  triggers, public-safe views, one-active-booking constraint, immutable balanced
  ledger, RLS on every table, private storage policies, seed, and transactional
  `SECURITY DEFINER` RPCs for the key privileged workflows.
- Edge Functions: `health` and a signed `payment-webhook` that fails closed in
  production and never fabricates a paid state.
- Docs: architecture, data model, setup, environments, deployment/backup/
  rollback/reconciliation, decision register, risk register, traceability, and
  account/access.

Explicitly not done (owned elsewhere / blocked):

- Mobile and Admin frontend UI/UX (next pass).
- Live payment/map/push/store integrations (release blockers B1–B10).
