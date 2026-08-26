-- 0037_support_ticket_subject.sql
--
-- Persist the concrete subject a support ticket concerns.
--
-- A ticket is opened from a specific task or booking: the mobile client passes
-- `subjectType` + `subjectId` (e.g. the booking uuid) into `submitSupportTicket`.
-- Until now only a free-text `subject` ("booking concern") was stored, so the
-- concrete id was discarded the moment the ticket was submitted and could never
-- be shown back to the requester or resolved by an admin. This adds first-class,
-- nullable columns for that link so the association survives a round-trip.
--
-- SAFETY: purely additive. No existing column, row, trigger, or policy is
-- altered; the new columns default to NULL (general tickets legitimately have no
-- subject), and every statement is idempotent so re-running the migration is a
-- no-op. Table-level privileges granted in 0014 already cover new columns, so
-- `authenticated` can read/write them under the existing RLS row gate.

alter table public.support_tickets
  add column if not exists subject_type text,
  add column if not exists subject_id   uuid;

-- Constrain the type only when a subject is actually set; general tickets keep
-- both columns NULL. Dropped-then-added so the migration stays re-runnable.
alter table public.support_tickets
  drop constraint if exists support_tickets_subject_type_check;
alter table public.support_tickets
  add constraint support_tickets_subject_type_check
  check (subject_type is null or subject_type in ('task', 'booking'));

-- Admin/reporting lookups by concrete subject (e.g. every ticket for one booking).
create index if not exists ix_support_tickets_subject
  on public.support_tickets (subject_type, subject_id);
