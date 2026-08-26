-- 0033_ledger_balance_check_rls_fix.sql
-- Fix: the deferred ledger balance-check trigger must evaluate every entry in a
-- transaction, regardless of the committing role's row-level security.
--
-- app.assert_transaction_balanced() runs on a DEFERRED constraint trigger, so it
-- fires at COMMIT time in the context of the invoking role -- not inside the
-- SECURITY DEFINER RPC that posted the entries. ledger_entries has RLS that only
-- exposes entries for accounts the caller owns. When a Client calls
-- confirm_completion_and_release, both posted entries belong to the Tasker's
-- accounts, so at commit the trigger (running as the Client) sees zero visible
-- rows and wrongly raises "must have at least two entries", making it impossible
-- for any Client to release escrow to a Tasker.
--
-- Service-role paths (webhook capture/refund/payout) bypass RLS and were
-- unaffected, which is why only the client-initiated release path failed.
--
-- The integrity invariant (>= 2 entries, sum = 0) is a property of the whole
-- transaction and must never depend on caller visibility. Making the check
-- SECURITY DEFINER (owned by the table owner) evaluates it over all rows. The
-- pinned search_path prevents object-resolution hijacking.

create or replace function app.assert_transaction_balanced()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_sum bigint;
  v_count integer;
begin
  select coalesce(sum(amount_centavos), 0), count(*)
    into v_sum, v_count
  from public.ledger_entries
  where transaction_id = new.transaction_id;

  if v_count < 2 then
    raise exception 'Ledger transaction % must have at least two entries.', new.transaction_id
      using errcode = 'check_violation';
  end if;

  if v_sum <> 0 then
    raise exception 'Ledger transaction % is not balanced (sum=%).', new.transaction_id, v_sum
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;
