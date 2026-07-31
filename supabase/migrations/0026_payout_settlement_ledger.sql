-- 0026_payout_settlement_ledger.sql
-- Complete the payout settlement so a successful payout leaves the ledger.
--
-- `process_payout_result('PAID')` recorded the withdrawal as PAID but posted no
-- ledger entry, on the reasoning that settlement needed the approved payout
-- provider. That left a real inconsistency that has nothing to do with any
-- provider:
--
--   * request_withdrawal moves the amount TASKER_AVAILABLE -> PAYOUT_CLEARING
--     (both owned by the tasker), so `reserved` rises.
--   * derive_user_balances computes `reserved` from PAYOUT_CLEARING and
--     `withdrawn` from withdrawals where status = 'PAID'.
--   * With no settle entry, a PAID payout is counted in BOTH: the amount stays
--     in the tasker's PAYOUT_CLEARING forever AND shows as withdrawn.
--
-- Settlement is the money physically leaving the tasker's clearing balance. The
-- balanced counterpart is the PLATFORM's PAYOUT_CLEARING account (owner_id
-- null) — the funds have moved from "this tasker's payout in flight" to "the
-- platform has dispatched it". Because derive_user_balances only sums entries
-- owned by the tasker, the platform-side leg is correctly excluded from every
-- user balance, so `reserved` drops to zero once a payout settles while
-- `withdrawn` (from status) continues to reflect it. No new account type or
-- enum value is needed: WITHDRAWAL_SETTLE already exists in
-- ledger_transaction_type, and this uses the existing PAYOUT_CLEARING type on
-- two different owners.
--
-- This does NOT fabricate a provider payout. `process_payout_result` is still
-- service-role only and is only ever called after a provider confirms the
-- payout succeeded; this migration only makes the ledger effect of that
-- confirmation correct and complete.

create or replace function public.process_payout_result(
  p_withdrawal_id uuid,
  p_result text,
  p_provider_reference text,
  p_failure_reason text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_w public.withdrawals;
  v_tx uuid;
  v_acc_avail uuid;
  v_acc_clearing uuid;
  v_acc_settled uuid;
begin
  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'NOT_FOUND: withdrawal' using errcode = 'no_data_found'; end if;

  if p_result = 'PAID' then
    if v_w.status = 'PAID' then return v_w; end if;
    if v_w.status not in ('RESERVED','PROCESSING') then
      raise exception 'INVALID_STATE: withdrawal not settleable in state %.', v_w.status
        using errcode = 'check_violation';
    end if;

    -- Discharge the reservation: the reserved amount leaves the tasker's
    -- payout-clearing for the platform's, so it stops counting as the tasker's
    -- reserved balance. Exactly-once via a settle-specific idempotency key,
    -- independent of the reverse key so a later reversal cannot collide.
    v_acc_clearing := app.ensure_ledger_account('tasker', v_w.tasker_id, 'PAYOUT_CLEARING');
    v_acc_settled  := app.ensure_ledger_account('platform', null, 'PAYOUT_CLEARING');

    insert into public.ledger_transactions (type, idempotency_key, metadata)
    values ('WITHDRAWAL_SETTLE', 'wsettle_' || v_w.id::text,
            jsonb_build_object('withdrawal_id', v_w.id, 'provider_reference', p_provider_reference))
    returning id into v_tx;

    insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
    values (v_tx, v_acc_clearing, -v_w.amount_centavos),
           (v_tx, v_acc_settled, v_w.amount_centavos);

    update public.withdrawals set status = 'PAID', provider_reference = p_provider_reference, updated_at = now()
      where id = p_withdrawal_id returning * into v_w;
    return v_w;

  elsif p_result = 'FAILED' then
    if v_w.status in ('FAILED','CANCELLED') then return v_w; end if; -- idempotent
    if v_w.status not in ('RESERVED','PROCESSING') then
      raise exception 'INVALID_STATE: withdrawal not reversible in state %.', v_w.status
        using errcode = 'check_violation';
    end if;

    v_acc_avail    := app.ensure_ledger_account('tasker', v_w.tasker_id, 'TASKER_AVAILABLE');
    v_acc_clearing := app.ensure_ledger_account('tasker', v_w.tasker_id, 'PAYOUT_CLEARING');

    -- Exactly-once via unique ledger idempotency key tied to the withdrawal.
    insert into public.ledger_transactions (type, idempotency_key, metadata)
    values ('WITHDRAWAL_REVERSE', 'wrev_' || v_w.id::text,
            jsonb_build_object('withdrawal_id', v_w.id))
    returning id into v_tx;

    insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
    values (v_tx, v_acc_clearing, -v_w.amount_centavos),
           (v_tx, v_acc_avail, v_w.amount_centavos);

    update public.withdrawals set status = 'FAILED', failure_reason = p_failure_reason, updated_at = now()
      where id = p_withdrawal_id returning * into v_w;
    return v_w;
  else
    raise exception 'VALIDATION_ERROR: unsupported payout result %.', p_result using errcode = 'check_violation';
  end if;
exception
  when unique_violation then
    select * into v_w from public.withdrawals where id = p_withdrawal_id;
    return v_w;
end;
$$;

-- Unchanged from 0013, restated so the grant travels with the redefinition:
-- settlement is provider-authoritative and server-only.
revoke execute on function public.process_payout_result(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.process_payout_result(uuid, text, text, text)
  to service_role;
