-- 0003_taskers.sql
-- Tasker applications, public profiles, specialties, service areas, portfolio,
-- and the payout-token boundary (no raw wallet/card credentials).

create table if not exists public.tasker_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  status           tasker_application_status not null default 'DRAFT',
  bio              text not null check (char_length(bio) between 20 and 2000),
  experience       text not null check (char_length(experience) between 1 and 2000),
  payout_provider  text,
  -- Payout token boundary: only an opaque reference, never raw credentials.
  payout_reference text,
  submitted_at     timestamptz,
  decided_at       timestamptz,
  decided_by       uuid references public.profiles(id),
  decision_reason  text,
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_no_raw_card check (payout_reference is null or payout_reference !~ '^[0-9]{13,19}$')
);

create unique index if not exists uq_tasker_application_active
  on public.tasker_applications (user_id)
  where status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RESUBMISSION_REQUIRED');

drop trigger if exists trg_tasker_applications_updated_at on public.tasker_applications;
create trigger trg_tasker_applications_updated_at
  before update on public.tasker_applications
  for each row execute function app.set_updated_at();

-- Public trust profile. Excludes private identity/payout/exact address/admin notes.
create table if not exists public.tasker_profiles (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  public_bio       text not null default '',
  public_experience text not null default '',
  completion_count integer not null default 0 check (completion_count >= 0),
  rating_sum       integer not null default 0 check (rating_sum >= 0),
  rating_count     integer not null default 0 check (rating_count >= 0),
  approved_at      timestamptz,
  suspended_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_tasker_profiles_updated_at on public.tasker_profiles;
create trigger trg_tasker_profiles_updated_at
  before update on public.tasker_profiles
  for each row execute function app.set_updated_at();

create table if not exists public.specialties (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  active     boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.tasker_specialties (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  primary key (user_id, specialty_id)
);

create table if not exists public.service_areas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  city_code     text not null,
  barangay_code text,
  radius_km     integer check (radius_km is null or (radius_km between 1 and 100)),
  created_at    timestamptz not null default now()
);

create index if not exists ix_service_areas_user on public.service_areas (user_id);
create index if not exists ix_service_areas_city on public.service_areas (city_code);

create table if not exists public.portfolio_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  storage_path     text not null,
  caption          text check (caption is null or char_length(caption) <= 280),
  sort_order       integer not null default 0,
  moderation_status moderation_status not null default 'PENDING',
  created_at       timestamptz not null default now()
);

create index if not exists ix_portfolio_items_user on public.portfolio_items (user_id);

-- payout_methods: masked label + provider reference only; no raw credential.
create table if not exists public.payout_methods (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  provider          text not null,
  provider_reference text not null,
  masked_label      text not null,
  status            text not null default 'active' check (status in ('active', 'disabled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint chk_payout_no_raw_card check (provider_reference !~ '^[0-9]{13,19}$')
);

drop trigger if exists trg_payout_methods_updated_at on public.payout_methods;
create trigger trg_payout_methods_updated_at
  before update on public.payout_methods
  for each row execute function app.set_updated_at();
