-- 0020_notification_emission.sql
-- Actually produce the notifications the apps already read.
--
-- Before this migration the entire schema contained exactly two notification
-- inserts, both inside payment-driven RPCs. The mobile app models eleven
-- notification types; nine of them were never written, so a user's inbox stayed
-- empty no matter what happened to their tasks, offers, or bookings.
--
-- Implemented as AFTER triggers rather than by editing the existing RPCs:
--
--   * A trigger fires for every path that changes the row, including Admin
--     commands and future service-role automation, so a notification cannot be
--     missed by a code path someone forgets to update.
--   * The alternative meant redefining `process_payment_event` and
--     `confirm_completion_and_release` — long, finance-critical functions that
--     move money through the balanced ledger. Rewriting those to change a
--     notification label would be a poor risk trade.
--
-- `public.notifications` has no INSERT policy, so an authenticated user cannot
-- forge a notification. `app.notify` is SECURITY DEFINER and is the only way
-- rows are created.

-- ---------------------------------------------------------------------------
-- Allow the 'reviews' preference category.
--
-- The apps have always offered a Reviews toggle, but the original CHECK list
-- omitted it, so the upsert was rejected and the switch silently snapped back.
-- Widening the constraint is additive: every previously valid value stays valid.
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  drop constraint if exists notification_preferences_category_check;

alter table public.notification_preferences
  add constraint notification_preferences_category_check
  check (category in
    ('verification', 'offers', 'bookings', 'payments', 'messages', 'disputes', 'reviews', 'system'));

-- ---------------------------------------------------------------------------
-- Preference category for an event type.
--
-- `notification_preferences.category` is a coarse grouping the user toggles;
-- `notifications.type` is the specific event. This maps one to the other so a
-- user who mutes "offers" stops receiving both OFFER_RECEIVED and OFFER_SELECTED.
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
    when 'BOOKING_COMPLETED'      then 'bookings'
    when 'DISPUTE_OPENED'         then 'disputes'
    when 'REVIEW_RECEIVED'        then 'reviews'
    when 'MESSAGE_RECEIVED'       then 'messages'
    when 'VERIFICATION_DECISION'  then 'verification'
    else 'system'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Create one in-app notification, honouring the recipient's preference.
--
-- Silent no-ops are deliberate: a missing recipient, or a recipient who muted
-- the category, must not fail the surrounding transaction. Losing a task state
-- change because a notification could not be delivered would be the wrong
-- trade — the state change is the important part.
-- ---------------------------------------------------------------------------
create or replace function app.notify(
  p_user_id       uuid,
  p_type          text,
  p_title         text,
  p_body          text,
  p_resource_type text,
  p_resource_id   uuid
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_category text := app.notification_category(p_type);
  v_in_app   boolean;
begin
  if p_user_id is null then return; end if;

  -- Absent row means "not configured", which the table defaults to enabled.
  select np.in_app into v_in_app
  from public.notification_preferences np
  where np.user_id = p_user_id and np.category = v_category;

  if v_in_app is false then return; end if;

  insert into public.notifications
    (user_id, type, title, body, resource_type, resource_id, delivery_status)
  values
    (p_user_id, p_type, p_title, p_body, p_resource_type, p_resource_id, 'PENDING');
end;
$$;

-- ---------------------------------------------------------------------------
-- Offers: the Client learns an offer arrived; the Tasker learns they were chosen.
-- ---------------------------------------------------------------------------
create or replace function app.tg_notify_offer_received()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if not found then return new; end if;

  -- A Client offering on their own task would be notified about themselves.
  if v_task.client_id = new.tasker_id then return new; end if;

  perform app.notify(
    v_task.client_id,
    'OFFER_RECEIVED',
    'New offer received',
    format('You have a new offer on "%s".', v_task.title),
    'task',
    v_task.id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_offer_received on public.offers;
create trigger trg_notify_offer_received
  after insert on public.offers
  for each row execute function app.tg_notify_offer_received();

create or replace function app.tg_notify_offer_decided()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_task public.tasks;
begin
  if new.status = old.status then return new; end if;
  if new.status <> 'SELECTED' then return new; end if;

  select * into v_task from public.tasks where id = new.task_id;

  perform app.notify(
    new.tasker_id,
    'OFFER_SELECTED',
    'Your offer was accepted',
    format('The client chose your offer on "%s".', coalesce(v_task.title, 'a task')),
    'task',
    new.task_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_offer_decided on public.offers;
create trigger trg_notify_offer_decided
  after update of status on public.offers
  for each row execute function app.tg_notify_offer_decided();

-- ---------------------------------------------------------------------------
-- Bookings: both sides follow the work as it progresses.
-- ---------------------------------------------------------------------------
create or replace function app.tg_notify_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_title text;
begin
  if new.status = old.status then return new; end if;
  select t.title into v_title from public.tasks t where t.id = new.task_id;
  v_title := coalesce(v_title, 'your booking');

  if new.status = 'IN_PROGRESS' then
    perform app.notify(new.client_id, 'BOOKING_STARTED', 'Work has started',
      format('Your Tasker started work on "%s".', v_title), 'booking', new.id);

  elsif new.status = 'COMPLETION_REQUESTED' then
    perform app.notify(new.client_id, 'COMPLETION_REQUESTED', 'Confirm completion',
      format('Your Tasker marked "%s" as done. Please review and confirm.', v_title),
      'booking', new.id);

  elsif new.status = 'COMPLETED' then
    -- The Tasker's "funds released" notice is already emitted by
    -- confirm_completion_and_release; this closes the loop for the Client.
    perform app.notify(new.client_id, 'BOOKING_COMPLETED', 'Booking completed',
      format('"%s" is complete. Leave a review to help other clients.', v_title),
      'booking', new.id);

  elsif new.status = 'PAYMENT_FAILED' then
    perform app.notify(new.client_id, 'PAYMENT_FAILED', 'Payment failed',
      format('Payment for "%s" did not go through.', v_title), 'booking', new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_booking_status on public.bookings;
create trigger trg_notify_booking_status
  after update of status on public.bookings
  for each row execute function app.tg_notify_booking_status();

-- ---------------------------------------------------------------------------
-- Disputes: the participant who did not open it needs to know.
-- ---------------------------------------------------------------------------
create or replace function app.tg_notify_dispute_opened()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_booking public.bookings;
  v_other   uuid;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found then return new; end if;

  v_other := case when new.opened_by = v_booking.client_id
                  then v_booking.tasker_id else v_booking.client_id end;

  perform app.notify(v_other, 'DISPUTE_OPENED', 'A dispute was opened',
    'A dispute was opened on one of your bookings. Support will review it.',
    'dispute', new.id);
  return new;
end;
$$;

drop trigger if exists trg_notify_dispute_opened on public.disputes;
create trigger trg_notify_dispute_opened
  after insert on public.disputes
  for each row execute function app.tg_notify_dispute_opened();

-- ---------------------------------------------------------------------------
-- Reviews: the reviewee is told a review exists, never its contents.
--
-- Reviews are double-blind until both sides submit, so the body deliberately
-- carries no score or comment.
-- ---------------------------------------------------------------------------
create or replace function app.tg_notify_review_received()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  perform app.notify(new.reviewee_id, 'REVIEW_RECEIVED', 'You received a review',
    'A review was submitted for one of your completed bookings.',
    'review', new.id);
  return new;
end;
$$;

drop trigger if exists trg_notify_review_received on public.reviews;
create trigger trg_notify_review_received
  after insert on public.reviews
  for each row execute function app.tg_notify_review_received();

-- ---------------------------------------------------------------------------
-- Messages: every other participant of the conversation.
-- ---------------------------------------------------------------------------
create or replace function app.tg_notify_message_received()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_participant uuid;
begin
  for v_participant in
    select cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.sender_id
  loop
    perform app.notify(v_participant, 'MESSAGE_RECEIVED', 'New message',
      'You have a new message about one of your bookings.',
      'conversation', new.conversation_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notify_message_received on public.messages;
create trigger trg_notify_message_received
  after insert on public.messages
  for each row execute function app.tg_notify_message_received();

-- ---------------------------------------------------------------------------
-- Identity verification and Tasker applications: the subject learns the outcome.
--
-- The decision reason is not included: it can contain reviewer notes, and the
-- app fetches the case detail when the user opens it.
-- ---------------------------------------------------------------------------
create or replace function app.tg_notify_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status not in ('APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED') then
    return new;
  end if;

  perform app.notify(new.user_id, 'VERIFICATION_DECISION',
    case new.status
      when 'APPROVED' then 'Identity verified'
      when 'REJECTED' then 'Identity verification rejected'
      else 'More information needed'
    end,
    case new.status
      when 'APPROVED' then 'Your identity is verified. You can now post tasks.'
      when 'REJECTED' then 'Your identity verification was not approved. Open the app for details.'
      else 'Please resubmit your identity documents.'
    end,
    null::text, null::uuid);
  return new;
end;
$$;

drop trigger if exists trg_notify_verification_decision on public.verification_cases;
create trigger trg_notify_verification_decision
  after update of status on public.verification_cases
  for each row execute function app.tg_notify_verification_decision();

create or replace function app.tg_notify_tasker_decision()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status not in ('APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED', 'SUSPENDED') then
    return new;
  end if;

  perform app.notify(new.user_id, 'VERIFICATION_DECISION',
    case new.status
      when 'APPROVED'  then 'You are an approved Tasker'
      when 'REJECTED'  then 'Tasker application not approved'
      when 'SUSPENDED' then 'Tasker access suspended'
      else 'More information needed'
    end,
    case new.status
      when 'APPROVED'  then 'You can now browse work and submit offers.'
      when 'REJECTED'  then 'Your Tasker application was not approved. Open the app for details.'
      when 'SUSPENDED' then 'Your Tasker access is suspended. Contact support for details.'
      else 'Please update and resubmit your Tasker application.'
    end,
    null::text, null::uuid);
  return new;
end;
$$;

drop trigger if exists trg_notify_tasker_decision on public.tasker_applications;
create trigger trg_notify_tasker_decision
  after update of status on public.tasker_applications
  for each row execute function app.tg_notify_tasker_decision();

-- ---------------------------------------------------------------------------
-- Grants. The helpers are invoked only from SECURITY DEFINER trigger bodies,
-- which execute as the owner, so no role needs EXECUTE. Revoking keeps a
-- client from minting notifications for another user.
-- ---------------------------------------------------------------------------
revoke execute on function app.notify(uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.notification_category(text)
  from public, anon, authenticated, service_role;
