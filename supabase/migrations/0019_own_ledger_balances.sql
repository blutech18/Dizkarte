-- 0019_own_ledger_balances.sql
-- Expose the caller's own derived ledger balances to the app.
--
-- `app.derive_user_balances(p_user_id)` computes the pending / protected /
-- available / reserved / withdrawn projection, but it lives in schema `app`,
-- which is deliberately NOT in PostgREST's exposed schemas and carries no
-- `authenticated` EXECUTE grant. A client calling `rpc('derive_user_balances')`
-- therefore always got HTTP 404, so the Tasker Dashboard balance could never
-- load.
--
-- The fix is a `public` wrapper that takes NO arguments. Exposing the existing
-- function directly would let any authenticated user pass an arbitrary
-- `p_user_id` and read another Tasker's earnings; binding the subject to
-- `auth.uid()` inside the body makes that impossible by construction.

create or replace function public.my_ledger_balances()
returns table (
  pending_centavos   bigint,
  protected_centavos bigint,
  available_centavos bigint,
  reserved_centavos  bigint,
  withdrawn_centavos bigint
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'FORBIDDEN: authentication is required.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Subject is always the caller. There is no parameter to tamper with.
  return query select * from app.derive_user_balances(v_user);
end;
$$;

grant execute on function public.my_ledger_balances() to authenticated;
