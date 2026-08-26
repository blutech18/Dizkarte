-- tests/milestone3_reviews_notifications.sql
-- Self-checks for the Milestone 3 gap-closure migrations 0042–0044:
--
--   * review secrecy INCLUDING the public rating aggregate (0042) — a HIDDEN
--     review must not move `public_tasker_profiles.rating_average`;
--   * the review-window TIMEOUT case (one-sided review revealing on expiry) and
--     the unauthorised read, both named by the Phase 3 exit gate;
--   * Admin review moderation recount;
--   * the two Wave 3B producers that previously had none: REVIEW_REMINDER and
--     NEARBY_TASK, including preference suppression and no-duplicate guarantees;
--   * the completion TIMEOUT sweep, asserting reminder → exactly-once escalation
--     AND that no booking status changes and no ledger entry is written (auto
--     release remains an unapproved policy: D13 / blocker 11.5);
--   * bounded push retry: attempt counting, backoff, and the terminal state.
--
-- REQUIRES a Supabase-local (or Supabase-equivalent) database: it relies on
-- `auth.uid()`, the `authenticated` role, and inserts synthetic rows into
-- `auth.users`. Run inside a transaction; it mutates nothing permanently.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/milestone3_reviews_notifications.sql
--
-- All IDs and content below are synthetic — no real users/PII.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (as the owner role, bypassing RLS).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'm3-client@synthetic.test'),
  ('b2222222-2222-2222-2222-222222222222', 'm3-tasker@synthetic.test'),
  ('b3333333-3333-3333-3333-333333333333', 'm3-nearby-tasker@synthetic.test'),
  ('b4444444-4444-4444-4444-444444444444', 'm3-stranger@synthetic.test'),
  ('b5555555-5555-5555-5555-555555555555', 'm3-support@synthetic.test')
on conflict (id) do nothing;

-- `handle_new_user` (0015) already creates a profile row for each auth user, so
-- this fills in the display names rather than inserting.
insert into public.profiles (id, display_name) values
  ('b1111111-1111-1111-1111-111111111111', 'M3 Client'),
  ('b2222222-2222-2222-2222-222222222222', 'M3 Tasker'),
  ('b3333333-3333-3333-3333-333333333333', 'M3 Nearby Tasker'),
  ('b4444444-4444-4444-4444-444444444444', 'M3 Stranger'),
  ('b5555555-5555-5555-5555-555555555555', 'M3 Support Admin')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.user_capabilities (user_id, capability) values
  ('b2222222-2222-2222-2222-222222222222', 'TASKER'),
  ('b3333333-3333-3333-3333-333333333333', 'TASKER'),
  ('b5555555-5555-5555-5555-555555555555', 'ADMIN_SUPPORT')
on conflict do nothing;

-- Both Taskers are approved; only their aggregates differ during the test.
insert into public.tasker_profiles (user_id, approved_at) values
  ('b2222222-2222-2222-2222-222222222222', now() - interval '30 days'),
  ('b3333333-3333-3333-3333-333333333333', now() - interval '30 days');

-- The nearby Tasker serves the city the task is published in.
insert into public.service_areas (user_id, city_code, barangay_code)
values ('b3333333-3333-3333-3333-333333333333', '137404', null);

insert into public.categories (id, slug, name)
values ('c1000000-0000-0000-0000-000000000001', 'm3-cat', 'M3 Category');

-- Verified Client, so publish_task is reachable further down.
insert into public.verification_cases (user_id, status)
values ('b1111111-1111-1111-1111-111111111111', 'APPROVED');

-- task1: completed booking used by the review checks.
-- task2: booking stuck in COMPLETION_REQUESTED for the timeout sweep.
-- task3: DRAFT, published inside the test to fire the nearby alert.
insert into public.tasks (id, client_id, category_id, title, description, budget_centavos, status)
values
  ('a1000000-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111',
   'c1000000-0000-0000-0000-000000000001', 'M3 Completed Task',
   'Synthetic completed task for review checks.', 500000, 'COMPLETED'),
  ('a1000000-0000-0000-0000-000000000002', 'b1111111-1111-1111-1111-111111111111',
   'c1000000-0000-0000-0000-000000000001', 'M3 Awaiting Confirmation',
   'Synthetic task awaiting client confirmation.', 400000, 'IN_PROGRESS'),
  ('a1000000-0000-0000-0000-000000000003', 'b1111111-1111-1111-1111-111111111111',
   'c1000000-0000-0000-0000-000000000001', 'M3 Nearby Publication',
   'Synthetic task used to assert the nearby alert.', 300000, 'DRAFT'),
  -- One task per extra booking: `uq_offer_task_tasker` allows a Tasker only one
  -- offer per task, and every booking needs its own accepted offer.
  ('a1000000-0000-0000-0000-000000000004', 'b1111111-1111-1111-1111-111111111111',
   'c1000000-0000-0000-0000-000000000001', 'M3 Reminder Candidate',
   'Synthetic completed task used by the review-reminder sweep.', 500000, 'COMPLETED'),
  ('a1000000-0000-0000-0000-000000000005', 'b1111111-1111-1111-1111-111111111111',
   'c1000000-0000-0000-0000-000000000001', 'M3 Muted Reminder Candidate',
   'Synthetic completed task used by the muted-preference check.', 500000, 'COMPLETED');

insert into public.task_public_locations (task_id, city_code, barangay_code, landmark, approximate_point)
values
  ('a1000000-0000-0000-0000-000000000003', '137404', '137404001', 'Near a landmark',
   st_setsrid(st_point(121.03, 14.65), 4326)::geography);

insert into public.task_private_locations (task_id, exact_address, exact_point)
values
  ('a1000000-0000-0000-0000-000000000003', '123 Synthetic Street',
   st_setsrid(st_point(121.03, 14.65), 4326)::geography);

insert into public.offers
  (id, task_id, tasker_id, amount_centavos, message, eta_text, availability_text,
   experience_text, status)
values
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'b2222222-2222-2222-2222-222222222222', 500000, 'Synthetic offer.', '2 hours',
   'Today', 'Synthetic experience.', 'SELECTED'),
  ('d1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002',
   'b2222222-2222-2222-2222-222222222222', 400000, 'Synthetic offer.', '3 hours',
   'Tomorrow', 'Synthetic experience.', 'SELECTED'),
  -- Each booking needs its own accepted offer (uq_booking_accepted_offer).
  ('d1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
   'b3333333-3333-3333-3333-333333333333', 500000, 'Synthetic offer.', '2 hours',
   'Today', 'Synthetic experience.', 'SELECTED'),
  ('d1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004',
   'b2222222-2222-2222-2222-222222222222', 500000, 'Synthetic offer.', '2 hours',
   'Today', 'Synthetic experience.', 'SELECTED'),
  ('d1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005',
   'b2222222-2222-2222-2222-222222222222', 500000, 'Synthetic offer.', '2 hours',
   'Today', 'Synthetic experience.', 'SELECTED');

insert into public.bookings
  (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111',
   'b2222222-2222-2222-2222-222222222222', 500000, 'COMPLETED', 'm3-booking-1'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002',
   'd1000000-0000-0000-0000-000000000002', 'b1111111-1111-1111-1111-111111111111',
   'b2222222-2222-2222-2222-222222222222', 400000, 'COMPLETION_REQUESTED', 'm3-booking-2');

-- Lifecycle events with backdated timestamps: the sweeps read elapsed time from
-- `booking_events`, which is exactly how they behave in production.
insert into public.booking_events (booking_id, from_status, to_status, source, created_at)
values
  ('e1000000-0000-0000-0000-000000000001', 'COMPLETION_REQUESTED', 'COMPLETED', 'client',
   now() - interval '48 hours'),
  ('e1000000-0000-0000-0000-000000000002', 'IN_PROGRESS', 'COMPLETION_REQUESTED', 'tasker',
   now() - interval '72 hours');

-- ===========================================================================
-- 1. Execute boundaries: the new server-only functions are not client-callable.
-- ===========================================================================
do $$
begin
  if has_function_privilege('authenticated', 'public.emit_review_reminders(integer)', 'EXECUTE')
    then raise exception 'FAIL: authenticated may run emit_review_reminders'; end if;
  if has_function_privilege('authenticated', 'public.sweep_stale_completion_requests(integer)', 'EXECUTE')
    then raise exception 'FAIL: authenticated may run sweep_stale_completion_requests'; end if;
  if has_function_privilege('authenticated', 'public.record_push_delivery(uuid, text, text)', 'EXECUTE')
    then raise exception 'FAIL: authenticated may record push delivery'; end if;
  if has_function_privilege('authenticated', 'public.due_push_retries(integer)', 'EXECUTE')
    then raise exception 'FAIL: authenticated may read the push retry queue'; end if;
  if not has_function_privilege('service_role', 'public.emit_review_reminders(integer)', 'EXECUTE')
    then raise exception 'FAIL: service_role cannot run emit_review_reminders'; end if;
  raise notice 'PASS: server-only execute boundaries on 0043/0044 functions';
end $$;

-- ===========================================================================
-- 1b. Scheduling (0045): the sweeps are actually wired to a scheduler, and the
--     wiring itself is not client-callable.
-- ===========================================================================
do $$
declare v_report jsonb;
begin
  if has_function_privilege('authenticated', 'app.ensure_scheduled_jobs()', 'EXECUTE')
    then raise exception 'FAIL: authenticated may re-schedule server jobs'; end if;
  if has_function_privilege('authenticated', 'app.dispatch_push_retries(integer)', 'EXECUTE')
    then raise exception 'FAIL: authenticated may trigger a push dispatch'; end if;
  if has_function_privilege('service_role', 'app.dispatch_push_retries(integer)', 'EXECUTE')
    then raise exception 'FAIL: service_role may trigger a push dispatch directly'; end if;

  -- Callable by the owner, and truthful about its own preconditions: either it
  -- scheduled the jobs, or it reports why it could not. Safe inside this
  -- transaction — any schedule written here is rolled back with everything else.
  v_report := app.ensure_scheduled_jobs();
  if v_report->'scheduled' is null then
    raise exception 'FAIL: ensure_scheduled_jobs returned no verdict (%)', v_report;
  end if;
  if not (v_report->>'scheduled')::boolean
     and v_report->>'reason' <> 'pg_cron_not_installed' then
    raise exception 'FAIL: unscheduled for an undocumented reason (%)', v_report;
  end if;

  -- Push dispatch must never fabricate a call: without Vault credentials it
  -- returns false rather than erroring or inventing an endpoint.
  if to_regclass('vault.decrypted_secrets') is not null
     and not exists (select 1 from pg_extension where extname = 'pg_net') then
    if app.dispatch_push_retries(10) then
      raise exception 'FAIL: push dispatch claimed success without pg_net';
    end if;
  end if;
  raise notice 'PASS: scheduled-job wiring exists and stays server-only';
end $$;

-- ===========================================================================
-- 2. A HIDDEN review must not move the PUBLIC rating aggregate (0042).
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'b1111111-1111-1111-1111-111111111111';

do $$
declare v_review public.reviews; v_count integer; v_avg numeric;
begin
  v_review := public.submit_review('e1000000-0000-0000-0000-000000000001', 5, 'Excellent work.');
  if v_review.status <> 'HIDDEN' then
    raise exception 'FAIL: first review was not hidden (status %)', v_review.status;
  end if;

  select rating_count, rating_average into v_count, v_avg
  from public.public_tasker_profiles
  where user_id = 'b2222222-2222-2222-2222-222222222222';

  if coalesce(v_count, 0) <> 0 or v_avg is not null then
    raise exception 'FAIL: hidden review leaked into the public aggregate (count %, avg %)',
      v_count, v_avg;
  end if;
  raise notice 'PASS: hidden review does not move the public rating';
end $$;

-- ===========================================================================
-- 3. The second review reveals both AND publishes the aggregate.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = 'b2222222-2222-2222-2222-222222222222';

do $$
declare v_hidden integer; v_count integer; v_avg numeric;
begin
  perform public.submit_review('e1000000-0000-0000-0000-000000000001', 4, 'Clear instructions.');

  select count(*) into v_hidden
  from public.reviews
  where booking_id = 'e1000000-0000-0000-0000-000000000001' and status = 'HIDDEN';
  if v_hidden <> 0 then raise exception 'FAIL: reviews stayed hidden after both submitted'; end if;

  select rating_count, rating_average into v_count, v_avg
  from public.public_tasker_profiles
  where user_id = 'b2222222-2222-2222-2222-222222222222';
  if v_count <> 1 or v_avg <> 5.00 then
    raise exception 'FAIL: revealed review not aggregated (count %, avg %)', v_count, v_avg;
  end if;
  raise notice 'PASS: reveal publishes exactly the revealed score';
end $$;

-- ===========================================================================
-- 4. Unauthorised review read is refused (exit-gate "unauthorised" case).
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b4444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local request.jwt.claim.sub = 'b4444444-4444-4444-4444-444444444444';

do $$
declare v_ok boolean := false;
begin
  begin
    perform public.get_review_pair('e1000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: a non-participant read the review pair'; end if;
  raise notice 'PASS: non-participant review read refused';
end $$;

-- ===========================================================================
-- 5. Expiry reveal (exit-gate "timeout" case): a ONE-SIDED review reveals when
--    the window has passed, and only then enters the aggregate.
-- ===========================================================================
reset role;

-- Second booking, one review only, submitted longer ago than the window.
insert into public.bookings
  (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
values ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
        'd1000000-0000-0000-0000-000000000003', 'b1111111-1111-1111-1111-111111111111',
        'b3333333-3333-3333-3333-333333333333', 500000, 'COMPLETED', 'm3-booking-3')
on conflict (idempotency_key) do nothing;

insert into public.reviews (booking_id, reviewer_id, reviewee_id, score, comment, status, submitted_at)
values ('e1000000-0000-0000-0000-000000000003', 'b1111111-1111-1111-1111-111111111111',
        'b3333333-3333-3333-3333-333333333333', 3, 'One-sided review.', 'HIDDEN',
        now() - make_interval(days => app.review_reveal_days() + 1));

do $$
declare v_count integer;
begin
  select rating_count into v_count from public.tasker_profiles
  where user_id = 'b3333333-3333-3333-3333-333333333333';
  if v_count <> 0 then raise exception 'FAIL: expired-but-unread review already aggregated'; end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b3333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local request.jwt.claim.sub = 'b3333333-3333-3333-3333-333333333333';

do $$
declare v_pair jsonb; v_status text; v_count integer; v_avg numeric;
begin
  v_pair := public.get_review_pair('e1000000-0000-0000-0000-000000000003');

  if (v_pair->>'both_submitted')::boolean then
    raise exception 'FAIL: both_submitted true with a single review';
  end if;
  if v_pair->'counterpart_review' is null or v_pair->'counterpart_review' = 'null'::jsonb then
    raise exception 'FAIL: one-sided review did not reveal after the window expired';
  end if;

  select status into v_status from public.reviews
  where booking_id = 'e1000000-0000-0000-0000-000000000003';
  if v_status <> 'REVEALED' then
    raise exception 'FAIL: expiry reveal did not persist (status %)', v_status;
  end if;

  select rating_count, rating_average into v_count, v_avg
  from public.public_tasker_profiles
  where user_id = 'b3333333-3333-3333-3333-333333333333';
  if v_count <> 1 or v_avg <> 3.00 then
    raise exception 'FAIL: expiry reveal did not publish the aggregate (count %, avg %)',
      v_count, v_avg;
  end if;
  raise notice 'PASS: expiry reveal publishes the review and the aggregate exactly once';
end $$;

-- ===========================================================================
-- 6. Admin moderation withdraws and restores the aggregate by recount.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b5555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local request.jwt.claim.sub = 'b5555555-5555-5555-5555-555555555555';

do $$
declare v_review uuid; v_count integer;
begin
  select id into v_review from public.reviews
  where booking_id = 'e1000000-0000-0000-0000-000000000003';

  perform public.admin_moderate_review(v_review, 'hide', 'Contains personal information.', 'm3-mod-1');
  select rating_count into v_count from public.tasker_profiles
  where user_id = 'b3333333-3333-3333-3333-333333333333';
  if v_count <> 0 then raise exception 'FAIL: hidden-by-Admin review still counted'; end if;

  -- Replay must not double-apply.
  perform public.admin_moderate_review(v_review, 'hide', 'Contains personal information.', 'm3-mod-1');
  select rating_count into v_count from public.tasker_profiles
  where user_id = 'b3333333-3333-3333-3333-333333333333';
  if v_count <> 0 then raise exception 'FAIL: replayed moderation changed the aggregate'; end if;

  perform public.admin_moderate_review(v_review, 'restore', 'Appeal upheld.', 'm3-mod-2');
  select rating_count into v_count from public.tasker_profiles
  where user_id = 'b3333333-3333-3333-3333-333333333333';
  if v_count <> 1 then raise exception 'FAIL: restored review not re-counted'; end if;
  raise notice 'PASS: moderation hide/restore recounts the aggregate idempotently';
end $$;

reset role;

-- ===========================================================================
-- 7. REVIEW_REMINDER producer (0043).
-- ===========================================================================
do $$
declare v_sent integer; v_again integer; v_rows integer;
begin
  -- booking-2 is not COMPLETED, booking-1 has both reviews, so only booking-3
  -- (one-sided) is a candidate — and its window has expired, which the sweep
  -- deliberately skips. Create a fresh, in-window, unreviewed completed booking.
  insert into public.bookings
    (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
  values ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004',
          'd1000000-0000-0000-0000-000000000004', 'b1111111-1111-1111-1111-111111111111',
          'b2222222-2222-2222-2222-222222222222', 500000, 'COMPLETED', 'm3-booking-4');
  insert into public.booking_events (booking_id, from_status, to_status, source, created_at)
  values ('e1000000-0000-0000-0000-000000000004', 'COMPLETION_REQUESTED', 'COMPLETED', 'client',
          now() - interval '30 hours');

  v_sent := public.emit_review_reminders(100);
  if v_sent < 2 then
    raise exception 'FAIL: review reminders not sent to both participants (sent %)', v_sent;
  end if;

  select count(*) into v_rows from public.notifications
  where type = 'REVIEW_REMINDER' and resource_id = 'e1000000-0000-0000-0000-000000000004';
  if v_rows <> 2 then raise exception 'FAIL: expected 2 reminders, found %', v_rows; end if;

  -- Re-running must not spam.
  v_again := public.emit_review_reminders(100);
  select count(*) into v_rows from public.notifications
  where type = 'REVIEW_REMINDER' and resource_id = 'e1000000-0000-0000-0000-000000000004';
  if v_rows <> 2 then
    raise exception 'FAIL: re-running the sweep duplicated reminders (now %, returned %)',
      v_rows, v_again;
  end if;
  raise notice 'PASS: review reminders are sent once per participant per booking';
end $$;

-- Muted category suppresses the reminder entirely.
do $$
declare v_rows integer;
begin
  insert into public.notification_preferences (user_id, category, in_app, push)
  values ('b1111111-1111-1111-1111-111111111111', 'reviews', false, false)
  on conflict (user_id, category) do update set in_app = false, push = false;

  insert into public.bookings
    (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
  values ('e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005',
          'd1000000-0000-0000-0000-000000000005', 'b1111111-1111-1111-1111-111111111111',
          'b2222222-2222-2222-2222-222222222222', 500000, 'COMPLETED', 'm3-booking-5');
  insert into public.booking_events (booking_id, from_status, to_status, source, created_at)
  values ('e1000000-0000-0000-0000-000000000005', 'COMPLETION_REQUESTED', 'COMPLETED', 'client',
          now() - interval '30 hours');

  perform public.emit_review_reminders(100);

  select count(*) into v_rows from public.notifications
  where type = 'REVIEW_REMINDER'
    and resource_id = 'e1000000-0000-0000-0000-000000000005'
    and user_id = 'b1111111-1111-1111-1111-111111111111';
  if v_rows <> 0 then raise exception 'FAIL: muted reviews category still received a reminder'; end if;

  select count(*) into v_rows from public.notifications
  where type = 'REVIEW_REMINDER'
    and resource_id = 'e1000000-0000-0000-0000-000000000005'
    and user_id = 'b2222222-2222-2222-2222-222222222222';
  if v_rows <> 1 then raise exception 'FAIL: the unmuted participant lost their reminder'; end if;
  raise notice 'PASS: reminders honour the per-category preference';
end $$;

-- ===========================================================================
-- 8. NEARBY_TASK producer (0043): publication alerts a matching Tasker only.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'b1111111-1111-1111-1111-111111111111';

do $$
begin
  perform public.publish_task('a1000000-0000-0000-0000-000000000003');
  raise notice 'PASS: task published by its verified owner';
end $$;

-- Assertions run as the owner role: `notifications` RLS is `user_id = auth.uid()`,
-- so the publishing Client cannot see the rows addressed to a Tasker — which is
-- itself the correct behaviour, and would make an in-session count meaningless.
reset role;

do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.notifications
  where type = 'NEARBY_TASK'
    and resource_id = 'a1000000-0000-0000-0000-000000000003'
    and user_id = 'b3333333-3333-3333-3333-333333333333';
  if v_rows <> 1 then raise exception 'FAIL: matching Tasker got % nearby alerts', v_rows; end if;

  select count(*) into v_rows from public.notifications
  where type = 'NEARBY_TASK'
    and resource_id = 'a1000000-0000-0000-0000-000000000003'
    and user_id = 'b1111111-1111-1111-1111-111111111111';
  if v_rows <> 0 then raise exception 'FAIL: the task owner was alerted about their own task'; end if;

  select count(*) into v_rows from public.notifications
  where type = 'NEARBY_TASK'
    and resource_id = 'a1000000-0000-0000-0000-000000000003'
    and user_id = 'b2222222-2222-2222-2222-222222222222';
  if v_rows <> 0 then
    raise exception 'FAIL: a Tasker with no matching service area was alerted';
  end if;
  raise notice 'PASS: nearby alert reaches only Taskers serving that locality';
end $$;

-- Re-opening the task (e.g. abandoned checkout recovery) must not re-alert.
do $$
declare v_rows integer;
begin
  update public.tasks set status = 'BOOKING_PENDING'
   where id = 'a1000000-0000-0000-0000-000000000003';
  update public.tasks set status = 'OPEN'
   where id = 'a1000000-0000-0000-0000-000000000003';

  select count(*) into v_rows from public.notifications
  where type = 'NEARBY_TASK'
    and resource_id = 'a1000000-0000-0000-0000-000000000003'
    and user_id = 'b3333333-3333-3333-3333-333333333333';
  if v_rows <> 1 then raise exception 'FAIL: re-opening the task re-alerted (% rows)', v_rows; end if;
  raise notice 'PASS: nearby alert is not repeated when a task returns to OPEN';
end $$;

-- ===========================================================================
-- 9. Completion timeout sweep (0044) — reminds, escalates once, moves NO money.
-- ===========================================================================
do $$
declare
  v_acted integer;
  v_status booking_status;
  v_events integer;
  v_ledger integer;
  v_audit integer;
  v_notifications integer;
begin
  select count(*) into v_ledger
  from public.ledger_entries le
  join public.ledger_transactions lt on lt.id = le.transaction_id;

  -- booking-2 has been in COMPLETION_REQUESTED for 72h: past the 48h reminder
  -- window and NOT past the 168h escalation window.
  v_acted := public.sweep_stale_completion_requests(100);
  if v_acted < 1 then raise exception 'FAIL: stale completion request produced no reminder'; end if;

  select count(*) into v_notifications from public.notifications
  where type = 'COMPLETION_REMINDER'
    and resource_id = 'e1000000-0000-0000-0000-000000000002'
    and user_id = 'b1111111-1111-1111-1111-111111111111';
  if v_notifications <> 1 then
    raise exception 'FAIL: expected exactly one Client reminder, found %', v_notifications;
  end if;

  -- Only the Client is asked to act at the reminder stage.
  select count(*) into v_notifications from public.notifications
  where type = 'COMPLETION_REMINDER'
    and resource_id = 'e1000000-0000-0000-0000-000000000002'
    and user_id = 'b2222222-2222-2222-2222-222222222222';
  if v_notifications <> 0 then
    raise exception 'FAIL: the Tasker was notified at the reminder stage';
  end if;

  -- Repeat run must not re-notify.
  perform public.sweep_stale_completion_requests(100);
  select count(*) into v_notifications from public.notifications
  where type = 'COMPLETION_REMINDER'
    and resource_id = 'e1000000-0000-0000-0000-000000000002';
  if v_notifications <> 1 then
    raise exception 'FAIL: reminder duplicated on re-run (% rows)', v_notifications;
  end if;

  -- Now push the request past the escalation window.
  update public.booking_events
     set created_at = now() - interval '200 hours'
   where booking_id = 'e1000000-0000-0000-0000-000000000002'
     and to_status = 'COMPLETION_REQUESTED';

  perform public.sweep_stale_completion_requests(100);

  select count(*) into v_events from public.booking_events
  where booking_id = 'e1000000-0000-0000-0000-000000000002'
    and idempotency_key = 'completion-timeout:e1000000-0000-0000-0000-000000000002';
  if v_events <> 1 then raise exception 'FAIL: expected one escalation event, found %', v_events; end if;

  -- Exactly-once under replay.
  perform public.sweep_stale_completion_requests(100);
  select count(*) into v_events from public.booking_events
  where booking_id = 'e1000000-0000-0000-0000-000000000002'
    and idempotency_key = 'completion-timeout:e1000000-0000-0000-0000-000000000002';
  if v_events <> 1 then raise exception 'FAIL: escalation repeated (% events)', v_events; end if;

  select count(*) into v_audit from public.audit_logs
  where action = 'booking.completion.timeout'
    and resource_id = 'e1000000-0000-0000-0000-000000000002';
  if v_audit <> 1 then raise exception 'FAIL: escalation was not audited exactly once'; end if;

  -- The invariant that matters: no status change and no money movement.
  select status into v_status from public.bookings
  where id = 'e1000000-0000-0000-0000-000000000002';
  if v_status <> 'COMPLETION_REQUESTED' then
    raise exception 'FAIL: timeout changed the booking status to % (auto-release is unapproved)',
      v_status;
  end if;

  if (select count(*) from public.ledger_entries) <> v_ledger then
    raise exception 'FAIL: the completion timeout wrote ledger entries';
  end if;
  raise notice 'PASS: completion timeout reminds, escalates exactly once, and moves no money';
end $$;

-- ===========================================================================
-- 10. Bounded push retry (0044).
-- ===========================================================================
do $$
declare
  v_id uuid;
  v_row public.notifications;
  v_due integer;
begin
  insert into public.notifications (user_id, type, title, body, resource_type, resource_id)
  values ('b1111111-1111-1111-1111-111111111111', 'BOOKING_COMPLETED', 'Synthetic', 'Synthetic body.',
          'booking', 'e1000000-0000-0000-0000-000000000001')
  returning id into v_id;

  -- First failure: one attempt, backoff scheduled, still retryable.
  v_row := public.record_push_delivery(v_id, 'FAILED', 'expo responded 503');
  if v_row.delivery_status <> 'FAILED' or v_row.delivery_attempts <> 1 then
    raise exception 'FAIL: first failure not recorded (status %, attempts %)',
      v_row.delivery_status, v_row.delivery_attempts;
  end if;
  if v_row.next_attempt_at is null then raise exception 'FAIL: no retry was scheduled'; end if;
  if v_row.next_attempt_at <= now() then
    raise exception 'FAIL: retry scheduled in the past (no backoff)';
  end if;

  -- Not due yet, so the dispatcher must not pick it up.
  select count(*) into v_due from public.due_push_retries(50) where id = v_id;
  if v_due <> 0 then raise exception 'FAIL: a backed-off notification was offered for retry'; end if;

  -- Make it due.
  update public.notifications set next_attempt_at = now() - interval '1 minute' where id = v_id;
  select count(*) into v_due from public.due_push_retries(50) where id = v_id;
  if v_due <> 1 then raise exception 'FAIL: a due retry was not offered'; end if;

  -- Exhaust the attempt ceiling: the row becomes terminal.
  v_row := public.record_push_delivery(v_id, 'FAILED', 'expo responded 503');
  v_row := public.record_push_delivery(v_id, 'FAILED', 'expo responded 503');
  if v_row.delivery_attempts < app.push_max_attempts() then
    raise exception 'FAIL: attempts did not reach the ceiling (%)', v_row.delivery_attempts;
  end if;
  if v_row.next_attempt_at is not null then
    raise exception 'FAIL: an exhausted notification is still scheduled for retry';
  end if;
  select count(*) into v_due from public.due_push_retries(50) where id = v_id;
  if v_due <> 0 then raise exception 'FAIL: an exhausted notification was offered for retry'; end if;

  -- A later success clears the failure bookkeeping.
  v_row := public.record_push_delivery(v_id, 'SENT');
  if v_row.delivery_status <> 'SENT' or v_row.delivery_error is not null
     or v_row.next_attempt_at is not null then
    raise exception 'FAIL: success did not clear the retry state';
  end if;

  -- An unsupported outcome is refused rather than silently stored.
  begin
    perform public.record_push_delivery(v_id, 'MAYBE');
    raise exception 'FAIL: an unsupported push outcome was accepted';
  exception when check_violation then
    null;
  end;
  raise notice 'PASS: push retry is counted, backed off, bounded, and clearable';
end $$;

rollback;
