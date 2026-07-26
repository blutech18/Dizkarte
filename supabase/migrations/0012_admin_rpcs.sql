-- 0012_admin_rpcs.sql
-- Remaining privileged Admin commands: Tasker application decisions, refunds,
-- and dispute-driven freezes. All are SECURITY DEFINER with capability checks
-- and append audit/moderation records. Financial actions require finance/super.

-- ---------------------------------------------------------------------------
-- decide_tasker_application (Admin: support/super)
-- ---------------------------------------------------------------------------
create or replace function public.decide_tasker_application(
  p_application_id uuid,
  p_decision tasker_application_status,
  p_reason text,
  p_idempotency_key text
)
returns public.tasker_applications
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_app public.tasker_applications;
begin
  if not app.has_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: requires support/super Admin.' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('APPROVED','REJECTED','RESUBMISSION_REQUIRED','SUSPENDED') then
    raise exception 'INVALID_STATE: unsupported decision %', p_decision using errcode = 'check_violation';
  end if;

  select * into v_app from public.tasker_applications where id = p_application_id for update;
  if not found then raise exception 'NOT_FOUND: application' using errcode = 'no_data_found'; end if;
  if v_app.status = p_decision then return v_app; end if;

  update public.tasker_applications
    set status = p_decision, decided_at = now(), decided_by = auth.uid(), decision_reason = p_reason
    where id = p_application_id
    returning * into v_app;

  -- Maintain the public tasker profile approval/suspension markers.
  if p_decision = 'APPROVED' then
    insert into public.tasker_profiles (user_id, public_bio, public_experience, approved_at)
    values (v_app.user_id, v_app.bio, v_app.experience, now())
    on conflict (user_id) do update
      set approved_at = now(), suspended_at = null,
          public_bio = excluded.public_bio, public_experience = excluded.public_experience;
    -- Grant the TASKER capability (server-side only).
    insert into public.user_capabilities (user_id, capability, granted_by)
    values (v_app.user_id, 'TASKER', auth.uid())
    on conflict (user_id, capability) where (revoked_at is null) do nothing;
  elsif p_decision = 'SUSPENDED' then
    update public.tasker_profiles set suspended_at = now() where user_id = v_app.user_id;
    update public.user_capabilities set revoked_at = now(), revoked_by = auth.uid()
      where user_id = v_app.user_id and capability = 'TASKER' and revoked_at is null;
  end if;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), 'ADMIN_SUPPORT', 'tasker_application', p_application_id,
          'decide:' || p_decision, p_reason, jsonb_build_object('idempotency_key', p_idempotency_key));

  return v_app;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_refund (Admin: finance/super) — records a refund + balanced ledger entry
-- ---------------------------------------------------------------------------
create or replace function public.admin_refund(
  p_payment_intent_id uuid,
  p_amount_centavos bigint,
  p_reason text,
  p_idempotency_key text
)
returns public.refunds
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_refund public.refunds;
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_tx uuid;
  v_acc_hold uuid;
  v_acc_refund uuid;
begin
  if not app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: requires finance/super Admin.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_refund from public.refunds where idempotency_key = p_idempotency_key;
  if found then return v_refund; end if;

  select * into v_intent from public.payment_intents where id = p_payment_intent_id for update;
  if not found then raise exception 'NOT_FOUND: payment intent' using errcode = 'no_data_found'; end if;
  if v_intent.status <> 'CONFIRMED' then
    raise exception 'INVALID_STATE: only confirmed payments can be refunded.' using errcode = 'check_violation';
  end if;
  if p_amount_centavos <= 0 or p_amount_centavos > v_intent.amount_centavos then
    raise exception 'VALIDATION_ERROR: refund amount out of range.' using errcode = 'check_violation';
  end if;

  select * into v_booking from public.bookings where id = v_intent.booking_id for update;

  insert into public.refunds (payment_intent_id, amount_centavos, status, reason, idempotency_key)
  values (p_payment_intent_id, p_amount_centavos, 'PROCESSING', p_reason, p_idempotency_key)
  returning * into v_refund;

  v_acc_hold   := app.ensure_ledger_account('tasker', v_booking.tasker_id, 'PROTECTED_HOLD');
  v_acc_refund := app.ensure_ledger_account('platform', null, 'REFUND_CLEARING');

  insert into public.ledger_transactions (booking_id, type, idempotency_key, created_by, metadata)
  values (v_booking.id, 'REFUND', 'ref_' || p_idempotency_key, auth.uid(),
          jsonb_build_object('refund_id', v_refund.id))
  returning id into v_tx;

  insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
  values (v_tx, v_acc_hold, -p_amount_centavos),
         (v_tx, v_acc_refund, p_amount_centavos);

  update public.bookings set status = 'REFUNDED' where id = v_booking.id;
  update public.tasks t set status = 'CANCELLED' from public.bookings b
    where b.id = v_booking.id and t.id = b.task_id;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), 'ADMIN_FINANCE', 'payment_intent', p_payment_intent_id, 'refund', p_reason,
          jsonb_build_object('amount_centavos', p_amount_centavos, 'idempotency_key', p_idempotency_key));

  return v_refund;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_freeze (Admin: finance/super) — freezes a booking without rewriting ledger
-- ---------------------------------------------------------------------------
create or replace function public.admin_freeze(
  p_booking_id uuid, p_reason text, p_idempotency_key text
)
returns public.bookings
language plpgsql
security definer
set search_path = public, app
as $$
declare v_booking public.bookings;
begin
  if not app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: requires finance/super Admin.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND: booking' using errcode = 'no_data_found'; end if;
  if v_booking.status = 'DISPUTED' then return v_booking; end if;

  update public.bookings set status = 'DISPUTED' where id = p_booking_id returning * into v_booking;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, source, idempotency_key, metadata)
  values (p_booking_id, v_booking.status, 'DISPUTED', auth.uid(), 'admin', p_idempotency_key,
          jsonb_build_object('freeze_reason', p_reason));
  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), 'ADMIN_FINANCE', 'booking', p_booking_id, 'freeze', p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key));
  return v_booking;
end;
$$;

-- Grants: Admin commands callable by authenticated sessions (each re-checks
-- capability internally).
grant execute on function public.decide_tasker_application(uuid, tasker_application_status, text, text) to authenticated;
grant execute on function public.admin_refund(uuid, bigint, text, text) to authenticated;
grant execute on function public.admin_freeze(uuid, text, text) to authenticated;
