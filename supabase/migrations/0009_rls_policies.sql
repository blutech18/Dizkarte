-- 0009_rls_policies.sql
-- Enable Row Level Security on every user-facing/sensitive table and add
-- least-privilege policies. Authentication never substitutes for authorization
-- (core invariant 1). Privileged writes flow through SECURITY DEFINER functions
-- which run as the table owner and thus bypass these policies intentionally.

-- Helper: is the current user a confirmed participant of the booking on a task?
create or replace function app.is_task_participant(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1 from public.bookings b
    where b.task_id = p_task_id
      and (b.client_id = auth.uid() or b.tasker_id = auth.uid())
      and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETION_REQUESTED', 'COMPLETED', 'DISPUTED')
  );
$$;

create or replace function app.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid() or app.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
alter table public.user_capabilities enable row level security;
-- No user writes. Read own grants; Admin reads all.
drop policy if exists user_capabilities_select on public.user_capabilities;
create policy user_capabilities_select on public.user_capabilities
  for select to authenticated using (user_id = auth.uid() or app.is_admin());

-- ---------------------------------------------------------------------------
alter table public.verification_cases enable row level security;

drop policy if exists verification_cases_select on public.verification_cases;
create policy verification_cases_select on public.verification_cases
  for select to authenticated using (
    user_id = auth.uid()
    or (app.has_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]))
  );

drop policy if exists verification_cases_insert_own on public.verification_cases;
create policy verification_cases_insert_own on public.verification_cases
  for insert to authenticated with check (user_id = auth.uid() and status = 'DRAFT');
-- Status transitions are performed by decide_verification (SECURITY DEFINER).

alter table public.verification_documents enable row level security;

drop policy if exists verification_documents_owner on public.verification_documents;
create policy verification_documents_owner on public.verification_documents
  for select to authenticated using (
    exists (select 1 from public.verification_cases vc
            where vc.id = case_id and vc.user_id = auth.uid())
    or app.has_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
  );

drop policy if exists verification_documents_insert on public.verification_documents;
create policy verification_documents_insert on public.verification_documents
  for insert to authenticated with check (
    exists (select 1 from public.verification_cases vc
            where vc.id = case_id and vc.user_id = auth.uid()
              and vc.status in ('DRAFT', 'RESUBMISSION_REQUIRED'))
  );

alter table public.verification_events enable row level security;
drop policy if exists verification_events_select on public.verification_events;
create policy verification_events_select on public.verification_events
  for select to authenticated using (
    exists (select 1 from public.verification_cases vc
            where vc.id = case_id and vc.user_id = auth.uid())
    or app.has_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
  );

-- ---------------------------------------------------------------------------
alter table public.devices enable row level security;
drop policy if exists devices_own on public.devices;
create policy devices_own on public.devices
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
alter table public.tasker_applications enable row level security;
drop policy if exists tasker_applications_select on public.tasker_applications;
create policy tasker_applications_select on public.tasker_applications
  for select to authenticated using (
    user_id = auth.uid()
    or app.has_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
  );
drop policy if exists tasker_applications_insert on public.tasker_applications;
create policy tasker_applications_insert on public.tasker_applications
  for insert to authenticated with check (user_id = auth.uid() and status = 'DRAFT');
drop policy if exists tasker_applications_update_own_draft on public.tasker_applications;
create policy tasker_applications_update_own_draft on public.tasker_applications
  for update to authenticated
  using (user_id = auth.uid() and status in ('DRAFT', 'RESUBMISSION_REQUIRED'))
  with check (user_id = auth.uid());

alter table public.tasker_profiles enable row level security;
drop policy if exists tasker_profiles_select on public.tasker_profiles;
-- Public trust data readable to any authenticated user via the view; base table
-- readable too (view is security_invoker).
create policy tasker_profiles_select on public.tasker_profiles
  for select to authenticated using (true);

alter table public.specialties enable row level security;
drop policy if exists specialties_select on public.specialties;
create policy specialties_select on public.specialties
  for select to authenticated using (active or app.is_admin());

alter table public.tasker_specialties enable row level security;
drop policy if exists tasker_specialties_select on public.tasker_specialties;
create policy tasker_specialties_select on public.tasker_specialties
  for select to authenticated using (true);
drop policy if exists tasker_specialties_write_own on public.tasker_specialties;
create policy tasker_specialties_write_own on public.tasker_specialties
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.service_areas enable row level security;
drop policy if exists service_areas_select on public.service_areas;
create policy service_areas_select on public.service_areas
  for select to authenticated using (true);
drop policy if exists service_areas_write_own on public.service_areas;
create policy service_areas_write_own on public.service_areas
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.portfolio_items enable row level security;
drop policy if exists portfolio_items_select on public.portfolio_items;
create policy portfolio_items_select on public.portfolio_items
  for select to authenticated using (
    user_id = auth.uid() or moderation_status = 'APPROVED' or app.is_admin()
  );
drop policy if exists portfolio_items_write_own on public.portfolio_items;
create policy portfolio_items_write_own on public.portfolio_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- payout_methods: strictly owner-only; never publicly readable.
alter table public.payout_methods enable row level security;
drop policy if exists payout_methods_own on public.payout_methods;
create policy payout_methods_own on public.payout_methods
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated using (active or app.is_admin());

alter table public.tasks enable row level security;
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated using (
    status = 'OPEN'                    -- public discovery predicate
    or client_id = auth.uid()          -- owner sees all own tasks
    or app.is_task_participant(id)     -- confirmed participant
    or app.is_admin()
  );
drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks
  for insert to authenticated with check (client_id = auth.uid() and status = 'DRAFT');
drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks
  for update to authenticated
  using (client_id = auth.uid() and status in ('DRAFT', 'OPEN'))
  with check (client_id = auth.uid());

alter table public.task_public_locations enable row level security;
drop policy if exists task_public_locations_select on public.task_public_locations;
create policy task_public_locations_select on public.task_public_locations
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id
            and (t.status = 'OPEN' or t.client_id = auth.uid()
                 or app.is_task_participant(t.id) or app.is_admin()))
  );
drop policy if exists task_public_locations_write_own on public.task_public_locations;
create policy task_public_locations_write_own on public.task_public_locations
  for all to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
  ) with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
  );

-- Private location: owner or confirmed participant only (invariant 2).
alter table public.task_private_locations enable row level security;
drop policy if exists task_private_locations_select on public.task_private_locations;
create policy task_private_locations_select on public.task_private_locations
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
    or app.is_task_participant(task_id)
    or app.is_admin()
  );
drop policy if exists task_private_locations_write_own on public.task_private_locations;
create policy task_private_locations_write_own on public.task_private_locations
  for all to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
  ) with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
  );

alter table public.task_media enable row level security;
drop policy if exists task_media_select on public.task_media;
create policy task_media_select on public.task_media
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id
            and (t.status = 'OPEN' or t.client_id = auth.uid()
                 or app.is_task_participant(t.id) or app.is_admin()))
  );
drop policy if exists task_media_write_own on public.task_media;
create policy task_media_write_own on public.task_media
  for all to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
  ) with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
  );

alter table public.task_questions enable row level security;
drop policy if exists task_questions_select on public.task_questions;
create policy task_questions_select on public.task_questions
  for select to authenticated using (
    status = 'APPROVED'
    or author_id = auth.uid()
    or exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
    or app.is_admin()
  );
drop policy if exists task_questions_insert on public.task_questions;
create policy task_questions_insert on public.task_questions
  for insert to authenticated with check (author_id = auth.uid());

-- Offers: submitting Tasker reads own; task owner reads offers on their task.
alter table public.offers enable row level security;
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers
  for select to authenticated using (
    tasker_id = auth.uid()
    or exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
    or app.is_admin()
  );
-- Offer creation goes through submit_offer (SECURITY DEFINER) for eligibility
-- checks, but we also allow a guarded direct insert as defense-in-depth.
drop policy if exists offers_insert_tasker on public.offers;
create policy offers_insert_tasker on public.offers
  for insert to authenticated with check (
    tasker_id = auth.uid()
    and app.has_capability(array['TASKER']::user_capability[])
  );

alter table public.offer_events enable row level security;
drop policy if exists offer_events_select on public.offer_events;
create policy offer_events_select on public.offer_events
  for select to authenticated using (
    exists (select 1 from public.offers o where o.id = offer_id
            and (o.tasker_id = auth.uid()
                 or exists (select 1 from public.tasks t where t.id = o.task_id and t.client_id = auth.uid())))
    or app.is_admin()
  );

-- Bookings: participants only; mutations only via functions.
alter table public.bookings enable row level security;
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated using (
    client_id = auth.uid() or tasker_id = auth.uid() or app.is_admin()
  );

alter table public.booking_events enable row level security;
drop policy if exists booking_events_select on public.booking_events;
create policy booking_events_select on public.booking_events
  for select to authenticated using (
    exists (select 1 from public.bookings b where b.id = booking_id
            and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
    or app.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Messaging (invariant 2 & 8): only confirmed-booking participants + assigned Admin.
alter table public.conversations enable row level security;
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated using (
    app.is_conversation_participant(id) or app.is_admin()
  );

alter table public.conversation_participants enable row level security;
drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants
  for select to authenticated using (
    user_id = auth.uid() or app.is_conversation_participant(conversation_id) or app.is_admin()
  );

alter table public.messages enable row level security;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (
    app.is_conversation_participant(conversation_id) or app.is_admin()
  );
drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and app.is_conversation_participant(conversation_id)
  );

alter table public.message_media enable row level security;
drop policy if exists message_media_select on public.message_media;
create policy message_media_select on public.message_media
  for select to authenticated using (
    exists (select 1 from public.messages m where m.id = message_id
            and app.is_conversation_participant(m.conversation_id))
    or app.is_admin()
  );
drop policy if exists message_media_insert on public.message_media;
create policy message_media_insert on public.message_media
  for insert to authenticated with check (
    exists (select 1 from public.messages m where m.id = message_id
            and m.sender_id = auth.uid()
            and app.is_conversation_participant(m.conversation_id))
  );

-- Notifications: owner only.
alter table public.notifications enable row level security;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Finance: participants see scoped status/own derived balances; raw ledger and
-- provider events are finance-Admin only. Clients cannot insert/update.
alter table public.payment_intents enable row level security;
drop policy if exists payment_intents_select on public.payment_intents;
create policy payment_intents_select on public.payment_intents
  for select to authenticated using (
    exists (select 1 from public.bookings b where b.id = booking_id
            and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
    or app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
  );

alter table public.provider_events enable row level security;
drop policy if exists provider_events_admin on public.provider_events;
create policy provider_events_admin on public.provider_events
  for select to authenticated using (
    app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
  );

alter table public.ledger_accounts enable row level security;
drop policy if exists ledger_accounts_select on public.ledger_accounts;
create policy ledger_accounts_select on public.ledger_accounts
  for select to authenticated using (
    owner_id = auth.uid()
    or app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
  );

alter table public.ledger_transactions enable row level security;
drop policy if exists ledger_transactions_select on public.ledger_transactions;
create policy ledger_transactions_select on public.ledger_transactions
  for select to authenticated using (
    app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
    or exists (select 1 from public.bookings b where b.id = booking_id
               and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
  );

alter table public.ledger_entries enable row level security;
drop policy if exists ledger_entries_select on public.ledger_entries;
create policy ledger_entries_select on public.ledger_entries
  for select to authenticated using (
    app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
    or exists (select 1 from public.ledger_accounts la where la.id = account_id and la.owner_id = auth.uid())
  );

alter table public.refunds enable row level security;
drop policy if exists refunds_select on public.refunds;
create policy refunds_select on public.refunds
  for select to authenticated using (
    app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
    or exists (select 1 from public.payment_intents pi
               join public.bookings b on b.id = pi.booking_id
               where pi.id = payment_intent_id and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
  );

alter table public.withdrawals enable row level security;
drop policy if exists withdrawals_select_own on public.withdrawals;
create policy withdrawals_select_own on public.withdrawals
  for select to authenticated using (
    tasker_id = auth.uid()
    or app.has_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
  );

-- ---------------------------------------------------------------------------
-- Reviews: only revealed projection readable broadly; participants + admin see own.
alter table public.reviews enable row level security;
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to authenticated using (
    status = 'REVEALED'
    or reviewer_id = auth.uid()
    or reviewee_id = auth.uid()
    or app.is_admin()
  );

alter table public.review_dimensions enable row level security;
drop policy if exists review_dimensions_select on public.review_dimensions;
create policy review_dimensions_select on public.review_dimensions
  for select to authenticated using (
    exists (select 1 from public.reviews r where r.id = review_id
            and (r.status = 'REVEALED' or r.reviewer_id = auth.uid()
                 or r.reviewee_id = auth.uid() or app.is_admin()))
  );

-- ---------------------------------------------------------------------------
-- Support/reports/evidence: reporter reads own; assignee/capability Admin reads.
alter table public.reports enable row level security;
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated using (
    reporter_id = auth.uid() or assignee_id = auth.uid() or app.is_admin()
  );
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated with check (reporter_id = auth.uid() and status = 'OPEN');

alter table public.disputes enable row level security;
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes
  for select to authenticated using (
    opened_by = auth.uid()
    or assignee_id = auth.uid()
    or exists (select 1 from public.bookings b where b.id = booking_id
               and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
    or app.is_admin()
  );

alter table public.support_tickets enable row level security;
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select to authenticated using (
    user_id = auth.uid() or assignee_id = auth.uid() or app.is_admin()
  );
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets
  for insert to authenticated with check (user_id = auth.uid() and status = 'OPEN');

alter table public.ticket_messages enable row level security;
drop policy if exists ticket_messages_select on public.ticket_messages;
create policy ticket_messages_select on public.ticket_messages
  for select to authenticated using (
    (is_internal = false and exists (select 1 from public.support_tickets t
       where t.id = ticket_id and t.user_id = auth.uid()))
    or app.is_admin()
  );
drop policy if exists ticket_messages_insert on public.ticket_messages;
create policy ticket_messages_insert on public.ticket_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and (
      exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
      or app.is_admin()
    )
  );

alter table public.evidence enable row level security;
drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence
  for select to authenticated using (owner_id = auth.uid() or app.is_admin());
drop policy if exists evidence_insert_own on public.evidence;
create policy evidence_insert_own on public.evidence
  for insert to authenticated with check (owner_id = auth.uid());

-- Roles/settings/audit/moderation: bounded Admin reads; no direct user writes.
alter table public.moderation_actions enable row level security;
drop policy if exists moderation_actions_select on public.moderation_actions;
create policy moderation_actions_select on public.moderation_actions
  for select to authenticated using (app.is_admin());

alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (
    app.has_capability(array['ADMIN_SUPER']::user_capability[])
  );

alter table public.app_settings enable row level security;
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated using (app.is_admin());
