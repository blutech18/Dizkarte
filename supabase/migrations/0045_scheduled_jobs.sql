-- 0045_scheduled_jobs.sql
-- Actually RUN the recurring server jobs.
--
-- Four server-only sweeps existed with no caller:
--
--   * `expire_stale_payment_pending` (0027) — abandoned checkouts stayed
--     PAYMENT_PENDING forever, holding the one-active-booking slot on a task.
--   * `emit_review_reminders` (0043) — the blind review window could expire in
--     silence.
--   * `sweep_stale_completion_requests` (0044) — a completion request the Client
--     never answered was never reminded or escalated.
--   * the push retry queue (`due_push_retries`, 0044) — a transiently failed push
--     was never attempted again.
--
-- Each was written, tested, and then invoked by nothing: no `pg_cron` schedule, no
-- scheduled workflow, no runbook. A sweep that never runs is indistinguishable
-- from an unimplemented one, so this migration wires them up.
--
-- DESIGN
--
-- 1. **Extensions are not created here.** `pg_cron` needs
--    `shared_preload_libraries` and, on hosted Supabase, is enabled from the
--    Dashboard. A migration that assumed it would fail on any database without
--    it — including CI and disposable test containers. Instead, scheduling is
--    guarded: present → schedule; absent → NOTICE and skip, leaving the migration
--    successful and the jobs runnable manually.
-- 2. **Idempotent.** `app.ensure_scheduled_jobs()` can be re-run after enabling
--    `pg_cron` (or after changing a cadence) and converges on the same schedule.
--    It is also the documented ops step in
--    `docs/operations/scheduled-jobs.md`.
-- 3. **No secret in a job command.** The push retry needs an HTTPS call, so the
--    cron entry invokes `app.dispatch_push_retries()`, which reads the URL and
--    dispatch secret from Supabase Vault at run time. Nothing is embedded in
--    `cron.job.command`, and a missing secret is a no-op, never a fabricated call.
-- 4. **Dynamic SQL for optional schemas.** `cron.*`, `net.*`, and `vault.*` are
--    referenced through `execute` so these functions can be created on a database
--    where those schemas do not exist yet.
--
-- Cadence rationale: checkout expiry is the only one a user waits on, so it runs
-- most often; reminders and escalation are day-scale rules, so hourly is ample
-- and keeps the notification volume honest. Offsets stagger the jobs so they
-- never start in the same second.

-- ---------------------------------------------------------------------------
-- app.dispatch_push_retries — ask the push-dispatch function to retry due rows.
--
-- Returns true only when a request was actually sent. The three "not configured"
-- paths (no pg_net, no Vault, no secret) are silent no-ops by design: this runs on
-- a schedule, and a database where push has not been provisioned must not fill
-- the log with failures for a channel the Client has not enabled yet (B4).
-- ---------------------------------------------------------------------------
create or replace function app.dispatch_push_retries(p_limit integer default 100)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_url    text;
  v_secret text;
  v_limit  integer := least(500, greatest(1, coalesce(p_limit, 100)));
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'push retry skipped: pg_net is not installed';
    return false;
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'push retry skipped: Supabase Vault is not available';
    return false;
  end if;

  execute $q$
    select max(case when name = 'push_dispatch_url' then decrypted_secret end),
           max(case when name = 'push_dispatch_secret' then decrypted_secret end)
    from vault.decrypted_secrets
    where name in ('push_dispatch_url', 'push_dispatch_secret')
  $q$ into v_url, v_secret;

  if v_url is null or v_secret is null then
    raise notice 'push retry skipped: push_dispatch_url/push_dispatch_secret not set in Vault';
    return false;
  end if;

  execute format(
    'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
    v_url,
    jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    jsonb_build_object('mode', 'retry', 'limit', v_limit)
  );
  return true;
end;
$$;

revoke execute on function app.dispatch_push_retries(integer)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.ensure_scheduled_jobs — declare the schedule.
--
-- Returns a jsonb report of what was scheduled or skipped, so an operator (and
-- the runbook) can see the outcome rather than guessing.
-- ---------------------------------------------------------------------------
create or replace function app.ensure_scheduled_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_jobs   jsonb := '[]'::jsonb;
  v_job    record;
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice 'pg_cron is not installed: no jobs scheduled. Enable it, then run select app.ensure_scheduled_jobs();';
    return jsonb_build_object('scheduled', false, 'reason', 'pg_cron_not_installed');
  end if;

  for v_job in
    select *
    from (values
      -- name, cron schedule, command
      ('dizkarte-expire-stale-checkouts', '*/15 * * * *',
       'select public.expire_stale_payment_pending(60);'),
      ('dizkarte-review-reminders', '15 * * * *',
       'select public.emit_review_reminders(500);'),
      ('dizkarte-completion-sweep', '35 * * * *',
       'select public.sweep_stale_completion_requests(500);'),
      ('dizkarte-push-retry', '*/10 * * * *',
       'select app.dispatch_push_retries(100);')
    ) as j(name, schedule, command)
  loop
    -- Unschedule first so a changed cadence replaces the old entry instead of
    -- depending on pg_cron's upsert-by-name behaviour across versions.
    begin
      execute format('select cron.unschedule(%L)', v_job.name);
    exception when others then
      null; -- not scheduled yet
    end;

    execute format('select cron.schedule(%L, %L, %L)', v_job.name, v_job.schedule, v_job.command);

    v_jobs := v_jobs || jsonb_build_object(
      'name', v_job.name, 'schedule', v_job.schedule, 'command', v_job.command);
  end loop;

  return jsonb_build_object('scheduled', true, 'jobs', v_jobs);
end;
$$;

revoke execute on function app.ensure_scheduled_jobs()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Apply the schedule now (no-op without pg_cron).
-- ---------------------------------------------------------------------------
do $$
declare v_result jsonb;
begin
  v_result := app.ensure_scheduled_jobs();
  raise notice 'scheduled jobs: %', v_result;
end $$;
