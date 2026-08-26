-- 0032_admin_operational_settings.sql
--
-- Let a super Admin edit *operational* app settings from the console, audited.
--
-- `app_settings` (0007) is admin-readable but write-gated to privileged
-- functions; until now nothing exposed a write path, so the console Settings
-- page was read-only. This adds a single narrow, allow-listed command.
--
-- Scope is deliberately limited to OPERATIONAL settings only. Money and release
-- policy — `platform_fee_bps`, `optional_client_fee_enabled`,
-- `auto_release_enabled`, and the like — are Client-owned decisions (decision
-- register D3/D5/D13) and are intentionally NOT editable here; the RPC rejects
-- any key outside its allow-list. Today the only operator-editable setting is
-- `review_reveal_days` (the blind-review reveal window).
--
-- Settings are not a uuid-keyed moderated resource, so the change is recorded in
-- `audit_logs` (nullable `resource_id`) rather than `moderation_actions` (whose
-- `resource_id` is `uuid not null`).

create or replace function public.admin_update_setting(
  p_key             text,
  p_value           integer,
  p_reason          text,
  p_idempotency_key text
)
returns public.app_settings
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row    public.app_settings;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not app.has_active_capability(array['ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: settings changes require an active super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_reason = '' then
    raise exception 'VALIDATION_ERROR: a reason is required.'
      using errcode = 'check_violation';
  end if;

  -- Allow-list. Only operational settings may be edited from the console; every
  -- other key (including all money/release policy) is refused.
  if p_key = 'review_reveal_days' then
    if p_value is null or p_value < 1 or p_value > 90 then
      raise exception 'VALIDATION_ERROR: review reveal days must be between 1 and 90.'
        using errcode = 'check_violation';
    end if;
  else
    raise exception 'FORBIDDEN: "%" is not an operator-editable setting.', p_key
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotency: an already-recorded change returns the current row unchanged.
  if exists (
    select 1 from public.audit_logs
    where action = 'admin.setting.update'
      and safe_metadata->>'idempotency_key' = p_idempotency_key
      and safe_metadata->>'key' = p_key
  ) then
    select * into v_row from public.app_settings where key = p_key;
    return v_row;
  end if;

  insert into public.app_settings (key, typed_value, updated_by, updated_at)
  values (p_key, to_jsonb(p_value), auth.uid(), now())
  on conflict (key) do update
    set typed_value = excluded.typed_value,
        updated_by  = excluded.updated_by,
        updated_at  = now()
  returning * into v_row;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.setting.update', 'app_setting', null,
          jsonb_build_object('capability', 'ADMIN_SUPER', 'key', p_key,
                             'value', p_value, 'reason', v_reason,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

grant execute on function public.admin_update_setting(text, integer, text, text) to authenticated;
