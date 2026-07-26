-- tests/rls_enabled.sql
-- Verifies that Row Level Security is enabled on every user-facing/sensitive
-- table and that the expected public-safe views exist. Runnable via psql.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_enabled.sql

do $$
declare
  v_missing text;
  v_tables text[] := array[
    'profiles','user_capabilities','verification_cases','verification_documents',
    'verification_events','devices','tasker_applications','tasker_profiles',
    'specialties','tasker_specialties','service_areas','portfolio_items','payout_methods',
    'categories','tasks','task_public_locations','task_private_locations','task_media',
    'task_questions','offers','offer_events','bookings','booking_events',
    'conversations','conversation_participants','messages','message_media',
    'notifications','notification_preferences','payment_intents','provider_events',
    'ledger_accounts','ledger_transactions','ledger_entries','refunds','withdrawals',
    'reviews','review_dimensions','reports','disputes','support_tickets',
    'ticket_messages','evidence','moderation_actions','audit_logs','app_settings'
  ];
begin
  select string_agg(t, ', ') into v_missing
  from unnest(v_tables) as t
  where not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t and c.relrowsecurity = true
  );

  if v_missing is not null then
    raise exception 'FAIL: RLS not enabled on: %', v_missing;
  end if;
  raise notice 'PASS: RLS enabled on all % user-facing tables', array_length(v_tables, 1);
end $$;

do $$
begin
  if to_regclass('public.public_task_feed') is null then
    raise exception 'FAIL: public_task_feed view missing';
  end if;
  if to_regclass('public.public_tasker_profiles') is null then
    raise exception 'FAIL: public_tasker_profiles view missing';
  end if;
  raise notice 'PASS: public-safe views exist';
end $$;

-- The public task feed view must not reference the private location table.
do $$
declare v_def text;
begin
  select pg_get_viewdef('public.public_task_feed'::regclass, true) into v_def;
  if v_def ilike '%task_private_locations%'
     or v_def ilike '%exact_address%'
     or v_def ilike '%exact_point%' then
    raise exception 'FAIL: public_task_feed leaks private location data';
  end if;
  raise notice 'PASS: public_task_feed contains no private location references';
end $$;
