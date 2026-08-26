-- 0042_review_aggregate_on_reveal.sql
-- Stop a still-hidden review from moving the Tasker's PUBLIC rating.
--
-- Requirement R10 / the Milestone 3 exit gate say a review stays secret until
-- both participants submit or the review window expires. The review TEXT was
-- correctly withheld, but the SCORE was not: `submit_review` (0011) incremented
-- `tasker_profiles.rating_sum` / `rating_count` at insert time, while the row was
-- still `HIDDEN`, and `public_tasker_profiles.rating_average` (0008) is derived
-- from exactly those two columns. Anyone browsing offers could therefore watch a
-- Tasker's average move — and, with `rating_count` visible, infer that a review
-- had landed and roughly what it said — before the blind window closed.
--
-- Fix: the aggregate counts REVEALED reviews only, and is RECOMPUTED from the
-- rows rather than nudged by deltas.
--
--   * Recompute is idempotent. The previous delta arithmetic had to be applied
--     exactly once per event, which is why 0023 needed `greatest(0, ...)` guards
--     and an idempotency check to avoid double-applying a moderation. A
--     recount cannot drift, double-count, or go negative.
--   * Every reveal path now converges on one function, so a future reveal path
--     cannot forget to update the aggregate.
--
-- Touched functions: `submit_review` (0011), `get_review_pair` (0021, the lazy
-- expiry reveal), `admin_moderate_review` (0023). Their contracts, authorization,
-- and error codes are unchanged; only aggregate maintenance moves.

-- ---------------------------------------------------------------------------
-- app.recount_review_aggregate — the single source of a reviewee's aggregate.
--
-- REVEALED only: HIDDEN (blind window still open) and MODERATED (withdrawn by an
-- Admin) rows are excluded. A reviewee with no revealed reviews lands on 0/0,
-- which `public_tasker_profiles` renders as a null average, not "0 stars".
--
-- Written for a Client reviewee too: they have no `tasker_profiles` row, so the
-- UPDATE simply matches nothing. That is the pre-existing asymmetry (only
-- Taskers carry a public rating), made explicit rather than silently relied on.
-- ---------------------------------------------------------------------------
create or replace function app.recount_review_aggregate(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, app
as $$
  update public.tasker_profiles tp
     set rating_sum   = coalesce(agg.total, 0),
         rating_count = coalesce(agg.entries, 0)
    from (
      select sum(r.score)::integer as total,
             count(*)::integer     as entries
      from public.reviews r
      where r.reviewee_id = p_user_id
        and r.status = 'REVEALED'
    ) agg
   where tp.user_id = p_user_id
     and (tp.rating_sum <> coalesce(agg.total, 0)
       or tp.rating_count <> coalesce(agg.entries, 0));
$$;

revoke execute on function app.recount_review_aggregate(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- submit_review — unchanged contract, aggregate no longer moves at insert.
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(
  p_booking_id uuid, p_score integer, p_comment text
)
returns public.reviews
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_booking public.bookings;
  v_reviewee uuid;
  v_review public.reviews;
  v_both boolean;
  v_target uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'NOT_FOUND: booking' using errcode = 'no_data_found'; end if;
  if v_booking.status <> 'COMPLETED' then
    raise exception 'INVALID_STATE: reviews require a completed booking.' using errcode = 'check_violation';
  end if;
  if auth.uid() = v_booking.client_id then
    v_reviewee := v_booking.tasker_id;
  elsif auth.uid() = v_booking.tasker_id then
    v_reviewee := v_booking.client_id;
  else
    raise exception 'FORBIDDEN: only participants may review.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.reviews (booking_id, reviewer_id, reviewee_id, score, comment, status)
  values (p_booking_id, auth.uid(), v_reviewee, p_score, p_comment, 'HIDDEN')
  returning * into v_review;

  -- Reveal both when both participants have reviewed.
  select count(*) = 2 into v_both from public.reviews where booking_id = p_booking_id;
  if v_both then
    update public.reviews set status = 'REVEALED', revealed_at = now()
      where booking_id = p_booking_id and status = 'HIDDEN';
    -- Re-read so the caller's own row carries the revealed state it now has.
    select * into v_review from public.reviews where id = v_review.id;
  end if;

  -- Aggregate maintenance: recount both participants from REVEALED rows only.
  -- Unconditional because it is idempotent — and because running it on the
  -- HIDDEN path is precisely what keeps the public average from moving early.
  for v_target in
    select distinct r.reviewee_id from public.reviews r where r.booking_id = p_booking_id
  loop
    perform app.recount_review_aggregate(v_target);
  end loop;

  return v_review;
exception
  when unique_violation then
    raise exception 'CONFLICT: you have already reviewed this booking.' using errcode = 'unique_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- get_review_pair — the lazy expiry reveal now also publishes the score.
--
-- Identical to 0021 except that a reveal performed here recounts the aggregate
-- of every reviewee whose row it just revealed. Without this, a one-sided review
-- that reveals on expiry would become readable while still absent from the
-- public average — the mirror image of the defect above.
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
  v_target   uuid;
  v_revealed boolean := false;
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
    v_revealed := found;
  end if;

  if v_revealed then
    for v_target in
      select distinct r.reviewee_id from public.reviews r where r.booking_id = p_booking_id
    loop
      perform app.recount_review_aggregate(v_target);
    end loop;
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

-- ---------------------------------------------------------------------------
-- admin_moderate_review — delta arithmetic replaced by the recount.
--
-- The idempotency check stays (it still guards the audit/moderation rows), but
-- the aggregate no longer depends on it for correctness.
-- ---------------------------------------------------------------------------
create or replace function public.admin_moderate_review(
  p_review_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key text
)
returns public.reviews
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.reviews;
  v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: review moderation requires an active support/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('hide','restore') then
    raise exception 'INVALID_STATE: unsupported moderation action %', p_action
      using errcode = 'check_violation';
  end if;

  select * into v_row from public.reviews where id = p_review_id for update;
  if not found then raise exception 'NOT_FOUND: review' using errcode = 'no_data_found'; end if;

  if exists (select 1 from public.moderation_actions ma
             where ma.resource_type = 'review' and ma.resource_id = p_review_id
               and ma.admin_id = auth.uid()
               and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  if p_action = 'hide' then
    if v_row.status = 'MODERATED' then return v_row; end if;
    update public.reviews set status = 'MODERATED' where id = p_review_id returning * into v_row;
  else
    if v_row.status <> 'MODERATED' then return v_row; end if;
    -- A review that was never revealed goes back to HIDDEN, not REVEALED: the
    -- blind window is the counterpart's, not the Admin's, to end. Restoring to
    -- HIDDEN therefore also keeps it out of the aggregate.
    --
    -- The explicit casts matter: with two bare literals the CASE resolves to
    -- `text`, and there is no implicit text→review_status cast, so this statement
    -- failed at runtime. That defect shipped in 0023 and went unnoticed because
    -- no test ever exercised `restore`; it is fixed here and now covered by
    -- `supabase/tests/milestone3_reviews_notifications.sql`.
    update public.reviews
       set status = case
             when v_row.revealed_at is null then 'HIDDEN'::review_status
             else 'REVEALED'::review_status
           end
     where id = p_review_id
    returning * into v_row;
  end if;

  perform app.recount_review_aggregate(v_row.reviewee_id);

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'review', p_review_id, p_action, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'to_status', v_row.status));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.review.' || p_action, 'review', p_review_id,
          jsonb_build_object('capability', v_cap, 'to_status', v_row.status,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

grant execute on function public.admin_moderate_review(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- One-time correction of aggregates written under the old rule.
--
-- Any average that currently includes a HIDDEN review is wrong from this point
-- on, so it is recomputed here rather than left to drift until the next review.
-- ---------------------------------------------------------------------------
update public.tasker_profiles tp
   set rating_sum   = coalesce(agg.total, 0),
       rating_count = coalesce(agg.entries, 0)
  from (
    select p.user_id,
           (select sum(r.score)::integer from public.reviews r
             where r.reviewee_id = p.user_id and r.status = 'REVEALED') as total,
           (select count(*)::integer from public.reviews r
             where r.reviewee_id = p.user_id and r.status = 'REVEALED') as entries
    from public.tasker_profiles p
  ) agg
 where agg.user_id = tp.user_id
   and (tp.rating_sum <> coalesce(agg.total, 0)
     or tp.rating_count <> coalesce(agg.entries, 0));
