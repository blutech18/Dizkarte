-- 0040_cancel_own_task.sql
--
-- Let a Client cancel their own task before it carries any booking.
--
-- The task lifecycle (`packages/domain/src/state/task.ts`) has always allowed
-- DRAFT -> CANCELLED and OPEN -> CANCELLED, and Admins can already remove a task
-- via `admin_moderate_task` (0016). The task's own owner could not: 0009 gives
-- `public.tasks` an owner UPDATE policy for editing a draft, but the marketplace
-- had no command to retire a task, so a Client who no longer needed a job had to
-- leave it open and let Taskers keep quoting on it.
--
-- SCOPE — deliberately pre-payment only. This command refuses any state from
-- BOOKING_PENDING onward, because once an offer has been selected there is money
-- or a commitment attached and the outcome depends on the cancellation/refund
-- policy that is still an open decision (register D13). Abandoning an unpaid
-- booking already has its own narrow path (`cancel_unpaid_booking`, 0027), and
-- anything further belongs to the dispute/refund flow. Nothing here invents a
-- penalty, a fee, or a refund.
--
-- A broad owner UPDATE of `status` would be the wrong fix: it would let a Client
-- move a task into any state, including ones that imply payment. This is a
-- narrow SECURITY DEFINER command that can only ever move DRAFT/OPEN ->
-- CANCELLED for the caller's own task, and it locks the task row first so it
-- cannot interleave with `select_offer`.

create or replace function public.cancel_own_task(
  p_task_id uuid,
  p_idempotency_key text
)
returns public.tasks
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_task  public.tasks;
  v_offer public.offers;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or char_length(p_idempotency_key) > 200 then
    raise exception 'VALIDATION_ERROR: a non-empty idempotency key (1..200 chars) is required.'
      using errcode = 'check_violation';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'NOT_FOUND: task' using errcode = 'no_data_found';
  end if;

  -- Only the owning Client may cancel, and only on an active account.
  if v_task.client_id <> auth.uid() then
    raise exception 'FORBIDDEN: only the task owner may cancel this task.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: account is not active.' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent: cancelling an already-cancelled task is a no-op success.
  if v_task.status = 'CANCELLED' then
    return v_task;
  end if;

  -- Lock the task so this cannot interleave with an offer being selected, then
  -- re-read under that lock before deciding.
  select * into v_task from public.tasks where id = p_task_id for update;

  if v_task.status = 'CANCELLED' then
    return v_task;
  end if;
  if v_task.status not in ('DRAFT', 'OPEN') then
    raise exception 'INVALID_STATE: only a draft or open task with no booking can be cancelled (current: %).', v_task.status
      using errcode = 'check_violation';
  end if;

  update public.tasks
    set status = 'CANCELLED', updated_at = now()
    where id = p_task_id
    returning * into v_task;

  -- Every still-live offer is now moot. Rejecting them keeps offer state honest
  -- (no Tasker is left believing they are still in the running) and records the
  -- transition in the offer's own history, the same way selection does.
  for v_offer in
    select * from public.offers
    where task_id = p_task_id and status = 'SUBMITTED'
    for update
  loop
    update public.offers
      set status = 'REJECTED', updated_at = now()
      where id = v_offer.id;

    insert into public.offer_events (offer_id, actor_id, event_type, metadata)
    values (v_offer.id, auth.uid(), 'rejected',
            jsonb_build_object('idempotency_key', p_idempotency_key,
                               'reason', 'task_cancelled_by_client'));

    -- Best-effort courtesy notice; app.notify already no-ops silently if the
    -- recipient muted the category, so it can never fail the cancellation.
    perform app.notify(
      v_offer.tasker_id,
      'TASK_CANCELLED',
      'A task you offered on was cancelled',
      format('The client cancelled "%s", so your offer was closed.',
             coalesce(v_task.title, 'a task')),
      'task',
      p_task_id
    );
  end loop;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'task.cancelled_by_owner', 'task', p_task_id,
          jsonb_build_object('idempotency_key', p_idempotency_key,
                             'from_status', 'DRAFT_OR_OPEN'));

  return v_task;
end;
$$;

grant execute on function public.cancel_own_task(uuid, text) to authenticated;
