-- tests/conversation_read_state.sql
-- Self-checks for migration 0046: per-conversation read state and the bounded
-- summary read model behind the Bookings list.
--
-- Coverage: participant-only marking; the same refusal for a stranger and for a
-- non-existent conversation (so it cannot be used to probe which bookings
-- exist); monotonic high-water mark; unread counts the COUNTERPART's messages
-- only; own messages are never unread; marking read zeroes the count; an
-- Admin-moderated message is excluded from both the preview and the count; the
-- preview is truncated server-side; a non-participant sees zero rows; and anon
-- cannot execute either function.
--
-- REQUIRES a Supabase-equivalent database (`auth.uid()`, the `authenticated`
-- role, `auth.users`). Runs in a transaction and rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conversation_read_state.sql
--
-- All IDs and content are synthetic.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (owner role).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111', 'crs-client@synthetic.test'),
  ('d2222222-2222-2222-2222-222222222222', 'crs-tasker@synthetic.test'),
  ('d3333333-3333-3333-3333-333333333333', 'crs-stranger@synthetic.test'),
  ('d5555555-5555-5555-5555-555555555555', 'crs-support@synthetic.test')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('d1111111-1111-1111-1111-111111111111', 'CRS Client'),
  ('d2222222-2222-2222-2222-222222222222', 'CRS Tasker'),
  ('d3333333-3333-3333-3333-333333333333', 'CRS Stranger'),
  ('d5555555-5555-5555-5555-555555555555', 'CRS Support')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.user_capabilities (user_id, capability) values
  ('d2222222-2222-2222-2222-222222222222', 'TASKER'),
  ('d5555555-5555-5555-5555-555555555555', 'ADMIN_SUPPORT')
on conflict do nothing;

insert into public.categories (id, slug, name)
values ('c2000000-0000-0000-0000-000000000001', 'crs-cat', 'CRS Category');

insert into public.tasks (id, client_id, category_id, title, description, budget_centavos, status)
values ('a2000000-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111',
        'c2000000-0000-0000-0000-000000000001', 'CRS Confirmed Task',
        'Synthetic task backing a confirmed booking.', 500000, 'ASSIGNED');

insert into public.offers
  (id, task_id, tasker_id, amount_centavos, message, eta_text, availability_text,
   experience_text, status)
values ('d2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
        'd2222222-2222-2222-2222-222222222222', 500000, 'Synthetic offer.', '2 hours',
        'Today', 'Synthetic experience.', 'SELECTED');

insert into public.bookings
  (id, task_id, accepted_offer_id, client_id, tasker_id, agreed_centavos, status, idempotency_key)
values ('e2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
        'd2000000-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111',
        'd2222222-2222-2222-2222-222222222222', 500000, 'CONFIRMED', 'crs-booking-1');

-- In production `process_payment_event` is the only creator of a conversation;
-- inserted directly here because this suite is about read state, not the gate
-- (which `security_hardening.sql` already covers).
insert into public.conversations (id, booking_id)
values ('f2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001');

insert into public.conversation_participants (conversation_id, user_id) values
  ('f2000000-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111'),
  ('f2000000-0000-0000-0000-000000000001', 'd2222222-2222-2222-2222-222222222222');

-- Two from the Tasker, one from the Client, plus one moderated-away message that
-- must not appear as preview text or be counted.
insert into public.messages (id, conversation_id, sender_id, body, moderation_status, created_at)
values
  ('aa000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
   'd2222222-2222-2222-2222-222222222222', 'On my way to the pickup point.', 'APPROVED',
   now() - interval '30 minutes'),
  ('aa000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001',
   'd1111111-1111-1111-1111-111111111111', 'Great, the gate code is on the note.', 'APPROVED',
   now() - interval '20 minutes'),
  ('aa000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000001',
   'd2222222-2222-2222-2222-222222222222', 'Arrived, starting now.', 'APPROVED',
   now() - interval '10 minutes'),
  ('aa000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000001',
   'd2222222-2222-2222-2222-222222222222', 'REMOVED BY MODERATION - must never preview',
   'REJECTED', now() - interval '1 minute');

-- ===========================================================================
-- 1. Execute boundaries.
-- ===========================================================================
do $$
begin
  if has_function_privilege('anon', 'public.conversation_summaries()', 'EXECUTE')
    then raise exception 'FAIL: anon may read conversation summaries'; end if;
  if has_function_privilege('anon', 'public.mark_conversation_read(uuid)', 'EXECUTE')
    then raise exception 'FAIL: anon may mark a conversation read'; end if;
  if not has_function_privilege('authenticated', 'public.conversation_summaries()', 'EXECUTE')
    then raise exception 'FAIL: authenticated cannot read their own summaries'; end if;
  raise notice 'PASS: read-state functions are authenticated-only';
end $$;

-- ===========================================================================
-- 2. Unread counts the counterpart's messages only, and excludes a moderated one.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';

do $$
declare v_row record;
begin
  select * into v_row from public.conversation_summaries()
  where conversation_id = 'f2000000-0000-0000-0000-000000000001';
  if not found then raise exception 'FAIL: participant saw no summary for their conversation'; end if;

  -- Two APPROVED Tasker messages; the Client's own message and the REJECTED one
  -- are both excluded.
  if v_row.unread_count <> 2 then
    raise exception 'FAIL: expected 2 unread, got %', v_row.unread_count;
  end if;
  if v_row.last_message_preview <> 'Arrived, starting now.' then
    raise exception 'FAIL: preview was % (a moderated message must never surface)',
      v_row.last_message_preview;
  end if;
  if v_row.last_message_sender_id <> 'd2222222-2222-2222-2222-222222222222' then
    raise exception 'FAIL: wrong last sender %', v_row.last_message_sender_id;
  end if;
  if v_row.booking_id <> 'e2000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: summary is not joined to its booking';
  end if;
  raise notice 'PASS: unread counts only the counterpart''s approved messages';
end $$;

-- ===========================================================================
-- 3. Marking read zeroes the count; the mark is monotonic.
-- ===========================================================================
do $$
declare v_mark timestamptz; v_again timestamptz; v_unread integer;
begin
  v_mark := public.mark_conversation_read('f2000000-0000-0000-0000-000000000001');
  if v_mark is null then raise exception 'FAIL: mark_conversation_read returned null'; end if;

  select unread_count into v_unread from public.conversation_summaries()
  where conversation_id = 'f2000000-0000-0000-0000-000000000001';
  if v_unread <> 0 then raise exception 'FAIL: unread was % after marking read', v_unread; end if;

  -- Idempotent: a second call is harmless.
  v_again := public.mark_conversation_read('f2000000-0000-0000-0000-000000000001');
  if v_again < v_mark then raise exception 'FAIL: the high-water mark moved backwards'; end if;
  raise notice 'PASS: marking read clears the count and is idempotent';
end $$;

-- A stale/late call must not resurrect already-read messages.
reset role;
update public.conversation_participants
   set last_read_at = now() + interval '1 day'
 where conversation_id = 'f2000000-0000-0000-0000-000000000001'
   and user_id = 'd1111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';

do $$
declare v_mark timestamptz;
begin
  v_mark := public.mark_conversation_read('f2000000-0000-0000-0000-000000000001');
  if v_mark <= now() then
    raise exception 'FAIL: a later call pulled the high-water mark back to now (%)', v_mark;
  end if;
  raise notice 'PASS: the read high-water mark is monotonic';
end $$;

-- ===========================================================================
-- 4. A new counterpart message makes the conversation unread again.
-- ===========================================================================
reset role;
update public.conversation_participants
   set last_read_at = now() - interval '5 minutes'
 where conversation_id = 'f2000000-0000-0000-0000-000000000001'
   and user_id = 'd1111111-1111-1111-1111-111111111111';

insert into public.messages (conversation_id, sender_id, body, moderation_status, created_at)
values ('f2000000-0000-0000-0000-000000000001', 'd2222222-2222-2222-2222-222222222222',
        'One more thing before I finish.', 'APPROVED', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';

do $$
declare v_unread integer; v_preview text;
begin
  select unread_count, last_message_preview into v_unread, v_preview
  from public.conversation_summaries()
  where conversation_id = 'f2000000-0000-0000-0000-000000000001';
  if v_unread <> 1 then raise exception 'FAIL: a new message left unread at %', v_unread; end if;
  if v_preview <> 'One more thing before I finish.' then
    raise exception 'FAIL: preview did not advance to the newest message (%)', v_preview;
  end if;
  raise notice 'PASS: a newer counterpart message reopens the unread state';
end $$;

-- ===========================================================================
-- 5. The Tasker's own view is symmetric: their own messages are not unread.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = 'd2222222-2222-2222-2222-222222222222';

do $$
declare v_unread integer;
begin
  select unread_count into v_unread from public.conversation_summaries()
  where conversation_id = 'f2000000-0000-0000-0000-000000000001';
  -- Only the Client's single message is unread to the Tasker.
  if v_unread <> 1 then
    raise exception 'FAIL: Tasker unread was % (own messages must not count)', v_unread;
  end if;
  raise notice 'PASS: a participant''s own messages are never unread to themselves';
end $$;

-- ===========================================================================
-- 6. A stranger sees nothing and cannot mark anything read.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local request.jwt.claim.sub = 'd3333333-3333-3333-3333-333333333333';

do $$
declare v_rows integer; v_refused boolean := false; v_probe boolean := false;
begin
  select count(*) into v_rows from public.conversation_summaries();
  if v_rows <> 0 then raise exception 'FAIL: a stranger saw % summaries', v_rows; end if;

  begin
    perform public.mark_conversation_read('f2000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'FAIL: a stranger marked a conversation read'; end if;

  -- A conversation that does not exist must fail the SAME way, so the error
  -- cannot be used to discover which conversations are real.
  begin
    perform public.mark_conversation_read('f2000000-0000-0000-0000-0000000000ff');
  exception when insufficient_privilege then
    v_probe := true;
  end;
  if not v_probe then
    raise exception 'FAIL: a missing conversation is distinguishable from a forbidden one';
  end if;
  raise notice 'PASS: non-participants see nothing and cannot probe';
end $$;

-- ===========================================================================
-- 7. The preview is truncated server-side (a list read is never a bulk export).
-- ===========================================================================
reset role;
insert into public.messages (conversation_id, sender_id, body, moderation_status, created_at)
values ('f2000000-0000-0000-0000-000000000001', 'd2222222-2222-2222-2222-222222222222',
        repeat('x', 900), 'APPROVED', now() + interval '1 minute');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';

do $$
declare v_len integer;
begin
  select char_length(last_message_preview) into v_len
  from public.conversation_summaries()
  where conversation_id = 'f2000000-0000-0000-0000-000000000001';
  if v_len <> 140 then
    raise exception 'FAIL: preview length was % (expected the 140-char truncation)', v_len;
  end if;
  raise notice 'PASS: the preview is truncated in SQL, not in the client';
end $$;

rollback;
