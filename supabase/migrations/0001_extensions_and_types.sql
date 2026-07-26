-- 0001_extensions_and_types.sql
-- Dizkarte schema foundation: extensions, enum types, and shared helpers.
-- Idempotent where practical. Applied as a reviewed forward migration.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";         -- case-insensitive email
create extension if not exists "postgis";        -- geography(Point, 4326)

-- ---------------------------------------------------------------------------
-- Application schema for privileged/internal objects that must not be exposed
-- directly through PostgREST.
-- ---------------------------------------------------------------------------
create schema if not exists app;

-- RLS policy predicates and the helper functions used by policies live in the
-- `app` schema. The Supabase API roles need USAGE on the schema to invoke them
-- (per-function EXECUTE is still controlled individually, and `app` is never
-- added to PostgREST's exposed schemas, so this does not expose anything via
-- the REST API). Without this grant, any RLS policy that calls `app.*` fails at
-- query time with "permission denied for schema app".
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enum types. Values mirror @dizkarte/domain status unions exactly.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type account_status as enum ('active', 'suspended', 'banned', 'deactivated');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_capability') then
    create type user_capability as enum
      ('CLIENT', 'TASKER', 'ADMIN_SUPPORT', 'ADMIN_FINANCE', 'ADMIN_SUPER');
  end if;

  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type verification_status as enum
      ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED');
  end if;

  if not exists (select 1 from pg_type where typname = 'tasker_application_status') then
    create type tasker_application_status as enum
      ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED', 'SUSPENDED');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum
      ('DRAFT', 'OPEN', 'BOOKING_PENDING', 'ASSIGNED', 'IN_PROGRESS',
       'COMPLETION_REQUESTED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'DISPUTED', 'REMOVED');
  end if;

  if not exists (select 1 from pg_type where typname = 'offer_status') then
    create type offer_status as enum
      ('SUBMITTED', 'SELECTED', 'WITHDRAWN', 'REJECTED', 'EXPIRED');
  end if;

  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type booking_status as enum
      ('PAYMENT_PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETION_REQUESTED',
       'COMPLETED', 'PAYMENT_FAILED', 'CANCELLED', 'DISPUTED', 'REFUNDED');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('CREATED', 'PENDING', 'CONFIRMED', 'FAILED');
  end if;

  if not exists (select 1 from pg_type where typname = 'withdrawal_status') then
    create type withdrawal_status as enum
      ('REQUESTED', 'RESERVED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');
  end if;

  if not exists (select 1 from pg_type where typname = 'review_status') then
    create type review_status as enum ('HIDDEN', 'REVEALED', 'MODERATED');
  end if;

  if not exists (select 1 from pg_type where typname = 'dispute_status') then
    create type dispute_status as enum ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CANCELLED');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type report_status as enum ('OPEN', 'TRIAGED', 'ACTIONED', 'DISMISSED');
  end if;

  if not exists (select 1 from pg_type where typname = 'ticket_status') then
    create type ticket_status as enum ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');
  end if;

  if not exists (select 1 from pg_type where typname = 'moderation_status') then
    create type moderation_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');
  end if;

  if not exists (select 1 from pg_type where typname = 'refund_status') then
    create type refund_status as enum ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED');
  end if;

  if not exists (select 1 from pg_type where typname = 'provider_event_status') then
    create type provider_event_status as enum ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'QUARANTINED');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_delivery_status') then
    create type notification_delivery_status as enum ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_account_type') then
    create type ledger_account_type as enum
      ('CLIENT_FUNDING', 'PROTECTED_HOLD', 'TASKER_AVAILABLE',
       'PLATFORM_FEE', 'PAYOUT_CLEARING', 'REFUND_CLEARING');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_transaction_type') then
    create type ledger_transaction_type as enum
      ('PAYMENT_CAPTURE', 'RELEASE_TO_TASKER', 'FEE_CHARGE', 'REFUND',
       'WITHDRAWAL_RESERVE', 'WITHDRAWAL_SETTLE', 'WITHDRAWAL_REVERSE', 'FREEZE', 'UNFREEZE');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Shared helper functions
-- ---------------------------------------------------------------------------

-- Generic updated_at trigger.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- NOTE: the capability/admin helper functions (app.current_capabilities,
-- app.has_capability, app.is_admin) are defined at the END of
-- 0002_identity_profiles.sql, because as `language sql` functions PostgreSQL
-- validates their bodies at creation time and they read public.user_capabilities
-- and public.profiles, which are created in 0002. Defining them here (before
-- those tables exist) fails with "relation does not exist" during migration.
