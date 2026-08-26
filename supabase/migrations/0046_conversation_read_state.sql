-- 0046_conversation_read_state.sql
-- Per-conversation read state, and a bounded summary read model for the
-- Bookings list.
--
-- WHY
--
-- Unread was only ever modelled per NOTIFICATION (`notifications.read_at` on a
-- `MESSAGE_RECEIVED` row). That answers "have you looked at your inbox?", not
-- "does this conversation have messages you have not read?" — so the Bookings
-- list could not show a per-conversation badge or a last-message preview without
-- fetching every message of every booking to the client and computing it there.
--
-- WHAT
--
--   1. `conversation_participants.last_read_at` — the participant's own high-water
--      mark. Monotonic: `mark_conversation_read` never moves it backwards, so an
--      out-of-order call (a stale screen, a retried request) cannot resurrect
--      messages the user has already seen.
--   2. `conversation_summaries()` — one bounded row per conversation the CALLER
--      participates in: last message time, a short preview, who sent it, and the
--      caller's unread count.
--
-- PRIVACY
--
-- The summary is `SECURITY DEFINER` but hard-scoped to `auth.uid()`: it never
-- takes a user id argument, so there is no parameter to tamper with. It reads
-- only conversations the caller participates in, which by construction exist
-- only for a payment-confirmed booking (`process_payment_event` is the sole
-- creator), so this adds no new pre-payment surface.
--
-- Two deliberate exclusions:
--   * only `moderation_status = 'APPROVED'` messages are previewed or counted —
--     a message an Admin removed must not reappear as preview text;
--   * the preview is truncated in SQL (140 chars), so a 4,000-character message
--     cannot turn a list query into a bulk content transfer. The full body is
--     still only readable inside the conversation itself.

alter table public.conversation_participants
  add column if not exists last_read_at timestamptz;

-- The unread count and the summary both filter by participant + time.
create index if not exists ix_messages_conversation_created
  on public.messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- mark_conversation_read — participant-only, monotonic, idempotent.
--
-- Returns the effective high-water mark, so a caller can tell what was recorded
-- without a second read.
-- ---------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_now timestamptz := now();
  v_result timestamptz;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN: authentication is required.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.conversation_participants cp
     set last_read_at = greatest(coalesce(cp.last_read_at, v_now), v_now)
   where cp.conversation_id = p_conversation_id
     and cp.user_id = auth.uid()
  returning cp.last_read_at into v_result;

  if not found then
    -- Not a participant (or no such conversation): the same refusal either way,
    -- so this cannot be used to probe which bookings exist.
    raise exception 'FORBIDDEN: only conversation participants may mark it read.'
      using errcode = 'insufficient_privilege';
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- conversation_summaries — the Bookings-list read model.
--
-- One row per conversation the caller participates in, ordered by most recent
-- activity. `unread_count` counts APPROVED messages from the OTHER participant
-- newer than the caller's high-water mark; a participant's own messages are
-- never unread to themselves, and a never-opened conversation counts everything
-- from the counterpart.
-- ---------------------------------------------------------------------------
create or replace function public.conversation_summaries()
returns table (
  conversation_id uuid,
  booking_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender_id uuid,
  last_message_has_media boolean,
  unread_count integer
)
language sql
security definer
set search_path = public, app
as $$
  with mine as (
    select cp.conversation_id, cp.last_read_at
    from public.conversation_participants cp
    where cp.user_id = auth.uid()
  ),
  latest as (
    select distinct on (m.conversation_id)
           m.conversation_id,
           m.created_at,
           m.body,
           m.sender_id,
           m.id as message_id
    from public.messages m
    join mine on mine.conversation_id = m.conversation_id
    where m.moderation_status = 'APPROVED'
    order by m.conversation_id, m.created_at desc
  )
  select c.id as conversation_id,
         c.booking_id,
         latest.created_at as last_message_at,
         left(latest.body, 140) as last_message_preview,
         latest.sender_id as last_message_sender_id,
         exists (
           select 1 from public.message_media mm where mm.message_id = latest.message_id
         ) as last_message_has_media,
         (
           select count(*)::integer
           from public.messages m2
           where m2.conversation_id = c.id
             and m2.moderation_status = 'APPROVED'
             and m2.sender_id <> auth.uid()
             and (mine.last_read_at is null or m2.created_at > mine.last_read_at)
         ) as unread_count
  from public.conversations c
  join mine on mine.conversation_id = c.id
  left join latest on latest.conversation_id = c.id
  order by latest.created_at desc nulls last;
$$;

-- Explicit ACLs. A bare `create function` grants EXECUTE to PUBLIC, which `anon`
-- inherits — revoking from `anon` alone would not remove it. Revoke from PUBLIC
-- first, then re-grant only the intended role, matching the 0013 convention.
--
-- `service_role` is deliberately excluded: both functions resolve the caller
-- through `auth.uid()`, so a service-role call carries no identity and would
-- silently return nothing. A server-side path that needs this data should read
-- the underlying tables directly, where the intent is explicit.
revoke execute on function public.conversation_summaries()
  from public, anon, authenticated, service_role;
grant execute on function public.conversation_summaries() to authenticated;

revoke execute on function public.mark_conversation_read(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
