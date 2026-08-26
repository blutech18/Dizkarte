-- tests/task_feed_filters.sql
-- Self-checks for the browse/search feed function `search_task_feed`, focused on
-- migration 0047's "no offers yet" filter.
--
-- Coverage: exactly ONE `search_task_feed` exists (the overload trap that would
-- make the new filter silently do nothing); the filter returns only zero-offer
-- tasks and genuinely narrows the set; a null/absent flag behaves as "off"; the
-- filter composes with another predicate rather than replacing it; and the
-- page-size clamp and private-location exclusion still hold on this path.
--
-- REQUIRES a Supabase-equivalent database (`auth.uid()`, the `authenticated`
-- role, PostGIS). Runs in a transaction and rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/task_feed_filters.sql

begin;

-- ---------------------------------------------------------------------------
-- Fixtures: two OPEN tasks in the same locality, one already quoted.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'tff-client@synthetic.test'),
  ('e2222222-2222-2222-2222-222222222222', 'tff-tasker@synthetic.test'),
  ('e3333333-3333-3333-3333-333333333333', 'tff-viewer@synthetic.test')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('e1111111-1111-1111-1111-111111111111', 'TFF Client'),
  ('e2222222-2222-2222-2222-222222222222', 'TFF Tasker'),
  ('e3333333-3333-3333-3333-333333333333', 'TFF Viewer')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.user_capabilities (user_id, capability)
values ('e2222222-2222-2222-2222-222222222222', 'TASKER')
on conflict do nothing;

insert into public.categories (id, slug, name)
values ('c3000000-0000-0000-0000-000000000001', 'tff-cat', 'TFF Category');

insert into public.tasks
  (id, client_id, category_id, title, description, budget_centavos, status, same_day, published_at)
values
  ('a3000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111',
   'c3000000-0000-0000-0000-000000000001', 'TFF Unquoted Task',
   'Synthetic open task with no offers yet.', 250000, 'OPEN', true, now() - interval '2 hours'),
  ('a3000000-0000-0000-0000-000000000002', 'e1111111-1111-1111-1111-111111111111',
   'c3000000-0000-0000-0000-000000000001', 'TFF Quoted Task',
   'Synthetic open task that already has an offer.', 350000, 'OPEN', false,
   now() - interval '1 hour');

insert into public.task_public_locations (task_id, city_code, barangay_code, landmark, approximate_point)
values
  ('a3000000-0000-0000-0000-000000000001', '137404', '137404001', 'Near a landmark',
   st_setsrid(st_point(121.03, 14.65), 4326)::geography),
  ('a3000000-0000-0000-0000-000000000002', '137404', '137404001', 'Near a landmark',
   st_setsrid(st_point(121.04, 14.66), 4326)::geography);

insert into public.task_private_locations (task_id, exact_address, exact_point)
values
  ('a3000000-0000-0000-0000-000000000001', '1 Exact Street', st_setsrid(st_point(121.03, 14.65), 4326)::geography),
  ('a3000000-0000-0000-0000-000000000002', '2 Exact Street', st_setsrid(st_point(121.04, 14.66), 4326)::geography);

-- Only the second task is quoted.
insert into public.offers
  (id, task_id, tasker_id, amount_centavos, message, eta_text, availability_text,
   experience_text, status)
values ('d3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002',
        'e2222222-2222-2222-2222-222222222222', 340000, 'Synthetic offer.', '2 hours',
        'Today', 'Synthetic experience.', 'SUBMITTED');

-- ===========================================================================
-- 1. Exactly one `search_task_feed` exists.
-- ===========================================================================
do $$
declare v_count integer; v_args text;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_task_feed';

  if v_count <> 1 then
    -- Adding a parameter with `create or replace` alone leaves the previous
    -- signature behind as an overload; PostgREST would then resolve by argument
    -- names and could keep calling the old one, so the new filter would appear
    -- to do nothing. 0047 drops the old signature for exactly this reason.
    raise exception 'FAIL: % search_task_feed functions exist (expected 1)', v_count;
  end if;

  select pg_get_function_identity_arguments(p.oid) into v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_task_feed';
  if v_args not like '%p_no_offers_only boolean%' then
    raise exception 'FAIL: the surviving signature lacks p_no_offers_only (%)', v_args;
  end if;
  raise notice 'PASS: one search_task_feed, carrying p_no_offers_only';
end $$;

-- ===========================================================================
-- 2. The filter returns only unquoted tasks — and narrows the set.
--
-- Run as an unrelated viewer on purpose: this is the audience whose `offer_count`
-- was previously always 0, which is what made the filter meaningless before the
-- count was delegated to a SECURITY DEFINER helper.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local request.jwt.claim.sub = 'e3333333-3333-3333-3333-333333333333';

do $$
declare v_quoted_count bigint; v_offers_visible integer;
begin
  -- The count is a task fact.
  select offer_count into v_quoted_count
  from public.search_task_feed(p_city_code => '137404', p_page_size => 50)
  where id = 'a3000000-0000-0000-0000-000000000002';
  if v_quoted_count <> 1 then
    raise exception 'FAIL: an unrelated viewer saw offer_count % (expected the true 1)',
      v_quoted_count;
  end if;

  -- ...while the offer ROWS stay private to this viewer. The aggregate is the
  -- only thing the feed discloses.
  select count(*) into v_offers_visible from public.offers
  where task_id = 'a3000000-0000-0000-0000-000000000002';
  if v_offers_visible <> 0 then
    raise exception 'FAIL: offer rows leaked to an unrelated viewer (% rows)', v_offers_visible;
  end if;
  raise notice 'PASS: offer_count is a task fact; offer rows remain private';
end $$;

do $$
declare v_all integer; v_unquoted integer; v_quoted_present boolean;
begin
  select count(*) into v_all
  from public.search_task_feed(p_city_code => '137404', p_page_size => 50);

  select count(*) into v_unquoted
  from public.search_task_feed(p_city_code => '137404', p_page_size => 50,
                               p_no_offers_only => true);

  if v_all < 2 then raise exception 'FAIL: fixture tasks are not both in the feed (%)', v_all; end if;
  if v_unquoted <> 1 then
    raise exception 'FAIL: expected exactly 1 unquoted task, got %', v_unquoted;
  end if;

  select exists (
    select 1 from public.search_task_feed(p_city_code => '137404', p_page_size => 50,
                                          p_no_offers_only => true)
    where id = 'a3000000-0000-0000-0000-000000000002'
  ) into v_quoted_present;
  if v_quoted_present then raise exception 'FAIL: a quoted task survived the filter'; end if;

  -- Every returned row must actually carry a zero count, not merely be the row
  -- we expected.
  if exists (
    select 1 from public.search_task_feed(p_city_code => '137404', p_page_size => 50,
                                           p_no_offers_only => true)
    where coalesce(offer_count, 0) <> 0
  ) then
    raise exception 'FAIL: a row with offers was returned as unquoted';
  end if;
  raise notice 'PASS: p_no_offers_only returns only zero-offer tasks';
end $$;

-- ===========================================================================
-- 3. Absent/null flag behaves as "off" (consistent with the other booleans).
-- ===========================================================================
do $$
declare v_default integer; v_null integer; v_false integer;
begin
  select count(*) into v_default
  from public.search_task_feed(p_city_code => '137404', p_page_size => 50);
  select count(*) into v_null
  from public.search_task_feed(p_city_code => '137404', p_page_size => 50,
                               p_no_offers_only => null);
  select count(*) into v_false
  from public.search_task_feed(p_city_code => '137404', p_page_size => 50,
                               p_no_offers_only => false);

  if v_default <> v_null or v_default <> v_false then
    raise exception 'FAIL: off/null/absent disagree (% / % / %)', v_default, v_null, v_false;
  end if;
  raise notice 'PASS: an unset or null flag leaves the feed unfiltered';
end $$;

-- ===========================================================================
-- 4. It composes with another predicate instead of replacing it.
-- ===========================================================================
do $$
declare v_rows integer;
begin
  -- The only unquoted task is same-day; asking for same-day + unquoted keeps it.
  select count(*) into v_rows
  from public.search_task_feed(p_city_code => '137404', p_page_size => 50,
                               p_same_day_only => true, p_no_offers_only => true);
  if v_rows <> 1 then raise exception 'FAIL: same-day + unquoted returned %', v_rows; end if;

  -- A budget floor above it must exclude it even though it is unquoted.
  select count(*) into v_rows
  from public.search_task_feed(p_city_code => '137404', p_page_size => 50,
                               p_min_budget => 300000, p_no_offers_only => true);
  if v_rows <> 0 then
    raise exception 'FAIL: the filter overrode the budget predicate (% rows)', v_rows;
  end if;
  raise notice 'PASS: the filter composes with the other predicates';
end $$;

-- ===========================================================================
-- 5. Existing guarantees still hold on this code path.
-- ===========================================================================
do $$
declare v_rows integer; v_cols integer;
begin
  -- Page size is clamped server-side (a client cannot ask for the whole table).
  select count(*) into v_rows
  from public.search_task_feed(p_page_size => 100000);
  if v_rows > 100 then raise exception 'FAIL: page-size clamp lost (% rows)', v_rows; end if;

  -- No exact-location column is exposed by the feed contract.
  select count(*) into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'public_task_feed'
    and column_name in ('exact_address', 'exact_point');
  if v_cols <> 0 then raise exception 'FAIL: the feed exposes an exact-location column'; end if;
  raise notice 'PASS: clamp and private-location exclusion intact';
end $$;

rollback;
