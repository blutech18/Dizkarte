-- LOCAL TEST HARNESS ONLY — not part of the application schema.
--
-- A bare `supabase/postgres` image ships the `storage` SCHEMA but not its tables
-- (storage-api creates those on first boot of a full stack). Migration 0010
-- declares the bucket rows and object policies, and `security_hardening.sql`
-- exercises them, so both need a minimal stand-in when the suites are run against
-- a disposable Postgres container instead of `supabase start`.
--
-- Deliberately minimal and faithful only where the tests touch it: bucket/object
-- identity, `storage.foldername`, RLS enabled, and the same role grants the real
-- schema exposes (policies, not grants, are the row gate).
--
-- Apply BEFORE the migrations:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/_local_storage_shim.sql

create schema if not exists storage;

create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  owner      uuid,
  public     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets(id),
  name             text,
  owner            uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  metadata         jsonb
);

create index if not exists ix_storage_objects_bucket on storage.objects (bucket_id, name);

-- Real signature: splits an object path into its folder segments.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema storage to postgres, anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
