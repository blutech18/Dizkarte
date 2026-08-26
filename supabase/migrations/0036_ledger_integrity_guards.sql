-- 0036_ledger_integrity_guards.sql
-- Make fabricated / duplicated money movements impossible at the database
-- boundary, and give the ledger a way to correct itself without ever mutating
-- history.
--
-- WHY
-- ---
-- A booking was released twice: once by the real
-- `confirm_completion_and_release` RPC (idempotency key `rel_<booking_id>`,
-- booking-scoped) and once by an ad-hoc service-role insert that used its own
-- key and left `booking_id` null. The transaction-level invariants held (both
-- transactions balanced to zero), but the *account* invariant did not: the
-- Tasker's PROTECTED_HOLD was debited twice for a single capture, so the
-- derived balance went to -₱100.00 while TASKER_AVAILABLE was credited ₱100.00
-- that no Client ever paid. A negative derived balance then broke every screen
-- that renders it.
--
-- The existing deferred trigger only checks that each transaction sums to zero.
-- Zero-sum is not enough: money can still be conjured into a user's account as
-- long as some other account absorbs the other leg. These guards close that.
--
-- All three guards are additive and cannot invalidate existing rows:
--   * the CHECK is NOT VALID (it governs new rows; ledger history is immutable
--     and must stay exactly as it was recorded),
--   * the unique indexes are partial and NULL-tolerant,
--   * the balance trigger fires on INSERT only.

-- ---------------------------------------------------------------------------
-- 1. ADJUSTMENT transaction type.
--
-- An append-only ledger cannot delete a bad entry; it reverses it with a new,
-- audit-trailed transaction. There was no transaction type that says "this
-- corrects a previously recorded error", which is why the only apparent way to
-- clean up was to break immutability. ADJUSTMENT is that type.
-- ---------------------------------------------------------------------------
alter type ledger_transaction_type add value if not exists 'ADJUSTMENT';

-- ---------------------------------------------------------------------------
-- 2. Booking-scoped transactions must name their booking.
--
-- Only payout movements are booking-less (they settle a withdrawal, not a job).
-- Everything else moves a specific booking's money, and an unnamed booking is
-- exactly what let a duplicate release slip past `rel_<booking_id>`.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_ledger_tx_booking_scoped'
  ) then
    alter table public.ledger_transactions
      add constraint ck_ledger_tx_booking_scoped
      check (
        booking_id is not null
        or type in ('WITHDRAWAL_RESERVE', 'WITHDRAWAL_SETTLE', 'WITHDRAWAL_REVERSE', 'ADJUSTMENT')
      )
      not valid;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. One capture and one release per booking, enforced by the database rather
--    than by an idempotency-key convention a caller can choose not to follow.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_ledger_capture_per_booking
  on public.ledger_transactions (booking_id)
  where type = 'PAYMENT_CAPTURE';

create unique index if not exists uq_ledger_release_per_booking
  on public.ledger_transactions (booking_id)
  where type = 'RELEASE_TO_TASKER';

-- ---------------------------------------------------------------------------
-- 4. A user-owned balance may never go negative.
--
-- Platform accounts (owner_id null) are contra accounts: CLIENT_FUNDING,
-- PLATFORM_FEE, REFUND_CLEARING and the platform payout sink are *expected* to
-- carry negative sums as money flows through them. Only owner-held balances
-- represent money a real person can hold, and those can never be less than
-- nothing.
--
-- SECURITY DEFINER for the same reason as `app.assert_transaction_balanced`
-- (see 0033): the check runs at COMMIT as the invoking role, and ledger_entries
-- RLS would otherwise hide the very rows being validated, so the invariant
-- would silently depend on who is committing.
-- ---------------------------------------------------------------------------
create or replace function app.assert_owned_balance_not_negative()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_owner   uuid;
  v_type    ledger_account_type;
  v_balance bigint;
begin
  select la.owner_id, la.account_type
    into v_owner, v_type
  from public.ledger_accounts la
  where la.id = new.account_id;

  if v_owner is null then
    return null;
  end if;

  select coalesce(sum(amount_centavos), 0)
    into v_balance
  from public.ledger_entries
  where account_id = new.account_id;

  if v_balance < 0 then
    raise exception
      'Ledger account % (% owned by %) would end negative (balance=%). Money cannot be moved out of an account that does not hold it.',
      new.account_id, v_type, v_owner, v_balance
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

revoke all on function app.assert_owned_balance_not_negative() from public, anon, authenticated;

drop trigger if exists trg_ledger_owned_balance_not_negative on public.ledger_entries;
create constraint trigger trg_ledger_owned_balance_not_negative
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function app.assert_owned_balance_not_negative();
