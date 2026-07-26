-- 0002_identity_profiles.sql
-- Identity, profile, capabilities, verification, and devices.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Application data separate from auth.users.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 2 and 80),
  avatar_path    text,
  mobile         text,
  city_code      text,
  barangay_code  text,
  language       text not null default 'en' check (language in ('en', 'fil')),
  bio            text check (bio is null or char_length(bio) <= 2000),
  account_status account_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_capabilities: server-granted roles. Users cannot write this table.
-- ---------------------------------------------------------------------------
create table if not exists public.user_capabilities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  capability  user_capability not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references public.profiles(id),
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles(id)
);

-- One active grant per (user, capability).
create unique index if not exists uq_user_capability_active
  on public.user_capabilities (user_id, capability)
  where revoked_at is null;

create index if not exists ix_user_capabilities_user on public.user_capabilities (user_id);

-- ---------------------------------------------------------------------------
-- verification_cases: identity verification lifecycle.
-- ---------------------------------------------------------------------------
create table if not exists public.verification_cases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  status           verification_status not null default 'DRAFT',
  version          integer not null default 1 check (version >= 1),
  submitted_at     timestamptz,
  decided_at       timestamptz,
  decided_by       uuid references public.profiles(id),
  decision_reason  text check (decision_reason is null or char_length(decision_reason) <= 1000),
  assigned_admin_id uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Only one non-terminal (active) case per user at a time.
create unique index if not exists uq_verification_active_case
  on public.verification_cases (user_id)
  where status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RESUBMISSION_REQUIRED');

create index if not exists ix_verification_cases_status on public.verification_cases (status);

drop trigger if exists trg_verification_cases_updated_at on public.verification_cases;
create trigger trg_verification_cases_updated_at
  before update on public.verification_cases
  for each row execute function app.set_updated_at();

create table if not exists public.verification_documents (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.verification_cases(id) on delete cascade,
  kind        text not null check (kind in ('government_id_front', 'government_id_back', 'selfie')),
  storage_path text not null,
  mime_type   text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes  bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at  timestamptz not null default now()
);

create index if not exists ix_verification_documents_case on public.verification_documents (case_id);

-- Immutable audit trail of verification status changes.
create table if not exists public.verification_events (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.verification_cases(id) on delete cascade,
  from_status verification_status,
  to_status   verification_status not null,
  actor_id    uuid references public.profiles(id),
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists ix_verification_events_case on public.verification_events (case_id, created_at);

-- ---------------------------------------------------------------------------
-- devices: push registration. Token stored as a reference/hash, never raw.
-- ---------------------------------------------------------------------------
create table if not exists public.devices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  platform       text not null check (platform in ('ios', 'android')),
  token_reference text not null,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, token_reference)
);

drop trigger if exists trg_devices_updated_at on public.devices;
create trigger trg_devices_updated_at
  before update on public.devices
  for each row execute function app.set_updated_at();


-- ---------------------------------------------------------------------------
-- Capability / admin helper functions (moved here from 0001).
-- These are `language sql` SECURITY DEFINER helpers whose bodies read
-- public.user_capabilities and public.profiles, so they must be created AFTER
-- those tables (defined above in this migration). PostgreSQL validates SQL
-- function bodies at creation time, so defining them in 0001 failed with
-- "relation public.user_capabilities does not exist".
-- ---------------------------------------------------------------------------

-- Returns the set of capabilities for the current authenticated user.
-- SECURITY DEFINER so RLS policies can call it without exposing the table.
create or replace function app.current_capabilities()
returns user_capability[]
language sql
stable
security definer
set search_path = public, app
as $$
  select coalesce(array_agg(uc.capability), '{}')
  from public.user_capabilities uc
  where uc.user_id = auth.uid()
    and uc.revoked_at is null;
$$;

-- True when the current user holds any of the given capabilities.
create or replace function app.has_capability(caps user_capability[])
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.user_capabilities uc
    where uc.user_id = auth.uid()
      and uc.revoked_at is null
      and uc.capability = any(caps)
  );
$$;

-- True when the current user is any active Admin.
create or replace function app.is_admin()
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
      and uc.capability in ('ADMIN_SUPPORT', 'ADMIN_FINANCE', 'ADMIN_SUPER')
      and p.account_status = 'active'
  );
$$;
