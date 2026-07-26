-- 0007_reviews_safety_ops.sql
-- Reviews and aggregates, reports, disputes, support tickets, evidence,
-- moderation actions, audit logs, and app settings.

create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  reviewer_id  uuid not null references public.profiles(id),
  reviewee_id  uuid not null references public.profiles(id),
  score        integer not null check (score between 1 and 5),
  comment      text check (comment is null or char_length(comment) <= 2000),
  status       review_status not null default 'HIDDEN',
  submitted_at timestamptz not null default now(),
  revealed_at  timestamptz,
  -- At most one review per reviewer per booking (requirement R10).
  constraint uq_review_booking_reviewer unique (booking_id, reviewer_id),
  constraint chk_review_distinct check (reviewer_id <> reviewee_id)
);

create index if not exists ix_reviews_reviewee on public.reviews (reviewee_id);

create table if not exists public.review_dimensions (
  review_id uuid not null references public.reviews(id) on delete cascade,
  dimension text not null check (dimension in
    ('communication', 'quality', 'timeliness', 'professionalism')),
  score     integer not null check (score between 1 and 5),
  primary key (review_id, dimension)
);

create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.profiles(id) on delete cascade,
  resource_type text not null check (resource_type in ('task', 'user', 'message', 'offer', 'booking')),
  resource_id   uuid not null,
  category      text not null check (category in
    ('fraud', 'harassment', 'inappropriate', 'safety', 'spam', 'other')),
  narrative     text not null check (char_length(narrative) between 10 and 4000),
  status        report_status not null default 'OPEN',
  assignee_id   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ix_reports_status on public.reports (status);
create index if not exists ix_reports_reporter on public.reports (reporter_id);

drop trigger if exists trg_reports_updated_at on public.reports;
create trigger trg_reports_updated_at
  before update on public.reports
  for each row execute function app.set_updated_at();

create table if not exists public.disputes (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  opened_by   uuid not null references public.profiles(id),
  status      dispute_status not null default 'OPEN',
  reason      text not null,
  assignee_id uuid references public.profiles(id),
  resolution  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ix_disputes_booking on public.disputes (booking_id);
create index if not exists ix_disputes_status on public.disputes (status);

drop trigger if exists trg_disputes_updated_at on public.disputes;
create trigger trg_disputes_updated_at
  before update on public.disputes
  for each row execute function app.set_updated_at();

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  subject     text not null,
  narrative   text not null,
  category    text not null check (category in ('account', 'payment', 'task', 'safety', 'other')),
  status      ticket_status not null default 'OPEN',
  assignee_id uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ix_support_tickets_user on public.support_tickets (user_id);
create index if not exists ix_support_tickets_status on public.support_tickets (status);

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function app.set_updated_at();

create table if not exists public.ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id),
  body       text not null check (char_length(body) between 1 and 4000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ix_ticket_messages_ticket on public.ticket_messages (ticket_id, created_at);

create table if not exists public.evidence (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  resource_type text not null check (resource_type in ('report', 'dispute', 'ticket', 'booking')),
  resource_id   uuid not null,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);

create index if not exists ix_evidence_resource on public.evidence (resource_type, resource_id);

-- Immutable material Admin actions.
create table if not exists public.moderation_actions (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.profiles(id),
  capability    user_capability not null,
  resource_type text not null,
  resource_id   uuid not null,
  action        text not null,
  reason        text not null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists ix_moderation_actions_resource
  on public.moderation_actions (resource_type, resource_id);

drop trigger if exists trg_moderation_actions_immutable on public.moderation_actions;
create trigger trg_moderation_actions_immutable
  before update or delete on public.moderation_actions
  for each row execute function app.forbid_mutation();

-- Append-only audit log with safe metadata only.
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.profiles(id),
  action        text not null,
  resource_type text,
  resource_id   uuid,
  request_id    text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists ix_audit_logs_actor on public.audit_logs (actor_id, created_at desc);
create index if not exists ix_audit_logs_resource on public.audit_logs (resource_type, resource_id);

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function app.forbid_mutation();

-- Typed app settings, mutated only through privileged functions.
create table if not exists public.app_settings (
  key         text primary key,
  typed_value jsonb not null,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);
