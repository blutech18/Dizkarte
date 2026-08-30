-- tests/read_path_aggregates.sql
-- Self-checks for migration 0051: the read-path aggregate views.
--
-- 0051 exists only to remove round-trips and full-table transfers, so these
-- checks are about equivalence, not new behaviour:
--
--   * `admin_ledger_totals` returns exactly the per-account-type sums the app
--     used to compute in JavaScript, and its rows still add up to the overall
--     ledger balance (which a correct double-entry ledger keeps at zero).
--   * `admin_platform_fee_events` returns exactly the PLATFORM_FEE entries of
--     FEE_CHARGE transactions, dated by the TRANSACTION — not the entry — which
--     is what makes the revenue series reconcilable.
--   * `user_context` returns exactly one row per profile (a LEFT JOIN that
--     dropped or duplicated a row would change an authorization outcome) and the
--     same projection the five per-table reads produced.
--   * All three are security_invoker, and `user_context` therefore still leaks
--     no other user's capabilities.
--
-- REQUIRES a Supabase-equivalent database. Runs in a transaction and rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/read_path_aggregates.sql

begin;

-- ===========================================================================
-- 1. The views exist and evaluate RLS as the CALLER.
--
-- security_invoker is the whole reason these views are safe: without it the
-- view owner's privileges would apply and an aggregate would silently include
-- rows the caller may not read.
-- ===========================================================================
do $$
declare
  v_view text;
  v_views text[] := array['admin_ledger_totals', 'admin_platform_fee_events', 'user_context'];
  v_options text[];
begin
  foreach v_view in array v_views loop
    if to_regclass('public.' || v_view) is null then
      raise exception 'FAIL: view public.% is missing', v_view;
    end if;

    select c.reloptions into v_options
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_view;

    if v_options is null or not ('security_invoker=true' = any (v_options)) then
      raise exception 'FAIL: view public.% is not security_invoker', v_view;
    end if;
  end loop;
  raise notice 'PASS: all three aggregate views exist and are security_invoker';
end $$;

do $$
begin
  if not has_table_privilege('authenticated', 'public.user_context', 'SELECT') then
    raise exception 'FAIL: authenticated cannot read user_context';
  end if;
  if not has_table_privilege('authenticated', 'public.admin_ledger_totals', 'SELECT') then
    raise exception 'FAIL: authenticated cannot read admin_ledger_totals';
  end if;
  if not has_table_privilege('authenticated', 'public.admin_platform_fee_events', 'SELECT') then
    raise exception 'FAIL: authenticated cannot read admin_platform_fee_events';
  end if;
  raise notice 'PASS: the aggregate views are readable by authenticated';
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: two users and two balanced ledger transactions.
--
-- The amounts are deliberately asymmetric so a view that summed the wrong
-- column, or attributed a fee to the wrong account type, cannot pass by
-- coincidence.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'rpa-client@synthetic.test'),
  ('a2222222-2222-2222-2222-222222222222', 'rpa-tasker@synthetic.test')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('a1111111-1111-1111-1111-111111111111', 'RPA Client'),
  ('a2222222-2222-2222-2222-222222222222', 'RPA Tasker')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.user_capabilities (user_id, capability) values
  ('a1111111-1111-1111-1111-111111111111', 'CLIENT'),
  ('a2222222-2222-2222-2222-222222222222', 'TASKER')
on conflict do nothing;

-- A revoked capability must never appear in the context projection.
insert into public.user_capabilities (user_id, capability, revoked_at)
values ('a1111111-1111-1111-1111-111111111111', 'TASKER', now())
on conflict do nothing;

-- Two verification cases: only the newest one is the user's status.
insert into public.verification_cases (id, user_id, status, created_at) values
  ('c1000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'REJECTED', now() - interval '10 days'),
  ('c1000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111',
   'APPROVED', now() - interval '1 day');

insert into public.tasker_applications (id, user_id, status, bio, experience, created_at) values
  ('c2000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222',
   'SUBMITTED', 'Synthetic application bio for the read-path aggregate suite.',
   'Synthetic experience.', now() - interval '5 days'),
  ('c2000000-0000-0000-0000-000000000002', 'a2222222-2222-2222-2222-222222222222',
   'APPROVED', 'Synthetic approved bio for the read-path aggregate suite.',
   'Synthetic experience.', now() - interval '2 days');

insert into public.tasker_profiles (user_id, approved_at)
values ('a2222222-2222-2222-2222-222222222222', now() - interval '2 days')
on conflict (user_id) do update set approved_at = excluded.approved_at;

insert into public.ledger_accounts (id, owner_type, owner_id, account_type) values
  ('d1000000-0000-0000-0000-000000000001', 'client', 'a1111111-1111-1111-1111-111111111111',
   'CLIENT_FUNDING'),
  ('d1000000-0000-0000-0000-000000000002', 'platform', null, 'PLATFORM_FEE'),
  ('d1000000-0000-0000-0000-000000000003', 'tasker', 'a2222222-2222-2222-2222-222222222222',
   'TASKER_AVAILABLE');

-- Every non-payout ledger transaction must name the booking whose money it
-- moves (0036), so the fee needs a real booking behind it.
insert into public.categories (id, slug, name)
values ('c3000000-0000-0000-0000-000000000001', 'rpa-cat', 'RPA Category');

insert into public.tasks
  (id, client_id, category_id, title, description, budget_centavos, status, published_at)
values
  ('a3000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'c3000000-0000-0000-0000-000000000001', 'RPA Booked Task',
   'Synthetic assigned task behind the fee transaction.', 500000, 'ASSIGNED', now());

insert into public.offers
  (id, task_id, tasker_id, amount_centavos, message, eta_text, availability_text,
   experience_text, status)
values ('b3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
        'a2222222-2222-2222-2222-222222222222', 500000, 'Synthetic offer.', '2 hours',
        'Today', 'Synthetic experience.', 'SELECTED');

insert into public.bookings
  (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
values ('e3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
        'b3000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111',
        'a2222222-2222-2222-2222-222222222222', 500000, 'CONFIRMED', 'rpa-booking-1');

-- Dated in the past so a view that used the ENTRY timestamp instead of the
-- TRANSACTION timestamp would report a different instant.
insert into public.ledger_transactions (id, booking_id, type, idempotency_key, created_at) values
  ('d2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
   'FEE_CHARGE', 'rpa-fee-1', now() - interval '3 days'),
  ('d2000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001',
   'RELEASE_TO_TASKER', 'rpa-release-1', now() - interval '3 days');

-- Each transaction balances to zero, as the ledger's own trigger requires.
insert into public.ledger_entries (transaction_id, account_id, amount_centavos) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', -12345),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 12345),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', -50000),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003', 50000);

-- ===========================================================================
-- 2. admin_ledger_totals equals the per-account-type sums, and its rows still
--    add up to the whole-ledger balance.
-- ===========================================================================
do $$
declare
  v_mismatch text;
  v_view_balance bigint;
  v_entry_balance bigint;
begin
  select string_agg(
           format('%s: view=%s expected=%s', account_type, view_total, expected_total), ', ')
    into v_mismatch
  from (
    select
      a.account_type::text as account_type,
      (select v.total_centavos from public.admin_ledger_totals v
        where v.account_type = a.account_type::text) as view_total,
      sum(e.amount_centavos) as expected_total
    from public.ledger_entries e
    join public.ledger_accounts a on a.id = e.account_id
    group by a.account_type
  ) per_type
  where view_total is distinct from expected_total;

  if v_mismatch is not null then
    raise exception 'FAIL: admin_ledger_totals disagrees with the entries (%)', v_mismatch;
  end if;

  select coalesce(sum(total_centavos), 0) into v_view_balance from public.admin_ledger_totals;
  select coalesce(sum(amount_centavos), 0) into v_entry_balance from public.ledger_entries;
  if v_view_balance <> v_entry_balance then
    raise exception 'FAIL: view balance % <> entry balance %', v_view_balance, v_entry_balance;
  end if;
  if v_view_balance <> 0 then
    raise exception 'FAIL: the fixture ledger does not balance to zero (%)', v_view_balance;
  end if;
  raise notice 'PASS: admin_ledger_totals matches the entries and balances to zero';
end $$;

-- ===========================================================================
-- 3. admin_platform_fee_events is exactly the platform-fee revenue, dated by
--    its transaction.
-- ===========================================================================
do $$
declare
  v_count integer;
  v_amount bigint;
  v_occurred timestamptz;
  v_transaction_at timestamptz;
begin
  select count(*), coalesce(sum(amount_centavos), 0)
    into v_count, v_amount
  from public.admin_platform_fee_events;

  -- One fee entry exists; the funding leg of the same transaction, and both legs
  -- of the RELEASE_TO_TASKER transaction, must not be reported as revenue.
  if v_count <> 1 then
    raise exception 'FAIL: expected 1 platform fee event, found %', v_count;
  end if;
  if v_amount <> 12345 then
    raise exception 'FAIL: expected 12345 centavos of fee revenue, found %', v_amount;
  end if;

  select occurred_at into v_occurred from public.admin_platform_fee_events;
  select created_at into v_transaction_at
  from public.ledger_transactions
  where id = 'd2000000-0000-0000-0000-000000000001';
  if v_occurred <> v_transaction_at then
    raise exception 'FAIL: fee dated % but its transaction is dated %',
      v_occurred, v_transaction_at;
  end if;
  raise notice 'PASS: admin_platform_fee_events reports only fee revenue, dated by its transaction';
end $$;

-- ===========================================================================
-- 4. user_context returns exactly one row per profile.
--
-- The projection joins five tables; a plain join would have dropped users with
-- no capabilities or no Tasker profile, and a non-lateral join against two
-- verification cases would have duplicated the row. Either would change an
-- authorization decision.
-- ===========================================================================
do $$
declare
  v_profiles integer;
  v_rows integer;
begin
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_rows from public.user_context;
  if v_rows <> v_profiles then
    raise exception 'FAIL: user_context returned % rows for % profiles', v_rows, v_profiles;
  end if;
  raise notice 'PASS: user_context returns exactly one row per profile';
end $$;

-- ===========================================================================
-- 5. The projection matches what the five per-table reads produced.
-- ===========================================================================
do $$
declare r record;
begin
  select * into r from public.user_context
   where user_id = 'a1111111-1111-1111-1111-111111111111';

  if r.display_name <> 'RPA Client' then
    raise exception 'FAIL: display_name was %', r.display_name;
  end if;
  if r.account_status <> 'active' then
    raise exception 'FAIL: account_status was %', r.account_status;
  end if;
  if r.capabilities <> array['CLIENT'] then
    raise exception 'FAIL: a revoked capability leaked into the context (%)', r.capabilities;
  end if;
  if r.verification_status <> 'APPROVED' then
    raise exception 'FAIL: expected the NEWEST verification case, got %', r.verification_status;
  end if;
  if r.tasker_application_status is not null then
    raise exception 'FAIL: a client reported a Tasker application (%)',
      r.tasker_application_status;
  end if;
  if r.tasker_approved_at is not null or r.tasker_suspended_at is not null then
    raise exception 'FAIL: a client reported Tasker approval timestamps';
  end if;

  select * into r from public.user_context
   where user_id = 'a2222222-2222-2222-2222-222222222222';

  -- Every provisioned profile also holds CLIENT, and the array is ordered so the
  -- projection is stable rather than dependent on insert order.
  if r.capabilities <> array['CLIENT', 'TASKER'] then
    raise exception 'FAIL: tasker capabilities were %', r.capabilities;
  end if;
  if r.tasker_application_status <> 'APPROVED' then
    raise exception 'FAIL: expected the NEWEST application, got %', r.tasker_application_status;
  end if;
  if r.tasker_approved_at is null or r.tasker_suspended_at is not null then
    raise exception 'FAIL: Tasker approval timestamps were not projected';
  end if;
  -- A user with no verification case must still yield a row, with a null status
  -- the application maps to DRAFT.
  if r.verification_status is not null then
    raise exception 'FAIL: expected no verification case, got %', r.verification_status;
  end if;
  raise notice 'PASS: user_context projects the same values as the per-table reads';
end $$;

-- ===========================================================================
-- 6. RLS still applies: one user cannot read another user's capabilities
--    through the view.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

do $$
declare
  v_own_capabilities text[];
  v_other_capabilities text[];
begin
  select capabilities into v_own_capabilities
  from public.user_context where user_id = 'a1111111-1111-1111-1111-111111111111';

  if v_own_capabilities is distinct from array['CLIENT'] then
    raise exception 'FAIL: a user cannot read their own capabilities (%)', v_own_capabilities;
  end if;

  select capabilities into v_other_capabilities
  from public.user_context where user_id = 'a2222222-2222-2222-2222-222222222222';

  -- Either the row is invisible (null) or it is visible with no capabilities.
  -- What must never happen is one user reading another's grants.
  if v_other_capabilities is not null and array_length(v_other_capabilities, 1) is not null then
    raise exception 'FAIL: user_context leaked another user''s capabilities (%)',
      v_other_capabilities;
  end if;
  raise notice 'PASS: user_context exposes the caller''s own capabilities only';
end $$;

reset role;

-- ===========================================================================
-- 7. An unauthenticated caller reads nothing through the new views.
--
-- This project's gate is RLS, not table grants (see 0014): there is no policy
-- granting `anon` anything, so an anonymous select must come back empty rather
-- than be refused. Asserted behaviourally, because that is the property that
-- actually matters.
-- ===========================================================================
set local role anon;

do $$
declare
  v_contexts integer;
  v_totals integer;
  v_fees integer;
begin
  select count(*) into v_contexts from public.user_context;
  select count(*) into v_totals from public.admin_ledger_totals;
  select count(*) into v_fees from public.admin_platform_fee_events;

  if v_contexts <> 0 then
    raise exception 'FAIL: anon read % user_context rows', v_contexts;
  end if;
  if v_totals <> 0 then
    raise exception 'FAIL: anon read % ledger total rows', v_totals;
  end if;
  if v_fees <> 0 then
    raise exception 'FAIL: anon read % platform fee events', v_fees;
  end if;
  raise notice 'PASS: an anonymous caller reads nothing through the aggregate views';
end $$;

reset role;

rollback;
