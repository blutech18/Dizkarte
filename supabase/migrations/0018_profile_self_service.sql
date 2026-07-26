-- 0018_profile_self_service.sql
-- Let an approved Tasker maintain their own public trust profile.
--
-- 0009 gives `public.tasker_profiles` a SELECT policy (`using (true)`) but no
-- UPDATE policy for anyone. The public bio and experience are written once by
-- `decide_tasker_application` at approval time, copied from the application, and
-- were then frozen forever — a Tasker could never correct a typo or refresh
-- their own description.
--
-- A self-UPDATE policy on the table would be too wide: the same row also holds
-- `completion_count`, `rating_sum`, `rating_count`, `approved_at`, and
-- `suspended_at`, which are platform-authoritative trust signals a Tasker must
-- never be able to edit. This RPC therefore updates exactly the two descriptive
-- columns and nothing else, and only for a Tasker whose profile is approved and
-- not suspended.

create or replace function public.update_tasker_public_profile(
  p_public_bio text,
  p_public_experience text
)
returns public.tasker_profiles
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.tasker_profiles;
  v_bio text := btrim(coalesce(p_public_bio, ''));
  v_experience text := btrim(coalesce(p_public_experience, ''));
begin
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: account is not active.' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_active_capability(array['TASKER']::user_capability[]) then
    raise exception 'FORBIDDEN: a Tasker capability is required.'
      using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_bio) > 2000 or char_length(v_experience) > 2000 then
    raise exception 'VALIDATION_ERROR: bio and experience must each be at most 2000 characters.'
      using errcode = 'check_violation';
  end if;

  select * into v_row from public.tasker_profiles where user_id = auth.uid() for update;
  if not found then
    raise exception 'NOT_FOUND: no Tasker profile for this account.' using errcode = 'no_data_found';
  end if;
  if v_row.approved_at is null or v_row.suspended_at is not null then
    raise exception 'FORBIDDEN: only an approved, unsuspended Tasker profile can be edited.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.tasker_profiles
    set public_bio = v_bio, public_experience = v_experience
    where user_id = auth.uid()
    returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.update_tasker_public_profile(text, text) to authenticated;
