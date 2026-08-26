-- 0043_notification_producers.sql
-- Produce the two Phase 3 notifications that had no producer.
--
-- Wave 3B requires push/in-app delivery "for offers, bookings, messages, payment
-- states, REVIEW REMINDERS, and approved NEARBY ALERTS". The first four were
-- emitted by the 0020 triggers, but:
--
--   * REVIEW_REMINDER did not exist at all. `BOOKING_COMPLETED` carries a
--     one-time "leave a review" line, and after that nothing ever reminded a
--     participant, so the blind review window could expire in silence.
--   * The `nearby` PREFERENCE category was added by 0031, but no code ever wrote
--     a nearby notification — the toggle governed nothing.
--
-- Both are added here with the same discipline as 0020: `app.notify` is the only
-- insert path (so the recipient's category preference is always honoured), and
-- nothing raises into the caller's transaction.
--
-- Delivery-channel note: these two types are also mapped in
-- `packages/domain/src/adapters/push-delivery.ts` and in the `push-dispatch`
-- edge function. The three mappings must agree, or a user who muted a category
-- in-app would still receive it as a push.

-- ---------------------------------------------------------------------------
-- Preference category for the two new types.
--
-- Restated in full (rather than patched) because `app.notification_category` is
-- an immutable SQL function — there is no partial replacement.
--
-- `COMPLETION_REMINDER` is mapped here too; its producer arrives in 0044.
-- ---------------------------------------------------------------------------
create or replace function app.notification_category(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'OFFER_RECEIVED'         then 'offers'
    when 'OFFER_SELECTED'         then 'offers'
    when 'PAYMENT_CONFIRMED'      then 'payments'
    when 'PAYMENT_FAILED'         then 'payments'
    when 'BOOKING_STARTED'        then 'bookings'
    when 'COMPLETION_REQUESTED'   then 'bookings'
    when 'COMPLETION_REMINDER'    then 'bookings'
    when 'BOOKING_COMPLETED'      then 'bookings'
    when 'DISPUTE_OPENED'         then 'disputes'
    when 'REVIEW_RECEIVED'        then 'reviews'
    when 'REVIEW_REMINDER'        then 'reviews'
    when 'MESSAGE_RECEIVED'       then 'messages'
    when 'VERIFICATION_DECISION'  then 'verification'
    when 'NEARBY_TASK'            then 'nearby'
    else 'system'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Settings that govern the two producers.
--
-- Both are bounded and Admin-editable through `admin_update_setting` (0032)
-- only if that function's allow-list is extended; until then they are defaults
-- that a DB-admin can change deliberately. They are NOT policy decisions about
-- money, so no Client approval gate applies (contrast: auto-release, D13).
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, typed_value)
values ('review_reminder_after_hours', '24'::jsonb),
       ('nearby_alert_max_recipients', '200'::jsonb)
on conflict (key) do nothing;

create or replace function app.review_reminder_after_hours()
returns integer
language sql
stable
as $$
  select greatest(1, coalesce(
    (select (typed_value #>> '{}')::integer
     from public.app_settings where key = 'review_reminder_after_hours'),
    24));
$$;

create or replace function app.nearby_alert_max_recipients()
returns integer
language sql
stable
as $$
  select least(2000, greatest(1, coalesce(
    (select (typed_value #>> '{}')::integer
     from public.app_settings where key = 'nearby_alert_max_recipients'),
    200)));
$$;

revoke execute on function app.review_reminder_after_hours()
  from public, anon, authenticated, service_role;
revoke execute on function app.nearby_alert_max_recipients()
  from public, anon, authenticated, service_role;

-- ===========================================================================
-- REVIEW_REMINDER
-- ===========================================================================
--
-- Sweep, not a trigger: "the booking completed N hours ago and you still have
-- not reviewed" is a statement about elapsed time, which no row change signals.
-- Runs from the same scheduler that runs `expire_stale_payment_pending` (0027).
--
-- Guarantees:
--   * At most ONE reminder per (booking, recipient), enforced by an existence
--     check against `notifications` — so re-running the sweep, or running two
--     instances concurrently, cannot spam a user. The advisory lock makes the
--     concurrent case deterministic rather than merely unlikely.
--   * Only while the review can still be submitted: once the blind window has
--     expired a reminder would be useless (and misleading).
--   * Never to a participant who has already reviewed, and never for a booking
--     where both reviews already exist.
-- ---------------------------------------------------------------------------
create or replace function public.emit_review_reminders(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_sent  integer := 0;
  v_limit integer := least(2000, greatest(1, coalesce(p_limit, 500)));
  v_row   record;
begin
  if not pg_try_advisory_xact_lock(hashtext('emit_review_reminders')) then
    return 0;
  end if;

  for v_row in
    select b.id            as booking_id,
           b.client_id,
           b.tasker_id,
           t.title         as task_title,
           done.completed_at
    from public.bookings b
    join public.tasks t on t.id = b.task_id
    join lateral (
      select max(be.created_at) as completed_at
      from public.booking_events be
      where be.booking_id = b.id and be.to_status = 'COMPLETED'
    ) done on true
    where b.status = 'COMPLETED'
      and done.completed_at is not null
      and done.completed_at
            <= now() - make_interval(hours => app.review_reminder_after_hours())
      -- Still inside the blind window: a reminder after expiry is pointless.
      and done.completed_at
            > now() - make_interval(days => app.review_reveal_days())
      and (select count(*) from public.reviews r where r.booking_id = b.id) < 2
    order by done.completed_at
    limit v_limit
  loop
    if not exists (select 1 from public.reviews r
                   where r.booking_id = v_row.booking_id
                     and r.reviewer_id = v_row.client_id)
       and not exists (select 1 from public.notifications n
                       where n.user_id = v_row.client_id
                         and n.type = 'REVIEW_REMINDER'
                         and n.resource_id = v_row.booking_id)
    then
      perform app.notify(
        v_row.client_id,
        'REVIEW_REMINDER',
        'Review your Tasker',
        format('Your review for "%s" is still private until both sides submit.', v_row.task_title),
        'booking',
        v_row.booking_id
      );
      v_sent := v_sent + 1;
    end if;

    if not exists (select 1 from public.reviews r
                   where r.booking_id = v_row.booking_id
                     and r.reviewer_id = v_row.tasker_id)
       and not exists (select 1 from public.notifications n
                       where n.user_id = v_row.tasker_id
                         and n.type = 'REVIEW_REMINDER'
                         and n.resource_id = v_row.booking_id)
    then
      perform app.notify(
        v_row.tasker_id,
        'REVIEW_REMINDER',
        'Review your Client',
        format('Your review for "%s" is still private until both sides submit.', v_row.task_title),
        'booking',
        v_row.booking_id
      );
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

-- Service-role/scheduler only. An authenticated user has no reason to trigger a
-- fan-out, and letting them would turn a reminder into a spam primitive.
revoke execute on function public.emit_review_reminders(integer)
  from public, anon, authenticated;
grant execute on function public.emit_review_reminders(integer) to service_role;

-- ===========================================================================
-- NEARBY_TASK
-- ===========================================================================
--
-- Fires when a task becomes OPEN (publication), which is exactly the moment the
-- work becomes available to Taskers.
--
-- Recipient rule — deliberately conservative, because an alert is a push to a
-- stranger's phone:
--   * approved, non-suspended Tasker with an active account;
--   * never the task owner;
--   * declared a service area matching the task's PUBLIC locality — the city, and
--     the barangay when the Tasker named one. Locality matching, not a radius
--     query on the private point: the alert must never imply the exact address,
--     and `task_public_locations` is the approximate surface built for this.
--   * bounded fan-out (`nearby_alert_max_recipients`), so a single publication
--     cannot generate an unbounded write/push storm;
--   * one row per (task, recipient), and the user's `nearby` preference decides
--     delivery inside `app.notify` — the toggle from 0031 now governs something.
--
-- The task title is the only task detail included. No budget, no landmark, no
-- schedule: the notification is a pointer to a public task page, not a payload.
-- ---------------------------------------------------------------------------
create or replace function app.tg_notify_nearby_task()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_loc public.task_public_locations;
  v_row record;
begin
  if new.status <> 'OPEN' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'OPEN' then return new; end if;

  select * into v_loc from public.task_public_locations where task_id = new.id;
  if not found then return new; end if;

  for v_row in
    select distinct sa.user_id
    from public.service_areas sa
    join public.tasker_profiles tp on tp.user_id = sa.user_id
    join public.profiles p on p.id = sa.user_id
    where sa.city_code = v_loc.city_code
      and (sa.barangay_code is null or sa.barangay_code = v_loc.barangay_code)
      and tp.approved_at is not null
      and tp.suspended_at is null
      and p.account_status = 'active'
      and sa.user_id <> new.client_id
    order by sa.user_id
    limit app.nearby_alert_max_recipients()
  loop
    if not exists (select 1 from public.notifications n
                   where n.user_id = v_row.user_id
                     and n.type = 'NEARBY_TASK'
                     and n.resource_id = new.id)
    then
      perform app.notify(
        v_row.user_id,
        'NEARBY_TASK',
        'New task in your area',
        format('"%s" was just posted in an area you serve.', new.title),
        'task',
        new.id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_nearby_task_insert on public.tasks;
create trigger trg_notify_nearby_task_insert
  after insert on public.tasks
  for each row execute function app.tg_notify_nearby_task();

drop trigger if exists trg_notify_nearby_task_update on public.tasks;
create trigger trg_notify_nearby_task_update
  after update of status on public.tasks
  for each row execute function app.tg_notify_nearby_task();
