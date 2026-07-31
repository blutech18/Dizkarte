-- 0025_media_moderation.sql
-- Let an Admin act on a single photo instead of the whole task.
--
-- `task_media.moderation_status` has existed since 0004 with four states, but the
-- only thing that ever wrote it was `admin_moderate_task` (0016), which flips
-- every row for a task at once. So a task with nine acceptable photos and one
-- inappropriate photo had exactly two outcomes: leave the bad photo published,
-- or remove the entire task and the Client's work with it. Neither is a
-- proportionate moderation response.
--
-- Only APPROVED and HIDDEN are reachable here. REJECTED exists in the enum but
-- is indistinguishable from HIDDEN in behaviour and would only create ambiguity
-- about which state means "not visible"; PENDING is the insert default and is
-- not something an Admin needs to set back.

-- ---------------------------------------------------------------------------
-- Media moderation queue.
--
-- Capability predicate lives in the view, matching the 0013 queue pattern: a
-- non-Admin session selecting from it gets zero rows rather than depending on a
-- grant being withheld.
--
-- `storage_path` is exposed because moderating an image requires fetching it,
-- and the only way to do that is `admin_authorize_object_read` plus a signed
-- URL, which needs the key. The bucket stays private throughout.
-- ---------------------------------------------------------------------------
create or replace view public.admin_task_media_queue as
select tm.id,
       tm.task_id,
       t.title as task_title,
       t.status as task_status,
       t.client_id,
       tm.storage_path,
       tm.kind,
       tm.moderation_status,
       tm.sort_order,
       tm.created_at
from public.task_media tm
join public.tasks t on t.id = tm.task_id
where app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);

grant select on public.admin_task_media_queue to authenticated;

-- ---------------------------------------------------------------------------
-- admin_moderate_task_media (Admin: support/super)
--
-- Same contract as the other 0016 admin commands: active capability, bounded
-- reason plus idempotency key, row lock, and a replay that returns the current
-- row without a second audit write.
-- ---------------------------------------------------------------------------
create or replace function public.admin_moderate_task_media(
  p_media_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key text
)
returns public.task_media
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.task_media;
  v_cap user_capability;
  v_target moderation_status;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: media moderation requires an active support/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('approve','hide') then
    raise exception 'INVALID_STATE: unsupported moderation action %', p_action
      using errcode = 'check_violation';
  end if;

  select * into v_row from public.task_media where id = p_media_id for update;
  if not found then raise exception 'NOT_FOUND: task media' using errcode = 'no_data_found'; end if;

  if exists (select 1 from public.moderation_actions ma
             where ma.resource_type = 'task_media' and ma.resource_id = p_media_id
               and ma.admin_id = auth.uid()
               and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  v_target := case when p_action = 'approve' then 'APPROVED' else 'HIDDEN' end;
  if v_row.moderation_status = v_target then return v_row; end if;

  update public.task_media set moderation_status = v_target
    where id = p_media_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'task_media', p_media_id, p_action, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key,
                             'to_status', v_target, 'task_id', v_row.task_id));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.task_media.' || p_action, 'task_media', p_media_id,
          jsonb_build_object('capability', v_cap, 'to_status', v_target,
                             'task_id', v_row.task_id,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

grant execute on function public.admin_moderate_task_media(uuid, text, text, text) to authenticated;
