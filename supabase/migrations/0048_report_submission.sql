-- 0048_report_submission.sql
-- Give `reports` a producer.
--
-- THE GAP
--
-- The table has existed since 0007 (with `resource_type` already allowing
-- `message`), the Admin queue consumes it, and 0013 built assignment-scoped,
-- audited narrative/evidence reads for it. But **nothing in the product ever
-- created a report**: the only writer in the repository was a seed script, and the
-- mobile app offers support TICKETS only. So the Admin reports queue could never
-- receive a real report — the same class of defect as the notification producers
-- fixed in 0043 (written, tested, called by nothing).
--
-- WHY AN RPC RATHER THAN THE EXISTING INSERT POLICY
--
-- `reports_insert` (0009) allowed an authenticated user to insert their own OPEN
-- report directly. That is not enough:
--
--   * it accepts ANY `resource_id`, including a message, booking, or offer the
--     reporter cannot see — so a stranger could file a report referencing private
--     rows, and an Admin would then open an audited case about content the
--     reporter had no legitimate view of;
--   * nothing bounds volume, so a client loop could flood the queue;
--   * the CHECK constraints raise raw constraint errors, not the app's
--     `VALIDATION_ERROR` contract.
--
-- So this migration adds `submit_report`, which re-checks authorization per
-- resource type, and **removes the direct INSERT policy** so the RPC is the only
-- writer. Same pattern as `notifications` (no INSERT policy; `app.notify` is the
-- only path).
--
-- WHAT IT DOES NOT DO
--
-- No blocking, no auto-moderation, no notification to the reported user. A report
-- opens an Admin case; it changes nothing about the reported resource. Blocking a
-- counterpart mid-booking has refund/completion consequences that decision D13 /
-- blocker 11.5 have not settled, so it stays out of scope.

-- ---------------------------------------------------------------------------
-- submit_report — one report per (reporter, resource) while a case is open.
--
-- Idempotent by construction: a second submission for a resource this reporter
-- has already reported returns the existing row rather than stacking duplicates
-- on the Admin queue. Re-reporting is possible once the earlier case is closed
-- (ACTIONED/DISMISSED), which is the legitimate "it happened again" path.
--
-- The visibility rule per resource type answers one question: could this reporter
-- legitimately have SEEN the thing they are reporting?
--
--   task     — publicly listed (OPEN), or the reporter owns it, or they are a
--              participant in its booking.
--   message  — the reporter participates in that conversation. Chat is gated
--              behind payment confirmation, so this also means the booking is
--              confirmed. Reporting your OWN message is refused as meaningless.
--   offer    — the task owner, or the Tasker who made it.
--   booking  — a participant.
--   user     — any active account may report another; never yourself.
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(
  p_resource_type text,
  p_resource_id   uuid,
  p_category      text,
  p_narrative     text
)
returns public.reports
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_actor     uuid := auth.uid();
  v_report    public.reports;
  v_narrative text := btrim(coalesce(p_narrative, ''));
  v_allowed   boolean := false;
begin
  if v_actor is null then
    raise exception 'FORBIDDEN: authentication is required.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.profiles p
                 where p.id = v_actor and p.account_status = 'active') then
    raise exception 'FORBIDDEN: only an active account may report.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_resource_type not in ('task', 'user', 'message', 'offer', 'booking') then
    raise exception 'VALIDATION_ERROR: unsupported report resource type %', p_resource_type
      using errcode = 'check_violation';
  end if;
  if p_category not in ('fraud', 'harassment', 'inappropriate', 'safety', 'spam', 'other') then
    raise exception 'VALIDATION_ERROR: unsupported report category %', p_category
      using errcode = 'check_violation';
  end if;
  -- Bounds checked here so the caller gets the app's error contract rather than a
  -- raw CHECK violation from the table.
  if char_length(v_narrative) < 10 or char_length(v_narrative) > 4000 then
    raise exception 'VALIDATION_ERROR: a report needs between 10 and 4000 characters.'
      using errcode = 'check_violation';
  end if;

  -- ---- Could this reporter legitimately see the resource? ----
  if p_resource_type = 'task' then
    select exists (
      select 1 from public.tasks t
      where t.id = p_resource_id
        and (t.status = 'OPEN'
             or t.client_id = v_actor
             or exists (select 1 from public.bookings b
                        where b.task_id = t.id
                          and (b.client_id = v_actor or b.tasker_id = v_actor)))
    ) into v_allowed;

  elsif p_resource_type = 'message' then
    select exists (
      select 1
      from public.messages m
      join public.conversation_participants cp on cp.conversation_id = m.conversation_id
      where m.id = p_resource_id
        and cp.user_id = v_actor
        -- Reporting your own message would open a case about yourself.
        and m.sender_id <> v_actor
    ) into v_allowed;

  elsif p_resource_type = 'offer' then
    select exists (
      select 1
      from public.offers o
      join public.tasks t on t.id = o.task_id
      where o.id = p_resource_id
        and (t.client_id = v_actor or o.tasker_id = v_actor)
    ) into v_allowed;

  elsif p_resource_type = 'booking' then
    select exists (
      select 1 from public.bookings b
      where b.id = p_resource_id
        and (b.client_id = v_actor or b.tasker_id = v_actor)
    ) into v_allowed;

  else -- 'user'
    select exists (
      select 1 from public.profiles p
      where p.id = p_resource_id and p.id <> v_actor
    ) into v_allowed;
  end if;

  if not v_allowed then
    -- Deliberately the same refusal whether the resource is invisible, absent, or
    -- the reporter themselves: the error must not become a probe for which
    -- messages, offers, or bookings exist.
    raise exception 'FORBIDDEN: you cannot report this resource.'
      using errcode = 'insufficient_privilege';
  end if;

  -- ---- One live case per (reporter, resource) ----
  select * into v_report
  from public.reports r
  where r.reporter_id = v_actor
    and r.resource_type = p_resource_type
    and r.resource_id = p_resource_id
    and r.status in ('OPEN', 'TRIAGED')
  order by r.created_at
  limit 1;
  if found then
    return v_report;
  end if;

  insert into public.reports (reporter_id, resource_type, resource_id, category, narrative)
  values (v_actor, p_resource_type, p_resource_id, p_category, v_narrative)
  returning * into v_report;

  return v_report;
end;
$$;

revoke execute on function public.submit_report(text, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The RPC is now the only writer.
--
-- Dropping the direct INSERT policy closes the path that bypassed every check
-- above. Reads are untouched: a reporter still sees their own reports, an
-- assignee sees theirs, and Admin capability reads stay exactly as 0009/0013 left
-- them. The service role (seeds, back-office jobs) bypasses RLS and is unaffected.
-- ---------------------------------------------------------------------------
drop policy if exists reports_insert on public.reports;

-- A reporter's own list, and the duplicate-suppression lookup above, both filter
-- on (reporter, resource).
create index if not exists ix_reports_reporter_resource
  on public.reports (reporter_id, resource_type, resource_id);
