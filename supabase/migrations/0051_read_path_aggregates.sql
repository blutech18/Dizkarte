-- 0051_read_path_aggregates.sql
-- Read-path performance only: no table, column, policy, or privilege semantics
-- change here.
--
-- Three read paths were shipping whole tables to the application and reducing
-- them in JavaScript:
--
--   1. Finance totals read every row of `ledger_entries` and `ledger_accounts`
--      on every dashboard, revenue, and reconciliation render, then summed in
--      the app. Cost grew with the lifetime of the ledger rather than with the
--      figure being shown, and any PostgREST `max-rows` cap would have silently
--      truncated the totals instead of failing.
--   2. The revenue trend resolved fee transactions, then their entries, then
--      the account types of those entries — three sequential round-trips to
--      recover a list of (day, amount) pairs.
--   3. The signed-in user's authorization context took five separate requests
--      (profile, capabilities, latest verification case, latest Tasker
--      application, Tasker profile) on every Admin request and every mobile
--      session derivation.
--
-- Each is replaced by a `security_invoker` view, so **authorization is
-- unchanged**: the base tables' RLS policies are evaluated against the calling
-- user exactly as they are today, and a caller who cannot read a row cannot see
-- it contribute to an aggregate either. Nothing here is SECURITY DEFINER and no
-- new privilege is granted.

begin;

-- ===========================================================================
-- SECTION 1 — Supporting indexes.
--
-- Every one of these supports a filter or join the application already issues;
-- none of them is speculative.
-- ===========================================================================

-- Fee transactions are always read as "type = FEE_CHARGE within a date window".
create index if not exists ix_ledger_transactions_type_created
  on public.ledger_transactions (type, created_at desc);

-- Entries are joined to accounts to recover the account type.
create index if not exists ix_ledger_accounts_type
  on public.ledger_accounts (account_type);

-- The authorization context reads the newest case/application for one user.
create index if not exists ix_verification_cases_user_created
  on public.verification_cases (user_id, created_at desc);

create index if not exists ix_tasker_applications_user_created
  on public.tasker_applications (user_id, created_at desc);

-- ===========================================================================
-- SECTION 2 — Ledger totals per account type.
--
-- Replaces a full-table read plus an in-app join. The double-entry ledger sums
-- to zero overall, so the app derives the reconciliation signal by summing
-- these rows; every entry has an account and every account has a type, so no
-- amount is dropped by the join.
-- ===========================================================================

create or replace view public.admin_ledger_totals
with (security_invoker = true) as
select
  a.account_type::text as account_type,
  sum(e.amount_centavos)::bigint as total_centavos
from public.ledger_entries e
join public.ledger_accounts a on a.id = e.account_id
group by a.account_type;

comment on view public.admin_ledger_totals is
  'Signed sum of ledger entries per account type. security_invoker: the caller sees totals only over the entries their RLS policies already allow them to read.';

grant select on public.admin_ledger_totals to authenticated;

-- ===========================================================================
-- SECTION 3 — Platform fee events.
--
-- One row per platform-fee entry, carrying the *transaction* timestamp. Fees are
-- attributed to the day of their transaction rather than the day the entry row
-- was written, which is what keeps the revenue series reconcilable — the same
-- rule the previous application code applied, moved into the join.
-- ===========================================================================

create or replace view public.admin_platform_fee_events
with (security_invoker = true) as
select
  t.id as transaction_id,
  t.created_at as occurred_at,
  e.amount_centavos
from public.ledger_transactions t
join public.ledger_entries e on e.transaction_id = t.id
join public.ledger_accounts a on a.id = e.account_id
where t.type = 'FEE_CHARGE'
  and a.account_type = 'PLATFORM_FEE';

comment on view public.admin_platform_fee_events is
  'Platform-fee ledger entries dated by their transaction. security_invoker: RLS on the underlying ledger tables still decides which rows are visible.';

grant select on public.admin_platform_fee_events to authenticated;

-- ===========================================================================
-- SECTION 4 — Signed-in user authorization context.
--
-- Collapses five requests into one. LEFT JOIN LATERAL rather than plain joins
-- so a user with no capabilities, no verification case, no Tasker application,
-- or no Tasker profile still yields exactly one row — the previous code treated
-- each of those as an independent optional read, and losing the row would
-- change an authorization outcome.
--
-- RLS is unchanged and still self-scoped: `user_capabilities`,
-- `verification_cases`, `tasker_applications`, and `tasker_profiles` all carry
-- self-read policies, so this view can never report capabilities the caller is
-- not allowed to read. Capabilities remain unforgeable.
-- ===========================================================================

create or replace view public.user_context
with (security_invoker = true) as
select
  p.id as user_id,
  p.display_name,
  p.account_status::text as account_status,
  coalesce(caps.capabilities, array[]::text[]) as capabilities,
  latest_verification.status as verification_status,
  latest_application.status as tasker_application_status,
  tasker.approved_at as tasker_approved_at,
  tasker.suspended_at as tasker_suspended_at
from public.profiles p
left join lateral (
  select array_agg(uc.capability::text order by uc.capability::text) as capabilities
  from public.user_capabilities uc
  where uc.user_id = p.id
    and uc.revoked_at is null
) caps on true
left join lateral (
  select vc.status::text as status
  from public.verification_cases vc
  where vc.user_id = p.id
  order by vc.created_at desc
  limit 1
) latest_verification on true
left join lateral (
  select ta.status::text as status
  from public.tasker_applications ta
  where ta.user_id = p.id
  order by ta.created_at desc
  limit 1
) latest_application on true
left join public.tasker_profiles tasker on tasker.user_id = p.id;

comment on view public.user_context is
  'One-row authorization projection for a user: profile state, active capabilities, latest verification case, latest Tasker application, Tasker approval. security_invoker, so the self-read RLS policies on every source table still apply.';

grant select on public.user_context to authenticated;

commit;
