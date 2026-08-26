-- 0049_admin_case_subject.sql
-- Resolve what an Admin case is actually ABOUT, from the live app data.
--
-- Before this migration the Admin console could name a case subject only as its
-- type plus eight hex characters of a UUID ("message 3f2a1b9c", "booking 7c14a2de").
-- A support Admin triaging a report could read the reporter's narrative but not the
-- reported message; a finance Admin opening a dispute saw neither the parties nor
-- the task. Acting on a case therefore meant querying the database by hand, which
-- is both slow and unaudited — the opposite of what the assignment-scoped read
-- functions in 0013 were built for.
--
-- This adds one internal resolver plus two audited, assignment-scoped entry points.
-- The resolver reads live rows, so the Admin console reflects the app's current
-- state rather than a snapshot taken when the case was filed.
--
-- Disclosure rules held here, deliberately:
--   * display names, statuses, amounts, and timestamps only;
--   * NO mobile number, NO email, NO exact location, NO storage paths;
--   * counts stay aggregate (how many reports, not who else reported);
--   * a message body IS included, because moderating content you cannot read is
--     not moderation — and the assigned Admin can already read the whole
--     transcript through `admin_read_conversation_messages` (0013), so this
--     discloses nothing new, just the one message the case is about.
--
-- Access is the same shape as every other sensitive Admin read: only the ASSIGNED
-- Admin, only with a reason + idempotency key, and audited exactly once per key.

-- ---------------------------------------------------------------------------
-- Internal resolver. Not granted to any client role.
-- ---------------------------------------------------------------------------
create or replace function app.case_subject_json(
  p_resource_type text,
  p_resource_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_subject jsonb;
begin
  -- Every branch returns the same key set so the Admin console can render one
  -- component for all case types instead of five special cases.
  case p_resource_type
    when 'task' then
      select jsonb_build_object(
               'exists', true,
               'kind', 'task',
               'label', format('Task "%s" (%s)', t.title, t.status),
               'status', t.status::text,
               'body', left(t.description, 2000),
               'occurredAt', coalesce(t.published_at, t.created_at),
               'subjectUserId', t.client_id,
               'subjectUserName', p.display_name,
               'counterpartyName', null,
               'taskId', t.id,
               'taskTitle', t.title,
               'bookingId', (select b.id from public.bookings b
                              where b.task_id = t.id order by b.created_at desc limit 1),
               'amountCentavos', t.budget_centavos,
               'extra', jsonb_build_object('categoryName', c.name, 'offerCount',
                          (select count(*) from public.offers o
                            where o.task_id = t.id and o.status <> 'WITHDRAWN'))
             )
        into v_subject
        from public.tasks t
        join public.profiles p on p.id = t.client_id
        left join public.categories c on c.id = t.category_id
       where t.id = p_resource_id;

    when 'user' then
      select jsonb_build_object(
               'exists', true,
               'kind', 'user',
               'label', format('Profile "%s" (%s)', p.display_name, p.account_status),
               'status', p.account_status::text,
               'body', left(p.bio, 2000),
               'occurredAt', p.created_at,
               'subjectUserId', p.id,
               'subjectUserName', p.display_name,
               'counterpartyName', null,
               'taskId', null,
               'taskTitle', null,
               'bookingId', null,
               'amountCentavos', null,
               -- Aggregate reputation only: the same disclosure the public
               -- profile already makes, never individual review rows.
               'extra', jsonb_build_object(
                 'isTasker', tp.user_id is not null,
                 'taskerApproved', tp.approved_at is not null,
                 'taskerSuspended', tp.suspended_at is not null,
                 'completionCount', coalesce(tp.completion_count, 0),
                 'ratingCount', coalesce(tp.rating_count, 0),
                 'ratingAverage', case when coalesce(tp.rating_count, 0) = 0 then null
                                       else round(tp.rating_sum::numeric / tp.rating_count, 2) end,
                 'tasksPosted', (select count(*) from public.tasks t where t.client_id = p.id))
             )
        into v_subject
        from public.profiles p
        left join public.tasker_profiles tp on tp.user_id = p.id
       where p.id = p_resource_id;

    when 'message' then
      select jsonb_build_object(
               'exists', true,
               'kind', 'message',
               'label', format('Message from "%s" in booking %s',
                               sender.display_name, left(bk.id::text, 8)),
               'status', m.moderation_status::text,
               'body', left(m.body, 2000),
               'occurredAt', m.created_at,
               'subjectUserId', m.sender_id,
               'subjectUserName', sender.display_name,
               'counterpartyName', case when bk.client_id = m.sender_id
                                        then tasker.display_name else client.display_name end,
               'taskId', bk.task_id,
               'taskTitle', t.title,
               'bookingId', bk.id,
               'amountCentavos', null,
               'extra', jsonb_build_object(
                 'bookingStatus', bk.status::text,
                 'attachmentCount', (select count(*) from public.message_media mm
                                      where mm.message_id = m.id))
             )
        into v_subject
        from public.messages m
        join public.profiles sender on sender.id = m.sender_id
        join public.conversations cv on cv.id = m.conversation_id
        join public.bookings bk on bk.id = cv.booking_id
        join public.profiles client on client.id = bk.client_id
        join public.profiles tasker on tasker.id = bk.tasker_id
        join public.tasks t on t.id = bk.task_id
       where m.id = p_resource_id;

    when 'offer' then
      select jsonb_build_object(
               'exists', true,
               'kind', 'offer',
               'label', format('Offer by "%s" on task "%s"', tasker.display_name, t.title),
               'status', o.status::text,
               'body', left(o.message, 2000),
               'occurredAt', o.created_at,
               'subjectUserId', o.tasker_id,
               'subjectUserName', tasker.display_name,
               'counterpartyName', client.display_name,
               'taskId', t.id,
               'taskTitle', t.title,
               'bookingId', null,
               'amountCentavos', o.amount_centavos,
               'extra', jsonb_build_object('taskStatus', t.status::text)
             )
        into v_subject
        from public.offers o
        join public.profiles tasker on tasker.id = o.tasker_id
        join public.tasks t on t.id = o.task_id
        join public.profiles client on client.id = t.client_id
       where o.id = p_resource_id;

    when 'booking' then
      select jsonb_build_object(
               'exists', true,
               'kind', 'booking',
               'label', format('Booking between "%s" and "%s" for task "%s"',
                               client.display_name, tasker.display_name, t.title),
               'status', bk.status::text,
               'body', null,
               'occurredAt', bk.created_at,
               'subjectUserId', bk.tasker_id,
               'subjectUserName', tasker.display_name,
               'counterpartyName', client.display_name,
               'taskId', bk.task_id,
               'taskTitle', t.title,
               'bookingId', bk.id,
               'amountCentavos', bk.agreed_centavos,
               'extra', jsonb_build_object(
                 'clientId', bk.client_id,
                 'taskerId', bk.tasker_id,
                 'messageCount', (select count(*) from public.messages m
                                   join public.conversations cv on cv.id = m.conversation_id
                                  where cv.booking_id = bk.id))
             )
        into v_subject
        from public.bookings bk
        join public.profiles client on client.id = bk.client_id
        join public.profiles tasker on tasker.id = bk.tasker_id
        join public.tasks t on t.id = bk.task_id
       where bk.id = p_resource_id;

    else
      -- An unknown type is a data problem, not a caller problem: say so plainly
      -- rather than raising and blanking the whole case page.
      v_subject := jsonb_build_object(
        'exists', false, 'kind', p_resource_type,
        'label', format('Unsupported resource type "%s"', p_resource_type));
  end case;

  -- A reported task/message/user can be deleted after the case is filed. The page
  -- must still open and still allow a decision, so this is a normal outcome.
  return coalesce(v_subject, jsonb_build_object(
    'exists', false, 'kind', p_resource_type,
    'label', format('This %s no longer exists', p_resource_type)));
end;
$$;

comment on function app.case_subject_json(text, uuid) is
  'Resolves an Admin case subject from live app rows. Display names, statuses, '
  'amounts and aggregate counts only - never contact details or exact location.';

-- ---------------------------------------------------------------------------
-- Report subject: assignment-scoped, reasoned, audited once.
-- ---------------------------------------------------------------------------
create or replace function public.admin_read_report_subject(
  p_report_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_cap    user_capability;
  v_report public.reports;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_report(p_report_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this report.'
      using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.report_subject', 'report', p_report_id,
                              v_cap, p_reason, p_idempotency_key);

  select * into v_report from public.reports where id = p_report_id;

  return app.case_subject_json(v_report.resource_type, v_report.resource_id)
      || jsonb_build_object(
           'resourceType', v_report.resource_type,
           'resourceId', v_report.resource_id,
           -- The reporter is disclosed to the ASSIGNED Admin only. Triage needs it:
           -- a single complaint and a coordinated pile-on look identical without it.
           'reporter', jsonb_build_object(
             'id', v_report.reporter_id,
             'displayName', (select display_name from public.profiles
                              where id = v_report.reporter_id),
             'accountStatus', (select account_status::text from public.profiles
                                where id = v_report.reporter_id),
             'reportsFiled', (select count(*) from public.reports r
                               where r.reporter_id = v_report.reporter_id),
             'reportsDismissed', (select count(*) from public.reports r
                                   where r.reporter_id = v_report.reporter_id
                                     and r.status = 'DISMISSED')),
           -- Distinct reporters on the SAME resource, as a count. Who else
           -- complained is not the assigned Admin's business; how many is.
           'resourceReportSummary', jsonb_build_object(
             'distinctReporters', (select count(distinct r.reporter_id) from public.reports r
                                    where r.resource_type = v_report.resource_type
                                      and r.resource_id = v_report.resource_id),
             'openCases', (select count(*) from public.reports r
                            where r.resource_type = v_report.resource_type
                              and r.resource_id = v_report.resource_id
                              and r.status in ('OPEN','TRIAGED')),
             'actionedCases', (select count(*) from public.reports r
                                where r.resource_type = v_report.resource_type
                                  and r.resource_id = v_report.resource_id
                                  and r.status = 'ACTIONED')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispute subject: the booking, its parties, and the task it is about.
-- ---------------------------------------------------------------------------
create or replace function public.admin_read_dispute_subject(
  p_dispute_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_cap        user_capability;
  v_booking_id uuid;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_dispute(p_dispute_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this dispute.'
      using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.dispute_subject', 'dispute', p_dispute_id,
                              v_cap, p_reason, p_idempotency_key);

  select booking_id into v_booking_id from public.disputes where id = p_dispute_id;

  return app.case_subject_json('booking', v_booking_id)
      || jsonb_build_object('resourceType', 'booking', 'resourceId', v_booking_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- ACLs.
--
-- Revoking from PUBLIC alone is NOT enough on Supabase: the project's default
-- privileges grant EXECUTE on new public functions to anon, authenticated and
-- service_role, so each role is revoked explicitly before the single intended
-- grant (the same pattern as `submit_report` in 0048).
--
-- service_role stays revoked deliberately: these functions are identity-scoped
-- through `auth.uid()`, so a service-role call could not be attributed to an
-- Admin and would produce an unattributable audit row.
-- ---------------------------------------------------------------------------
revoke all on function app.case_subject_json(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_read_report_subject(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_read_dispute_subject(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_read_report_subject(uuid, text, text) to authenticated;
grant execute on function public.admin_read_dispute_subject(uuid, text, text) to authenticated;
