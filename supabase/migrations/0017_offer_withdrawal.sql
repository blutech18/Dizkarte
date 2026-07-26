-- 0017_offer_withdrawal.sql
-- Offer withdrawal for the Tasker who submitted it.
--
-- 0009 gives `public.offers` an INSERT policy (plus the guarded `submit_offer`
-- RPC) and a SELECT policy, but no UPDATE policy for anyone. That left the
-- Offer System with no way for a Tasker to retract an offer they had not yet
-- won, even though the `offer_status` enum has a WITHDRAWN member and the
-- mobile port exposes the action.
--
-- A broad UPDATE policy on `offers` would be the wrong fix: it would also let a
-- Tasker rewrite their amount or message after the Client had read it, and it
-- could race with `select_offer`. Instead this is a narrow SECURITY DEFINER
-- command that can only ever move SUBMITTED -> WITHDRAWN for the calling
-- Tasker's own offer, and it locks the task row first so it cannot interleave
-- with offer selection.

create or replace function public.withdraw_offer(
  p_offer_id uuid,
  p_idempotency_key text
)
returns public.offers
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_offer public.offers;
  v_task  public.tasks;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or char_length(p_idempotency_key) > 200 then
    raise exception 'VALIDATION_ERROR: a non-empty idempotency key (1..200 chars) is required.'
      using errcode = 'check_violation';
  end if;

  select * into v_offer from public.offers where id = p_offer_id;
  if not found then
    raise exception 'NOT_FOUND: offer' using errcode = 'no_data_found';
  end if;

  -- Only the submitting Tasker may withdraw, and only on an active account.
  if v_offer.tasker_id <> auth.uid() then
    raise exception 'FORBIDDEN: only the submitting Tasker may withdraw this offer.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: account is not active.' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent: withdrawing an already-withdrawn offer is a no-op success.
  if v_offer.status = 'WITHDRAWN' then
    return v_offer;
  end if;

  -- Lock the task so this cannot interleave with select_offer choosing this
  -- very offer; re-read the offer under that lock before deciding.
  select * into v_task from public.tasks where id = v_offer.task_id for update;
  select * into v_offer from public.offers where id = p_offer_id for update;

  if v_offer.status = 'WITHDRAWN' then
    return v_offer;
  end if;
  if v_offer.status <> 'SUBMITTED' then
    raise exception 'INVALID_STATE: only a submitted offer can be withdrawn (current: %).', v_offer.status
      using errcode = 'check_violation';
  end if;

  update public.offers
    set status = 'WITHDRAWN', updated_at = now()
    where id = p_offer_id
    returning * into v_offer;

  insert into public.offer_events (offer_id, actor_id, event_type, metadata)
  values (p_offer_id, auth.uid(), 'withdrawn',
          jsonb_build_object('idempotency_key', p_idempotency_key));

  return v_offer;
end;
$$;

grant execute on function public.withdraw_offer(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Coordinate-readable location views.
--
-- `task_public_locations.approximate_point` and
-- `task_private_locations.exact_point` are `geography` columns. The only view
-- that exposes them as numbers is `public_task_feed`, which is restricted to
-- OPEN tasks — so an owner editing a DRAFT (or reviewing a task that has since
-- been assigned) had no way to read back the coordinates they saved.
--
-- Both views are `security_invoker = true`, so the caller's own RLS decides
-- visibility: the public one follows `task_public_locations_select` (owner,
-- participant, admin, or any OPEN task) and the private one follows
-- `task_private_locations_select` (owner or confirmed participant only). They
-- add no new access — they only make the stored point readable as lat/lng at
-- the same precision the feed already publishes.
-- ---------------------------------------------------------------------------

create or replace view public.task_locations_readable
with (security_invoker = true)
as
select
  pl.task_id,
  pl.city_code,
  pl.barangay_code,
  pl.landmark,
  round(st_y(pl.approximate_point::geometry)::numeric, 3) as approximate_lat,
  round(st_x(pl.approximate_point::geometry)::numeric, 3) as approximate_lng
from public.task_public_locations pl;

create or replace view public.task_private_locations_readable
with (security_invoker = true)
as
select
  pv.task_id,
  pv.exact_address,
  st_y(pv.exact_point::geometry) as exact_lat,
  st_x(pv.exact_point::geometry) as exact_lng
from public.task_private_locations pv;

grant select on public.task_locations_readable to authenticated;
grant select on public.task_private_locations_readable to authenticated;
