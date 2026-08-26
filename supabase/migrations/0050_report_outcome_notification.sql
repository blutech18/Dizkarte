-- 0050_report_outcome_notification.sql
-- Tell the reporter what happened to their report.
--
-- `submit_report` (0048) gave the reports queue a producer and `admin_read_report_subject`
-- (0049) made the queue triageable, but the loop still ended in silence: an Admin
-- moved a report to ACTIONED or DISMISSED and the person who filed it was never
-- told. For a trust & safety flow that is the worst place to go quiet — a user who
-- reports harassment and hears nothing reasonably concludes nobody looked.
--
-- Two changes, both narrow:
--   1. `REPORT_RESOLVED` is mapped to the existing `system` preference category.
--   2. `admin_transition_report` notifies the reporter on TERMINAL statuses only.
--
-- What the notification deliberately does NOT say: what action was taken, against
-- whom, or any detail about the other party. "We reviewed it and acted" is the
-- honest limit of what a reporter is entitled to know about someone else's account.
--
-- The reported user is NOT notified. There is no defined content-removal or
-- account-restriction consequence in the product yet (blocking remains policy-
-- blocked under D13/11.5), so a message telling someone they were reported would
-- describe an outcome that does not exist.

-- ---------------------------------------------------------------------------
-- Preference category.
--
-- Restated in full: `app.notification_category` is an immutable SQL function, so
-- there is no partial replacement. `REPORT_RESOLVED` is listed explicitly rather
-- than left to the `else` branch — relying on the fallback would make a future
-- rename silently change the category a user's toggle controls.
--
-- `system` rather than a new `safety` toggle: it is the existing home for
-- platform/administrative messages, and adding a category means adding a switch to
-- the mobile preferences screen for exactly one event type.
-- ---------------------------------------------------------------------------
create or replace function app.notification_category(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'OFFER_RECEIVED'         then 'offers'
    when 'OFFER_SELECTED'         then 'offers'
    when 'PAYMENT_CONFIRMED'      then 'payments'
    when 'PAYMENT_FAILED'         then 'payments'
    when 'BOOKING_STARTED'        then 'bookings'
    when 'COMPLETION_REQUESTED'   then 'bookings'
    when 'COMPLETION_REMINDER'    then 'bookings'
    when 'BOOKING_COMPLETED'      then 'bookings'
    when 'DISPUTE_OPENED'         then 'disputes'
    when 'REVIEW_RECEIVED'        then 'reviews'
    when 'REVIEW_REMINDER'        then 'reviews'
    when 'MESSAGE_RECEIVED'       then 'messages'
    when 'VERIFICATION_DECISION'  then 'verification'
    when 'NEARBY_TASK'            then 'nearby'
    when 'REPORT_RESOLVED'        then 'system'
    else 'system'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Report transition, now closing the loop with the reporter.
--
-- Restated in full from 0013 with one added block. Everything else is unchanged:
-- assigned-Admin-only, reasoned, idempotent by (admin, action, key), the same
-- allowed transition set, and both a `moderation_actions` and an `audit_logs` row.
-- ---------------------------------------------------------------------------
create or replace function public.admin_transition_report(
  p_report_id uuid, p_to_status report_status, p_reason text, p_idempotency_key text
)
returns public.reports
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.reports;
  v_cap user_capability;
  v_from report_status;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: requires an active support/super Admin.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.reports where id = p_report_id for update;
  if not found then raise exception 'NOT_FOUND: report' using errcode = 'no_data_found'; end if;
  if v_row.assignee_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN: only the assigned Admin may transition this report.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent replay or already at the target status. Returning early here is
  -- also what keeps the reporter from being notified twice about one decision.
  if v_row.status = p_to_status
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'report' and ma.resource_id = p_report_id
                  and ma.action = 'transition:' || p_to_status::text and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  v_from := v_row.status;
  if not ((v_from::text || '>' || p_to_status::text) = any (array[
        'OPEN>TRIAGED', 'OPEN>DISMISSED',
        'TRIAGED>ACTIONED', 'TRIAGED>DISMISSED'])) then
    raise exception 'INVALID_STATE: report transition %->% is not allowed.', v_from, p_to_status
      using errcode = 'check_violation';
  end if;

  update public.reports set status = p_to_status, updated_at = now()
    where id = p_report_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'report', p_report_id, 'transition:' || p_to_status::text, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'from', v_from, 'to', p_to_status));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.transition.report', 'report', p_report_id,
          jsonb_build_object('capability', v_cap, 'from', v_from, 'to', p_to_status,
                             'idempotency_key', p_idempotency_key));

  -- Terminal outcomes only. TRIAGED is an internal queue step; telling a reporter
  -- "your report changed to TRIAGED" leaks how the queue works and says nothing
  -- they can use. The Admin's private `reason` is never forwarded.
  if p_to_status in ('ACTIONED', 'DISMISSED')
     -- An Admin who reported something and then handled it themselves does not
     -- need a notification about their own decision.
     and v_row.reporter_id is distinct from auth.uid() then
    perform app.notify(
      v_row.reporter_id,
      'REPORT_RESOLVED',
      case p_to_status
        when 'ACTIONED' then 'We acted on your report'
        else 'We reviewed your report'
      end,
      case p_to_status
        when 'ACTIONED' then
          'Thanks for reporting this. Our team reviewed it and has taken action. '
          || 'We cannot share details about another person''s account.'
        else
          'Our team reviewed your report and did not find a policy breach this time. '
          || 'If something new happens, report it again and we will take another look.'
      end,
      'report',
      p_report_id
    );
  end if;

  return v_row;
end;
$$;
