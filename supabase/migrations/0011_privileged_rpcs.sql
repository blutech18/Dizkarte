-- 0011_privileged_rpcs.sql
-- Transactional, idempotent SECURITY DEFINER commands for privileged workflows.
-- Each function runs as the table owner (bypassing RLS) and therefore re-checks
-- authorization explicitly using auth.uid(). Server-only functions have their
-- execute grant restricted to service_role.

-- ---------------------------------------------------------------------------
-- Ledger account bootstrap
-- ---------------------------------------------------------------------------
create or replace function app.ensure_ledger_account(
  p_owner_type text,
  p_owner_id   uuid,
  p_account_type ledger_account_type
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.ledger_accounts
  where owner_type = p_owner_type
    and owner_id is not distinct from p_owner_id
    and account_type = p_account_type
    and currency = 'PHP';

  if v_id is null then
    insert into public.ledger_accounts (owner_type, owner_id, account_type, currency)
    values (p_owner_type, p_owner_id, p_account_type, 'PHP')
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function app.platform_fee_bps()
returns integer
language sql
stable
as $$
  select coalesce((select (typed_value #>> '{}')::integer
                   from public.app_settings where key = 'platform_fee_bps'), 0);
$$;

-- ---------------------------------------------------------------------------
-- decide_verification (Admin: support/super)
-- ---------------------------------------------------------------------------
create or replace function public.decide_verification(
  p_case_id uuid,
  p_decision verification_status,
  p_reason text,
  p_idempotency_key text
)
returns public.verification_cases
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_case public.verification_cases;
begin
  if not app.has_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: verification decision requires support/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('APPROVED','REJECTED','RESUBMISSION_REQUIRED') then
    raise exception 'INVALID_STATE: unsupported verification decision %', p_decision
      using errcode = 'check_violation';
  end if;

  select * into v_case from public.verification_cases where id = p_case_id for update;
  if not found then
    raise exception 'NOT_FOUND: verification case %', p_case_id using errcode = 'no_data_found';
  end if;

  if v_case.status = p_decision then
    return v_case; -- idempotent no-op
  end if;
  if v_case.status not in ('SUBMITTED','IN_REVIEW') then
    raise exception 'INVALID_STATE: cannot decide case in status %', v_case.status
      using errcode = 'check_violation';
  end if;

  update public.verification_cases
    set status = p_decision,
        decided_at = now(),
        decided_by = auth.uid(),
        decision_reason = p_reason
    where id = p_case_id
    returning * into v_case;

  insert into public.verification_events (case_id, from_status, to_status, actor_id, reason)
  values (p_case_id, null, p_decision, auth.uid(), p_reason);

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(),
          (case when app.has_capability(array['ADMIN_SUPER']::user_capability[]) then 'ADMIN_SUPER' else 'ADMIN_SUPPORT' end)::user_capability,
          'verification_case', p_case_id, 'decide:' || p_decision, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key));

  return v_case;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_offer (approved, verified, active Tasker only)
-- ---------------------------------------------------------------------------
create or replace function public.submit_offer(
  p_task_id uuid,
  p_amount_centavos bigint,
  p_message text,
  p_eta_text text,
  p_availability_text text,
  p_experience_text text
)
returns public.offers
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_offer public.offers;
  v_task public.tasks;
begin
  if not app.has_capability(array['TASKER']::user_capability[]) then
    raise exception 'FORBIDDEN: only approved Taskers may submit offers.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.tasker_profiles tp
    where tp.user_id = auth.uid() and tp.approved_at is not null and tp.suspended_at is null
  ) then
    raise exception 'FORBIDDEN: Tasker is not approved or is suspended.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.verification_cases vc
                 where vc.user_id = auth.uid() and vc.status = 'APPROVED') then
    raise exception 'FORBIDDEN: identity verification is required.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found or v_task.status <> 'OPEN' then
    raise exception 'INVALID_STATE: task is not open for offers.' using errcode = 'check_violation';
  end if;
  if v_task.client_id = auth.uid() then
    raise exception 'FORBIDDEN: cannot offer on your own task.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.offers (task_id, tasker_id, amount_centavos, currency, message,
                             eta_text, availability_text, experience_text, status)
  values (p_task_id, auth.uid(), p_amount_centavos, 'PHP', p_message,
          p_eta_text, p_availability_text, p_experience_text, 'SUBMITTED')
  on conflict (task_id, tasker_id) do update
    set amount_centavos = excluded.amount_centavos,
        message = excluded.message,
        eta_text = excluded.eta_text,
        availability_text = excluded.availability_text,
        experience_text = excluded.experience_text,
        status = 'SUBMITTED',
        updated_at = now()
  returning * into v_offer;

  insert into public.offer_events (offer_id, actor_id, event_type)
  values (v_offer.id, auth.uid(), 'submitted');

  return v_offer;
end;
$$;

-- ---------------------------------------------------------------------------
-- publish_task (verified Client owner only)
-- ---------------------------------------------------------------------------
create or replace function public.publish_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'NOT_FOUND: task %', p_task_id using errcode = 'no_data_found';
  end if;
  if v_task.client_id <> auth.uid() then
    raise exception 'FORBIDDEN: only the task owner may publish.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.verification_cases vc
                 where vc.user_id = auth.uid() and vc.status = 'APPROVED') then
    raise exception 'FORBIDDEN: identity verification is required to publish.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_task.status <> 'DRAFT' then
    raise exception 'INVALID_STATE: only draft tasks can be published.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.task_public_locations where task_id = p_task_id)
     or not exists (select 1 from public.task_private_locations where task_id = p_task_id) then
    raise exception 'VALIDATION_ERROR: task requires public and private location.' using errcode = 'check_violation';
  end if;

  update public.tasks set status = 'OPEN', published_at = now()
    where id = p_task_id returning * into v_task;
  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- select_offer (task owner) — transactional, one active booking, idempotent
-- ---------------------------------------------------------------------------
create or replace function public.select_offer(
  p_task_id uuid,
  p_offer_id uuid,
  p_idempotency_key text
)
returns public.bookings
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_task public.tasks;
  v_offer public.offers;
  v_booking public.bookings;
begin
  -- Idempotency: return the existing booking for this key.
  select * into v_booking from public.bookings where idempotency_key = p_idempotency_key;
  if found then
    return v_booking;
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'NOT_FOUND: task %', p_task_id using errcode = 'no_data_found';
  end if;
  if v_task.client_id <> auth.uid() then
    raise exception 'FORBIDDEN: only the task owner may select an offer.' using errcode = 'insufficient_privilege';
  end if;
  if v_task.status <> 'OPEN' then
    raise exception 'INVALID_STATE: task is not open for selection.' using errcode = 'check_violation';
  end if;

  select * into v_offer from public.offers where id = p_offer_id and task_id = p_task_id for update;
  if not found then
    raise exception 'NOT_FOUND: offer % on task', p_offer_id using errcode = 'no_data_found';
  end if;
  if v_offer.status <> 'SUBMITTED' then
    raise exception 'INVALID_STATE: offer is not selectable.' using errcode = 'check_violation';
  end if;

  -- Create the single PAYMENT_PENDING booking. The partial unique index
  -- uq_booking_active_per_task guarantees at most one active booking per task.
  insert into public.bookings (task_id, accepted_offer_id, client_id, tasker_id,
                               agreed_centavos, currency, status, idempotency_key)
  values (p_task_id, p_offer_id, v_task.client_id, v_offer.tasker_id,
          v_offer.amount_centavos, 'PHP', 'PAYMENT_PENDING', p_idempotency_key)
  returning * into v_booking;

  update public.offers set status = 'SELECTED', updated_at = now() where id = p_offer_id;
  update public.tasks set status = 'BOOKING_PENDING' where id = p_task_id;

  insert into public.payment_intents (booking_id, provider, amount_centavos, currency, status, idempotency_key)
  values (v_booking.id, 'pending-selection', v_offer.amount_centavos, 'PHP', 'CREATED',
          'pi_' || p_idempotency_key);

  insert into public.booking_events (booking_id, from_status, to_status, actor_id, source, idempotency_key, metadata)
  values (v_booking.id, null, 'PAYMENT_PENDING', auth.uid(), 'client', p_idempotency_key,
          jsonb_build_object('offer_id', p_offer_id));

  return v_booking;
exception
  when unique_violation then
    -- Concurrent selection lost the race; surface as a conflict.
    raise exception 'CONFLICT: this task already has an active booking.' using errcode = 'unique_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- process_payment_event (SERVER ONLY) — authoritative payment confirmation.
-- Records the provider event (replay-safe), and on confirmation moves the
-- booking to CONFIRMED and posts a balanced PAYMENT_CAPTURE ledger transaction.
-- ---------------------------------------------------------------------------
create or replace function public.process_payment_event(
  p_provider text,
  p_external_event_id text,
  p_type text,
  p_provider_reference text,
  p_amount_centavos bigint,
  p_currency text,
  p_signature_valid boolean,
  p_payload_hash text
)
returns public.provider_events
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_event public.provider_events;
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_fee bigint;
  v_net bigint;
  v_tx uuid;
  v_acc_funding uuid;
  v_acc_hold uuid;
  v_acc_fee uuid;
begin
  -- Replay protection: unique (provider, external_event_id).
  begin
    insert into public.provider_events (provider, external_event_id, event_type, provider_reference,
      amount_centavos, currency, signature_valid, payload_hash, processing_status)
    values (p_provider, p_external_event_id, p_type, p_provider_reference,
      p_amount_centavos, p_currency, p_signature_valid, p_payload_hash,
      -- CASE resolves its unknown-type literals to `text`, and there is no
      -- implicit text->enum cast, so the enum column assignment must be cast
      -- explicitly (a bare literal would coerce, but a CASE result does not).
      (case when p_signature_valid then 'RECEIVED' else 'QUARANTINED' end)::provider_event_status)
    returning * into v_event;
  exception when unique_violation then
    select * into v_event from public.provider_events
      where provider = p_provider and external_event_id = p_external_event_id;
    -- Replay of an already-recorded event: report the delivery as DUPLICATE to
    -- the caller without re-processing (ledger idempotency keys also guard the
    -- domain effects) and without overwriting the original persisted outcome
    -- (PROCESSED/QUARANTINED), which reconciliation needs. The previous
    -- `update ... where processing_status = 'RECEIVED'` was a no-op once the
    -- first delivery had finished processing, so the returned row was stale and
    -- a replay was never reported as DUPLICATE. Set it in-memory instead.
    v_event.processing_status := 'DUPLICATE';
    return v_event;
  end;

  -- Invalid signature or currency: quarantine and stop (invalid events create
  -- zero domain effects).
  if not p_signature_valid or p_currency <> 'PHP' then
    update public.provider_events set processing_status = 'QUARANTINED', error_code = 'INVALID_EVENT'
      where id = v_event.id returning * into v_event;
    return v_event;
  end if;

  if p_type = 'payment.confirmed' then
    select * into v_intent from public.payment_intents
      where provider_reference = p_provider_reference for update;
    if not found then
      update public.provider_events set processing_status = 'QUARANTINED', error_code = 'UNKNOWN_REFERENCE'
        where id = v_event.id returning * into v_event;
      return v_event;
    end if;
    if v_intent.amount_centavos <> p_amount_centavos then
      update public.provider_events set processing_status = 'QUARANTINED', error_code = 'AMOUNT_MISMATCH'
        where id = v_event.id returning * into v_event;
      return v_event;
    end if;

    select * into v_booking from public.bookings where id = v_intent.booking_id for update;

    -- Only act if the booking is still awaiting payment (idempotent otherwise).
    if v_booking.status = 'PAYMENT_PENDING' then
      v_fee := (v_booking.agreed_centavos * app.platform_fee_bps()) / 10000;
      v_net := v_booking.agreed_centavos - v_fee;

      v_acc_funding := app.ensure_ledger_account('platform', null, 'CLIENT_FUNDING');
      v_acc_hold    := app.ensure_ledger_account('tasker', v_booking.tasker_id, 'PROTECTED_HOLD');
      v_acc_fee     := app.ensure_ledger_account('platform', null, 'PLATFORM_FEE');

      insert into public.ledger_transactions (booking_id, type, idempotency_key, provider_event_id, metadata)
      values (v_booking.id, 'PAYMENT_CAPTURE', 'cap_' || p_external_event_id, v_event.id,
              jsonb_build_object('fee_bps', app.platform_fee_bps()))
      returning id into v_tx;

      insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
      values (v_tx, v_acc_funding, -v_booking.agreed_centavos),
             (v_tx, v_acc_hold, v_net);
      if v_fee > 0 then
        insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
        values (v_tx, v_acc_fee, v_fee);
      else
        -- Keep the transaction balanced with exactly the funding+hold pair.
        null;
      end if;

      update public.payment_intents set status = 'CONFIRMED',
             provider_reference = p_provider_reference, updated_at = now()
        where id = v_intent.id;

      update public.bookings set status = 'CONFIRMED' where id = v_booking.id;
      update public.tasks set status = 'ASSIGNED' where id = v_booking.task_id;

      insert into public.booking_events (booking_id, from_status, to_status, source, idempotency_key, metadata)
      values (v_booking.id, 'PAYMENT_PENDING', 'CONFIRMED', 'provider', p_external_event_id,
              jsonb_build_object('provider_reference', p_provider_reference));

      -- Open the conversation now that payment is authoritatively confirmed.
      insert into public.conversations (booking_id) values (v_booking.id)
        on conflict (booking_id) do nothing;
      insert into public.conversation_participants (conversation_id, user_id)
      select c.id, u.user_id
      from public.conversations c
      cross join (values (v_booking.client_id), (v_booking.tasker_id)) as u(user_id)
      where c.booking_id = v_booking.id
      on conflict do nothing;

      -- Notifications are created only after the state commits.
      insert into public.notifications (user_id, type, title, body, resource_type, resource_id)
      values (v_booking.client_id, 'payments', 'Payment confirmed', 'Your booking is confirmed.', 'booking', v_booking.id),
             (v_booking.tasker_id, 'bookings', 'You were booked', 'A client confirmed payment for your offer.', 'booking', v_booking.id);
    end if;

    update public.provider_events set processing_status = 'PROCESSED', processed_at = now()
      where id = v_event.id returning * into v_event;

  elsif p_type = 'payment.failed' then
    select * into v_intent from public.payment_intents
      where provider_reference = p_provider_reference for update;
    if found then
      update public.payment_intents set status = 'FAILED', updated_at = now() where id = v_intent.id;
      update public.bookings set status = 'PAYMENT_FAILED'
        where id = v_intent.booking_id and status = 'PAYMENT_PENDING';
      update public.tasks t set status = 'OPEN'
        from public.bookings b where b.id = v_intent.booking_id and t.id = b.task_id
          and t.status = 'BOOKING_PENDING';
    end if;
    update public.provider_events set processing_status = 'PROCESSED', processed_at = now()
      where id = v_event.id returning * into v_event;
  else
    update public.provider_events set processing_status = 'PROCESSED', processed_at = now()
      where id = v_event.id returning * into v_event;
  end if;

  return v_event;
end;
$$;

-- ---------------------------------------------------------------------------
-- request_completion (assigned Tasker) and confirm_completion_and_release (Client)
-- ---------------------------------------------------------------------------
create or replace function public.request_completion(p_booking_id uuid, p_idempotency_key text)
returns public.bookings
language plpgsql
security definer
set search_path = public, app
as $$
declare v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND: booking' using errcode = 'no_data_found'; end if;
  if v_booking.tasker_id <> auth.uid() then
    raise exception 'FORBIDDEN: only the assigned Tasker may request completion.' using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status = 'COMPLETION_REQUESTED' then return v_booking; end if;
  if v_booking.status <> 'IN_PROGRESS' then
    raise exception 'INVALID_STATE: booking must be in progress.' using errcode = 'check_violation';
  end if;

  update public.bookings set status = 'COMPLETION_REQUESTED' where id = p_booking_id returning * into v_booking;
  update public.tasks set status = 'COMPLETION_REQUESTED' where id = v_booking.task_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, source, idempotency_key)
  values (p_booking_id, 'IN_PROGRESS', 'COMPLETION_REQUESTED', auth.uid(), 'tasker', p_idempotency_key);
  return v_booking;
end;
$$;

create or replace function public.start_booking(p_booking_id uuid, p_idempotency_key text)
returns public.bookings
language plpgsql
security definer
set search_path = public, app
as $$
declare v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND: booking' using errcode = 'no_data_found'; end if;
  if v_booking.client_id <> auth.uid() and v_booking.tasker_id <> auth.uid() then
    raise exception 'FORBIDDEN: not a booking participant.' using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status = 'IN_PROGRESS' then return v_booking; end if;
  if v_booking.status <> 'CONFIRMED' then
    raise exception 'INVALID_STATE: booking must be confirmed.' using errcode = 'check_violation';
  end if;
  update public.bookings set status = 'IN_PROGRESS' where id = p_booking_id returning * into v_booking;
  update public.tasks set status = 'IN_PROGRESS' where id = v_booking.task_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, source, idempotency_key)
  values (p_booking_id, 'CONFIRMED', 'IN_PROGRESS', auth.uid(), 'system', p_idempotency_key);
  return v_booking;
end;
$$;

create or replace function public.confirm_completion_and_release(p_booking_id uuid, p_idempotency_key text)
returns public.bookings
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_booking public.bookings;
  v_fee bigint;
  v_net bigint;
  v_tx uuid;
  v_acc_hold uuid;
  v_acc_avail uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND: booking' using errcode = 'no_data_found'; end if;

  -- Only the Client may release; Taskers cannot release funds (invariant 4).
  if v_booking.client_id <> auth.uid() then
    raise exception 'FORBIDDEN: only the Client may confirm completion and release.' using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status = 'COMPLETED' then return v_booking; end if;
  if v_booking.status <> 'COMPLETION_REQUESTED' then
    raise exception 'INVALID_STATE: completion has not been requested.' using errcode = 'check_violation';
  end if;

  v_fee := (v_booking.agreed_centavos * app.platform_fee_bps()) / 10000;
  v_net := v_booking.agreed_centavos - v_fee;

  v_acc_hold  := app.ensure_ledger_account('tasker', v_booking.tasker_id, 'PROTECTED_HOLD');
  v_acc_avail := app.ensure_ledger_account('tasker', v_booking.tasker_id, 'TASKER_AVAILABLE');

  -- Idempotent: ledger idempotency key ties to the booking.
  insert into public.ledger_transactions (booking_id, type, idempotency_key, created_by)
  values (v_booking.id, 'RELEASE_TO_TASKER', 'rel_' || v_booking.id::text, auth.uid())
  returning id into v_tx;

  insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
  values (v_tx, v_acc_hold, -v_net),
         (v_tx, v_acc_avail, v_net);

  update public.bookings set status = 'COMPLETED' where id = p_booking_id returning * into v_booking;
  update public.tasks set status = 'COMPLETED' where id = v_booking.task_id;
  update public.tasker_profiles set completion_count = completion_count + 1
    where user_id = v_booking.tasker_id;

  insert into public.booking_events (booking_id, from_status, to_status, actor_id, source, idempotency_key)
  values (p_booking_id, 'COMPLETION_REQUESTED', 'COMPLETED', auth.uid(), 'client', p_idempotency_key);

  insert into public.notifications (user_id, type, title, body, resource_type, resource_id)
  values (v_booking.tasker_id, 'payments', 'Funds released', 'The client released your payment.', 'booking', v_booking.id);

  return v_booking;
exception
  when unique_violation then
    -- Release already posted; return current booking state.
    select * into v_booking from public.bookings where id = p_booking_id;
    return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- open_dispute (participant) — freezes financial activity without rewriting ledger
-- ---------------------------------------------------------------------------
create or replace function public.open_dispute(p_booking_id uuid, p_reason text, p_idempotency_key text)
returns public.disputes
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_booking public.bookings;
  v_dispute public.disputes;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND: booking' using errcode = 'no_data_found'; end if;
  if v_booking.client_id <> auth.uid() and v_booking.tasker_id <> auth.uid() then
    raise exception 'FORBIDDEN: only participants may open a dispute.' using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status not in ('CONFIRMED','IN_PROGRESS','COMPLETION_REQUESTED','COMPLETED') then
    raise exception 'INVALID_STATE: booking is not disputable.' using errcode = 'check_violation';
  end if;

  insert into public.disputes (booking_id, opened_by, status, reason)
  values (p_booking_id, auth.uid(), 'OPEN', p_reason)
  returning * into v_dispute;

  update public.bookings set status = 'DISPUTED' where id = p_booking_id;
  update public.tasks set status = 'DISPUTED' where id = v_booking.task_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, source, idempotency_key, metadata)
  values (p_booking_id, v_booking.status, 'DISPUTED', auth.uid(), 'system', p_idempotency_key,
          jsonb_build_object('dispute_id', v_dispute.id));
  return v_dispute;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_review (participant, blind) and reveal_reviews (when both exist)
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(
  p_booking_id uuid, p_score integer, p_comment text
)
returns public.reviews
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_booking public.bookings;
  v_reviewee uuid;
  v_review public.reviews;
  v_both boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'NOT_FOUND: booking' using errcode = 'no_data_found'; end if;
  if v_booking.status <> 'COMPLETED' then
    raise exception 'INVALID_STATE: reviews require a completed booking.' using errcode = 'check_violation';
  end if;
  if auth.uid() = v_booking.client_id then
    v_reviewee := v_booking.tasker_id;
  elsif auth.uid() = v_booking.tasker_id then
    v_reviewee := v_booking.client_id;
  else
    raise exception 'FORBIDDEN: only participants may review.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.reviews (booking_id, reviewer_id, reviewee_id, score, comment, status)
  values (p_booking_id, auth.uid(), v_reviewee, p_score, p_comment, 'HIDDEN')
  returning * into v_review;

  -- Reveal both when both participants have reviewed.
  select count(*) = 2 into v_both from public.reviews where booking_id = p_booking_id;
  if v_both then
    update public.reviews set status = 'REVEALED', revealed_at = now()
      where booking_id = p_booking_id and status = 'HIDDEN';
  end if;

  -- Maintain reviewee aggregate (server-controlled).
  update public.tasker_profiles
    set rating_sum = rating_sum + p_score, rating_count = rating_count + 1
    where user_id = v_reviewee;

  return v_review;
exception
  when unique_violation then
    raise exception 'CONFLICT: you have already reviewed this booking.' using errcode = 'unique_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- request_withdrawal (Tasker) — reserves against cleared available balance
-- ---------------------------------------------------------------------------
create or replace function public.request_withdrawal(
  p_payout_method_id uuid, p_amount_centavos bigint, p_idempotency_key text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_withdrawal public.withdrawals;
  v_available bigint;
  v_tx uuid;
  v_acc_avail uuid;
  v_acc_clearing uuid;
begin
  select * into v_withdrawal from public.withdrawals where idempotency_key = p_idempotency_key;
  if found then return v_withdrawal; end if;

  if not app.has_capability(array['TASKER']::user_capability[]) then
    raise exception 'FORBIDDEN: only Taskers may withdraw.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.payout_methods pm
                 where pm.id = p_payout_method_id and pm.user_id = auth.uid() and pm.status = 'active') then
    raise exception 'FORBIDDEN: payout method not found or not owned.' using errcode = 'insufficient_privilege';
  end if;

  select available_centavos into v_available from app.derive_user_balances(auth.uid());
  if p_amount_centavos <= 0 or p_amount_centavos > coalesce(v_available, 0) then
    -- Withdrawal above cleared balance creates zero provider requests.
    raise exception 'INVALID_STATE: amount exceeds available balance.' using errcode = 'check_violation';
  end if;

  insert into public.withdrawals (tasker_id, payout_method_id, amount_centavos, status, idempotency_key)
  values (auth.uid(), p_payout_method_id, p_amount_centavos, 'RESERVED', p_idempotency_key)
  returning * into v_withdrawal;

  v_acc_avail    := app.ensure_ledger_account('tasker', auth.uid(), 'TASKER_AVAILABLE');
  v_acc_clearing := app.ensure_ledger_account('tasker', auth.uid(), 'PAYOUT_CLEARING');

  insert into public.ledger_transactions (type, idempotency_key, created_by, metadata)
  values ('WITHDRAWAL_RESERVE', 'wr_' || p_idempotency_key, auth.uid(),
          jsonb_build_object('withdrawal_id', v_withdrawal.id))
  returning id into v_tx;

  insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
  values (v_tx, v_acc_avail, -p_amount_centavos),
         (v_tx, v_acc_clearing, p_amount_centavos);

  return v_withdrawal;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute-grant hardening.
-- ---------------------------------------------------------------------------
revoke execute on function public.process_payment_event(text, text, text, text, bigint, text, boolean, text) from public;
grant execute on function public.process_payment_event(text, text, text, text, bigint, text, boolean, text) to service_role;

-- User/Admin commands are callable by authenticated sessions; each function
-- enforces its own authorization internally.
grant execute on function public.decide_verification(uuid, verification_status, text, text) to authenticated;
grant execute on function public.submit_offer(uuid, bigint, text, text, text, text) to authenticated;
grant execute on function public.publish_task(uuid) to authenticated;
grant execute on function public.select_offer(uuid, uuid, text) to authenticated;
grant execute on function public.request_completion(uuid, text) to authenticated;
grant execute on function public.start_booking(uuid, text) to authenticated;
grant execute on function public.confirm_completion_and_release(uuid, text) to authenticated;
grant execute on function public.open_dispute(uuid, text, text) to authenticated;
grant execute on function public.submit_review(uuid, integer, text) to authenticated;
grant execute on function public.request_withdrawal(uuid, bigint, text) to authenticated;
