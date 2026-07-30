-- 0021_verification_submission_and_review_reveal.sql
--
-- Two gaps that both blocked real user flows.
--
-- 1. Identity verification could not be submitted at all. RLS lets a user
--    insert their own case (only in status DRAFT) and its documents, but there
--    is no UPDATE policy, so nothing could move DRAFT -> SUBMITTED. Admins had
--    `decide_verification`; users had no way to reach the queue. Verification is
--    a hard precondition for publishing a task and for offering on one, so this
--    made the entire marketplace unreachable for a genuinely new account.
--
-- 2. Blind reviews could deadlock. `submit_review` reveals both reviews when the
--    second one arrives, so a booking where only one side ever reviews stays
--    hidden forever and the review is never published. The apps model a reveal
--    deadline, but nothing in the database implemented it.
--
-- Both are exposed as `public` SECURITY DEFINER functions that derive the
-- subject from `auth.uid()`. Neither takes a user id parameter, so neither can
-- be pointed at somebody else's case or booking.

-- ===========================================================================
-- Identity verification submission
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The caller's active case, created on demand.
--
-- `uq_verification_active_case` permits one non-terminal case per user, so a
-- plain insert races with itself and fails the second time. Callers need an
-- idempotent "give me the case I should attach documents to" entry point, which
-- is also what supplies the storage scope id for the upload path.
-- ---------------------------------------------------------------------------
create or replace function public.start_verification()
returns public.verification_cases
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user uuid := auth.uid();
  v_case public.verification_cases;
begin
  if v_user is null then
    raise exception 'FORBIDDEN: authentication is required.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_case
  from public.verification_cases
  where user_id = v_user
    and status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RESUBMISSION_REQUIRED')
  limit 1;
  if found then return v_case; end if;

  -- An already-approved user has no active case and needs no new one.
  if exists (select 1 from public.verification_cases
             where user_id = v_user and status = 'APPROVED') then
    select * into v_case
    from public.verification_cases
    where user_id = v_user and status = 'APPROVED'
    order by decided_at desc nulls last
    limit 1;
    return v_case;
  end if;

  insert into public.verification_cases (user_id, status)
  values (v_user, 'DRAFT')
  returning * into v_case;

  insert into public.verification_events (case_id, from_status, to_status, actor_id)
  values (v_case.id, null, 'DRAFT', v_user);

  return v_case;
exception
  when unique_violation then
    -- Lost the race against a concurrent call; the winner's case is the answer.
    select * into v_case
    from public.verification_cases
    where user_id = v_user
      and status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RESUBMISSION_REQUIRED')
    limit 1;
    return v_case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hand the caller's case to the Admin review queue.
--
-- Documents must have been added since the last decision. Without that clause a
-- user asked to resubmit could re-send the same rejected photos by pressing
-- Submit again, and the Admin queue would fill with unchanged cases.
-- ---------------------------------------------------------------------------
create or replace function public.submit_verification()
returns public.verification_cases
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user  uuid := auth.uid();
  v_case  public.verification_cases;
  v_prev  verification_status;
  v_since timestamptz;
begin
  if v_user is null then
    raise exception 'FORBIDDEN: authentication is required.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_case
  from public.verification_cases
  where user_id = v_user
    and status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RESUBMISSION_REQUIRED')
  limit 1
  for update;

  if not found then
    raise exception 'NOT_FOUND: no verification case to submit.'
      using errcode = 'no_data_found';
  end if;

  -- Already queued: return it rather than pushing a duplicate at the reviewers.
  if v_case.status in ('SUBMITTED', 'IN_REVIEW') then
    return v_case;
  end if;

  v_prev  := v_case.status;
  v_since := coalesce(v_case.decided_at, '-infinity'::timestamptz);

  if not exists (
    select 1 from public.verification_documents
    where case_id = v_case.id and kind = 'government_id_front' and created_at > v_since
  ) then
    raise exception 'VALIDATION_ERROR: a photo of your government ID is required.'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.verification_documents
    where case_id = v_case.id and kind = 'selfie' and created_at > v_since
  ) then
    raise exception 'VALIDATION_ERROR: a selfie is required.'
      using errcode = 'check_violation';
  end if;

  update public.verification_cases
     set status = 'SUBMITTED',
         submitted_at = now(),
         -- A resubmission is a new attempt; the version makes that auditable.
         version = case when v_prev = 'RESUBMISSION_REQUIRED'
                        then v_case.version + 1 else v_case.version end,
         decision_reason = null
   where id = v_case.id
  returning * into v_case;

  insert into public.verification_events (case_id, from_status, to_status, actor_id)
  values (v_case.id, v_prev, 'SUBMITTED', v_user);

  return v_case;
end;
$$;

grant execute on function public.start_verification() to authenticated;
grant execute on function public.submit_verification() to authenticated;

-- ===========================================================================
-- Blind review reveal
-- ===========================================================================

insert into public.app_settings (key, typed_value)
values ('review_reveal_days', '14'::jsonb)
on conflict (key) do nothing;

create or replace function app.review_reveal_days()
returns integer
language sql
stable
as $$
  select greatest(1, coalesce(
    (select (typed_value #>> '{}')::integer
     from public.app_settings where key = 'review_reveal_days'),
    14));
$$;

-- ---------------------------------------------------------------------------
-- Read the caller's review pair for a booking, revealing anything now due.
--
-- Revealing lazily on read rather than from a scheduled job keeps the rule in
-- one place and needs no extension: the only moment the reveal state matters is
-- when somebody looks. `submit_review` still reveals immediately when the second
-- review lands, so the deadline only ever resolves the one-sided case.
--
-- The counterpart's review is withheld unless its status is REVEALED, so a
-- moderated review is never surfaced either.
-- ---------------------------------------------------------------------------
create or replace function public.get_review_pair(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_booking  public.bookings;
  v_first    timestamptz;
  v_count    integer;
  v_deadline timestamptz;
  v_mine     public.reviews;
  v_other    public.reviews;
  v_has_mine boolean := false;
  v_has_other boolean := false;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN: authentication is required.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'NOT_FOUND: booking %', p_booking_id using errcode = 'no_data_found';
  end if;
  if auth.uid() <> v_booking.client_id and auth.uid() <> v_booking.tasker_id then
    raise exception 'FORBIDDEN: only booking participants may read its reviews.'
      using errcode = 'insufficient_privilege';
  end if;

  select min(submitted_at), count(*) into v_first, v_count
  from public.reviews where booking_id = p_booking_id;

  if v_first is not null then
    v_deadline := v_first + make_interval(days => app.review_reveal_days());
  end if;

  if v_count >= 2 or (v_deadline is not null and v_deadline <= now()) then
    update public.reviews
       set status = 'REVEALED',
           revealed_at = coalesce(revealed_at, now())
     where booking_id = p_booking_id and status = 'HIDDEN';
  end if;

  select * into v_mine
  from public.reviews
  where booking_id = p_booking_id and reviewer_id = auth.uid();
  v_has_mine := found;

  select * into v_other
  from public.reviews
  where booking_id = p_booking_id and reviewer_id <> auth.uid();
  v_has_other := found;

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'reveal_deadline', v_deadline,
    'both_submitted', v_count >= 2,
    'my_review', case when v_has_mine then to_jsonb(v_mine) else null end,
    'counterpart_review',
      case when v_has_other and v_other.status = 'REVEALED'
           then to_jsonb(v_other) else null end
  );
end;
$$;

grant execute on function public.get_review_pair(uuid) to authenticated;
revoke execute on function app.review_reveal_days() from public, anon, authenticated, service_role;
