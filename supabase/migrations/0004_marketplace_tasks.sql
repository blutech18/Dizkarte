-- 0004_marketplace_tasks.sql
-- Categories, tasks, separated public/private locations, media, questions,
-- offers, bookings, and the one-active-booking constraint.

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  active     boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.profiles(id) on delete cascade,
  category_id     uuid not null references public.categories(id),
  title           text not null check (char_length(title) between 5 and 120),
  description     text not null check (char_length(description) between 20 and 4000),
  budget_centavos bigint not null check (budget_centavos >= 2000 and budget_centavos <= 100000000),
  currency        text not null default 'PHP' check (currency = 'PHP'),
  scheduled_for   timestamptz,
  same_day        boolean not null default false,
  status          task_status not null default 'DRAFT',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ix_tasks_status on public.tasks (status);
create index if not exists ix_tasks_client on public.tasks (client_id);
create index if not exists ix_tasks_category on public.tasks (category_id);
-- Feed access pattern: open tasks newest-first.
create index if not exists ix_tasks_open_published
  on public.tasks (published_at desc)
  where status = 'OPEN';

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function app.set_updated_at();

-- Public approximate location. Structurally separate from the exact address.
create table if not exists public.task_public_locations (
  task_id         uuid primary key references public.tasks(id) on delete cascade,
  city_code       text not null,
  barangay_code   text not null,
  landmark        text not null default '',
  approximate_point geography(Point, 4326) not null
);

create index if not exists ix_task_public_locations_city
  on public.task_public_locations (city_code, barangay_code);
create index if not exists ix_task_public_locations_geo
  on public.task_public_locations using gist (approximate_point);

-- Private exact location. Never included in any public projection/view.
create table if not exists public.task_private_locations (
  task_id       uuid primary key references public.tasks(id) on delete cascade,
  exact_address text not null,
  exact_point   geography(Point, 4326) not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.task_media (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  storage_path     text not null,
  kind             text not null check (kind in ('image', 'video')),
  moderation_status moderation_status not null default 'PENDING',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists ix_task_media_task on public.task_media (task_id);

create table if not exists public.task_questions (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  status     moderation_status not null default 'APPROVED',
  answer     text,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_task_questions_task on public.task_questions (task_id);

create table if not exists public.offers (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  tasker_id        uuid not null references public.profiles(id) on delete cascade,
  amount_centavos  bigint not null check (amount_centavos > 0 and amount_centavos <= 100000000),
  currency         text not null default 'PHP' check (currency = 'PHP'),
  message          text not null check (char_length(message) between 1 and 2000),
  eta_text         text not null,
  availability_text text not null,
  experience_text  text not null,
  status           offer_status not null default 'SUBMITTED',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A Tasker may have at most one active offer per task.
  constraint uq_offer_task_tasker unique (task_id, tasker_id)
);

create index if not exists ix_offers_task on public.offers (task_id);
create index if not exists ix_offers_tasker on public.offers (tasker_id);

drop trigger if exists trg_offers_updated_at on public.offers;
create trigger trg_offers_updated_at
  before update on public.offers
  for each row execute function app.set_updated_at();

create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  accepted_offer_id uuid not null references public.offers(id),
  client_id        uuid not null references public.profiles(id),
  tasker_id        uuid not null references public.profiles(id),
  agreed_centavos  bigint not null check (agreed_centavos > 0 and agreed_centavos <= 100000000),
  currency         text not null default 'PHP' check (currency = 'PHP'),
  status           booking_status not null default 'PAYMENT_PENDING',
  idempotency_key  text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint uq_booking_accepted_offer unique (accepted_offer_id),
  constraint uq_booking_idempotency unique (idempotency_key),
  constraint chk_booking_participants check (client_id <> tasker_id)
);

-- One-active-booking-per-task invariant (core invariant 3).
create unique index if not exists uq_booking_active_per_task
  on public.bookings (task_id)
  where status in ('PAYMENT_PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETION_REQUESTED');

create index if not exists ix_bookings_client on public.bookings (client_id);
create index if not exists ix_bookings_tasker on public.bookings (tasker_id);

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
  before update on public.bookings
  for each row execute function app.set_updated_at();

create table if not exists public.booking_events (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  from_status    booking_status,
  to_status      booking_status not null,
  actor_id       uuid references public.profiles(id),
  source         text not null default 'system' check (source in ('client', 'tasker', 'admin', 'provider', 'system')),
  idempotency_key text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint uq_booking_event_idempotency unique (booking_id, idempotency_key)
);

create index if not exists ix_booking_events_booking on public.booking_events (booking_id, created_at);

create table if not exists public.offer_events (
  id         uuid primary key default gen_random_uuid(),
  offer_id   uuid not null references public.offers(id) on delete cascade,
  actor_id   uuid references public.profiles(id),
  event_type text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_offer_events_offer on public.offer_events (offer_id, created_at);
