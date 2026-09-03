-- 0052_notification_retention_policy.sql
-- 30-day automatic retention policy for read in-app notifications (matching industry standard / Facebook).
--
-- DESIGN:
-- 1. Read notifications older than 30 days are pruned automatically by a daily sweep.
-- 2. Unread notifications are retained until opened or marked as read.
-- 3. Scheduled as part of app.ensure_scheduled_jobs() on a daily cron cadence.

create or replace function app.prune_expired_notifications(p_retention_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_deleted integer;
  v_cutoff timestamptz := now() - (coalesce(p_retention_days, 30) || ' days')::interval;
begin
  delete from public.notifications
  where read_at is not null
    and created_at < v_cutoff;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function app.prune_expired_notifications(integer)
  from public, anon, authenticated;
grant execute on function app.prune_expired_notifications(integer)
  to service_role;

-- Update or extend scheduled jobs declaration if pg_cron is present
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if to_regclass('cron.job') is not null then
      -- Schedule daily at 03:30 AM
      execute $cron$
        select cron.schedule(
          'prune-expired-notifications',
          '30 3 * * *',
          'select app.prune_expired_notifications(30);'
        );
      $cron$;
    end if;
  end if;
exception
  when others then
    raise notice 'pg_cron schedule notice: %', sqlerrm;
end;
$$;
