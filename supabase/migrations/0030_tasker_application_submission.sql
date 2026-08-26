-- 0030_tasker_application_submission.sql
--
-- Applicant-side Tasker onboarding was unreachable from the app. The schema for
-- Tasker applications (0003) and the Admin decision path
-- (`decide_tasker_application`, 0012) both exist, and RLS (0009) even lets a
-- user insert their own DRAFT application and write their own specialties and
-- service areas. But there was no single, atomic, server-validated entry point
-- to assemble and submit an application, so the mobile "Become a Tasker" form
-- could only fake a submission locally and nothing ever reached the Admin
-- approvals queue.
--
-- This adds `submit_tasker_application`: a SECURITY DEFINER command that derives
-- the subject from `auth.uid()`, validates the whole application, upserts the
-- caller's single active application to SUBMITTED, and atomically replaces their
-- specialty set and service area. It records only a payout *provider* preference
-- (never a raw credential), preserving the payout-token boundary invariant.

create or replace function public.submit_tasker_application(
  p_bio             text,
  p_experience      text,
  p_specialty_ids   uuid[],
  p_city_code       text,
  p_barangay_code   text,
  p_payout_provider text
)
returns public.tasker_applications
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user       uuid := auth.uid();
  v_app        public.tasker_applications;
  v_bio        text := btrim(coalesce(p_bio, ''));
  v_experience text := btrim(coalesce(p_experience, ''));
  v_city       text := btrim(coalesce(p_city_code, ''));
  v_barangay   text := nullif(btrim(coalesce(p_barangay_code, '')), '');
  v_provider   text := nullif(btrim(coalesce(p_payout_provider, '')), '');
  v_prev       tasker_application_status;
  v_ids        uuid[];
  v_valid      integer;
begin
  if v_user is null then
    raise exception 'FORBIDDEN: authentication is required.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: account is not active.'
      using errcode = 'insufficient_privilege';
  end if;
  -- An already-approved Tasker has nothing to apply for.
  if app.has_active_capability(array['TASKER']::user_capability[]) then
    raise exception 'INVALID_STATE: you are already an approved Tasker.'
      using errcode = 'check_violation';
  end if;

  -- Validation mirrors the table CHECK constraints so the user gets a clear
  -- message instead of a raw constraint error.
  if char_length(v_bio) < 20 or char_length(v_bio) > 2000 then
    raise exception 'VALIDATION_ERROR: your bio must be between 20 and 2000 characters.'
      using errcode = 'check_violation';
  end if;
  if char_length(v_experience) < 1 or char_length(v_experience) > 2000 then
    raise exception 'VALIDATION_ERROR: describe your experience (up to 2000 characters).'
      using errcode = 'check_violation';
  end if;
  if v_city = '' then
    raise exception 'VALIDATION_ERROR: enter the city you can work in.'
      using errcode = 'check_violation';
  end if;

  v_ids := (
    select coalesce(array_agg(distinct s), '{}'::uuid[])
    from unnest(coalesce(p_specialty_ids, '{}'::uuid[])) as s
  );
  if array_length(v_ids, 1) is null then
    raise exception 'VALIDATION_ERROR: choose at least one specialty.'
      using errcode = 'check_violation';
  end if;
  select count(*) into v_valid
    from public.specialties
    where id = any(v_ids) and active;
  if v_valid <> array_length(v_ids, 1) then
    raise exception 'VALIDATION_ERROR: one or more selected specialties are unavailable.'
      using errcode = 'check_violation';
  end if;

  -- The caller's single active application, if any (partial unique index
  -- `uq_tasker_application_active` guarantees at most one).
  select * into v_app
  from public.tasker_applications
  where user_id = v_user
    and status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RESUBMISSION_REQUIRED')
  limit 1
  for update;

  -- Already queued: return it rather than re-queuing the reviewers.
  if found and v_app.status in ('SUBMITTED', 'IN_REVIEW') then
    return v_app;
  end if;

  if found then
    v_prev := v_app.status;
    update public.tasker_applications
       set bio             = v_bio,
           experience      = v_experience,
           payout_provider = v_provider,
           status          = 'SUBMITTED',
           submitted_at    = now(),
           decision_reason = null,
           -- A resubmission is a new attempt; the version makes it auditable.
           version         = case when v_prev = 'RESUBMISSION_REQUIRED'
                                  then version + 1 else version end
     where id = v_app.id
    returning * into v_app;
  else
    insert into public.tasker_applications
      (user_id, status, bio, experience, payout_provider, submitted_at)
    values (v_user, 'SUBMITTED', v_bio, v_experience, v_provider, now())
    returning * into v_app;
  end if;

  -- Atomically replace the specialty set and the service area.
  delete from public.tasker_specialties where user_id = v_user;
  insert into public.tasker_specialties (user_id, specialty_id)
  select v_user, s from unnest(v_ids) as s;

  delete from public.service_areas where user_id = v_user;
  insert into public.service_areas (user_id, city_code, barangay_code)
  values (v_user, v_city, v_barangay);

  return v_app;
end;
$$;

grant execute on function
  public.submit_tasker_application(text, text, uuid[], text, text, text)
  to authenticated;
