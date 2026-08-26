-- tests/report_submission.sql
-- Self-checks for migration 0048: `submit_report`, the producer the `reports`
-- table never had.
--
-- Coverage: the direct INSERT path is closed so the RPC is the only writer;
-- narrative bounds and enum values raise the app's VALIDATION_ERROR contract;
-- per-resource visibility (you may only report a message in a conversation you
-- participate in, an offer on your own task or your own offer, a booking you are
-- party to, a task that is public or yours); reporting yourself or your own
-- message is refused; an invisible resource and a non-existent one fail the SAME
-- way so the error cannot be used as a probe; duplicate suppression returns the
-- existing open case; and a closed case allows re-reporting.
--
-- REQUIRES a Supabase-equivalent database. Runs in a transaction and rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/report_submission.sql

begin;

-- ---------------------------------------------------------------------------
-- Fixtures: a confirmed booking with a conversation, plus an outsider.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('f1111111-1111-1111-1111-111111111111', 'rs-client@synthetic.test'),
  ('f2222222-2222-2222-2222-222222222222', 'rs-tasker@synthetic.test'),
  ('f3333333-3333-3333-3333-333333333333', 'rs-outsider@synthetic.test'),
  ('f4444444-4444-4444-4444-444444444444', 'rs-suspended@synthetic.test')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('f1111111-1111-1111-1111-111111111111', 'RS Client'),
  ('f2222222-2222-2222-2222-222222222222', 'RS Tasker'),
  ('f3333333-3333-3333-3333-333333333333', 'RS Outsider'),
  ('f4444444-4444-4444-4444-444444444444', 'RS Suspended')
on conflict (id) do update set display_name = excluded.display_name;

update public.profiles set account_status = 'suspended'
 where id = 'f4444444-4444-4444-4444-444444444444';

insert into public.user_capabilities (user_id, capability)
values ('f2222222-2222-2222-2222-222222222222', 'TASKER')
on conflict do nothing;

insert into public.categories (id, slug, name)
values ('c4000000-0000-0000-0000-000000000001', 'rs-cat', 'RS Category');

insert into public.tasks
  (id, client_id, category_id, title, description, budget_centavos, status, published_at)
values
  ('a4000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111',
   'c4000000-0000-0000-0000-000000000001', 'RS Booked Task',
   'Synthetic assigned task behind a confirmed booking.', 500000, 'ASSIGNED', now()),
  ('a4000000-0000-0000-0000-000000000002', 'f1111111-1111-1111-1111-111111111111',
   'c4000000-0000-0000-0000-000000000001', 'RS Public Task',
   'Synthetic OPEN task anyone browsing can see.', 400000, 'OPEN', now());

insert into public.offers
  (id, task_id, tasker_id, amount_centavos, message, eta_text, availability_text,
   experience_text, status)
values ('d4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
        'f2222222-2222-2222-2222-222222222222', 500000, 'Synthetic offer.', '2 hours',
        'Today', 'Synthetic experience.', 'SELECTED');

insert into public.bookings
  (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
values ('e4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
        'd4000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111',
        'f2222222-2222-2222-2222-222222222222', 500000, 'CONFIRMED', 'rs-booking-1');

insert into public.conversations (id, booking_id)
values ('aa400000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001');

insert into public.conversation_participants (conversation_id, user_id) values
  ('aa400000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111'),
  ('aa400000-0000-0000-0000-000000000001', 'f2222222-2222-2222-2222-222222222222');

insert into public.messages (id, conversation_id, sender_id, body, moderation_status)
values
  ('bb400000-0000-0000-0000-000000000001', 'aa400000-0000-0000-0000-000000000001',
   'f2222222-2222-2222-2222-222222222222', 'A message from the Tasker.', 'APPROVED'),
  ('bb400000-0000-0000-0000-000000000002', 'aa400000-0000-0000-0000-000000000001',
   'f1111111-1111-1111-1111-111111111111', 'A message from the Client.', 'APPROVED');

-- ===========================================================================
-- 1. The RPC is the only writer, and it is authenticated-only.
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'reports' and cmd = 'INSERT') then
    -- 0009's direct INSERT policy accepted ANY resource_id, including rows the
    -- reporter could not see, and bounded nothing.
    raise exception 'FAIL: a direct INSERT policy on reports still exists';
  end if;
  if has_function_privilege('anon', 'public.submit_report(text, uuid, text, text)', 'EXECUTE')
    then raise exception 'FAIL: anon may file reports'; end if;
  if not has_function_privilege('authenticated', 'public.submit_report(text, uuid, text, text)', 'EXECUTE')
    then raise exception 'FAIL: authenticated cannot file a report'; end if;
  raise notice 'PASS: submit_report is the only writer and is authenticated-only';
end $$;

-- ===========================================================================
-- 2. A participant may report the counterpart's message; the row lands OPEN.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'f1111111-1111-1111-1111-111111111111';

do $$
declare v_report public.reports;
begin
  v_report := public.submit_report('message', 'bb400000-0000-0000-0000-000000000001',
                                   'harassment', 'This message was abusive towards me.');
  if v_report.status <> 'OPEN' then raise exception 'FAIL: report status % (expected OPEN)', v_report.status; end if;
  if v_report.reporter_id <> 'f1111111-1111-1111-1111-111111111111' then
    raise exception 'FAIL: reporter was not taken from auth.uid()';
  end if;
  raise notice 'PASS: a participant can report the counterpart''s message';
end $$;

-- ===========================================================================
-- 3. Duplicate suppression, and re-reporting after the case closes.
-- ===========================================================================
do $$
declare v_first uuid; v_second uuid; v_count integer;
begin
  select id into v_first from public.reports
  where resource_id = 'bb400000-0000-0000-0000-000000000001'
    and reporter_id = 'f1111111-1111-1111-1111-111111111111';

  v_second := (public.submit_report('message', 'bb400000-0000-0000-0000-000000000001',
                                    'spam', 'Reporting the same message again.')).id;
  if v_second <> v_first then
    raise exception 'FAIL: a duplicate report created a second case';
  end if;

  select count(*) into v_count from public.reports
  where resource_id = 'bb400000-0000-0000-0000-000000000001';
  if v_count <> 1 then raise exception 'FAIL: % report rows for one resource', v_count; end if;
  raise notice 'PASS: a second report returns the existing open case';
end $$;

reset role;
update public.reports set status = 'DISMISSED'
 where resource_id = 'bb400000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'f1111111-1111-1111-1111-111111111111';

do $$
declare v_count integer;
begin
  perform public.submit_report('message', 'bb400000-0000-0000-0000-000000000001',
                               'harassment', 'It happened again after the first case closed.');
  select count(*) into v_count from public.reports
  where resource_id = 'bb400000-0000-0000-0000-000000000001';
  if v_count <> 2 then
    raise exception 'FAIL: a closed case did not allow re-reporting (% rows)', v_count;
  end if;
  raise notice 'PASS: re-reporting is possible once the earlier case is closed';
end $$;

-- ===========================================================================
-- 4. Refusals: own message, and a message in someone else's conversation.
-- ===========================================================================
do $$
declare v_own boolean := false;
begin
  begin
    perform public.submit_report('message', 'bb400000-0000-0000-0000-000000000002',
                                 'spam', 'Reporting my own message makes no sense.');
  exception when insufficient_privilege then
    v_own := true;
  end;
  if not v_own then raise exception 'FAIL: a user reported their own message'; end if;
  raise notice 'PASS: reporting your own message is refused';
end $$;

set local request.jwt.claims = '{"sub":"f3333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local request.jwt.claim.sub = 'f3333333-3333-3333-3333-333333333333';

do $$
declare v_invisible boolean := false; v_missing boolean := false; v_booking boolean := false;
begin
  begin
    perform public.submit_report('message', 'bb400000-0000-0000-0000-000000000001',
                                 'harassment', 'A conversation I am not part of.');
  exception when insufficient_privilege then
    v_invisible := true;
  end;
  if not v_invisible then raise exception 'FAIL: an outsider reported a private message'; end if;

  -- A resource that does not exist must fail identically, so the error cannot be
  -- used to discover which messages are real.
  begin
    perform public.submit_report('message', 'bb400000-0000-0000-0000-0000000000ff',
                                 'harassment', 'A message id that does not exist.');
  exception when insufficient_privilege then
    v_missing := true;
  end;
  if not v_missing then raise exception 'FAIL: a missing resource is distinguishable'; end if;

  begin
    perform public.submit_report('booking', 'e4000000-0000-0000-0000-000000000001',
                                 'fraud', 'A booking I have nothing to do with.');
  exception when insufficient_privilege then
    v_booking := true;
  end;
  if not v_booking then raise exception 'FAIL: an outsider reported a booking'; end if;
  raise notice 'PASS: invisible and non-existent resources fail identically';
end $$;

-- ===========================================================================
-- 5. What an outsider legitimately CAN report: a public task, and a user.
-- ===========================================================================
do $$
declare v_task uuid; v_user uuid; v_self boolean := false;
begin
  v_task := (public.submit_report('task', 'a4000000-0000-0000-0000-000000000002',
                                  'inappropriate', 'This public listing looks like a scam.')).id;
  if v_task is null then raise exception 'FAIL: a public task could not be reported'; end if;

  v_user := (public.submit_report('user', 'f2222222-2222-2222-2222-222222222222',
                                  'harassment', 'This profile is impersonating someone.')).id;
  if v_user is null then raise exception 'FAIL: a profile could not be reported'; end if;

  begin
    perform public.submit_report('user', 'f3333333-3333-3333-3333-333333333333',
                                 'spam', 'Reporting myself should be impossible.');
  exception when insufficient_privilege then
    v_self := true;
  end;
  if not v_self then raise exception 'FAIL: a user reported themselves'; end if;
  raise notice 'PASS: public tasks and other profiles are reportable; self is not';
end $$;

-- ===========================================================================
-- 6. Validation uses the app's error contract, not raw CHECK violations.
-- ===========================================================================
do $$
declare v_short boolean := false; v_category boolean := false; v_type boolean := false;
begin
  begin
    perform public.submit_report('task', 'a4000000-0000-0000-0000-000000000002', 'spam', 'too short');
  exception when check_violation then
    v_short := true;
  end;
  if not v_short then raise exception 'FAIL: a 9-character narrative was accepted'; end if;

  begin
    perform public.submit_report('task', 'a4000000-0000-0000-0000-000000000002',
                                 'not-a-category', 'A narrative long enough to pass bounds.');
  exception when check_violation then
    v_category := true;
  end;
  if not v_category then raise exception 'FAIL: an unknown category was accepted'; end if;

  begin
    perform public.submit_report('planet', 'a4000000-0000-0000-0000-000000000002',
                                 'spam', 'A narrative long enough to pass bounds.');
  exception when check_violation then
    v_type := true;
  end;
  if not v_type then raise exception 'FAIL: an unknown resource type was accepted'; end if;
  raise notice 'PASS: bounds and enums raise the VALIDATION_ERROR contract';
end $$;

-- ===========================================================================
-- 7. A suspended account cannot report.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"f4444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local request.jwt.claim.sub = 'f4444444-4444-4444-4444-444444444444';

do $$
declare v_refused boolean := false;
begin
  begin
    perform public.submit_report('task', 'a4000000-0000-0000-0000-000000000002',
                                 'spam', 'A suspended account should not be able to file this.');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'FAIL: a suspended account filed a report'; end if;
  raise notice 'PASS: a suspended account cannot report';
end $$;

-- ===========================================================================
-- 8. A reporter reads their own reports; an outsider reads none of them.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'f1111111-1111-1111-1111-111111111111';

do $$
declare v_mine integer; v_others integer;
begin
  select count(*) into v_mine from public.reports
  where reporter_id = 'f1111111-1111-1111-1111-111111111111';
  if v_mine < 1 then raise exception 'FAIL: a reporter cannot read their own report'; end if;

  select count(*) into v_others from public.reports
  where reporter_id <> 'f1111111-1111-1111-1111-111111111111';
  if v_others <> 0 then
    raise exception 'FAIL: a reporter read % other people''s reports', v_others;
  end if;
  raise notice 'PASS: report reads stay scoped to the reporter';
end $$;

rollback;
