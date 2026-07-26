-- tests/security_hardening.sql
-- Assignment-scoped authorization, audited Admin read/assignment/transition
-- RPCs, storage-authorization, and finance-safety self checks for migration
-- 0013. Each block raises on failure and notices on pass.
--
-- Coverage: cross-user zero rows; unassigned/other/super Admin zero sensitive
-- rows/files; strict support-vs-finance dispute capability split (including a
-- stale support assignment); assigned-Admin sensitive base SELECT is now ZERO
-- (reads are RPC-only); finance and explicitly assigned super dispute access;
-- audited read/storage RPCs persist the exact reason and append exactly one row
-- per key on replay while acquiring their advisory transaction locks;
-- self-assignment success + idempotency; wrong-capability/reassignment denial;
-- status transition allowed/invalid/idempotent + assignee-only; storage
-- authorization malformed/wrong/assigned; explicit function execute ACLs; plus
-- the pre-existing finance/webhook/refund checks.
--
-- REQUIRES a Supabase-local (or Supabase-equivalent) database: it relies on the
-- Supabase `auth.uid()` function and the `authenticated`/`service_role` roles,
-- and it inserts synthetic rows into `auth.users`. It is NOT runnable against a
-- bare PostgreSQL without the Supabase auth schema. Run inside a transaction and
-- roll back; it mutates nothing permanently.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_hardening.sql
--
-- All IDs, paths, and content below are synthetic — no real users/PII/tokens.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (created as the migration/superuser role, bypassing RLS).
-- ---------------------------------------------------------------------------

-- Synthetic auth users (minimal). Adjust columns if your local auth.users
-- schema requires more NOT NULL fields.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'client@synthetic.test'),
  ('22222222-2222-2222-2222-222222222222', 'tasker@synthetic.test'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@synthetic.test'),
  ('44444444-4444-4444-4444-444444444444', 'support-unassigned@synthetic.test'),
  ('55555555-5555-5555-5555-555555555555', 'finance-unassigned@synthetic.test'),
  ('66666666-6666-6666-6666-666666666666', 'support-other@synthetic.test'),
  ('77777777-7777-7777-7777-777777777777', 'super-unassigned@synthetic.test'),
  ('88888888-8888-8888-8888-888888888888', 'support-assigned@synthetic.test'),
  ('99999999-9999-9999-9999-999999999999', 'finance-assigned@synthetic.test'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'verif-assigned@synthetic.test')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'Client One'),
  ('22222222-2222-2222-2222-222222222222', 'Tasker Two'),
  ('33333333-3333-3333-3333-333333333333', 'Stranger Three'),
  ('44444444-4444-4444-4444-444444444444', 'Support Unassigned'),
  ('55555555-5555-5555-5555-555555555555', 'Finance Unassigned'),
  ('66666666-6666-6666-6666-666666666666', 'Support Other'),
  ('77777777-7777-7777-7777-777777777777', 'Super Unassigned'),
  ('88888888-8888-8888-8888-888888888888', 'Support Assigned'),
  ('99999999-9999-9999-9999-999999999999', 'Finance Assigned'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Verification Assigned');

insert into public.user_capabilities (user_id, capability) values
  ('44444444-4444-4444-4444-444444444444', 'ADMIN_SUPPORT'),
  ('55555555-5555-5555-5555-555555555555', 'ADMIN_FINANCE'),
  ('66666666-6666-6666-6666-666666666666', 'ADMIN_SUPPORT'),
  ('77777777-7777-7777-7777-777777777777', 'ADMIN_SUPER'),
  ('88888888-8888-8888-8888-888888888888', 'ADMIN_SUPPORT'),
  ('99999999-9999-9999-9999-999999999999', 'ADMIN_FINANCE'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ADMIN_SUPPORT');

insert into public.categories (id, slug, name)
values ('c0000000-0000-0000-0000-000000000001', 'test-cat', 'Test Category');

-- task1: confirmed booking (chat/exact-location open to participants)
-- task2: payment-pending (prepayment gate)
-- task3: webhook idempotency
-- task4: completed (refund fail-closed)
insert into public.tasks (id, client_id, category_id, title, description, budget_centavos, status)
values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'Task One Confirmed', 'Synthetic task description for tests.', 500000, 'ASSIGNED'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'Task Two Pending', 'Synthetic task description for tests.', 500000, 'BOOKING_PENDING'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'Task Three Webhook', 'Synthetic task description for tests.', 500000, 'BOOKING_PENDING'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'Task Four Completed', 'Synthetic task description for tests.', 500000, 'COMPLETED');

insert into public.task_public_locations (task_id, city_code, barangay_code, approximate_point)
values ('a0000000-0000-0000-0000-000000000001', 'CITY', 'BRGY',
        st_setsrid(st_makepoint(121.0, 14.6), 4326)::geography);

insert into public.task_private_locations (task_id, exact_address, exact_point)
values
  ('a0000000-0000-0000-0000-000000000001', '123 Synthetic St', st_setsrid(st_makepoint(121.0, 14.6), 4326)::geography),
  ('a0000000-0000-0000-0000-000000000002', '456 Synthetic Ave', st_setsrid(st_makepoint(121.0, 14.6), 4326)::geography);

insert into public.offers (id, task_id, tasker_id, amount_centavos, message, eta_text, availability_text, experience_text, status)
values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', 500000, 'offer', 'eta', 'avail', 'exp', 'SELECTED'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 500000, 'offer', 'eta', 'avail', 'exp', 'SELECTED'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003',
   '22222222-2222-2222-2222-222222222222', 500000, 'offer', 'eta', 'avail', 'exp', 'SELECTED'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004',
   '22222222-2222-2222-2222-222222222222', 500000, 'offer', 'eta', 'avail', 'exp', 'SELECTED');

insert into public.bookings (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 500000, 'CONFIRMED', 'idem-bk1'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 500000, 'PAYMENT_PENDING', 'idem-bk2'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 500000, 'PAYMENT_PENDING', 'idem-bk3'),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 500000, 'COMPLETED', 'idem-bk4');

-- Conversation for the confirmed booking, with both participants and a message.
insert into public.conversations (id, booking_id)
values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');

insert into public.conversation_participants (conversation_id, user_id) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('e0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

insert into public.messages (id, conversation_id, sender_id, body)
values ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'synthetic chat body');

insert into public.message_media (id, message_id, storage_path, kind, mime_type, size_bytes)
values ('f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg',
        'image', 'image/jpeg', 1024);

-- Verification case for the client, assigned to the verification Admin.
insert into public.verification_cases (id, user_id, status, assigned_admin_id)
values ('c2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'SUBMITTED', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.verification_documents (id, case_id, kind, storage_path, mime_type, size_bytes)
values ('c2000000-0000-0000-0000-0000000000d1', 'c2000000-0000-0000-0000-000000000001',
        'government_id_front',
        '11111111-1111-1111-1111-111111111111/c2000000-0000-0000-0000-000000000001/front.jpg',
        'image/jpeg', 2048);

-- Report on the specific message -> its assignee may access that conversation.
insert into public.reports (id, reporter_id, resource_type, resource_id, category, narrative, status, assignee_id)
values ('c3000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
        'message', 'f0000000-0000-0000-0000-000000000001', 'harassment',
        'synthetic report narrative long enough', 'TRIAGED', '88888888-8888-8888-8888-888888888888');

-- Disputes on the confirmed booking: finance is valid, support is a stale
-- manually-created assignment that must grant nothing, and the final row is
-- unassigned until ADMIN_SUPER explicitly self-assigns it in the test flow.
insert into public.disputes (id, booking_id, opened_by, status, reason, assignee_id)
values
  ('c4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'UNDER_REVIEW', 'synthetic finance dispute',
   '99999999-9999-9999-9999-999999999999'),
  ('c4000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'OPEN', 'synthetic stale support dispute',
   '66666666-6666-6666-6666-666666666666'),
  ('c4000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'OPEN', 'synthetic super assignment dispute',
   null);

-- Evidence attached to each dispute (owned by the client).
insert into public.evidence (id, owner_id, resource_type, resource_id, storage_path)
values
  ('c5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'dispute', 'c4000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111/c4000000-0000-0000-0000-000000000001/evidence.pdf'),
  ('c5000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'dispute', 'c4000000-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111/c4000000-0000-0000-0000-000000000003/stale-support.pdf'),
  ('c5000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'dispute', 'c4000000-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111/c4000000-0000-0000-0000-000000000004/super-review.pdf');

-- Payment intents for finance tests.
insert into public.payment_intents (id, booking_id, provider, provider_reference, amount_centavos, status, idempotency_key)
values
  ('c1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'synthetic', 'pref1', 500000, 'CONFIRMED', 'pi-1'),
  ('c1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'synthetic', 'pref3', 500000, 'CREATED',   'pi-3'),
  ('c1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'synthetic', 'pref4', 500000, 'CONFIRMED', 'pi-4');

-- Unassigned cases used by the self-assignment / status-transition RPC tests.
insert into public.reports (id, reporter_id, resource_type, resource_id, category, narrative, status)
values ('c3000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333',
        'task', 'a0000000-0000-0000-0000-000000000002', 'spam',
        'synthetic unassigned report narrative for assignment tests', 'OPEN');

insert into public.support_tickets (id, user_id, subject, narrative, category, status)
values ('c6000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'Synthetic ticket subject', 'synthetic unassigned ticket narrative for assignment tests',
        'account', 'OPEN');

insert into public.disputes (id, booking_id, opened_by, status, reason)
values ('c4000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004',
        '11111111-1111-1111-1111-111111111111', 'OPEN', 'synthetic unassigned dispute');

insert into public.verification_cases (id, user_id, status)
values ('c2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'SUBMITTED');

-- Storage objects bound to message-media, verification-document, and evidence rows.
insert into storage.objects (bucket_id, name) values
  ('chat-media',   '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg'),
  ('id-documents', '11111111-1111-1111-1111-111111111111/c2000000-0000-0000-0000-000000000001/front.jpg'),
  ('evidence',     '11111111-1111-1111-1111-111111111111/c4000000-0000-0000-0000-000000000003/stale-support.pdf'),
  ('evidence',     '11111111-1111-1111-1111-111111111111/c4000000-0000-0000-0000-000000000004/super-review.pdf'),
  -- A malformed/guessed path bound to no row.
  ('chat-media',   'not-a-uuid/also-not-a-uuid/guessed.jpg')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Function execute boundaries (owner can inspect catalog ACLs directly).
-- `anon = false` also proves PostgreSQL PUBLIC has no inherited EXECUTE grant.
-- ---------------------------------------------------------------------------
do $$
declare
  v_proc regprocedure;
begin
  foreach v_proc in array array[
    'public.admin_assign_report(uuid,text,text)'::regprocedure,
    'public.admin_assign_dispute(uuid,text,text)'::regprocedure,
    'public.admin_assign_ticket(uuid,text,text)'::regprocedure,
    'public.admin_assign_verification(uuid,text,text)'::regprocedure,
    'public.admin_transition_report(uuid,public.report_status,text,text)'::regprocedure,
    'public.admin_transition_dispute(uuid,public.dispute_status,text,text)'::regprocedure,
    'public.admin_transition_ticket(uuid,public.ticket_status,text,text)'::regprocedure,
    'public.admin_read_report_case(uuid,text,text)'::regprocedure,
    'public.admin_read_dispute_case(uuid,text,text)'::regprocedure,
    'public.admin_read_ticket_case(uuid,text,text)'::regprocedure,
    'public.admin_read_ticket_messages(uuid,text,text)'::regprocedure,
    'public.admin_read_conversation_messages(uuid,text,text)'::regprocedure,
    'public.admin_read_conversation_media(uuid,text,text)'::regprocedure,
    'public.admin_read_verification_case(uuid,text,text)'::regprocedure,
    'public.admin_read_evidence(text,uuid,text,text)'::regprocedure,
    'public.admin_read_task_location(uuid,text,text)'::regprocedure,
    'public.admin_authorize_object_read(text,text,text,text)'::regprocedure
  ] loop
    if not has_function_privilege('authenticated', v_proc::oid, 'EXECUTE') then
      raise exception 'FAIL: authenticated lacks intended EXECUTE on %', v_proc;
    end if;
    if has_function_privilege('anon', v_proc::oid, 'EXECUTE') then
      raise exception 'FAIL: anon/PUBLIC retained EXECUTE on %', v_proc;
    end if;
  end loop;

  if has_function_privilege(
       'authenticated',
       'app.audit_read_once(text,text,uuid,public.user_capability,text,text)',
       'EXECUTE')
     or has_function_privilege(
       'anon',
       'app.audit_read_once(text,text,uuid,public.user_capability,text,text)',
       'EXECUTE') then
    raise exception 'FAIL: internal audit_read_once is directly executable';
  end if;

  if has_function_privilege(
       'authenticated', 'app.admin_assigned_dispute(uuid)', 'EXECUTE') then
    raise exception 'FAIL: internal dispute-assignment helper is directly executable';
  end if;
  if not has_function_privilege(
       'authenticated', 'app.admin_assigned_task(uuid)', 'EXECUTE') then
    raise exception 'FAIL: task RLS predicate lost authenticated EXECUTE';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.process_refund_event(text,text,text,text,bigint,boolean,text)',
       'EXECUTE')
     or has_function_privilege(
       'anon',
       'public.process_refund_event(text,text,text,text,bigint,boolean,text)',
       'EXECUTE')
     or not has_function_privilege(
       'service_role',
       'public.process_refund_event(text,text,text,text,bigint,boolean,text)',
       'EXECUTE') then
    raise exception 'FAIL: refund provider finalizer ACL is not service-role-only';
  end if;

  if has_function_privilege(
       'authenticated', 'public.process_payout_result(uuid,text,text,text)', 'EXECUTE')
     or has_function_privilege(
       'anon', 'public.process_payout_result(uuid,text,text,text)', 'EXECUTE')
     or not has_function_privilege(
       'service_role', 'public.process_payout_result(uuid,text,text,text)', 'EXECUTE') then
    raise exception 'FAIL: payout provider finalizer ACL is not service-role-only';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.admin_authorize_object_read(text,text,text,text)',
       'EXECUTE') then
    raise exception 'FAIL: signing adapter lost storage-authorizer EXECUTE';
  end if;

  raise notice 'PASS: explicit function execute boundaries';
end $$;

-- ---------------------------------------------------------------------------
-- Impersonation: switch to the `authenticated` role; each block sets the JWT
-- subject to the acting user. Setup above ran as the superuser/owner role.
-- ---------------------------------------------------------------------------
set local role authenticated;

-- Helper macro pattern per block:
--   set local request.jwt.claims / request.jwt.claim.sub, then assert counts.

-- 1. safe_uuid never throws and rejects malformed input.
do $$
begin
  if app.safe_uuid('not-a-uuid') is not null then raise exception 'FAIL: safe_uuid accepted garbage'; end if;
  if app.safe_uuid('11111111-1111-1111-1111-111111111111') is null then raise exception 'FAIL: safe_uuid rejected a valid uuid'; end if;
  raise notice 'PASS: safe_uuid parses safely';
end $$;

-- 2. Ordinary cross-user: stranger sees zero private location / messages / offers.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  if (select count(*) from public.task_private_locations where task_id = 'a0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: stranger read exact location'; end if;
  if (select count(*) from public.messages where conversation_id = 'e0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: stranger read chat messages'; end if;
  if (select count(*) from public.offers where task_id = 'a0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: stranger read offers'; end if;
  if (select count(*) from public.message_media where message_id = 'f0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: stranger read chat media metadata'; end if;
  raise notice 'PASS: ordinary cross-user zero rows';
end $$;

-- 3. Prepayment gate: the Tasker on a PAYMENT_PENDING booking sees zero exact
--    location and no conversation exists.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if (select count(*) from public.task_private_locations where task_id = 'a0000000-0000-0000-0000-000000000002') <> 0
    then raise exception 'FAIL: tasker saw exact location before payment confirmation'; end if;
  -- On the CONFIRMED booking the tasker IS a participant and may read.
  if (select count(*) from public.messages where conversation_id = 'e0000000-0000-0000-0000-000000000001') <> 1
    then raise exception 'FAIL: confirmed-booking participant could not read chat'; end if;
  if (select count(*) from public.task_private_locations where task_id = 'a0000000-0000-0000-0000-000000000001') <> 1
    then raise exception 'FAIL: confirmed-booking participant could not read exact location'; end if;
  raise notice 'PASS: prepayment chat/address gate + post-payment participant access';
end $$;

-- 4. Generic/unassigned ADMIN_SUPPORT sees zero sensitive rows/files.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
begin
  if (select count(*) from public.messages where conversation_id = 'e0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: unassigned support Admin read chat'; end if;
  if (select count(*) from public.verification_documents where case_id = 'c2000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: unassigned support Admin read ID documents'; end if;
  if (select count(*) from public.reports where id = 'c3000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: unassigned support Admin read report narrative'; end if;
  if (select count(*) from public.evidence where id = 'c5000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: unassigned support Admin read evidence'; end if;
  if (select count(*) from storage.objects
      where bucket_id = 'chat-media'
        and name = '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg') <> 0
    then raise exception 'FAIL: unassigned support Admin read chat-media object'; end if;
  -- Queue METADATA remains capability-visible even when unassigned.
  if (select count(*) from public.admin_report_queue where id = 'c3000000-0000-0000-0000-000000000001') <> 1
    then raise exception 'FAIL: support Admin cannot see report queue metadata'; end if;
  raise notice 'PASS: unassigned ADMIN_SUPPORT zero narrative/files, queue metadata visible';
end $$;

-- 5. Generic/unassigned ADMIN_FINANCE sees zero sensitive narrative rows/files
--    but retains raw finance visibility (ledger/provider) by capability.
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
do $$
begin
  if (select count(*) from public.messages where conversation_id = 'e0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: unassigned finance Admin read chat'; end if;
  if (select count(*) from public.verification_documents where case_id = 'c2000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: finance Admin read ID documents'; end if;
  if (select count(*) from public.payment_intents where id = 'c1000000-0000-0000-0000-000000000001') <> 1
    then raise exception 'FAIL: finance Admin lost payment-intent visibility'; end if;
  raise notice 'PASS: unassigned ADMIN_FINANCE zero narrative/ID, retains finance metadata';
end $$;

-- 6. Generic/unassigned ADMIN_SUPER is NOT an implicit purpose assignment.
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
do $$
begin
  if (select count(*) from public.messages where conversation_id = 'e0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: unassigned super Admin read chat'; end if;
  if (select count(*) from public.verification_documents where case_id = 'c2000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: unassigned super Admin read ID documents'; end if;
  if (select count(*) from public.evidence where id = 'c5000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: unassigned super Admin read evidence'; end if;
  raise notice 'PASS: unassigned ADMIN_SUPER has no implicit sensitive access';
end $$;

-- 7. Assigned support Admin (report on the message): RLS now gives ZERO direct
--    base/storage rows; the audited SECURITY DEFINER RPCs are the only read
--    path and return the assigned data.
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
set local request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
do $$
begin
  -- Direct base/storage SELECT is zero even for the correctly-assigned Admin.
  if (select count(*) from public.messages where conversation_id = 'e0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: assigned Admin read chat via direct base SELECT'; end if;
  if (select count(*) from public.conversations where id = 'e0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: assigned Admin read conversation via direct base SELECT'; end if;
  if (select count(*) from public.reports where id = 'c3000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: assigned Admin read report via direct base SELECT'; end if;
  if (select count(*) from storage.objects
      where bucket_id = 'chat-media'
        and name = '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg') <> 0
    then raise exception 'FAIL: assigned Admin read chat-media object directly'; end if;
  -- Audited RPCs return the assigned data.
  if (select count(*) from public.admin_read_report_case(
        'c3000000-0000-0000-0000-000000000001', 'investigating harassment report', 'r7-rep-1')) <> 1
    then raise exception 'FAIL: assigned Admin could not read report via audited RPC'; end if;
  if (select count(*) from public.admin_read_conversation_messages(
        'e0000000-0000-0000-0000-000000000001', 'reviewing reported message', 'r7-conv-1')) <> 1
    then raise exception 'FAIL: assigned Admin could not read chat via audited RPC'; end if;
  -- Storage authorization succeeds for the bound chat-media object.
  if public.admin_authorize_object_read('chat-media',
        '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg',
        'reviewing reported media', 'r7-obj-1') is not true
    then raise exception 'FAIL: assigned Admin storage authorization denied'; end if;
  -- Wrong purpose: not assigned the verification case -> the read RPC denies.
  begin
    perform public.admin_read_verification_case(
      'c2000000-0000-0000-0000-000000000001', 'no verification assignment here', 'r7-ver-1');
    raise exception 'FAIL: support Admin read ID docs without verification assignment';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: assigned support Admin RPC-only audited access + wrong-purpose denial';
end $$;

-- 8. Assigned finance Admin (dispute on booking): direct base = ZERO; audited
--    RPCs return the dispute, the booking chat, and the dispute evidence.
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
begin
  if (select count(*) from public.admin_dispute_queue
      where id = 'c4000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: finance Admin could not see dispute queue metadata';
  end if;
  if (select count(*) from public.disputes where id = 'c4000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: assigned finance Admin read dispute via direct base SELECT'; end if;
  if (select count(*) from public.messages where conversation_id = 'e0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: dispute-assigned Admin read chat via direct base SELECT'; end if;
  if (select count(*) from public.evidence where id = 'c5000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: dispute-assigned Admin read evidence via direct base SELECT'; end if;
  if (select count(*) from public.admin_read_dispute_case(
        'c4000000-0000-0000-0000-000000000001', 'resolving payment dispute', 'r8-d-1')) <> 1
    then raise exception 'FAIL: assigned finance Admin could not read dispute via audited RPC'; end if;
  if (select count(*) from public.admin_read_conversation_messages(
        'e0000000-0000-0000-0000-000000000001', 'reviewing dispute booking chat', 'r8-c-1')) <> 1
    then raise exception 'FAIL: dispute-assigned Admin could not read chat via audited RPC'; end if;
  if (select count(*) from public.admin_read_evidence(
        'dispute', 'c4000000-0000-0000-0000-000000000001', 'reviewing dispute evidence', 'r8-e-1')) <> 1
    then raise exception 'FAIL: dispute-assigned Admin could not read evidence via audited RPC'; end if;
  raise notice 'PASS: assigned finance Admin RPC-only dispute + linked chat/evidence access';
end $$;

-- 8b. ADMIN_SUPER gains dispute authority only after explicit assignment.
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
do $$
declare v_dispute public.disputes;
begin
  v_dispute := public.admin_assign_dispute(
    'c4000000-0000-0000-0000-000000000004',
    'super explicitly takes the dispute', 'super-dispute-assign-1');
  if v_dispute.assignee_id <> '77777777-7777-7777-7777-777777777777' then
    raise exception 'FAIL: super Admin explicit dispute assignment failed';
  end if;
  if (select count(*) from public.admin_dispute_queue
      where id = 'c4000000-0000-0000-0000-000000000004') <> 1 then
    raise exception 'FAIL: super Admin could not see dispute queue metadata';
  end if;

  v_dispute := public.admin_transition_dispute(
    'c4000000-0000-0000-0000-000000000004', 'UNDER_REVIEW',
    'super begins assigned dispute review', 'super-dispute-transition-1');
  if v_dispute.status <> 'UNDER_REVIEW' then
    raise exception 'FAIL: assigned super Admin could not transition dispute';
  end if;

  if (select count(*) from public.admin_read_dispute_case(
        'c4000000-0000-0000-0000-000000000004',
        'super reviews assigned dispute', 'super-dispute-read-1')) <> 1 then
    raise exception 'FAIL: assigned super Admin could not read dispute';
  end if;
  if (select count(*) from public.admin_read_conversation_messages(
        'e0000000-0000-0000-0000-000000000001',
        'super reviews assigned dispute chat', 'super-dispute-chat-1')) <> 1 then
    raise exception 'FAIL: assigned super Admin could not read linked chat';
  end if;
  if (select count(*) from public.admin_read_evidence(
        'dispute', 'c4000000-0000-0000-0000-000000000004',
        'super reviews assigned dispute evidence', 'super-dispute-evidence-1')) <> 1 then
    raise exception 'FAIL: assigned super Admin could not read linked evidence';
  end if;
  if public.admin_authorize_object_read(
       'evidence',
       '11111111-1111-1111-1111-111111111111/c4000000-0000-0000-0000-000000000004/super-review.pdf',
       'super reviews assigned evidence file', 'super-dispute-object-1') is not true then
    raise exception 'FAIL: assigned super Admin could not authorize evidence storage';
  end if;

  raise notice 'PASS: explicitly assigned super dispute behavior';
end $$;

-- 9. Assigned verification Admin: direct base/object = ZERO; the audited RPC
--    returns the ID-document metadata and the storage authorization succeeds;
--    no implicit chat access (not assigned to any report/dispute).
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$
begin
  if (select count(*) from public.verification_documents where case_id = 'c2000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: assigned verification Admin read ID documents via direct base SELECT'; end if;
  if (select count(*) from storage.objects
      where bucket_id = 'id-documents'
        and name = '11111111-1111-1111-1111-111111111111/c2000000-0000-0000-0000-000000000001/front.jpg') <> 0
    then raise exception 'FAIL: assigned verification Admin read ID object directly'; end if;
  if (select count(*) from public.admin_read_verification_case(
        'c2000000-0000-0000-0000-000000000001', 'verifying identity documents', 'r9-v-1')) <> 1
    then raise exception 'FAIL: assigned verification Admin could not read ID docs via audited RPC'; end if;
  if public.admin_authorize_object_read('id-documents',
        '11111111-1111-1111-1111-111111111111/c2000000-0000-0000-0000-000000000001/front.jpg',
        'verifying identity documents', 'r9-obj-1') is not true
    then raise exception 'FAIL: assigned verification Admin ID-object authorization denied'; end if;
  -- No implicit access to chat (not assigned to any report/dispute).
  begin
    perform public.admin_read_conversation_messages(
      'e0000000-0000-0000-0000-000000000001', 'no chat assignment here', 'r9-c-1');
    raise exception 'FAIL: verification Admin read chat without assignment';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: assigned verification Admin scoped to ID docs only';
end $$;

-- 10. Other-assignee denial: a different support Admin is not the report
--     assignee, so both direct base SELECT and the audited RPC return nothing.
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$
begin
  if (select count(*) from public.messages where conversation_id = 'e0000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: non-assignee support Admin read chat'; end if;
  if (select count(*) from public.reports where id = 'c3000000-0000-0000-0000-000000000001') <> 0
    then raise exception 'FAIL: non-assignee support Admin read another Admin''s report'; end if;
  begin
    perform public.admin_read_report_case(
      'c3000000-0000-0000-0000-000000000001', 'not my assigned report', 'r10-x-1');
    raise exception 'FAIL: non-assignee support Admin read report via audited RPC';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: other-assignee direct + RPC denial';
end $$;

-- 10a. Dispute handling is finance/super only. Even a stale, manually-created
--      support assignment grants no queue, transition, read, booking, chat,
--      evidence, or storage authority.
do $$
declare v_denied boolean;
begin
  if (select count(*) from public.admin_dispute_queue) <> 0 then
    raise exception 'FAIL: support Admin saw dispute queue rows';
  end if;
  if (select count(*) from public.disputes
      where id = 'c4000000-0000-0000-0000-000000000003') <> 0 then
    raise exception 'FAIL: stale support assignee read dispute directly';
  end if;
  if (select count(*) from public.evidence
      where id = 'c5000000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'FAIL: stale support assignee read dispute evidence directly';
  end if;
  if (select count(*) from public.offers
      where task_id = 'a0000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'FAIL: stale support dispute assignment leaked booking-linked offers';
  end if;

  v_denied := false;
  begin
    perform public.admin_assign_dispute(
      'c4000000-0000-0000-0000-000000000002',
      'support must not self-assign disputes', 'support-dispute-assign-denied');
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'FAIL: support Admin self-assigned a dispute'; end if;

  v_denied := false;
  begin
    perform public.admin_transition_dispute(
      'c4000000-0000-0000-0000-000000000003', 'UNDER_REVIEW',
      'support must not transition disputes', 'support-dispute-transition-denied');
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'FAIL: stale support assignee transitioned a dispute'; end if;

  v_denied := false;
  begin
    perform public.admin_read_dispute_case(
      'c4000000-0000-0000-0000-000000000003',
      'support must not read disputes', 'support-dispute-read-denied');
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'FAIL: stale support assignee read a dispute RPC'; end if;

  v_denied := false;
  begin
    perform public.admin_read_conversation_messages(
      'e0000000-0000-0000-0000-000000000001',
      'stale dispute cannot unlock chat', 'support-dispute-chat-denied');
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'FAIL: stale support dispute assignment unlocked chat'; end if;

  v_denied := false;
  begin
    perform public.admin_read_evidence(
      'dispute', 'c4000000-0000-0000-0000-000000000003',
      'stale dispute cannot unlock evidence', 'support-dispute-evidence-denied');
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'FAIL: stale support dispute assignment unlocked evidence'; end if;

  if public.admin_authorize_object_read(
       'chat-media',
       '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg',
       'stale dispute cannot unlock chat media', 'support-dispute-chat-object-denied') is not false then
    raise exception 'FAIL: stale support dispute assignment authorized chat storage';
  end if;
  if public.admin_authorize_object_read(
       'evidence',
       '11111111-1111-1111-1111-111111111111/c4000000-0000-0000-0000-000000000003/stale-support.pdf',
       'stale dispute cannot unlock evidence file', 'support-dispute-evidence-object-denied') is not false then
    raise exception 'FAIL: stale support dispute assignment authorized evidence storage';
  end if;

  raise notice 'PASS: support has zero dispute authority despite stale assignment';
end $$;

-- 10b. Super Admin without an assignment is denied by the audited read RPC too
--      (super is not an implicit sensitive grant).
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
do $$
begin
  begin
    perform public.admin_read_report_case(
      'c3000000-0000-0000-0000-000000000001', 'super without assignment', 'r10b-x-1');
    raise exception 'FAIL: unassigned super Admin read report via audited RPC';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: unassigned super Admin audited-read denial';
end $$;

-- 11. Malformed / guessed storage path grants zero rows (no row binding), and
--     the storage authorization RPC returns FALSE for malformed/wrong objects
--     and TRUE only for the bound object the caller is assigned to.
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
set local request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
do $$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'chat-media' and name = 'not-a-uuid/also-not-a-uuid/guessed.jpg') <> 0
    then raise exception 'FAIL: guessed unbound chat-media path was readable'; end if;
  -- Storage authorization: malformed/unbound -> false.
  if public.admin_authorize_object_read('chat-media',
        'not-a-uuid/also-not-a-uuid/guessed.jpg', 'malformed path check', 'so-1') is not false
    then raise exception 'FAIL: authorize accepted a malformed/unbound object'; end if;
  -- Wrong purpose: this support Admin is not assigned the verification case ->
  -- the id-document object must not be authorized.
  if public.admin_authorize_object_read('id-documents',
        '11111111-1111-1111-1111-111111111111/c2000000-0000-0000-0000-000000000001/front.jpg',
        'wrong purpose check', 'so-2') is not false
    then raise exception 'FAIL: authorize accepted an unassigned id-document'; end if;
  -- Assigned: the chat-media object bound to the reported conversation -> true.
  if public.admin_authorize_object_read('chat-media',
        '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg',
        'reviewing reported media', 'so-3') is not true
    then raise exception 'FAIL: authorize denied the assigned chat-media object'; end if;
  raise notice 'PASS: malformed/guessed storage path + storage authorization matrix';
end $$;

-- ---------------------------------------------------------------------------
-- 11c. Admin SELF-assignment: success + idempotency (support Admin 44 assigns
--      the fresh unassigned report to itself; a replay is a no-op).
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare v1 public.reports; v2 public.reports; v_mod int;
begin
  v1 := public.admin_assign_report('c3000000-0000-0000-0000-000000000002',
          'triaging a newly filed spam report', 'asg-rep-1');
  if v1.assignee_id <> '44444444-4444-4444-4444-444444444444'
    then raise exception 'FAIL: self-assignment did not set the caller as assignee'; end if;
  -- Idempotent replay (already mine) writes no second record.
  v2 := public.admin_assign_report('c3000000-0000-0000-0000-000000000002',
          'triaging a newly filed spam report', 'asg-rep-1');
  if v2.assignee_id <> '44444444-4444-4444-4444-444444444444'
    then raise exception 'FAIL: idempotent replay changed the assignee'; end if;
  select count(*) into v_mod from public.moderation_actions
    where resource_type = 'report' and resource_id = 'c3000000-0000-0000-0000-000000000002'
      and action = 'assign';
  if v_mod <> 1 then raise exception 'FAIL: assignment replay wrote % moderation rows (want 1).', v_mod; end if;
  raise notice 'PASS: report self-assignment success + idempotency';
end $$;

-- Also exercise dispute, ticket, and verification self-assignment happy paths.
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
do $$
declare v public.disputes;
begin
  v := public.admin_assign_dispute('c4000000-0000-0000-0000-000000000002',
         'taking ownership of the open dispute', 'asg-dis-1');
  if v.assignee_id <> '55555555-5555-5555-5555-555555555555'
    then raise exception 'FAIL: finance Admin could not self-assign the dispute'; end if;
  raise notice 'PASS: dispute self-assignment (finance capability)';
end $$;

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare vt public.support_tickets; vv public.verification_cases;
begin
  vt := public.admin_assign_ticket('c6000000-0000-0000-0000-000000000001',
          'picking up the account support ticket', 'asg-tic-1');
  if vt.assignee_id <> '44444444-4444-4444-4444-444444444444'
    then raise exception 'FAIL: support Admin could not self-assign the ticket'; end if;
  vv := public.admin_assign_verification('c2000000-0000-0000-0000-000000000002',
          'starting identity review for this case', 'asg-ver-1');
  if vv.assigned_admin_id <> '44444444-4444-4444-4444-444444444444'
    then raise exception 'FAIL: support Admin could not self-assign the verification case'; end if;
  raise notice 'PASS: ticket + verification self-assignment';
end $$;

-- 11d. Wrong-capability + unsafe-reassignment denial.
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
do $$
declare v_ok boolean := false;
begin
  -- Finance Admin cannot self-assign a report (support/super only).
  begin
    perform public.admin_assign_report('c3000000-0000-0000-0000-000000000002',
      'finance tries to grab a report', 'asg-rep-wrongcap');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: finance Admin self-assigned a report'; end if;
  raise notice 'PASS: wrong-capability assignment denied';
end $$;

set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$
declare v_ok boolean := false;
begin
  -- Another support Admin cannot take a report already owned by 44.
  begin
    perform public.admin_assign_report('c3000000-0000-0000-0000-000000000002',
      'another Admin tries to reassign', 'asg-rep-reassign');
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: report reassigned to another Admin'; end if;
  raise notice 'PASS: unsafe reassignment denied';
end $$;

-- 11e. Status transitions: allowed / invalid / idempotent, assignee-only.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare v public.reports; v_ok boolean := false; v_mod int;
begin
  v := public.admin_transition_report('c3000000-0000-0000-0000-000000000002',
         'TRIAGED', 'beginning triage of the report', 'tr-rep-1');
  if v.status <> 'TRIAGED' then raise exception 'FAIL: allowed transition did not apply'; end if;
  -- Invalid transition (TRIAGED -> OPEN is not in the allowed table).
  begin
    perform public.admin_transition_report('c3000000-0000-0000-0000-000000000002',
      'OPEN', 'reverting is not allowed', 'tr-rep-2');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: an invalid report transition was accepted'; end if;
  -- Idempotent replay of the same target status writes no second record.
  v := public.admin_transition_report('c3000000-0000-0000-0000-000000000002',
         'TRIAGED', 'beginning triage of the report', 'tr-rep-1');
  if v.status <> 'TRIAGED' then raise exception 'FAIL: idempotent transition replay changed state'; end if;
  select count(*) into v_mod from public.moderation_actions
    where resource_type = 'report' and resource_id = 'c3000000-0000-0000-0000-000000000002'
      and action = 'transition:TRIAGED';
  if v_mod <> 1 then raise exception 'FAIL: transition replay wrote % moderation rows (want 1).', v_mod; end if;
  raise notice 'PASS: report transition allowed/invalid/idempotent';
end $$;

set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$
declare v_ok boolean := false;
begin
  -- Non-assignee cannot transition the report.
  begin
    perform public.admin_transition_report('c3000000-0000-0000-0000-000000000002',
      'ACTIONED', 'not the assignee', 'tr-rep-3');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: non-assignee transitioned a report'; end if;
  raise notice 'PASS: non-assignee transition denied';
end $$;

-- 11f. Audited read/storage calls return success on replay but append EXACTLY
--      ONE row per key. A single session cannot simulate a competing waiter;
--      it can truthfully prove both code paths acquire distinct transaction-
--      scoped advisory locks before replay. Audit rows are inspected as owner.
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
set local request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
do $$
declare
  c1 int;
  c2 int;
  v_before int;
  v_after_read int;
  v_after_storage int;
begin
  select count(*) into v_before
  from pg_catalog.pg_locks
  where pid = pg_backend_pid() and locktype = 'advisory' and granted;

  select count(*) into c1 from public.admin_read_report_case(
    'c3000000-0000-0000-0000-000000000001',
    'audit replay exact read reason', 'rd-replay-1');
  select count(*) into c2 from public.admin_read_report_case(
    'c3000000-0000-0000-0000-000000000001',
    'audit replay exact read reason', 'rd-replay-1');
  if c1 <> 1 or c2 <> 1 then
    raise exception 'FAIL: audited read did not return data on both calls';
  end if;

  select count(*) into v_after_read
  from pg_catalog.pg_locks
  where pid = pg_backend_pid() and locktype = 'advisory' and granted;
  if v_after_read <= v_before then
    raise exception 'FAIL: audited read did not acquire its transaction advisory lock';
  end if;

  if public.admin_authorize_object_read(
       'chat-media',
       '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg',
       'storage replay exact reason', 'storage-replay-1') is not true
     or public.admin_authorize_object_read(
       'chat-media',
       '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg',
       'storage replay exact reason', 'storage-replay-1') is not true then
    raise exception 'FAIL: storage authorization did not succeed on replay';
  end if;

  select count(*) into v_after_storage
  from pg_catalog.pg_locks
  where pid = pg_backend_pid() and locktype = 'advisory' and granted;
  if v_after_storage <= v_after_read then
    raise exception 'FAIL: storage authorization did not acquire its transaction advisory lock';
  end if;

  raise notice 'PASS: read/storage replay paths acquired locks and returned success';
end $$;

-- Return to the owner role for privileged-function tests.
reset role;
reset request.jwt.claim.sub;

-- 11g. As owner (bypasses audit_logs RLS): replayed read/storage calls each
--      appended one complete audit row, while denied support attempts wrote none.
do $$
declare
  v_reads int;
  v_read_complete int;
  v_storage int;
  v_storage_complete int;
  v_denied_support int;
  v_assign int;
  v_trans int;
begin
  select count(*) into v_reads from public.audit_logs
    where actor_id = '88888888-8888-8888-8888-888888888888'
      and action = 'admin.read.report'
      and resource_type = 'report'
      and resource_id = 'c3000000-0000-0000-0000-000000000001'
      and safe_metadata->>'idempotency_key' = 'rd-replay-1';
  if v_reads <> 1 then
    raise exception 'FAIL: replayed audited read produced % audit rows (want 1).', v_reads;
  end if;

  select count(*) into v_read_complete from public.audit_logs
    where actor_id = '88888888-8888-8888-8888-888888888888'
      and action = 'admin.read.report'
      and resource_type = 'report'
      and resource_id = 'c3000000-0000-0000-0000-000000000001'
      and created_at is not null
      and safe_metadata->>'capability' = 'ADMIN_SUPPORT'
      and safe_metadata->>'reason' = 'audit replay exact read reason'
      and safe_metadata->>'idempotency_key' = 'rd-replay-1';
  if v_read_complete <> 1 then
    raise exception 'FAIL: audited read lost actor/time/target/capability/reason/key evidence';
  end if;

  select count(*) into v_storage from public.audit_logs
    where actor_id = '88888888-8888-8888-8888-888888888888'
      and action = 'admin.storage.authorize'
      and resource_type = 'conversation'
      and resource_id = 'e0000000-0000-0000-0000-000000000001'
      and safe_metadata->>'idempotency_key' = 'storage-replay-1';
  if v_storage <> 1 then
    raise exception 'FAIL: replayed storage authorization produced % audit rows (want 1).', v_storage;
  end if;

  select count(*) into v_storage_complete from public.audit_logs
    where actor_id = '88888888-8888-8888-8888-888888888888'
      and action = 'admin.storage.authorize'
      and resource_type = 'conversation'
      and resource_id = 'e0000000-0000-0000-0000-000000000001'
      and created_at is not null
      and safe_metadata->>'capability' = 'ADMIN_SUPPORT'
      and safe_metadata->>'reason' = 'storage replay exact reason'
      and safe_metadata->>'bucket' = 'chat-media'
      and safe_metadata->>'object_name' =
          '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001/photo.jpg'
      and safe_metadata->>'idempotency_key' = 'storage-replay-1';
  if v_storage_complete <> 1 then
    raise exception 'FAIL: storage audit lost actor/time/target/capability/reason/key/object evidence';
  end if;

  select count(*) into v_denied_support from public.audit_logs
    where actor_id = '66666666-6666-6666-6666-666666666666'
      and safe_metadata->>'idempotency_key' like 'support-dispute-%';
  if v_denied_support <> 0 then
    raise exception 'FAIL: denied support dispute attempts wrote % success audit rows.', v_denied_support;
  end if;

  select count(*) into v_assign from public.audit_logs
    where action = 'admin.assign.report'
      and resource_id = 'c3000000-0000-0000-0000-000000000002';
  if v_assign <> 1 then raise exception 'FAIL: report self-assignment produced % audit rows (want 1).', v_assign; end if;

  select count(*) into v_trans from public.audit_logs
    where action = 'admin.transition.report'
      and resource_id = 'c3000000-0000-0000-0000-000000000002'
      and safe_metadata->>'to' = 'TRIAGED';
  if v_trans <> 1 then raise exception 'FAIL: report transition produced % audit rows (want 1).', v_trans; end if;

  raise notice 'PASS: complete exactly-once read/storage audit evidence';
end $$;

-- 12. Webhook idempotency + reorder safety (process_payment_event).
do $$
declare v_e1 public.provider_events; v_e2 public.provider_events; v_caps int; v_status booking_status;
begin
  v_e1 := public.process_payment_event('synthetic','evt-webhook-1','payment.confirmed','pref3',500000,'PHP',true,'hash1');
  v_e2 := public.process_payment_event('synthetic','evt-webhook-1','payment.confirmed','pref3',500000,'PHP',true,'hash1');
  if v_e2.processing_status <> 'DUPLICATE' then raise exception 'FAIL: replayed webhook not marked DUPLICATE'; end if;
  select count(*) into v_caps from public.ledger_transactions
    where booking_id = 'd0000000-0000-0000-0000-000000000003' and type = 'PAYMENT_CAPTURE';
  if v_caps <> 1 then raise exception 'FAIL: duplicate webhook produced % capture transactions', v_caps; end if;
  -- Reordered late failure must not revert a confirmed booking.
  perform public.process_payment_event('synthetic','evt-webhook-2','payment.failed','pref3',500000,'PHP',true,'hash2');
  select status into v_status from public.bookings where id = 'd0000000-0000-0000-0000-000000000003';
  if v_status <> 'CONFIRMED' then raise exception 'FAIL: late failure reverted a confirmed booking (%).', v_status; end if;
  raise notice 'PASS: webhook duplicate + reorder idempotency';
end $$;

-- 13. Capture ledger transaction is balanced to zero (fee=0 default).
do $$
declare v_sum bigint;
begin
  select coalesce(sum(le.amount_centavos),0) into v_sum
  from public.ledger_entries le
  join public.ledger_transactions lt on lt.id = le.transaction_id
  where lt.booking_id = 'd0000000-0000-0000-0000-000000000003' and lt.type = 'PAYMENT_CAPTURE';
  if v_sum <> 0 then raise exception 'FAIL: capture ledger not balanced (sum=%).', v_sum; end if;
  raise notice 'PASS: capture ledger balanced to zero';
end $$;

-- 14. One-active-booking-per-task: a second active booking is rejected.
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.bookings (task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
    values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
            500000, 'PAYMENT_PENDING', 'idem-dup-active');
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: a second active booking per task was accepted'; end if;
  raise notice 'PASS: one-active-booking constraint enforced';
end $$;

-- 15. Refund fails closed on an already-released (COMPLETED) booking: raises and
--     mutates nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
do $$
declare v_ok boolean := false; v_before int; v_after int;
begin
  select count(*) into v_before from public.refunds;
  begin
    perform public.admin_refund('c1000000-0000-0000-0000-000000000004', 500000, 'test', 'refund-completed-1');
  exception when others then v_ok := true;
  end;
  select count(*) into v_after from public.refunds;
  if not v_ok then raise exception 'FAIL: admin_refund did not fail closed on a released booking'; end if;
  if v_after <> v_before then raise exception 'FAIL: admin_refund mutated refunds on a released booking'; end if;
  raise notice 'PASS: refund fails closed + zero mutation on released booking';
end $$;

-- 16. Refund request on a refundable booking records REQUESTED and posts NO
--     ledger movement and NO booking status change (provider-authoritative).
do $$
declare v_r public.refunds; v_ledger int; v_status booking_status;
begin
  v_r := public.admin_refund('c1000000-0000-0000-0000-000000000001', 500000, 'test', 'refund-confirmed-1');
  if v_r.status <> 'REQUESTED' then raise exception 'FAIL: refund not left as REQUESTED (%).', v_r.status; end if;
  select count(*) into v_ledger from public.ledger_transactions
    where booking_id = 'd0000000-0000-0000-0000-000000000001' and type = 'REFUND';
  if v_ledger <> 0 then raise exception 'FAIL: admin_refund posted a ledger movement without provider finalization'; end if;
  select status into v_status from public.bookings where id = 'd0000000-0000-0000-0000-000000000001';
  if v_status = 'REFUNDED' then raise exception 'FAIL: admin_refund set booking REFUNDED without provider finalization'; end if;
  raise notice 'PASS: refund request records intent only, no ledger/booking mutation';
end $$;

reset role;
reset request.jwt.claim.sub;

-- 17. Provider-authoritative refund finalization posts a balanced reversal and
--     is idempotent on replay.
do $$
declare v_e public.provider_events; v_sum bigint; v_status booking_status; v_rstatus refund_status;
begin
  v_e := public.process_refund_event('synthetic','refund-evt-1','refund-confirmed-1','prov-ref-1',500000,true,'rhash1');
  if v_e.processing_status <> 'PROCESSED' then raise exception 'FAIL: refund event not PROCESSED (%).', v_e.processing_status; end if;
  select coalesce(sum(le.amount_centavos),0) into v_sum
    from public.ledger_entries le
    join public.ledger_transactions lt on lt.id = le.transaction_id
    where lt.booking_id = 'd0000000-0000-0000-0000-000000000001' and lt.type = 'REFUND';
  if v_sum <> 0 then raise exception 'FAIL: refund reversal not balanced (sum=%).', v_sum; end if;
  select status into v_status from public.bookings where id = 'd0000000-0000-0000-0000-000000000001';
  if v_status <> 'REFUNDED' then raise exception 'FAIL: provider refund did not set booking REFUNDED'; end if;
  select status into v_rstatus from public.refunds where idempotency_key = 'refund-confirmed-1';
  if v_rstatus <> 'SUCCEEDED' then raise exception 'FAIL: refund not marked SUCCEEDED'; end if;
  -- Replay is idempotent (no second REFUND transaction).
  perform public.process_refund_event('synthetic','refund-evt-1','refund-confirmed-1','prov-ref-1',500000,true,'rhash1');
  if (select count(*) from public.ledger_transactions
      where booking_id = 'd0000000-0000-0000-0000-000000000001' and type = 'REFUND') <> 1
    then raise exception 'FAIL: replayed refund event posted a duplicate ledger movement'; end if;
  raise notice 'PASS: provider refund finalization balanced + idempotent';
end $$;

rollback;

-- If every block above printed PASS, the security-hardening invariants hold.
