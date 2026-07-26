-- 0013_security_hardening.sql
-- Additive, ordered security hardening. Replaces over-broad Admin grants on
-- sensitive narrative/content/files with assignment-scoped, capability-checked,
-- active-account-checked authorization; binds storage objects to real rows
-- instead of guessed paths; and closes finance correctness/authority gaps.
--
-- This migration is NON-DESTRUCTIVE: it drops and recreates POLICIES and
-- FUNCTIONS only. No table, column, index, or data is dropped. It is safe to
-- apply after 0001-0012 and re-runnable.
--
-- Invariants reinforced (see .kiro/specs/dizkarte-platform/requirements.md §5):
--   1 auth != authorization        2 gate exact/contact/chat until paid
--   4 client-only release          5 derived balanced append-only ledger
--   6 idempotent privileged/provider commands
--   7 server-controlled + audited  8 short-lived, scoped private storage
-- and R8/R12: sensitive chat/exact-details/evidence/narrative are visible only
-- to participants/owners and the ONE purpose-authorized Admin explicitly
-- assigned to the relevant report/dispute/ticket/verification case.

set search_path = public, app;

-- ===========================================================================
-- SECTION 1 — Hardened, narrowly scoped helper functions
-- All are STABLE, SECURITY DEFINER, with a fixed search_path, and re-derive the
-- caller identity from auth.uid() only (no caller-controlled bypass argument).
-- ===========================================================================

-- Active-account capability check. NOTE: app.has_capability() (0001) does NOT
-- verify account_status; a suspended/banned Admin still passed it. All Admin and
-- financial capability gates below use this active-checked variant instead.
create or replace function app.has_active_capability(caps user_capability[])
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.user_capabilities uc
    join public.profiles p on p.id = uc.user_id
    where uc.user_id = auth.uid()
      and uc.revoked_at is null
      and uc.capability = any(caps)
      and p.account_status = 'active'
  );
$$;

-- Is the current authenticated user an active (non-suspended) account?
create or replace function app.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_status = 'active'
  );
$$;

-- Parse a UUID without throwing on malformed input (storage path segments are
-- attacker-controlled). Returns NULL for anything that is not a valid UUID.
create or replace function app.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_text is null then
    return null;
  end if;
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- Safe access to the Nth folder segment of a storage object name. Never throws.
create or replace function app.storage_seg(p_name text, p_idx integer)
returns text
language sql
immutable
as $$
  select (storage.foldername(coalesce(p_name, '')))[p_idx];
$$;

-- --- Assignment-scoped Admin authorization -------------------------------------
-- Each requires BOTH an active, appropriately-capable Admin AND an explicit
-- assignment to the specific case/resource. "Super" is NOT an implicit purpose
-- assignment: a super Admin still needs the row-level assignment to read
-- sensitive narrative/files/chat.

create or replace function app.admin_assigned_verification(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
     and exists (
       select 1 from public.verification_cases vc
       where vc.id = p_case_id and vc.assigned_admin_id = auth.uid()
     );
$$;

create or replace function app.admin_assigned_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
     and exists (
       select 1 from public.reports r
       where r.id = p_report_id and r.assignee_id = auth.uid()
     );
$$;

create or replace function app.admin_assigned_dispute(p_dispute_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
     and exists (
       select 1 from public.disputes d
       where d.id = p_dispute_id and d.assignee_id = auth.uid()
     );
$$;

create or replace function app.admin_assigned_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
     and exists (
       select 1 from public.support_tickets t
       where t.id = p_ticket_id and t.assignee_id = auth.uid()
     );
$$;

-- An Admin is authorized for a booking's sensitive surface (chat, exact
-- location, booking-linked evidence) only through an explicit, capability-
-- appropriate assignment: finance/super on a dispute for that booking, or
-- support/super on a report whose resource is the booking or a message in its
-- conversation. A stale support assignment on a dispute grants nothing.
create or replace function app.admin_assigned_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select (
    app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
    and exists (
      select 1 from public.disputes d
      where d.booking_id = p_booking_id and d.assignee_id = auth.uid()
    )
  )
  or (
    app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
    and (
      exists (
        select 1 from public.reports r
        where r.assignee_id = auth.uid()
          and r.resource_type = 'booking' and r.resource_id = p_booking_id
      )
      or exists (
        select 1
        from public.reports r
        join public.messages m on m.id = r.resource_id
        join public.conversations c on c.id = m.conversation_id
        where r.assignee_id = auth.uid()
          and r.resource_type = 'message'
          and c.booking_id = p_booking_id
      )
    )
  );
$$;

create or replace function app.admin_assigned_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and app.admin_assigned_booking(c.booking_id)
  );
$$;

-- Task sensitive surface (exact location, task media): the assigned Admin on a
-- report about the task, or on the task's active booking.
create or replace function app.admin_assigned_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select (
    app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
    and exists (
      select 1 from public.reports r
      where r.assignee_id = auth.uid()
        and r.resource_type = 'task' and r.resource_id = p_task_id
    )
  )
  or exists (
    select 1 from public.bookings b
    where b.task_id = p_task_id and app.admin_assigned_booking(b.id)
  );
$$;

create or replace function app.admin_assigned_offer(p_offer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select (
    app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
    and exists (
      select 1 from public.reports r
      where r.assignee_id = auth.uid()
        and r.resource_type = 'offer' and r.resource_id = p_offer_id
    )
  )
  or exists (
    select 1 from public.offers o
    where o.id = p_offer_id and app.admin_assigned_task(o.task_id)
  );
$$;

-- Evidence rows point at a report/dispute/ticket/booking; access follows the
-- assignment on that parent resource.
create or replace function app.admin_assigned_evidence(p_resource_type text, p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select case p_resource_type
    when 'report'  then app.admin_assigned_report(p_resource_id)
    when 'dispute' then app.admin_assigned_dispute(p_resource_id)
    when 'ticket'  then app.admin_assigned_ticket(p_resource_id)
    when 'booking' then app.admin_assigned_booking(p_resource_id)
    else false
  end;
$$;

-- ===========================================================================
-- SECTION 2 — Reduce RLS SELECT to owner/participant ONLY on the sensitive
-- surfaces. Admin access to these is NOT granted through RLS at all, because an
-- RLS predicate cannot record who read what and why (and "do not log from an
-- RLS predicate"). Instead, the explicitly-assigned Admin reads these through
-- the audited SECURITY DEFINER RPCs in SECTION 8 (each writes exactly one audit
-- event). Non-sensitive queue METADATA remains capability-visible via the
-- definer views in SECTION 4 so unassigned cases can still be triaged/assigned.
--
-- Net effect for the strongly-sensitive base tables (verification detail, exact
-- location, chat + media, case narrative for reports/disputes/tickets, ticket
-- messages, evidence): generic, unassigned, other-assignee, AND super Admins all
-- read ZERO rows on a direct base SELECT; even the correctly-assigned Admin reads
-- zero directly and must go through the audited RPC. (task_media/offers keep an
-- assignment-scoped METADATA read — see the note by those policies.) Finance/
-- ledger reads (further down) remain capability-scoped by design because
-- reconciliation (R16) legitimately needs broad, non-assignment finance
-- visibility; they are not part of the assignment-audited narrative set.
-- ===========================================================================

-- Verification: base case row, decision history, and ID documents are the
-- subject's own data. Admin queue metadata is served by admin_verification_queue
-- (SECTION 4); full detail is served by app-audited admin_read_verification_case
-- (SECTION 8). No Admin predicate here.
drop policy if exists verification_cases_select on public.verification_cases;
create policy verification_cases_select on public.verification_cases
  for select to authenticated using (
    user_id = auth.uid()
  );

drop policy if exists verification_documents_owner on public.verification_documents;
create policy verification_documents_owner on public.verification_documents
  for select to authenticated using (
    exists (select 1 from public.verification_cases vc
            where vc.id = case_id and vc.user_id = auth.uid())
  );

drop policy if exists verification_events_select on public.verification_events;
create policy verification_events_select on public.verification_events
  for select to authenticated using (
    exists (select 1 from public.verification_cases vc
            where vc.id = case_id and vc.user_id = auth.uid())
  );

-- Tasker applications carry narrative/bio but not third-party PII; Admin triage
-- keeps the capability read here (this table is out of the assignment-audited
-- narrative set and has no per-row assignee column).
drop policy if exists tasker_applications_select on public.tasker_applications;
create policy tasker_applications_select on public.tasker_applications
  for select to authenticated using (
    user_id = auth.uid()
    or app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
  );

-- Exact location: owner or confirmed participant only (invariant 2). The
-- assigned Admin reads exact address/point through admin_read_task_location
-- (SECTION 8), which audits the access.
drop policy if exists task_private_locations_select on public.task_private_locations;
create policy task_private_locations_select on public.task_private_locations
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
    or app.is_task_participant(task_id)
  );

-- NOTE: task_media and offers below intentionally KEEP an assignment-scoped
-- Admin read. They are triage METADATA (task photo rows, offer amounts/text),
-- not part of the strongly-sensitive audited-narrative set (chat, exact
-- location, case narrative, evidence, ID docs). The assigned Admin may see this
-- metadata directly; the corresponding OBJECT bytes (task-media) still require
-- app.admin_authorize_object_read (SECTION 10) + a service-role signed URL.

-- Task media: public for OPEN tasks (feed), owner, participant, or assigned Admin.
drop policy if exists task_media_select on public.task_media;
create policy task_media_select on public.task_media
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id
            and (t.status = 'OPEN' or t.client_id = auth.uid()
                 or app.is_task_participant(t.id)))
    or app.admin_assigned_task(task_id)
  );

-- Offers: submitting Tasker, task owner, or assigned Admin only.
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers
  for select to authenticated using (
    tasker_id = auth.uid()
    or exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
    or app.admin_assigned_offer(id)
  );

-- Defense-in-depth on the direct offer insert: require an active account.
drop policy if exists offers_insert_tasker on public.offers;
create policy offers_insert_tasker on public.offers
  for insert to authenticated with check (
    tasker_id = auth.uid()
    and app.has_active_capability(array['TASKER']::user_capability[])
  );

-- Messaging: confirmed-booking participants only. The assigned case Admin reads
-- messages/media through admin_read_conversation_messages / _media (SECTION 8),
-- which audit the access. No Admin predicate here.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated using (
    app.is_conversation_participant(id)
  );

drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants
  for select to authenticated using (
    user_id = auth.uid()
    or app.is_conversation_participant(conversation_id)
  );

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (
    app.is_conversation_participant(conversation_id)
  );

drop policy if exists message_media_select on public.message_media;
create policy message_media_select on public.message_media
  for select to authenticated using (
    exists (select 1 from public.messages m where m.id = message_id
            and app.is_conversation_participant(m.conversation_id))
  );

-- Finance reads: participants see scoped rows; raw provider/ledger data is
-- ACTIVE finance/super Admin only (suspended finance Admin now excluded).
drop policy if exists payment_intents_select on public.payment_intents;
create policy payment_intents_select on public.payment_intents
  for select to authenticated using (
    exists (select 1 from public.bookings b where b.id = booking_id
            and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
    or app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
  );

drop policy if exists provider_events_admin on public.provider_events;
create policy provider_events_admin on public.provider_events
  for select to authenticated using (
    app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
  );

drop policy if exists ledger_accounts_select on public.ledger_accounts;
create policy ledger_accounts_select on public.ledger_accounts
  for select to authenticated using (
    owner_id = auth.uid()
    or app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
  );

drop policy if exists ledger_transactions_select on public.ledger_transactions;
create policy ledger_transactions_select on public.ledger_transactions
  for select to authenticated using (
    app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
    or exists (select 1 from public.bookings b where b.id = booking_id
               and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
  );

drop policy if exists ledger_entries_select on public.ledger_entries;
create policy ledger_entries_select on public.ledger_entries
  for select to authenticated using (
    app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
    or exists (select 1 from public.ledger_accounts la where la.id = account_id and la.owner_id = auth.uid())
  );

drop policy if exists refunds_select on public.refunds;
create policy refunds_select on public.refunds
  for select to authenticated using (
    app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
    or exists (select 1 from public.payment_intents pi
               join public.bookings b on b.id = pi.booking_id
               where pi.id = payment_intent_id and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
  );

drop policy if exists withdrawals_select_own on public.withdrawals;
create policy withdrawals_select_own on public.withdrawals
  for select to authenticated using (
    tasker_id = auth.uid()
    or app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[])
  );

-- Support/reports/disputes/evidence narrative: reporter/owner/participant ONLY.
-- The explicitly-assigned Admin reads case detail/evidence through the audited
-- RPCs in SECTION 8. Queue metadata is served by the SECTION 4 views. No Admin
-- predicate here (assigned or otherwise), so a direct base SELECT by any Admin
-- returns zero rows.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated using (
    reporter_id = auth.uid()
  );

drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes
  for select to authenticated using (
    opened_by = auth.uid()
    or exists (select 1 from public.bookings b where b.id = booking_id
               and (b.client_id = auth.uid() or b.tasker_id = auth.uid()))
  );

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select to authenticated using (
    user_id = auth.uid()
  );

-- Ticket messages: the requesting user reads their own non-internal messages.
-- The assigned Admin reads (including internal notes) through the audited
-- admin_read_ticket_messages RPC. Admin REPLIES still flow through the guarded
-- insert policy below (a write, not a sensitive read).
drop policy if exists ticket_messages_select on public.ticket_messages;
create policy ticket_messages_select on public.ticket_messages
  for select to authenticated using (
    is_internal = false and exists (select 1 from public.support_tickets t
       where t.id = ticket_id and t.user_id = auth.uid())
  );

drop policy if exists ticket_messages_insert on public.ticket_messages;
create policy ticket_messages_insert on public.ticket_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and (
      (is_internal = false
       and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()))
      or app.admin_assigned_ticket(ticket_id)
    )
  );

drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence
  for select to authenticated using (
    owner_id = auth.uid()
  );

-- ===========================================================================
-- SECTION 3 — Storage object policies bound to real rows (not guessed paths)
-- All buckets remain private. Writes stay owner-partitioned AND bound to a real
-- owned parent row. Reads bind the object to an actual table row so a guessed
-- path grants nothing.
-- ===========================================================================

-- id-documents: owner may read/write own partition ONLY. There is deliberately
-- NO Admin object-read policy: a direct Admin object read cannot be audited from
-- a storage RLS predicate. The assigned verification Admin obtains a short-lived
-- signed URL only after app.admin_authorize_object_read (SECTION 8) succeeds and
-- writes an audit event; the service role signs on that basis. Any residual
-- Admin object-read policy from 0010 is dropped and not recreated.
drop policy if exists id_documents_assigned_admin_read on storage.objects;
drop policy if exists id_documents_owner_rw on storage.objects;
create policy id_documents_owner_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'id-documents'
    and app.storage_seg(name, 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'id-documents'
    and app.storage_seg(name, 1) = auth.uid()::text
  );

-- portfolios: owner read/write own partition; APPROVED items are public trust
-- data (bound to the real portfolio_items row). No generic Admin read.
drop policy if exists portfolios_owner_rw on storage.objects;
create policy portfolios_owner_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'portfolios'
    and app.storage_seg(name, 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'portfolios'
    and app.storage_seg(name, 1) = auth.uid()::text
  );

drop policy if exists portfolios_public_read on storage.objects;
create policy portfolios_public_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portfolios'
    and exists (
      select 1 from public.portfolio_items pi
      where pi.storage_path = name and pi.moderation_status = 'APPROVED'
    )
  );

-- task-media: writer must own the referenced task; readers are OPEN-feed
-- viewers, owner, or participants (bound to the task_media row). No Admin object
-- read here; the assigned Admin uses admin_authorize_object_read (SECTION 8).
drop policy if exists task_media_owner_write on storage.objects;
create policy task_media_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-media'
    and app.storage_seg(name, 1) = auth.uid()::text
    and exists (
      select 1 from public.tasks t
      where t.id = app.safe_uuid(app.storage_seg(name, 2))
        and t.client_id = auth.uid()
    )
  );

drop policy if exists task_media_read on storage.objects;
create policy task_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-media'
    and exists (
      select 1
      from public.task_media tm
      join public.tasks t on t.id = tm.task_id
      where tm.storage_path = name
        and (t.status = 'OPEN'
             or t.client_id = auth.uid()
             or app.is_task_participant(t.id))
    )
  );

-- chat-media: sender must be a participant of the conversation named in the
-- path; readers are conversation participants (bound to the message_media row).
-- No Admin object read here; the assigned Admin uses admin_authorize_object_read.
drop policy if exists chat_media_owner_write on storage.objects;
create policy chat_media_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and app.storage_seg(name, 1) = auth.uid()::text
    and app.is_conversation_participant(app.safe_uuid(app.storage_seg(name, 2)))
  );

drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1
      from public.message_media mm
      join public.messages m on m.id = mm.message_id
      where mm.storage_path = name
        and app.is_conversation_participant(m.conversation_id)
    )
  );

-- evidence: owner read/write own partition ONLY. No Admin object-read policy;
-- the assigned Admin uses admin_authorize_object_read (SECTION 8). Any residual
-- Admin object-read policy from 0010 is dropped and not recreated.
drop policy if exists evidence_assigned_admin_read on storage.objects;
drop policy if exists evidence_owner_rw on storage.objects;
create policy evidence_owner_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'evidence'
    and app.storage_seg(name, 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'evidence'
    and app.storage_seg(name, 1) = auth.uid()::text
  );

-- ===========================================================================
-- SECTION 4 — Capability-scoped queue METADATA views
-- These expose ONLY non-sensitive queue columns (no narrative, no reason, no
-- storage paths) to active support/finance Admins so unassigned cases can be
-- triaged and assigned. They are ordinary (definer) views filtered by an
-- active-capability predicate; non-Admins select zero rows. They intentionally
-- omit `narrative`, `reason`, `resolution`, `subject`, and `decision_reason`.
-- ===========================================================================

create or replace view public.admin_report_queue as
select r.id, r.resource_type, r.resource_id, r.category, r.status,
       r.assignee_id, r.created_at, r.updated_at
from public.reports r
where app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);

create or replace view public.admin_dispute_queue as
select d.id, d.booking_id, d.status, d.assignee_id, d.created_at, d.updated_at
from public.disputes d
where app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);

create or replace view public.admin_ticket_queue as
select t.id, t.user_id, t.category, t.status, t.assignee_id, t.created_at, t.updated_at
from public.support_tickets t
where app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);

create or replace view public.admin_verification_queue as
select vc.id, vc.user_id, vc.status, vc.version, vc.assigned_admin_id,
       vc.submitted_at, vc.decided_at, vc.created_at, vc.updated_at
from public.verification_cases vc
where app.has_active_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);

grant select on public.admin_report_queue      to authenticated;
grant select on public.admin_dispute_queue      to authenticated;
grant select on public.admin_ticket_queue        to authenticated;
grant select on public.admin_verification_queue to authenticated;

-- ===========================================================================
-- SECTION 5 — Finance correctness & authority hardening
-- ===========================================================================

-- 5.1 request_withdrawal: add active-account gate + a per-user transaction
-- advisory lock so two concurrent requests cannot both pass the available-
-- balance check and over-reserve (invariant 5, R7 "above cleared balance = 0
-- provider requests").
create or replace function public.request_withdrawal(
  p_payout_method_id uuid, p_amount_centavos bigint, p_idempotency_key text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_withdrawal public.withdrawals;
  v_available bigint;
  v_tx uuid;
  v_acc_avail uuid;
  v_acc_clearing uuid;
begin
  select * into v_withdrawal from public.withdrawals where idempotency_key = p_idempotency_key;
  if found then return v_withdrawal; end if;

  if not app.has_active_capability(array['TASKER']::user_capability[]) then
    raise exception 'FORBIDDEN: only active Taskers may withdraw.' using errcode = 'insufficient_privilege';
  end if;

  -- Serialize concurrent withdrawal requests for this Tasker.
  perform pg_advisory_xact_lock(hashtextextended('dizkarte:withdrawal:' || auth.uid()::text, 0));

  if not exists (select 1 from public.payout_methods pm
                 where pm.id = p_payout_method_id and pm.user_id = auth.uid() and pm.status = 'active') then
    raise exception 'FORBIDDEN: payout method not found or not owned.' using errcode = 'insufficient_privilege';
  end if;

  select available_centavos into v_available from app.derive_user_balances(auth.uid());
  if p_amount_centavos <= 0 or p_amount_centavos > coalesce(v_available, 0) then
    raise exception 'INVALID_STATE: amount exceeds available balance.' using errcode = 'check_violation';
  end if;

  insert into public.withdrawals (tasker_id, payout_method_id, amount_centavos, status, idempotency_key)
  values (auth.uid(), p_payout_method_id, p_amount_centavos, 'RESERVED', p_idempotency_key)
  returning * into v_withdrawal;

  v_acc_avail    := app.ensure_ledger_account('tasker', auth.uid(), 'TASKER_AVAILABLE');
  v_acc_clearing := app.ensure_ledger_account('tasker', auth.uid(), 'PAYOUT_CLEARING');

  insert into public.ledger_transactions (type, idempotency_key, created_by, metadata)
  values ('WITHDRAWAL_RESERVE', 'wr_' || p_idempotency_key, auth.uid(),
          jsonb_build_object('withdrawal_id', v_withdrawal.id))
  returning id into v_tx;

  insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
  values (v_tx, v_acc_avail, -p_amount_centavos),
         (v_tx, v_acc_clearing, p_amount_centavos);

  return v_withdrawal;
end;
$$;

-- 5.2 admin_refund: an Admin request may NOT authoritatively refund. It now
-- validates, guards the booking state so already-released/withdrawn funds can
-- never be reversed, RECORDS a REQUESTED refund + moderation action, and posts
-- NO ledger movement and NO booking status change. Financial finalization is
-- deferred to a provider-authoritative event (5.3). This fails closed: without
-- an approved provider workflow the money state never changes.
create or replace function public.admin_refund(
  p_payment_intent_id uuid,
  p_amount_centavos bigint,
  p_reason text,
  p_idempotency_key text
)
returns public.refunds
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_refund public.refunds;
  v_intent public.payment_intents;
  v_booking public.bookings;
begin
  if not app.has_active_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]) then
    raise exception 'FORBIDDEN: requires active finance/super Admin.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_refund from public.refunds where idempotency_key = p_idempotency_key;
  if found then return v_refund; end if;

  select * into v_intent from public.payment_intents where id = p_payment_intent_id for update;
  if not found then raise exception 'NOT_FOUND: payment intent' using errcode = 'no_data_found'; end if;
  if v_intent.status <> 'CONFIRMED' then
    raise exception 'INVALID_STATE: only confirmed payments can be refunded.' using errcode = 'check_violation';
  end if;
  if p_amount_centavos <= 0 or p_amount_centavos > v_intent.amount_centavos then
    raise exception 'VALIDATION_ERROR: refund amount out of range.' using errcode = 'check_violation';
  end if;

  select * into v_booking from public.bookings where id = v_intent.booking_id for update;
  -- Funds must still be in protected hold. Once COMPLETED (released) or REFUNDED,
  -- a refund cannot be posted safely without an approved clawback policy.
  if v_booking.status not in ('CONFIRMED','IN_PROGRESS','COMPLETION_REQUESTED','DISPUTED') then
    raise exception 'INVALID_STATE: booking funds are no longer refundable in state %.', v_booking.status
      using errcode = 'check_violation';
  end if;

  -- Record the request only. No ledger movement, no booking change.
  insert into public.refunds (payment_intent_id, amount_centavos, status, reason, idempotency_key)
  values (p_payment_intent_id, p_amount_centavos, 'REQUESTED', p_reason, p_idempotency_key)
  returning * into v_refund;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(),
          (case when app.has_active_capability(array['ADMIN_SUPER']::user_capability[])
                then 'ADMIN_SUPER' else 'ADMIN_FINANCE' end)::user_capability,
          'payment_intent', p_payment_intent_id, 'refund_request', p_reason,
          jsonb_build_object('amount_centavos', p_amount_centavos,
                             'idempotency_key', p_idempotency_key,
                             'refund_id', v_refund.id,
                             'note', 'awaiting provider-authoritative finalization'));

  return v_refund;
end;
$$;

-- 5.3 process_refund_event (SERVER ONLY): provider-authoritative refund
-- finalization. Records the provider event (replay-safe), and only on a valid
-- provider-confirmed refund posts the balanced reversal (fee-correct) and marks
-- the refund SUCCEEDED and booking REFUNDED. Idempotent and reorder-safe.
create or replace function public.process_refund_event(
  p_provider text,
  p_external_event_id text,
  p_refund_idempotency_key text,
  p_provider_reference text,
  p_amount_centavos bigint,
  p_signature_valid boolean,
  p_payload_hash text
)
returns public.provider_events
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_event public.provider_events;
  v_refund public.refunds;
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_fee_total bigint;
  v_fee_portion bigint;
  v_hold_portion bigint;
  v_tx uuid;
  v_acc_hold uuid;
  v_acc_fee uuid;
  v_acc_refund uuid;
begin
  begin
    insert into public.provider_events (provider, external_event_id, event_type, provider_reference,
      amount_centavos, currency, signature_valid, payload_hash, processing_status)
    values (p_provider, p_external_event_id, 'refund.confirmed', p_provider_reference,
      p_amount_centavos, 'PHP', p_signature_valid, p_payload_hash,
      -- CASE resolves its unknown-type literals to `text`, and there is no
      -- implicit text->enum cast, so the enum column assignment must be cast
      -- explicitly (a bare literal would coerce, but a CASE result does not).
      (case when p_signature_valid then 'RECEIVED' else 'QUARANTINED' end)::provider_event_status)
    returning * into v_event;
  exception when unique_violation then
    select * into v_event from public.provider_events
      where provider = p_provider and external_event_id = p_external_event_id;
    -- Replay of an already-recorded event: report the delivery as DUPLICATE to
    -- the caller without re-processing (the refund is already finalized and the
    -- ledger idempotency key guards double-posting) and without overwriting the
    -- original persisted outcome. Mirrors process_payment_event; the previous
    -- `update ... where processing_status = 'RECEIVED'` was a no-op once the
    -- first delivery had finished processing.
    v_event.processing_status := 'DUPLICATE';
    return v_event;
  end;

  if not p_signature_valid then
    update public.provider_events set processing_status = 'QUARANTINED', error_code = 'INVALID_EVENT'
      where id = v_event.id returning * into v_event;
    return v_event;
  end if;

  select * into v_refund from public.refunds where idempotency_key = p_refund_idempotency_key for update;
  if not found then
    update public.provider_events set processing_status = 'QUARANTINED', error_code = 'UNKNOWN_REFERENCE'
      where id = v_event.id returning * into v_event;
    return v_event;
  end if;
  if v_refund.status = 'SUCCEEDED' then
    update public.provider_events set processing_status = 'DUPLICATE' where id = v_event.id
      returning * into v_event;
    return v_event; -- already finalized
  end if;
  if v_refund.amount_centavos <> p_amount_centavos then
    update public.provider_events set processing_status = 'QUARANTINED', error_code = 'AMOUNT_MISMATCH'
      where id = v_event.id returning * into v_event;
    return v_event;
  end if;

  select * into v_intent from public.payment_intents where id = v_refund.payment_intent_id for update;
  select * into v_booking from public.bookings where id = v_intent.booking_id for update;
  if v_booking.status not in ('CONFIRMED','IN_PROGRESS','COMPLETION_REQUESTED','DISPUTED') then
    update public.provider_events set processing_status = 'QUARANTINED', error_code = 'UNREFUNDABLE_STATE'
      where id = v_event.id returning * into v_event;
    return v_event;
  end if;

  -- Reverse proportionally to how the capture split fee vs protected hold.
  select coalesce(sum(le.amount_centavos), 0) into v_fee_total
  from public.ledger_entries le
  join public.ledger_transactions lt on lt.id = le.transaction_id
  join public.ledger_accounts la on la.id = le.account_id
  where lt.booking_id = v_booking.id
    and lt.type = 'PAYMENT_CAPTURE'
    and la.account_type = 'PLATFORM_FEE';

  v_fee_portion  := (v_fee_total * p_amount_centavos) / v_intent.amount_centavos;
  v_hold_portion := p_amount_centavos - v_fee_portion;

  v_acc_hold   := app.ensure_ledger_account('tasker', v_booking.tasker_id, 'PROTECTED_HOLD');
  v_acc_fee    := app.ensure_ledger_account('platform', null, 'PLATFORM_FEE');
  v_acc_refund := app.ensure_ledger_account('platform', null, 'REFUND_CLEARING');

  insert into public.ledger_transactions (booking_id, type, idempotency_key, provider_event_id, created_by, metadata)
  values (v_booking.id, 'REFUND', 'ref_final_' || v_refund.id::text, v_event.id, null,
          jsonb_build_object('refund_id', v_refund.id, 'fee_portion', v_fee_portion))
  returning id into v_tx;

  insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
  values (v_tx, v_acc_refund, p_amount_centavos),
         (v_tx, v_acc_hold, -v_hold_portion);
  if v_fee_portion > 0 then
    insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
    values (v_tx, v_acc_fee, -v_fee_portion);
  end if;

  update public.refunds set status = 'SUCCEEDED', provider_reference = p_provider_reference, updated_at = now()
    where id = v_refund.id;
  update public.bookings set status = 'REFUNDED' where id = v_booking.id;
  update public.tasks t set status = 'CANCELLED' from public.bookings b
    where b.id = v_booking.id and t.id = b.task_id;

  insert into public.booking_events (booking_id, from_status, to_status, source, idempotency_key, metadata)
  values (v_booking.id, v_booking.status, 'REFUNDED', 'provider', p_external_event_id,
          jsonb_build_object('refund_id', v_refund.id));

  update public.provider_events set processing_status = 'PROCESSED', processed_at = now()
    where id = v_event.id returning * into v_event;
  return v_event;
exception
  when unique_violation then
    -- Ledger idempotency key collision => already finalized concurrently.
    select * into v_event from public.provider_events
      where provider = p_provider and external_event_id = p_external_event_id;
    return v_event;
end;
$$;

-- 5.4 process_payout_result (SERVER ONLY): exactly-once reservation reversal on
-- payout failure (invariant "exactly-once reservation reversal on failure").
-- On FAILED it returns the reserved amount from PAYOUT_CLEARING to
-- TASKER_AVAILABLE. On PAID it records settlement status only; the settlement
-- ledger sink requires the approved payout provider integration (task 9.1) and
-- is intentionally left as a fail-closed no-op rather than a fabricated entry.
create or replace function public.process_payout_result(
  p_withdrawal_id uuid,
  p_result text,
  p_provider_reference text,
  p_failure_reason text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_w public.withdrawals;
  v_tx uuid;
  v_acc_avail uuid;
  v_acc_clearing uuid;
begin
  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'NOT_FOUND: withdrawal' using errcode = 'no_data_found'; end if;

  if p_result = 'PAID' then
    if v_w.status = 'PAID' then return v_w; end if;
    if v_w.status not in ('RESERVED','PROCESSING') then
      raise exception 'INVALID_STATE: withdrawal not settleable in state %.', v_w.status
        using errcode = 'check_violation';
    end if;
    update public.withdrawals set status = 'PAID', provider_reference = p_provider_reference, updated_at = now()
      where id = p_withdrawal_id returning * into v_w;
    return v_w;

  elsif p_result = 'FAILED' then
    if v_w.status in ('FAILED','CANCELLED') then return v_w; end if; -- idempotent
    if v_w.status not in ('RESERVED','PROCESSING') then
      raise exception 'INVALID_STATE: withdrawal not reversible in state %.', v_w.status
        using errcode = 'check_violation';
    end if;

    v_acc_avail    := app.ensure_ledger_account('tasker', v_w.tasker_id, 'TASKER_AVAILABLE');
    v_acc_clearing := app.ensure_ledger_account('tasker', v_w.tasker_id, 'PAYOUT_CLEARING');

    -- Exactly-once via unique ledger idempotency key tied to the withdrawal.
    insert into public.ledger_transactions (type, idempotency_key, metadata)
    values ('WITHDRAWAL_REVERSE', 'wrev_' || v_w.id::text,
            jsonb_build_object('withdrawal_id', v_w.id))
    returning id into v_tx;

    insert into public.ledger_entries (transaction_id, account_id, amount_centavos)
    values (v_tx, v_acc_clearing, -v_w.amount_centavos),
           (v_tx, v_acc_avail, v_w.amount_centavos);

    update public.withdrawals set status = 'FAILED', failure_reason = p_failure_reason, updated_at = now()
      where id = p_withdrawal_id returning * into v_w;
    return v_w;
  else
    raise exception 'VALIDATION_ERROR: unsupported payout result %.', p_result using errcode = 'check_violation';
  end if;
exception
  when unique_violation then
    select * into v_w from public.withdrawals where id = p_withdrawal_id;
    return v_w;
end;
$$;

-- ===========================================================================
-- SECTION 6 — Execute-grant boundaries
-- ===========================================================================

-- Server-only provider finalizers: service_role only.
revoke execute on function public.process_refund_event(text, text, text, text, bigint, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.process_refund_event(text, text, text, text, bigint, boolean, text)
  to service_role;

revoke execute on function public.process_payout_result(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.process_payout_result(uuid, text, text, text)
  to service_role;

-- Re-affirm authenticated-only grants for the redefined user/Admin commands.
revoke execute on function public.request_withdrawal(uuid, bigint, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_refund(uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_withdrawal(uuid, bigint, text) to authenticated;
grant execute on function public.admin_refund(uuid, bigint, text, text) to authenticated;

-- ===========================================================================
-- SECTION 7 — Reasoned/audited Admin action primitives
-- Shared validation + capability resolution used by the assignment, status-
-- transition, and audited-read RPCs below. Every privileged Admin touch of a
-- sensitive surface now carries a bounded, non-empty reason and an idempotency
-- key, and is attributable to a specific active capability. (R8: "Admin access
-- is reasoned and audited"; R7: server-controlled + audited.)
-- ===========================================================================

-- Bounded non-empty reason (8..1000 chars) + non-empty idempotency key
-- (1..200 chars). Raises a check_violation on any violation. Immutable/pure.
create or replace function app.assert_reasoned(p_reason text, p_idempotency_key text)
returns void
language plpgsql
immutable
as $$
begin
  if p_reason is null or btrim(p_reason) = ''
     or char_length(p_reason) < 8 or char_length(p_reason) > 1000 then
    raise exception 'VALIDATION_ERROR: a bounded non-empty reason (8..1000 chars) is required.'
      using errcode = 'check_violation';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or char_length(p_idempotency_key) > 200 then
    raise exception 'VALIDATION_ERROR: a non-empty idempotency key (1..200 chars) is required.'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Resolve the single active capability the caller is acting under, choosing the
-- first held capability in the supplied priority order. Returns NULL when the
-- caller holds none of them on an active account (used as the deny signal).
-- ADMIN_SUPER is only ever selected when it is explicitly in p_priority AND the
-- calling RPC has separately confirmed the row-level assignment — it is never an
-- implicit sensitive grant.
create or replace function app.acting_capability(p_priority user_capability[])
returns user_capability
language sql
stable
security definer
set search_path = public, app
as $$
  select c
  from unnest(p_priority) with ordinality as t(c, ord)
  where app.has_active_capability(array[c]::user_capability[])
  order by t.ord
  limit 1;
$$;

-- ===========================================================================
-- SECTION 8 — Idempotent Admin SELF-assignment RPCs
-- The caller may only assign the case to THEMSELVES (no caller-chosen assignee).
-- Requires an active, unrevoked, correct capability. Locks the target row.
-- Rejects assignment to a case already owned by another Admin (no unsafe
-- reassignment). Bounded non-empty reason + idempotency key. Records the actor,
-- acting capability, target, reason, and time in moderation_actions (immutable)
-- and a mirror access line in audit_logs. Idempotent: a replay with the same
-- (actor, key) — or a case already owned by the caller — returns the current row
-- without a second audit/moderation write.
-- ===========================================================================

create or replace function public.admin_assign_report(
  p_report_id uuid, p_reason text, p_idempotency_key text
)
returns public.reports
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.reports;
  v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: report assignment requires an active support/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.reports where id = p_report_id for update;
  if not found then raise exception 'NOT_FOUND: report' using errcode = 'no_data_found'; end if;

  -- Idempotent replay (same actor + key already recorded) or already mine.
  if v_row.assignee_id = auth.uid()
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'report' and ma.resource_id = p_report_id
                  and ma.action = 'assign' and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  if v_row.assignee_id is not null and v_row.assignee_id <> auth.uid() then
    raise exception 'CONFLICT: report is already assigned to another Admin.'
      using errcode = 'unique_violation';
  end if;

  update public.reports set assignee_id = auth.uid(), updated_at = now()
    where id = p_report_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'report', p_report_id, 'assign', p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'assigned_to', auth.uid()));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.assign.report', 'report', p_report_id,
          jsonb_build_object('capability', v_cap, 'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

create or replace function public.admin_assign_dispute(
  p_dispute_id uuid, p_reason text, p_idempotency_key text
)
returns public.disputes
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.disputes;
  v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: dispute assignment requires an active finance/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'NOT_FOUND: dispute' using errcode = 'no_data_found'; end if;

  if v_row.assignee_id = auth.uid()
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'dispute' and ma.resource_id = p_dispute_id
                  and ma.action = 'assign' and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  if v_row.assignee_id is not null and v_row.assignee_id <> auth.uid() then
    raise exception 'CONFLICT: dispute is already assigned to another Admin.'
      using errcode = 'unique_violation';
  end if;

  update public.disputes set assignee_id = auth.uid(), updated_at = now()
    where id = p_dispute_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'dispute', p_dispute_id, 'assign', p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'assigned_to', auth.uid()));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.assign.dispute', 'dispute', p_dispute_id,
          jsonb_build_object('capability', v_cap, 'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

create or replace function public.admin_assign_ticket(
  p_ticket_id uuid, p_reason text, p_idempotency_key text
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.support_tickets;
  v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: ticket assignment requires an active support/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'NOT_FOUND: ticket' using errcode = 'no_data_found'; end if;

  if v_row.assignee_id = auth.uid()
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'ticket' and ma.resource_id = p_ticket_id
                  and ma.action = 'assign' and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  if v_row.assignee_id is not null and v_row.assignee_id <> auth.uid() then
    raise exception 'CONFLICT: ticket is already assigned to another Admin.'
      using errcode = 'unique_violation';
  end if;

  update public.support_tickets set assignee_id = auth.uid(), updated_at = now()
    where id = p_ticket_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'ticket', p_ticket_id, 'assign', p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'assigned_to', auth.uid()));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.assign.ticket', 'ticket', p_ticket_id,
          jsonb_build_object('capability', v_cap, 'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

create or replace function public.admin_assign_verification(
  p_case_id uuid, p_reason text, p_idempotency_key text
)
returns public.verification_cases
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.verification_cases;
  v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: verification assignment requires an active support/super Admin.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.verification_cases where id = p_case_id for update;
  if not found then raise exception 'NOT_FOUND: verification case' using errcode = 'no_data_found'; end if;

  if v_row.assigned_admin_id = auth.uid()
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'verification_case' and ma.resource_id = p_case_id
                  and ma.action = 'assign' and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  if v_row.assigned_admin_id is not null and v_row.assigned_admin_id <> auth.uid() then
    raise exception 'CONFLICT: verification case is already assigned to another Admin.'
      using errcode = 'unique_violation';
  end if;

  update public.verification_cases set assigned_admin_id = auth.uid(), updated_at = now()
    where id = p_case_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'verification_case', p_case_id, 'assign', p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'assigned_to', auth.uid()));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.assign.verification', 'verification_case', p_case_id,
          jsonb_build_object('capability', v_cap, 'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

-- ===========================================================================
-- SECTION 9 — Idempotent status-transition RPCs (after assignment)
-- Validate against an explicit allowed-transition table, lock the row, require
-- the current caller to BE the assignee with the correct active capability,
-- bounded reason/key, and audit. There are NO direct UPDATE grants on these
-- base tables; status only ever changes through these functions.
-- ===========================================================================

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

  -- Idempotent replay or already at the target status.
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

  return v_row;
end;
$$;

create or replace function public.admin_transition_dispute(
  p_dispute_id uuid, p_to_status dispute_status, p_reason text, p_idempotency_key text
)
returns public.disputes
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.disputes;
  v_cap user_capability;
  v_from dispute_status;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: requires an active finance/super Admin.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'NOT_FOUND: dispute' using errcode = 'no_data_found'; end if;
  if v_row.assignee_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN: only the assigned Admin may transition this dispute.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.status = p_to_status
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'dispute' and ma.resource_id = p_dispute_id
                  and ma.action = 'transition:' || p_to_status::text and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  v_from := v_row.status;
  if not ((v_from::text || '>' || p_to_status::text) = any (array[
        'OPEN>UNDER_REVIEW', 'OPEN>CANCELLED',
        'UNDER_REVIEW>RESOLVED', 'UNDER_REVIEW>REJECTED',
        'UNDER_REVIEW>CANCELLED'])) then
    raise exception 'INVALID_STATE: dispute transition %->% is not allowed.', v_from, p_to_status
      using errcode = 'check_violation';
  end if;

  update public.disputes
    set status = p_to_status,
        resolution = case when p_to_status in ('RESOLVED','REJECTED') then p_reason else resolution end,
        updated_at = now()
    where id = p_dispute_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'dispute', p_dispute_id, 'transition:' || p_to_status::text, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'from', v_from, 'to', p_to_status));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.transition.dispute', 'dispute', p_dispute_id,
          jsonb_build_object('capability', v_cap, 'from', v_from, 'to', p_to_status,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

create or replace function public.admin_transition_ticket(
  p_ticket_id uuid, p_to_status ticket_status, p_reason text, p_idempotency_key text
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.support_tickets;
  v_cap user_capability;
  v_from ticket_status;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  if v_cap is null then
    raise exception 'FORBIDDEN: requires an active support/super Admin.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'NOT_FOUND: ticket' using errcode = 'no_data_found'; end if;
  if v_row.assignee_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN: only the assigned Admin may transition this ticket.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.status = p_to_status
     or exists (select 1 from public.moderation_actions ma
                where ma.resource_type = 'ticket' and ma.resource_id = p_ticket_id
                  and ma.action = 'transition:' || p_to_status::text and ma.admin_id = auth.uid()
                  and ma.metadata->>'idempotency_key' = p_idempotency_key) then
    return v_row;
  end if;

  v_from := v_row.status;
  if not ((v_from::text || '>' || p_to_status::text) = any (array[
        'OPEN>PENDING', 'OPEN>RESOLVED', 'OPEN>CLOSED',
        'PENDING>OPEN', 'PENDING>RESOLVED',
        'RESOLVED>CLOSED'])) then
    raise exception 'INVALID_STATE: ticket transition %->% is not allowed.', v_from, p_to_status
      using errcode = 'check_violation';
  end if;

  update public.support_tickets set status = p_to_status, updated_at = now()
    where id = p_ticket_id returning * into v_row;

  insert into public.moderation_actions (admin_id, capability, resource_type, resource_id, action, reason, metadata)
  values (auth.uid(), v_cap, 'ticket', p_ticket_id, 'transition:' || p_to_status::text, p_reason,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'from', v_from, 'to', p_to_status));
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
  values (auth.uid(), 'admin.transition.ticket', 'ticket', p_ticket_id,
          jsonb_build_object('capability', v_cap, 'from', v_from, 'to', p_to_status,
                             'idempotency_key', p_idempotency_key));

  return v_row;
end;
$$;

-- ===========================================================================
-- SECTION 10 — Audited sensitive-read RPCs + storage authorization RPC
-- Each requires an active correct capability AND an explicit assignment to the
-- specific case/resource (reusing the SECTION 1 assignment predicates), a
-- bounded reason + idempotency key, and writes EXACTLY ONE audit_logs row per
-- distinct idempotency key (a replay returns the same data without a second
-- audit row). Unassigned/other-assignee/super-without-assignment callers are
-- denied (function raises; zero rows leak). These are the ONLY authorized Admin
-- read paths for the sensitive base tables, whose RLS (SECTION 2) now excludes
-- Admins entirely.
-- ===========================================================================

-- Internal: append one audit read line unless this exact (actor, action,
-- resource, key) line already exists. The transaction-scoped advisory lock
-- serializes concurrent replays before the check-and-insert without making the
-- append-only audit table mutable.
drop function if exists app.audit_read_once(text, text, uuid, user_capability, text);
create or replace function app.audit_read_once(
  p_action text, p_resource_type text, p_resource_id uuid,
  p_capability user_capability, p_reason text, p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array('dizkarte:audit-read', auth.uid(), p_action,
                      p_resource_type, p_resource_id, p_idempotency_key)::text,
    0));

  if not exists (
    select 1 from public.audit_logs
    where actor_id = auth.uid() and action = p_action
      and resource_type = p_resource_type and resource_id = p_resource_id
      and safe_metadata->>'idempotency_key' = p_idempotency_key
  ) then
    insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
    values (auth.uid(), p_action, p_resource_type, p_resource_id,
            jsonb_build_object('capability', p_capability, 'reason', p_reason,
                               'idempotency_key', p_idempotency_key));
  end if;
end;
$$;

create or replace function public.admin_read_report_case(
  p_report_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.reports
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_report(p_report_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this report.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.report', 'report', p_report_id, v_cap, p_reason, p_idempotency_key);
  return query select * from public.reports where id = p_report_id;
end;
$$;

create or replace function public.admin_read_dispute_case(
  p_dispute_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.disputes
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_dispute(p_dispute_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this dispute.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.dispute', 'dispute', p_dispute_id, v_cap, p_reason, p_idempotency_key);
  return query select * from public.disputes where id = p_dispute_id;
end;
$$;

create or replace function public.admin_read_ticket_case(
  p_ticket_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.support_tickets
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_ticket(p_ticket_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this ticket.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.ticket', 'ticket', p_ticket_id, v_cap, p_reason, p_idempotency_key);
  return query select * from public.support_tickets where id = p_ticket_id;
end;
$$;

-- Ticket messages (including internal notes) for the assigned support Admin.
create or replace function public.admin_read_ticket_messages(
  p_ticket_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.ticket_messages
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_ticket(p_ticket_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this ticket.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.ticket_messages', 'ticket', p_ticket_id, v_cap, p_reason, p_idempotency_key);
  return query select * from public.ticket_messages where ticket_id = p_ticket_id order by created_at;
end;
$$;

-- Conversation messages for the Admin assigned to the linked report/dispute.
create or replace function public.admin_read_conversation_messages(
  p_conversation_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_conversation(p_conversation_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this conversation.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.conversation', 'conversation', p_conversation_id, v_cap, p_reason, p_idempotency_key);
  return query select * from public.messages where conversation_id = p_conversation_id order by created_at;
end;
$$;

-- Conversation message-media METADATA (no bytes) for the assigned Admin.
create or replace function public.admin_read_conversation_media(
  p_conversation_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.message_media
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_conversation(p_conversation_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this conversation.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.conversation_media', 'conversation', p_conversation_id, v_cap, p_reason, p_idempotency_key);
  return query
    select mm.* from public.message_media mm
    join public.messages m on m.id = mm.message_id
    where m.conversation_id = p_conversation_id
    order by mm.id;
end;
$$;

-- Verification ID-document METADATA (kind/path/mime/size) for the assigned
-- verification Admin. The bytes require admin_authorize_object_read + signing.
create or replace function public.admin_read_verification_case(
  p_case_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.verification_documents
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_verification(p_case_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this verification case.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.verification', 'verification_case', p_case_id, v_cap, p_reason, p_idempotency_key);
  return query select * from public.verification_documents where case_id = p_case_id order by created_at;
end;
$$;

-- Evidence METADATA for the Admin assigned to the parent resource.
create or replace function public.admin_read_evidence(
  p_resource_type text, p_resource_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.evidence
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_evidence(p_resource_type, p_resource_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this evidence resource.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.evidence', p_resource_type, p_resource_id, v_cap, p_reason, p_idempotency_key);
  return query
    select * from public.evidence
    where resource_type = p_resource_type and resource_id = p_resource_id
    order by created_at;
end;
$$;

-- Exact private location for the Admin assigned to a report/dispute on the
-- task's booking (invariant 2 gate + audit).
create or replace function public.admin_read_task_location(
  p_task_id uuid, p_reason text, p_idempotency_key text
)
returns setof public.task_private_locations
language plpgsql
security definer
set search_path = public, app
as $$
declare v_cap user_capability;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);
  if not app.admin_assigned_task(p_task_id) then
    raise exception 'FORBIDDEN: not the assigned Admin for this task.' using errcode = 'insufficient_privilege';
  end if;
  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  perform app.audit_read_once('admin.read.task_location', 'task', p_task_id, v_cap, p_reason, p_idempotency_key);
  return query select * from public.task_private_locations where task_id = p_task_id;
end;
$$;

-- Storage signed-URL authorization for a trusted server-side adapter.
-- Given a bucket + object name, binds the object to its real table row and
-- verifies the caller is the assigned Admin for that row (active capability).
-- On success it writes exactly one audit event (idempotent per key) and returns
-- TRUE; on a malformed/unbound path or wrong/unassigned caller it returns FALSE
-- and writes nothing. It NEVER returns object bytes or a URL. Contract: the
-- signed-URL adapter MUST call this with the acting Admin's JWT and may ask the
-- service role to sign a short-lived URL ONLY when it returns TRUE. (Do not log
-- from an RLS predicate — this SECURITY DEFINER function is the audit point.)
create or replace function public.admin_authorize_object_read(
  p_bucket text, p_name text, p_reason text, p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_ok boolean := false;
  v_cap user_capability;
  v_rtype text;
  v_rid uuid;
  v_ert text;
  v_erid uuid;
begin
  perform app.assert_reasoned(p_reason, p_idempotency_key);

  if p_bucket = 'id-documents' then
    select vd.case_id into v_rid from public.verification_documents vd where vd.storage_path = p_name;
    if v_rid is not null and app.admin_assigned_verification(v_rid) then
      v_ok := true; v_rtype := 'verification_case';
    end if;
  elsif p_bucket = 'chat-media' then
    select m.conversation_id into v_rid
      from public.message_media mm join public.messages m on m.id = mm.message_id
      where mm.storage_path = p_name;
    if v_rid is not null and app.admin_assigned_conversation(v_rid) then
      v_ok := true; v_rtype := 'conversation';
    end if;
  elsif p_bucket = 'evidence' then
    select e.resource_type, e.resource_id into v_ert, v_erid
      from public.evidence e where e.storage_path = p_name;
    if v_erid is not null and app.admin_assigned_evidence(v_ert, v_erid) then
      v_ok := true; v_rtype := v_ert; v_rid := v_erid;
    end if;
  elsif p_bucket = 'task-media' then
    select tm.task_id into v_rid from public.task_media tm where tm.storage_path = p_name;
    if v_rid is not null and app.admin_assigned_task(v_rid) then
      v_ok := true; v_rtype := 'task';
    end if;
  end if;

  if not v_ok then
    return false;
  end if;

  v_cap := app.acting_capability(array['ADMIN_SUPPORT','ADMIN_FINANCE','ADMIN_SUPER']::user_capability[]);
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array('dizkarte:audit-read', auth.uid(),
                      'admin.storage.authorize', v_rtype, v_rid,
                      p_bucket, p_name, p_idempotency_key)::text,
    0));

  if not exists (
    select 1 from public.audit_logs
    where actor_id = auth.uid() and action = 'admin.storage.authorize'
      and resource_type = v_rtype and resource_id = v_rid
      and safe_metadata->>'bucket' = p_bucket
      and safe_metadata->>'object_name' = p_name
      and safe_metadata->>'idempotency_key' = p_idempotency_key
  ) then
    insert into public.audit_logs (actor_id, action, resource_type, resource_id, safe_metadata)
    values (auth.uid(), 'admin.storage.authorize', v_rtype, v_rid,
            jsonb_build_object('capability', v_cap, 'reason', p_reason,
                               'bucket', p_bucket, 'object_name', p_name,
                               'idempotency_key', p_idempotency_key));
  end if;

  return true;
end;
$$;

-- ===========================================================================
-- SECTION 11 — Execute-grant boundaries for the new RPCs and helpers
-- Public RPCs re-derive auth.uid() and re-check authorization. Revoke default
-- PostgreSQL PUBLIC execution (and any stale explicit grants) before granting
-- only the intended authenticated/service roles. Internal definer helpers are
-- not directly callable, except the narrow predicates required by RLS.
-- ===========================================================================

-- Internal helpers: owner/definer call paths only unless RLS evaluates them.
revoke execute on function app.has_active_capability(user_capability[])
  from public, anon, authenticated, service_role;
revoke execute on function app.is_active_account()
  from public, anon, authenticated, service_role;
revoke execute on function app.safe_uuid(text)
  from public, anon, authenticated, service_role;
revoke execute on function app.storage_seg(text, integer)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_verification(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_report(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_dispute(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_ticket(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_booking(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_conversation(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_task(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_offer(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.admin_assigned_evidence(text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app.assert_reasoned(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function app.acting_capability(user_capability[])
  from public, anon, authenticated, service_role;
revoke execute on function app.audit_read_once(text, text, uuid, user_capability, text, text)
  from public, anon, authenticated, service_role;

-- These helpers are direct RLS predicates/path parsers for authenticated rows.
grant execute on function app.has_active_capability(user_capability[]) to authenticated;
grant execute on function app.safe_uuid(text) to authenticated;
grant execute on function app.storage_seg(text, integer) to authenticated;
grant execute on function app.admin_assigned_task(uuid) to authenticated;
grant execute on function app.admin_assigned_offer(uuid) to authenticated;

-- Admin assignment RPCs.
revoke execute on function public.admin_assign_report(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_assign_dispute(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_assign_ticket(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_assign_verification(uuid, text, text)
  from public, anon, authenticated, service_role;

-- Admin transition RPCs.
revoke execute on function public.admin_transition_report(uuid, report_status, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_transition_dispute(uuid, dispute_status, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_transition_ticket(uuid, ticket_status, text, text)
  from public, anon, authenticated, service_role;

-- Audited sensitive-read and storage-authorization RPCs.
revoke execute on function public.admin_read_report_case(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_read_dispute_case(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_read_ticket_case(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_read_ticket_messages(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_read_conversation_messages(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_read_conversation_media(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_read_verification_case(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_read_evidence(text, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_read_task_location(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_authorize_object_read(text, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_assign_report(uuid, text, text)              to authenticated;
grant execute on function public.admin_assign_dispute(uuid, text, text)             to authenticated;
grant execute on function public.admin_assign_ticket(uuid, text, text)              to authenticated;
grant execute on function public.admin_assign_verification(uuid, text, text)        to authenticated;

grant execute on function public.admin_transition_report(uuid, report_status, text, text)   to authenticated;
grant execute on function public.admin_transition_dispute(uuid, dispute_status, text, text) to authenticated;
grant execute on function public.admin_transition_ticket(uuid, ticket_status, text, text)   to authenticated;

grant execute on function public.admin_read_report_case(uuid, text, text)            to authenticated;
grant execute on function public.admin_read_dispute_case(uuid, text, text)           to authenticated;
grant execute on function public.admin_read_ticket_case(uuid, text, text)            to authenticated;
grant execute on function public.admin_read_ticket_messages(uuid, text, text)        to authenticated;
grant execute on function public.admin_read_conversation_messages(uuid, text, text)  to authenticated;
grant execute on function public.admin_read_conversation_media(uuid, text, text)     to authenticated;
grant execute on function public.admin_read_verification_case(uuid, text, text)      to authenticated;
grant execute on function public.admin_read_evidence(text, uuid, text, text)         to authenticated;
grant execute on function public.admin_read_task_location(uuid, text, text)          to authenticated;

grant execute on function public.admin_authorize_object_read(text, text, text, text) to authenticated;
grant execute on function public.admin_authorize_object_read(text, text, text, text) to service_role;
