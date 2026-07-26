-- 0016_admin_ops_rpcs.sql
-- Admin operations that previously had NO backing surface in the database.
--
-- 0009/0013 deliberately grant Admins a SELECT path to `profiles`, `tasks`, and
-- `categories` but no write path: there is no admin UPDATE/INSERT policy on any
-- of them. That left three Admin console capabilities (account moderation, task
-- moderation, and the service catalog) with nothing real to call.
--
-- Rather than opening broad admin RLS write policies — which cannot record who
-- changed what and why — each operation is a SECURITY DEFINER RPC following the
-- same contract as the 0013 admin commands:
--   * active-capability check via app.acting_capability (deny when null),
--   * bounded non-empty reason + idempotency key via app.assert_reasoned,
--   * row lock, idempotent replay returning the current row without a second
--     audit write,
--   * one immutable moderation_actions row + one audit_logs row per effect.
--
-- Writes still happen as the function owner, so the base tables keep their
-- deny-by-default posture for direct client writes.

-- ---------------------------------------------------------------------------
-- admin_set_account_status (Admin: support/super)
-- Suspend/ban/reinstate an account. Because app.has_active_capability() and
-- app.is_active_account() both require profiles.account_status = 'active', a
-- suspension immediately withdraws every capability-gated surface for that user
-- without touching their capability grants (so reinstatement is lossless).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_status account_status,
  p_reason text,
  p_idempotency_key text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.profiles;
  v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: account moderation requires an active support/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('active','suspended','banned') then
    raise exception 'INVALID_STATE: unsupported account status %', p_status
      using errcode = 'check_violation';
  end if;

  -- An Admin must not lock themselves out of the console.
  if p_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'VALIDATION_ERROR: an Admin cannot suspend or ban their own account.'
      using errcode = 'check_violation';
  end if;

  select * into v_row from public.profiles where id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND: profile' using errcode = 'no_data_found'; end if;

  if v_row.account_status = p_status
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'user' and ma.resource_id = p_user_id
                  and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  update public.profiles set account_status = p_status, updated_at = now()
    where id = p_user_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'user', p_user_id, 'account_status:' || p_status, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'to_status', p_status));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.user.account_status', 'user', p_user_id,
          jsonb_build_object('capability', v_cap, 'to_status', p_status,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_moderate_task (Admin: support/super)
-- Remove a task from the marketplace, or restore a previously removed task.
-- Removal is only meaningful before the task is under an active booking, so
-- states with money/commitment attached (ASSIGNED..COMPLETED) are refused;
-- those are handled through the finance freeze/dispute path instead.
-- ---------------------------------------------------------------------------
create or replace function public.admin_moderate_task(
  p_task_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key text
)
returns public.tasks
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.tasks;
  v_cap user_capability;
  v_target task_status;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: task moderation requires an active support/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('remove','restore') then
    raise exception 'INVALID_STATE: unsupported moderation action %', p_action
      using errcode = 'check_violation';
  end if;

  select * into v_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'NOT_FOUND: task' using errcode = 'no_data_found'; end if;

  if exists (select 1 from public.moderation_actions ma
             where ma.resource_type = 'task' and ma.resource_id = p_task_id
               and ma.admin_id = auth.uid()
               and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  if p_action = 'remove' then
    if v_row.status = 'REMOVED' then return v_row; end if;
    if v_row.status in ('ASSIGNED','IN_PROGRESS','COMPLETION_REQUESTED','COMPLETED','DISPUTED') then
      raise exception 'INVALID_STATE: a task with an active or completed booking cannot be removed; use the dispute/freeze path.'
        using errcode = 'check_violation';
    end if;
    v_target := 'REMOVED';
  else
    if v_row.status <> 'REMOVED' then return v_row; end if;
    -- Restore to the pre-publication-neutral open state when it was published,
    -- otherwise back to draft ownership.
    v_target := case when v_row.published_at is null then 'DRAFT' else 'OPEN' end;
  end if;

  update public.tasks set status = v_target, updated_at = now()
    where id = p_task_id returning * into v_row;

  -- Hide/restore the task's media alongside the task itself so removed content
  -- does not remain reachable through media listings.
  if p_action = 'remove' then
    update public.task_media set moderation_status = 'HIDDEN'
      where task_id = p_task_id and moderation_status <> 'HIDDEN';
  else
    update public.task_media set moderation_status = 'PENDING'
      where task_id = p_task_id and moderation_status = 'HIDDEN';
  end if;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'task', p_task_id, p_action, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'to_status', v_target));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.task.' || p_action, 'task', p_task_id,
          jsonb_build_object('capability', v_cap, 'to_status', v_target,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Service catalog (Admin: super only)
-- Categories are referenced by every task, so the catalog is deliberately
-- restricted to ADMIN_SUPER and never hard-deletes: a category is deactivated
-- (hidden from the client picker) so existing task references stay valid.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_category(
  p_name text,
  p_slug text,
  p_reason text,
  p_idempotency_key text
)
returns public.categories
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.categories;
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_name);
  v_order integer;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.has_active_capability(array['ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: catalog changes require an active super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'VALIDATION_ERROR: category name must be 1..80 characters.'
      using errcode = 'check_violation';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 80 then
    raise exception 'VALIDATION_ERROR: slug must be lowercase alphanumeric words separated by single hyphens.'
      using errcode = 'check_violation';
  end if;

  -- Idempotent replay, and a friendly conflict for a slug already in use.
  select * into v_row from public.categories where slug = v_slug;
  if found then
    if exists (select 1 from public.moderation_actions ma
               where ma.resource_type = 'category' and ma.resource_id = v_row.id
                 and ma.action = 'create' and ma.admin_id = auth.uid()
                 and ma.metadata->>'idempotency_key' = p_idempotency_key) then
      return v_row;
    end if;
    raise exception 'CONFLICT: a category with this slug already exists.'
      using errcode = 'unique_violation';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_order from public.categories;

  insert into public.categories (slug, name, active, sort_order)
  values (v_slug, v_name, true, v_order)
  returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), 'ADMIN_SUPER', 'category', v_row.id, 'create', p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'slug', v_slug, 'name', v_name));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.category.create', 'category', v_row.id,
          jsonb_build_object('capability', 'ADMIN_SUPER', 'slug', v_slug,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

create or replace function public.admin_rename_category(
  p_category_id uuid,
  p_name text,
  p_slug text,
  p_reason text,
  p_idempotency_key text
)
returns public.categories
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.categories;
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_name);
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.has_active_capability(array['ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: catalog changes require an active super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'VALIDATION_ERROR: category name must be 1..80 characters.'
      using errcode = 'check_violation';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 80 then
    raise exception 'VALIDATION_ERROR: slug must be lowercase alphanumeric words separated by single hyphens.'
      using errcode = 'check_violation';
  end if;

  select * into v_row from public.categories where id = p_category_id for update;
  if not found then raise exception 'NOT_FOUND: category' using errcode = 'no_data_found'; end if;

  if (v_row.name = v_name and v_row.slug = v_slug)
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'category' and ma.resource_id = p_category_id
                  and ma.action = 'rename' and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  if exists (select 1 from public.categories c where c.slug = v_slug and c.id <> p_category_id) then
    raise exception 'CONFLICT: a category with this slug already exists.'
      using errcode = 'unique_violation';
  end if;

  update public.categories set name = v_name, slug = v_slug
    where id = p_category_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), 'ADMIN_SUPER', 'category', p_category_id, 'rename', p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'slug', v_slug, 'name', v_name));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.category.rename', 'category', p_category_id,
          jsonb_build_object('capability', 'ADMIN_SUPER', 'slug', v_slug,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

create or replace function public.admin_set_category_active(
  p_category_id uuid,
  p_active boolean,
  p_reason text,
  p_idempotency_key text
)
returns public.categories
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.categories;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.has_active_capability(array['ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: catalog changes require an active super Admin.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.categories where id = p_category_id for update;
  if not found then raise exception 'NOT_FOUND: category' using errcode = 'no_data_found'; end if;

  if v_row.active = p_active
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'category' and ma.resource_id = p_category_id
                  and ma.action in ('activate','deactivate') and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  update public.categories set active = p_active
    where id = p_category_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), 'ADMIN_SUPER', 'category', p_category_id,
          case when p_active then 'activate' else 'deactivate' end, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'active', p_active));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.category.set_active', 'category', p_category_id,
          jsonb_build_object('capability', 'ADMIN_SUPER', 'active', p_active,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

create or replace function public.admin_reorder_category(
  p_category_id uuid,
  p_sort_order integer,
  p_reason text,
  p_idempotency_key text
)
returns public.categories
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.categories;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.has_active_capability(array['ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: catalog changes require an active super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_sort_order is null or p_sort_order < 0 or p_sort_order > 10000 then
    raise exception 'VALIDATION_ERROR: display order must be between 0 and 10000.'
      using errcode = 'check_violation';
  end if;

  select * into v_row from public.categories where id = p_category_id for update;
  if not found then raise exception 'NOT_FOUND: category' using errcode = 'no_data_found'; end if;

  if v_row.sort_order = p_sort_order
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'category' and ma.resource_id = p_category_id
                  and ma.action = 'reorder' and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  update public.categories set sort_order = p_sort_order
    where id = p_category_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), 'ADMIN_SUPER', 'category', p_category_id, 'reorder', p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'sort_order', p_sort_order));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.category.reorder', 'category', p_category_id,
          jsonb_build_object('capability', 'ADMIN_SUPER', 'sort_order', p_sort_order,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin catalog history view.
-- The Admin category detail screen shows the change history for one category.
-- moderation_actions is already Admin-readable (0009), but this view keeps the
-- console's read shape stable and omits nothing sensitive (catalog changes
-- contain no third-party PII).
-- ---------------------------------------------------------------------------
create or replace view public.admin_category_history as
select ma.id, ma.resource_id as category_id, ma.action, ma.reason,
       ma.admin_id, ma.capability, ma.created_at
from public.moderation_actions ma
where ma.resource_type = 'category'
  and app.has_active_capability(array['ADMIN_SUPER']::user_capability[]);

grant select on public.admin_category_history to authenticated;

-- Grants: callable by authenticated sessions; each re-checks capability itself.
grant execute on function public.admin_set_account_status(uuid, account_status, text, text) to authenticated;
grant execute on function public.admin_moderate_task(uuid, text, text, text) to authenticated;
grant execute on function public.admin_create_category(text, text, text, text) to authenticated;
grant execute on function public.admin_rename_category(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_set_category_active(uuid, boolean, text, text) to authenticated;
grant execute on function public.admin_reorder_category(uuid, integer, text, text) to authenticated;
