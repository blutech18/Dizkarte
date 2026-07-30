-- 0022_realtime_publication.sql
-- Let chat and the notification bell update without polling.
--
-- Supabase Realtime streams from the `supabase_realtime` publication. A table
-- that is not a member emits nothing, so a client subscription silently
-- receives no events — which is why chat had to be re-fetched by hand.
--
-- Only two tables are added, and both already carry restrictive RLS:
--
--   * `messages` — `postgres_changes` re-evaluates the table's SELECT policy per
--     subscriber, so a user receives an event only for a conversation they are
--     already allowed to read. Membership does not widen access.
--   * `notifications` — SELECT is limited to `user_id = auth.uid()`.
--
-- Deliberately excluded: `message_media` (no `conversation_id` to filter on, and
-- it commits in the same transaction as its message, so the message event is
-- already enough to trigger a refetch that includes it) and every finance table,
-- where a stream of ledger movements would be an unnecessary exposure.
--
-- `alter publication ... add table` errors if the table is already a member, so
-- each add is guarded to keep this migration re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when undefined_object then
    -- A self-hosted database without the Supabase Realtime publication is a
    -- valid target; the apps fall back to explicit refresh in that case.
    raise notice 'supabase_realtime publication not found; skipping realtime setup.';
end;
$$;

-- Realtime sends the old row for UPDATE/DELETE only when the replica identity
-- exposes it. Chat needs inserts, so the default (primary key) is enough here.
