-- 0027_abandoned_checkout_recovery.sql
-- Recover a task whose checkout was abandoned.
--
-- select_offer creates a PAYMENT_PENDING booking, marks the chosen offer
-- SELECTED, and moves the task to BOOKING_PENDING. If the Client never pays,
-- all three stay that way forever: the task is stuck out of the OPEN feed, the
-- selected offer cannot be re-selected (select_offer requires SUBMITTED), and
-- the one-active-booking index blocks any new selection. The Client has no way
-- back. This is entirely local state — no payment provider is involved in
-- undoing something that never got paid — so it can and should be handled now.
--
-- Recovery releases the booking (CANCELLED), fails its unconfirmed intent,
-- returns the offer to SUBMITTED so the same Tasker can be chosen again, and
-- reopens the task. Two entry points share one helper: the Client can abandon
-- their own checkout immediately, and a scheduled job can sweep stale ones.

-- ---------------------------------------------------------------------------
-- Internal: release one unpaid booking. Never exposed; called only by the
-- SECURITY DEFINER entry points below, which own the authorization decision.
--
-- Locks the booking and re-checks that it is still PAYMENT_PENDING with an
-- unconfirmed intent, so it can never race a payment confirmation: both this
-- and process_payment_event take `for update` on the booking, and whichever
-- commits first wins. Returns true when it acted.
-- ---------------------------------------------------------------------------
create or replace function app.release_unpaid_booking(p_booking_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_booking public.bookings;
  v_intent public.payment_intents;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then return false; end if;
  if v_booking.status <> 'PAYMENT_PENDING' then return false; end if;

  -- Defensive: if the intent is already CONFIRMED, a payment landed and this
  -- booking must not be cancelled.
  select * into v_intent from public.payment_intents
    where booking_id = p_booking_id order by created_at desc limit 1 for update;
  if found and v_intent.status = 'CONFIRMED' then return false; end if;

  update public.bookings set status = 'CANCELLED' where id = p_booking_id;

  if found then
    update public.payment_intents set status = 'FAILED', updated_at = now()
      where id = v_intent.id and status <> 'CONFIRMED';
  end if;

  -- Return the chosen offer to the pool so the Tasker can be re-selected.
  update public.offers set status = 'SUBMITTED', updated_at = now()
    where id = v_booking.accepted_offer_id and status = 'SELECTED';

  -- Reopen the task only if it is still parked on this booking.
  update public.tasks set status = 'OPEN'
    where id = v_booking.task_id and status = 'BOOKING_PENDING';

  insert into public.booking_events (booking_id, from_status, to_status, source, idempotency_key, metadata)
  values (p_booking_id, 'PAYMENT_PENDING', 'CANCELLED', 'system',
          'release_' || p_booking_id::text,
          jsonb_build_object('reason', p_reason))
  on conflict (booking_id, idempotency_key) do nothing;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_unpaid_booking (Client): abandon your own unpaid checkout.
--
-- Lets the Client back out of a booking they never paid for and either re-pay
-- (by selecting again) or choose a different Tasker. Idempotent: cancelling an
-- already-cancelled booking returns it without error.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_unpaid_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'NOT_FOUND: booking %', p_booking_id using errcode = 'no_data_found';
  end if;
  if v_booking.client_id <> auth.uid() then
    raise exception 'FORBIDDEN: only the booking owner may cancel it.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status = 'CANCELLED' then
    return v_booking; -- idempotent
  end if;
  if v_booking.status <> 'PAYMENT_PENDING' then
    raise exception 'INVALID_STATE: only an unpaid booking can be cancelled here.'
      using errcode = 'check_violation';
  end if;

  perform app.release_unpaid_booking(p_booking_id, 'client_abandoned');

  select * into v_booking from public.bookings where id = p_booking_id;
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- expire_stale_payment_pending (SERVER ONLY): sweep abandoned checkouts.
--
-- For a scheduled job (e.g. pg_cron or an external scheduler). Releases every
-- PAYMENT_PENDING booking older than the given age whose payment never
-- confirmed. Returns how many were released. Service-role only: it acts across
-- all users and must not be callable from a client session.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_payment_pending(p_older_than_minutes integer)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
  v_count integer := 0;
  v_cutoff timestamptz := now() - make_interval(mins => greatest(coalesce(p_older_than_minutes, 60), 1));
begin
  for v_id in
    select b.id from public.bookings b
    where b.status = 'PAYMENT_PENDING' and b.created_at < v_cutoff
    order by b.created_at
  loop
    if app.release_unpaid_booking(v_id, 'expired_unpaid') then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.cancel_unpaid_booking(uuid) to authenticated;

revoke execute on function public.expire_stale_payment_pending(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.expire_stale_payment_pending(integer) to service_role;

revoke execute on function app.release_unpaid_booking(uuid, text)
  from public, anon, authenticated, service_role;
