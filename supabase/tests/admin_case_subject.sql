-- tests/admin_case_subject.sql
-- Self-checks for migration 0049: the Admin console can now say what a case is
-- ABOUT, resolved from live app rows instead of eight characters of a UUID.
--
-- Coverage: only the ASSIGNED Admin may resolve a subject (an unassigned Admin,
-- another Admin, and a plain user are all refused identically); a reason and
-- idempotency key are mandatory; the read is audited exactly once per key; each
-- resource type resolves to the right live values; a deleted resource degrades to
-- an honest "no longer exists" instead of an error; contact details are never
-- included; and the reporter/pile-on counts reflect real rows.
--
-- REQUIRES a Supabase-equivalent database. Runs in a transaction and rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_case_subject.sql

begin;

-- ---------------------------------------------------------------------------
-- Fixtures: a confirmed booking with chat, two reports, and two Admins.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('c1111111-1111-1111-1111-111111111111', 'cs-client@synthetic.test'),
  ('c2222222-2222-2222-2222-222222222222', 'cs-tasker@synthetic.test'),
  ('c3333333-3333-3333-3333-333333333333', 'cs-reporter@synthetic.test'),
  ('c9999999-9999-9999-9999-999999999991', 'cs-admin-a@synthetic.test'),
  ('c9999999-9999-9999-9999-999999999992', 'cs-admin-b@synthetic.test')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, mobile, bio) values
  ('c1111111-1111-1111-1111-111111111111', 'Client Uno', '+639170000001', null),
  ('c2222222-2222-2222-2222-222222222222', 'Tasker Dos', '+639170000002', 'Handyman bio.'),
  ('c3333333-3333-3333-3333-333333333333', 'Reporter Tres', '+639170000003', null),
  ('c9999999-9999-9999-9999-999999999991', 'Admin A', null, null),
  ('c9999999-9999-9999-9999-999999999992', 'Admin B', null, null)
on conflict (id) do update set display_name = excluded.display_name;

insert into public.user_capabilities (user_id, capability) values
  ('c2222222-2222-2222-2222-222222222222', 'TASKER'),
  ('c9999999-9999-9999-9999-999999999991', 'ADMIN_SUPPORT'),
  ('c9999999-9999-9999-9999-999999999992', 'ADMIN_SUPPORT')
on conflict do nothing;

insert into public.tasker_profiles (user_id, completion_count, rating_sum, rating_count, approved_at)
values ('c2222222-2222-2222-2222-222222222222', 4, 18, 4, now())
on conflict (user_id) do update set rating_sum = excluded.rating_sum;

insert into public.categories (id, slug, name)
values ('cc500000-0000-0000-0000-000000000001', 'cs-cat', 'Cleaning');

insert into public.tasks
  (id, client_id, category_id, title, description, budget_centavos, status, published_at)
values ('a5000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111',
        'cc500000-0000-0000-0000-000000000001', 'Deep clean 2BR condo',
        'Two bedrooms, one bathroom, kitchen included.', 350000, 'ASSIGNED', now());

insert into public.offers
  (id, task_id, tasker_id, amount_centavos, message, eta_text, availability_text,
   experience_text, status)
values ('d5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001',
        'c2222222-2222-2222-2222-222222222222', 340000, 'I can start today.', '3 hours',
        'Today', 'Five years of condo cleaning.', 'SELECTED');

insert into public.bookings
  (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
values ('e5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001',
        'd5000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111',
        'c2222222-2222-2222-2222-222222222222', 340000, 'CONFIRMED', 'cs-booking-1');

insert into public.conversations (id, booking_id)
values ('ac500000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001');

insert into public.conversation_participants (conversation_id, user_id) values
  ('ac500000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111'),
  ('ac500000-0000-0000-0000-000000000001', 'c2222222-2222-2222-2222-222222222222');

insert into public.messages (id, conversation_id, sender_id, body, moderation_status)
values ('bc500000-0000-0000-0000-000000000001', 'ac500000-0000-0000-0000-000000000001',
        'c2222222-2222-2222-2222-222222222222', 'Pay me outside the app or I walk.', 'APPROVED');

-- Two different reporters on the SAME message, plus one dismissed history entry
-- for the reporter, so the triage counts have something real to count.
insert into public.reports
  (id, reporter_id, resource_type, resource_id, category, narrative, status, assignee_id)
values
  ('af500000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111',
   'message', 'bc500000-0000-0000-0000-000000000001', 'fraud',
   'The Tasker is asking me to pay outside the app.', 'OPEN',
   'c9999999-9999-9999-9999-999999999991'),
  ('af500000-0000-0000-0000-000000000002', 'c3333333-3333-3333-3333-333333333333',
   'message', 'bc500000-0000-0000-0000-000000000001', 'fraud',
   'Same message was sent to me in another booking.', 'OPEN', null),
  ('af500000-0000-0000-0000-000000000003', 'c1111111-1111-1111-1111-111111111111',
   'user', 'c2222222-2222-2222-2222-222222222222', 'spam',
   'An older complaint that support dismissed.', 'DISMISSED', null),
  ('af500000-0000-0000-0000-000000000004', 'c1111111-1111-1111-1111-111111111111',
   'task', 'a5000000-0000-0000-0000-000000000001', 'inappropriate',
   'Reporting the task itself for coverage of the task branch.', 'OPEN',
   'c9999999-9999-9999-9999-999999999991');

-- ===========================================================================
-- 1. ACLs: the resolver is internal; the entry points are authenticated-only.
-- ===========================================================================
do $$
begin
  if has_function_privilege('authenticated', 'app.case_subject_json(text, uuid)', 'EXECUTE')
    then raise exception 'FAIL: the internal resolver is callable by clients'; end if;
  if has_function_privilege('anon', 'public.admin_read_report_subject(uuid, text, text)', 'EXECUTE')
    then raise exception 'FAIL: anon may resolve a case subject'; end if;
  if not has_function_privilege('authenticated',
       'public.admin_read_report_subject(uuid, text, text)', 'EXECUTE')
    then raise exception 'FAIL: authenticated cannot resolve a case subject'; end if;
  raise notice 'PASS: resolver is internal; entry points are authenticated-only';
end $$;

-- ===========================================================================
-- 2. Refusals: a non-Admin, an unassigned Admin, and a missing reason.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';

do $$
declare v_user boolean := false;
begin
  begin
    perform public.admin_read_report_subject('af500000-0000-0000-0000-000000000001',
                                             'Curious.', 'probe-1');
  exception when insufficient_privilege then v_user := true;
  end;
  if not v_user then raise exception 'FAIL: a plain user resolved a case subject'; end if;
  raise notice 'PASS: a plain user cannot resolve a case subject';
end $$;

set local request.jwt.claims = '{"sub":"c9999999-9999-9999-9999-999999999992","role":"authenticated"}';
set local request.jwt.claim.sub = 'c9999999-9999-9999-9999-999999999992';

do $$
declare v_other boolean := false;
begin
  begin
    perform public.admin_read_report_subject('af500000-0000-0000-0000-000000000001',
                                             'Reviewing a colleague''s case.', 'probe-2');
  exception when insufficient_privilege then v_other := true;
  end;
  if not v_other then
    raise exception 'FAIL: an Admin who is not the assignee resolved the subject';
  end if;
  raise notice 'PASS: capability alone does not grant subject access (assignment does)';
end $$;

set local request.jwt.claims = '{"sub":"c9999999-9999-9999-9999-999999999991","role":"authenticated"}';
set local request.jwt.claim.sub = 'c9999999-9999-9999-9999-999999999991';

do $$
declare v_no_reason boolean := false;
begin
  begin
    perform public.admin_read_report_subject('af500000-0000-0000-0000-000000000001', '   ', 'probe-3');
  exception when others then v_no_reason := true;
  end;
  if not v_no_reason then raise exception 'FAIL: a blank reason was accepted'; end if;
  raise notice 'PASS: a reason is mandatory even for the assigned Admin';
end $$;

-- ===========================================================================
-- 3. The message subject resolves to live content, parties, and booking.
-- ===========================================================================
do $$
declare v jsonb;
begin
  v := public.admin_read_report_subject('af500000-0000-0000-0000-000000000001',
         'Triaging a fraud report.', 'subject-message-1');

  if (v->>'exists')::boolean is not true then raise exception 'FAIL: subject not resolved'; end if;
  if v->>'kind' <> 'message' then raise exception 'FAIL: kind % ', v->>'kind'; end if;
  -- The whole point: the moderator can read the reported words.
  if v->>'body' <> 'Pay me outside the app or I walk.' then
    raise exception 'FAIL: reported message body missing (got %)', v->>'body';
  end if;
  if v->>'subjectUserName' <> 'Tasker Dos' then
    raise exception 'FAIL: sender not resolved (got %)', v->>'subjectUserName';
  end if;
  if v->>'counterpartyName' <> 'Client Uno' then
    raise exception 'FAIL: counterparty not resolved (got %)', v->>'counterpartyName';
  end if;
  if v->>'bookingId' <> 'e5000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: booking not linked'; end if;
  if v->>'taskTitle' <> 'Deep clean 2BR condo' then raise exception 'FAIL: task not linked'; end if;
  if v->'extra'->>'bookingStatus' <> 'CONFIRMED' then
    raise exception 'FAIL: booking status not carried'; end if;
  raise notice 'PASS: a reported message resolves to its content, parties and booking';
end $$;

-- ===========================================================================
-- 4. No contact details leak through the subject payload.
-- ===========================================================================
do $$
declare v jsonb;
begin
  v := public.admin_read_report_subject('af500000-0000-0000-0000-000000000001',
         'Triaging a fraud report.', 'subject-message-1');
  if v::text like '%+63917%' then
    raise exception 'FAIL: a mobile number leaked into the case subject';
  end if;
  if v::text like '%synthetic.test%' then
    raise exception 'FAIL: an email address leaked into the case subject';
  end if;
  raise notice 'PASS: the subject payload carries no contact details';
end $$;

-- ===========================================================================
-- 5. Triage counts: reporter history and pile-on on the same resource.
-- ===========================================================================
do $$
declare v jsonb;
begin
  v := public.admin_read_report_subject('af500000-0000-0000-0000-000000000001',
         'Triaging a fraud report.', 'subject-message-1');

  if (v->'reporter'->>'displayName') <> 'Client Uno' then
    raise exception 'FAIL: reporter not disclosed to the assigned Admin'; end if;
  if (v->'reporter'->>'reportsFiled')::int <> 3 then
    raise exception 'FAIL: reportsFiled % (expected 3)', v->'reporter'->>'reportsFiled'; end if;
  if (v->'reporter'->>'reportsDismissed')::int <> 1 then
    raise exception 'FAIL: reportsDismissed % (expected 1)', v->'reporter'->>'reportsDismissed'; end if;
  -- Two different people reported the same message: that is the signal.
  if (v->'resourceReportSummary'->>'distinctReporters')::int <> 2 then
    raise exception 'FAIL: distinctReporters % (expected 2)',
      v->'resourceReportSummary'->>'distinctReporters'; end if;
  if (v->'resourceReportSummary'->>'openCases')::int <> 2 then
    raise exception 'FAIL: openCases % (expected 2)',
      v->'resourceReportSummary'->>'openCases'; end if;
  raise notice 'PASS: reporter history and same-resource pile-on are counted';
end $$;

-- ===========================================================================
-- 6. The task branch resolves category and offer count; aggregates only.
-- ===========================================================================
do $$
declare v jsonb;
begin
  v := public.admin_read_report_subject('af500000-0000-0000-0000-000000000004',
         'Triaging a task listing report.', 'subject-task-1');
  if v->>'kind' <> 'task' then raise exception 'FAIL: kind %', v->>'kind'; end if;
  if v->>'label' <> 'Task "Deep clean 2BR condo" (ASSIGNED)' then
    raise exception 'FAIL: task label % ', v->>'label'; end if;
  if v->>'subjectUserName' <> 'Client Uno' then raise exception 'FAIL: owner not resolved'; end if;
  if (v->>'amountCentavos')::bigint <> 350000 then raise exception 'FAIL: budget not carried'; end if;
  if v->'extra'->>'categoryName' <> 'Cleaning' then raise exception 'FAIL: category not resolved'; end if;
  if (v->'extra'->>'offerCount')::int <> 1 then raise exception 'FAIL: offer count wrong'; end if;
  if v->>'bookingId' <> 'e5000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: the task''s booking was not linked'; end if;
  raise notice 'PASS: a reported task resolves owner, category, budget and offers';
end $$;

-- ===========================================================================
-- 7. Auditing: once per idempotency key, regardless of how often the page loads.
-- ===========================================================================
-- Counted with RLS off: this asserts what was PERSISTED, not what an Admin can
-- read back (audit_logs reads are governed separately).
reset role;

do $$
declare v_count integer;
begin
  -- Steps 3-5 called the same key three times.
  select count(*) into v_count from public.audit_logs
  where action = 'admin.read.report_subject'
    and resource_id = 'af500000-0000-0000-0000-000000000001'
    and safe_metadata->>'idempotency_key' = 'subject-message-1';
  if v_count <> 1 then
    raise exception 'FAIL: % audit rows for one idempotency key (expected 1)', v_count;
  end if;

  select count(*) into v_count from public.audit_logs
  where action = 'admin.read.report_subject'
    and actor_id = 'c9999999-9999-9999-9999-999999999991';
  if v_count <> 2 then
    raise exception 'FAIL: % audited subject reads (expected 2 distinct keys)', v_count;
  end if;
  raise notice 'PASS: subject reads are audited exactly once per idempotency key';
end $$;

-- ===========================================================================
-- 8. A resource deleted after the report degrades honestly.
-- ===========================================================================
delete from public.messages where id = 'bc500000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c9999999-9999-9999-9999-999999999991","role":"authenticated"}';
set local request.jwt.claim.sub = 'c9999999-9999-9999-9999-999999999991';

do $$
declare v jsonb;
begin
  v := public.admin_read_report_subject('af500000-0000-0000-0000-000000000001',
         'Re-checking after deletion.', 'subject-message-2');
  if (v->>'exists')::boolean is not false then
    raise exception 'FAIL: a deleted resource still reports exists=true';
  end if;
  if v->>'label' <> 'This message no longer exists' then
    raise exception 'FAIL: unhelpful label for a deleted resource (%)', v->>'label';
  end if;
  -- The case must still be actionable: the narrative and the reporter block survive.
  if (v->'reporter'->>'displayName') <> 'Client Uno' then
    raise exception 'FAIL: the case lost its reporter when the resource vanished';
  end if;
  raise notice 'PASS: a deleted resource degrades to an honest label, case still actionable';
end $$;


-- ===========================================================================
-- 9. Deciding a report tells the reporter — once, on terminal outcomes only.
-- ===========================================================================
-- Transitions run as the assigned Admin; the assertions run with RLS off,
-- because a notification belongs to the REPORTER and an Admin cannot read it
-- (which is itself the correct behaviour).

-- OPEN -> DISMISSED on af500000-...-004, a task report assigned to Admin A.
do $$
begin
  perform public.admin_transition_report('af500000-0000-0000-0000-000000000004', 'DISMISSED',
            'Listing reviewed; no policy breach found.', 'decide-task-report-1');
end $$;

reset role;

do $$
declare v_count integer; v_body text;
begin
  select count(*) into v_count from public.notifications
  where user_id = 'c1111111-1111-1111-1111-111111111111'
    and type = 'REPORT_RESOLVED'
    and resource_id = 'af500000-0000-0000-0000-000000000004';
  if v_count <> 1 then
    raise exception 'FAIL: % REPORT_RESOLVED notifications (expected 1)', v_count;
  end if;

  select body into v_body from public.notifications
  where resource_id = 'af500000-0000-0000-0000-000000000004' and type = 'REPORT_RESOLVED';
  if v_body not like '%did not find a policy breach%' then
    raise exception 'FAIL: dismissal copy is wrong (%)', v_body;
  end if;
  -- The Admin's private reason must never be forwarded, and no party is named.
  if v_body like '%Listing reviewed%' then
    raise exception 'FAIL: the Admin reason leaked to the reporter';
  end if;
  if v_body like '%Client Uno%' or v_body like '%Tasker Dos%' then
    raise exception 'FAIL: the notification names a party';
  end if;
  raise notice 'PASS: a decided report notifies the reporter, without Admin detail';
end $$;

-- Replaying the same decision must not notify again.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c9999999-9999-9999-9999-999999999991","role":"authenticated"}';
set local request.jwt.claim.sub = 'c9999999-9999-9999-9999-999999999991';

do $$
begin
  perform public.admin_transition_report('af500000-0000-0000-0000-000000000004', 'DISMISSED',
            'Listing reviewed; no policy breach found.', 'decide-task-report-1');
end $$;

reset role;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.notifications
  where resource_id = 'af500000-0000-0000-0000-000000000004' and type = 'REPORT_RESOLVED';
  if v_count <> 1 then raise exception 'FAIL: a replayed decision notified twice'; end if;
  raise notice 'PASS: replaying a decision does not notify again';
end $$;

-- TRIAGED is an internal queue step, not an outcome: it must stay silent.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c9999999-9999-9999-9999-999999999991","role":"authenticated"}';
set local request.jwt.claim.sub = 'c9999999-9999-9999-9999-999999999991';

do $$
begin
  perform public.admin_transition_report('af500000-0000-0000-0000-000000000001', 'TRIAGED',
            'Escalating to trust & safety.', 'triage-message-report-1');
end $$;

reset role;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.notifications
  where resource_id = 'af500000-0000-0000-0000-000000000001' and type = 'REPORT_RESOLVED';
  if v_count <> 0 then raise exception 'FAIL: an internal triage step notified the reporter'; end if;
  raise notice 'PASS: an internal triage step stays silent';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c9999999-9999-9999-9999-999999999991","role":"authenticated"}';
set local request.jwt.claim.sub = 'c9999999-9999-9999-9999-999999999991';

do $$
begin
  perform public.admin_transition_report('af500000-0000-0000-0000-000000000001', 'ACTIONED',
            'Content actioned under the off-platform payment rule.', 'action-message-report-1');
end $$;

reset role;

do $$
declare v_count integer; v_title text;
begin
  select count(*) into v_count from public.notifications
  where resource_id = 'af500000-0000-0000-0000-000000000001' and type = 'REPORT_RESOLVED';
  if v_count <> 1 then
    raise exception 'FAIL: % notifications after ACTIONED (expected 1)', v_count;
  end if;
  select title into v_title from public.notifications
  where resource_id = 'af500000-0000-0000-0000-000000000001' and type = 'REPORT_RESOLVED';
  if v_title <> 'We acted on your report' then
    raise exception 'FAIL: actioned copy is wrong (%)', v_title;
  end if;
  raise notice 'PASS: an actioned report gets its own copy';
end $$;

-- A reporter who muted system notifications is honoured, like every other type.
insert into public.notification_preferences (user_id, category, in_app, push)
values ('c3333333-3333-3333-3333-333333333333', 'system', false, false)
on conflict (user_id, category) do update set in_app = false;

update public.reports set assignee_id = 'c9999999-9999-9999-9999-999999999991'
 where id = 'af500000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c9999999-9999-9999-9999-999999999991","role":"authenticated"}';
set local request.jwt.claim.sub = 'c9999999-9999-9999-9999-999999999991';

do $$
begin
  perform public.admin_transition_report('af500000-0000-0000-0000-000000000002', 'DISMISSED',
            'Duplicate of an already decided case.', 'decide-dup-report-1');
end $$;

reset role;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.notifications
  where user_id = 'c3333333-3333-3333-3333-333333333333' and type = 'REPORT_RESOLVED';
  if v_count <> 0 then
    raise exception 'FAIL: a muted category still produced a notification';
  end if;
  raise notice 'PASS: the reporter''s notification preference is honoured';
end $$;

rollback;
