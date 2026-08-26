-- 0044_completion_timeout_and_push_retry.sql
-- Two Phase 3 exit-gate cases that had no implementation: the completion
-- TIMEOUT path, and safe notification RETRY.
--
-- ===========================================================================
-- 1. Completion timeout — WITHOUT inventing a money policy
-- ===========================================================================
--
-- The exit gate says "completion and hidden-review state machines pass happy,
-- retry, timeout, and unauthorised cases". The timeout case was missing: a Tasker
-- could request completion and, if the Client simply never returned to the app,
-- the booking sat in COMPLETION_REQUESTED forever with the funds protected and
-- nobody informed.
--
-- What this migration deliberately does NOT do: auto-confirm, auto-release, or
-- otherwise move money. Automatic release is an unapproved commercial/legal
-- policy (decision D13 / blocker 11.5). Implementing it here would fabricate a
-- funds-flow rule the parties have not agreed, which is exactly the failure mode
-- the delivery plan forbids ("never hide scope behind a mock", "no invented
-- penalty, fee, or refund").
--
-- What it does instead — the honest, reversible half of the timeout case:
--   * reminds the Client while the decision is still theirs;
--   * after a longer window, ESCALATES: an immutable `booking_events` row, an
--     audit entry, and a notification to both participants telling them the
--     booking needs attention/support. The booking status does not change, so no
--     protected money moves and the Admin/dispute path stays authoritative.
--
-- Exactly-once escalation is enforced by the existing
-- `uq_booking_event_idempotency (booking_id, idempotency_key)` constraint rather
-- than by hoping the scheduler runs once.

insert into public.app_settings (key, typed_value)
values ('completion_reminder_hours', '48'::jsonb),
       ('completion_escalation_hours', '168'::jsonb),
       ('push_max_attempts', '3'::jsonb)
on conflict (key) do nothing;

create or replace function app.completion_reminder_hours()
returns integer
language sql
stable
as $$
  select greatest(1, coalesce(
    (select (typed_value #>> '{}')::integer
     from public.app_settings where key = 'completion_reminder_hours'),
    48));
$$;

create or replace function app.completion_escalation_hours()
returns integer
language sql
stable
as $$
  select greatest(2, coalesce(
    (select (typed_value #>> '{}')::integer
     from public.app_settings where key = 'completion_escalation_hours'),
    168));
$$;

create or replace function app.push_max_attempts()
returns integer
language sql
stable
as $$
  select least(10, greatest(1, coalesce(
    (select (typed_value #>> '{}')::integer
     from public.app_settings where key = 'push_max_attempts'),
    3)));
$$;

revoke execute on function app.completion_reminder_hours()
  from public, anon, authenticated, service_role;
revoke execute on function app.completion_escalation_hours()
  from public, anon, authenticated, service_role;
revoke execute on function app.push_max_attempts()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sweep_stale_completion_requests (SERVER ONLY)
--
-- Returns the number of bookings acted on. Idempotent in both halves: the
-- reminder is deduplicated per (booking, recipient) against `notifications`, and
-- the escalation against the unique booking-event idempotency key.
-- ---------------------------------------------------------------------------
create or replace function public.sweep_stale_completion_requests(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_acted integer := 0;
  v_limit integer := least(2000, greatest(1, coalesce(p_limit, 500)));
  v_row   record;
  v_escalated boolean;
begin
  if not pg_try_advisory_xact_lock(hashtext('sweep_stale_completion_requests')) then
    return 0;
  end if;

  for v_row in
    select b.id as booking_id,
           b.client_id,
           b.tasker_id,
           t.title as task_title,
           req.requested_at
    from public.bookings b
    join public.tasks t on t.id = b.task_id
    join lateral (
      select max(be.created_at) as requested_at
      from public.booking_events be
      where be.booking_id = b.id and be.to_status = 'COMPLETION_REQUESTED'
    ) req on true
    where b.status = 'COMPLETION_REQUESTED'
      and req.requested_at is not null
      and req.requested_at
            <= now() - make_interval(hours => app.completion_reminder_hours())
    order by req.requested_at
    limit v_limit
  loop
    v_escalated := v_row.requested_at
      <= now() - make_interval(hours => app.completion_escalation_hours());

    if v_escalated then
      -- Immutable, exactly-once record that this booking timed out. The unique
      -- (booking_id, idempotency_key) constraint is the guarantee; the insert is
      -- allowed to lose the race and do nothing.
      insert into public.booking_events
        (booking_id, from_status, to_status, actor_id, source, idempotency_key, metadata)
      values
        (v_row.booking_id, 'COMPLETION_REQUESTED', 'COMPLETION_REQUESTED', null, 'system',
         'completion-timeout:' || v_row.booking_id::text,
         jsonb_build_object(
           'reason', 'completion_confirmation_timeout',
           'requested_at', v_row.requested_at,
           'escalation_hours', app.completion_escalation_hours(),
           -- Stated in the record itself so nobody later reads this event as an
           -- automatic release having happened.
           'funds_moved', false,
           'auto_release_policy', 'not_approved'))
      on conflict (booking_id, idempotency_key) do nothing;

      if not found then
        -- Already escalated on an earlier sweep: nothing more to do or say.
        continue;
      end if;

      insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
      values (null, 'booking.completion.timeout', 'booking', v_row.booking_id,
              jsonb_build_object('requested_at', v_row.requested_at, 'funds_moved', false));

      perform app.notify(
        v_row.client_id,
        'COMPLETION_REMINDER',
        'Action needed on your booking',
        format('"%s" has been waiting for your confirmation. Confirm the work, or open a dispute if something is wrong.',
               v_row.task_title),
        'booking',
        v_row.booking_id);

      perform app.notify(
        v_row.tasker_id,
        'COMPLETION_REMINDER',
        'Your completion request is still waiting',
        format('"%s" has not been confirmed yet. Support can help if the Client does not respond.',
               v_row.task_title),
        'booking',
        v_row.booking_id);

      v_acted := v_acted + 1;
    else
      -- First reminder: the Client still owns the decision, so only they hear.
      if not exists (select 1 from public.notifications n
                     where n.user_id = v_row.client_id
                       and n.type = 'COMPLETION_REMINDER'
                       and n.resource_id = v_row.booking_id)
      then
        perform app.notify(
          v_row.client_id,
          'COMPLETION_REMINDER',
          'Confirm completed work',
          format('%s marked "%s" as finished. Confirm to release the protected payment.',
                 'Your Tasker', v_row.task_title),
          'booking',
          v_row.booking_id);
        v_acted := v_acted + 1;
      end if;
    end if;
  end loop;

  return v_acted;
end;
$$;

revoke execute on function public.sweep_stale_completion_requests(integer)
  from public, anon, authenticated;
grant execute on function public.sweep_stale_completion_requests(integer) to service_role;

-- ===========================================================================
-- 2. Safe push retry
-- ===========================================================================
--
-- `push-dispatch` wrote `delivery_status = 'FAILED'` and stopped. A transient
-- failure (Expo 5xx, a dropped connection, a cold start timing out) therefore
-- lost the push permanently, even though the in-app row survived.
--
-- Retry is bounded and recorded, not open-ended:
--   * `delivery_attempts` counts real send attempts;
--   * `next_attempt_at` is exponential backoff (2, 4, 8, ... minutes, capped at
--     an hour) so a provider outage is not hammered;
--   * once `delivery_attempts >= push_max_attempts` the row becomes terminal
--     (`next_attempt_at = null`) and is never picked up again — a failed push is
--     allowed to stay failed. The in-app notification is the durable channel;
--     push is best-effort by design.
--   * `delivery_error` stores a short, provider-supplied reason only. Bounded by
--     CHECK so an error blob cannot become a log-sized column, and never a token
--     or credential.
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists next_attempt_at   timestamptz,
  add column if not exists delivery_error    text;

alter table public.notifications
  drop constraint if exists chk_notification_delivery_error;
alter table public.notifications
  add constraint chk_notification_delivery_error
  check (delivery_error is null or char_length(delivery_error) <= 300);

alter table public.notifications
  drop constraint if exists chk_notification_delivery_attempts;
alter table public.notifications
  add constraint chk_notification_delivery_attempts
  check (delivery_attempts >= 0 and delivery_attempts <= 20);

-- Partial index: the retry sweep only ever looks at due failures.
create index if not exists ix_notifications_push_retry
  on public.notifications (next_attempt_at)
  where delivery_status = 'FAILED' and next_attempt_at is not null;

-- ---------------------------------------------------------------------------
-- record_push_delivery (SERVER ONLY) — the only writer of delivery bookkeeping.
--
-- Keeping the backoff/terminal decision in the database (rather than in the edge
-- function) means a second dispatcher, a manual replay, or a future provider
-- cannot disagree about when a notification may be retried.
-- ---------------------------------------------------------------------------
create or replace function public.record_push_delivery(
  p_notification_id uuid,
  p_outcome text,
  p_error text default null
)
returns public.notifications
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.notifications;
  v_attempts integer;
  v_max integer := app.push_max_attempts();
  v_backoff_minutes integer;
begin
  if p_outcome not in ('SENT', 'FAILED', 'SUPPRESSED') then
    raise exception 'VALIDATION_ERROR: unsupported push outcome %', p_outcome
      using errcode = 'check_violation';
  end if;

  select * into v_row from public.notifications where id = p_notification_id for update;
  if not found then
    raise exception 'NOT_FOUND: notification %', p_notification_id using errcode = 'no_data_found';
  end if;

  if p_outcome = 'FAILED' then
    v_attempts := v_row.delivery_attempts + 1;
    -- 2, 4, 8, 16, 32, 60, 60 ... minutes.
    v_backoff_minutes := least(60, power(2, least(v_attempts, 6))::integer);
    update public.notifications
       set delivery_status   = 'FAILED',
           delivery_attempts = v_attempts,
           delivery_error    = left(coalesce(p_error, 'unspecified provider failure'), 300),
           next_attempt_at   = case
             when v_attempts >= v_max then null
             else now() + make_interval(mins => v_backoff_minutes)
           end
     where id = p_notification_id
    returning * into v_row;
  else
    update public.notifications
       set delivery_status   = p_outcome::notification_delivery_status,
           delivery_attempts = v_row.delivery_attempts
             + case when p_outcome = 'SENT' then 1 else 0 end,
           delivery_error    = null,
           next_attempt_at   = null
     where id = p_notification_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke execute on function public.record_push_delivery(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_push_delivery(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- due_push_retries (SERVER ONLY) — what the dispatcher should try again.
--
-- Read-only: claiming/marking happens through `record_push_delivery` once the
-- attempt has actually been made, so a dispatcher that dies mid-run leaves the
-- row retryable rather than silently consumed.
-- ---------------------------------------------------------------------------
create or replace function public.due_push_retries(p_limit integer default 100)
returns table (
  id uuid,
  user_id uuid,
  type text,
  title text,
  body text,
  resource_type text,
  resource_id uuid,
  delivery_attempts integer
)
language sql
security definer
set search_path = public, app
as $$
  select n.id, n.user_id, n.type, n.title, n.body,
         n.resource_type, n.resource_id, n.delivery_attempts
  from public.notifications n
  where n.delivery_status = 'FAILED'
    and n.next_attempt_at is not null
    and n.next_attempt_at <= now()
    and n.delivery_attempts < app.push_max_attempts()
  order by n.next_attempt_at
  limit least(500, greatest(1, coalesce(p_limit, 100)));
$$;

revoke execute on function public.due_push_retries(integer)
  from public, anon, authenticated;
grant execute on function public.due_push_retries(integer) to service_role;
