-- 0023_review_moderation.sql
-- Give Admins a way to act on an abusive review.
--
-- `review_status` has always had a MODERATED state and `reviews` has always been
-- Admin-readable, but nothing could set it: there is no Admin UPDATE policy on
-- the table and no RPC. A review containing harassment or personal information
-- was therefore permanent once revealed.
--
-- Hiding a review must also correct the rating aggregate. `submit_review`
-- increments `tasker_profiles.rating_sum` / `rating_count` when the review is
-- created, so leaving those untouched would keep a retracted 1-star review
-- weighing on a Tasker's average while its text was no longer visible — the
-- worst of both outcomes.

-- ---------------------------------------------------------------------------
-- Admin review queue.
--
-- Follows the 0013 queue-view pattern: the capability predicate lives in the
-- view, so a non-Admin session selecting from it gets zero rows rather than
-- relying on a grant being withheld.
-- ---------------------------------------------------------------------------
create or replace view public.admin_review_queue as
select r.id,
       r.booking_id,
       b.task_id,
       t.title as task_title,
       r.reviewer_id,
       r.reviewee_id,
       r.score,
       r.comment,
       r.status,
       r.submitted_at,
       r.revealed_at
from public.reviews r
join public.bookings b on b.id = r.booking_id
join public.tasks t on t.id = b.task_id
where app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);

grant select on public.admin_review_queue to authenticated;

-- ---------------------------------------------------------------------------
-- admin_moderate_review (Admin: support/super)
--
-- `hide` moves a review to MODERATED and withdraws its score from the reviewee's
-- aggregate; `restore` reverses both. Same contract as the other 0016 admin
-- commands: active capability, bounded reason plus idempotency key, row lock,
-- and a replay that returns the current row without writing a second audit
-- entry (which would also double-apply the aggregate correction).
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

    -- `greatest`/`least` keep the non-negative CHECK constraints satisfied even
    -- if an aggregate was ever corrected by hand.
    update public.tasker_profiles
       set rating_sum   = greatest(0, rating_sum - v_row.score),
           rating_count = greatest(0, rating_count - 1)
     where user_id = v_row.reviewee_id;
  else
    if v_row.status <> 'MODERATED' then return v_row; end if;

    -- A review that was never revealed goes back to HIDDEN, not REVEALED: the
    -- blind window is the counterpart's, not the Admin's, to end.
    update public.reviews
       set status = case when v_row.revealed_at is null then 'HIDDEN' else 'REVEALED' end
     where id = p_review_id
    returning * into v_row;

    update public.tasker_profiles
       set rating_sum   = rating_sum + v_row.score,
           rating_count = rating_count + 1
     where user_id = v_row.reviewee_id;
  end if;

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
