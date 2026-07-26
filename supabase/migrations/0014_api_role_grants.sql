-- 0014_api_role_grants.sql
-- Reconcile PostgreSQL table/sequence privileges for the Supabase API roles.
--
-- WHY THIS EXISTS
-- Row Level Security (enabled on every user-facing table in 0009/0013) is only
-- consulted AFTER a table-level privilege check succeeds. The Supabase API
-- roles (anon, authenticated, service_role) were never granted base-table
-- privileges, so a request running as `authenticated` failed with
-- "permission denied for table ..." BEFORE any RLS policy could run
-- (confirmed: has_table_privilege('authenticated','public.tasks','SELECT') was
-- false). This migration adds the standard Supabase API-role grants so RLS
-- becomes the effective ROW gate. It does NOT widen what any row-level policy
-- already allows — the policies authored in 0009/0013 remain the authorization
-- boundary, and the security_hardening suite's denial assertions are the proof.
--
-- LEAST-PRIVILEGE MODEL
--   * authenticated : SELECT/INSERT/UPDATE/DELETE on all public tables. Every
--       write still requires a matching RLS policy; tables without a write
--       policy stay deny-by-default and are mutated only by SECURITY DEFINER
--       RPCs (which run as the table owner and bypass RLS by design). This
--       preserves the append-only ledger, provider-authoritative refund/payout,
--       one-active-booking, and exact-location/chat gating — none of those
--       tables expose a user-facing write policy.
--   * service_role  : ALL. It has BYPASSRLS and drives the provider finalizers
--       and server-side tooling.
--   * anon          : intentionally NO table/sequence privileges. Every RLS
--       policy in this schema targets the `authenticated` role; there is no
--       `to anon` policy anywhere, so an unauthenticated client has nothing to
--       read or write regardless of grants. Keeping anon at zero base-table
--       access is the least-privilege choice and avoids silently exposing a
--       future non-RLS table to the public.
--
-- NOTE: schema `app` is deliberately NOT added to PostgREST's exposed schemas
-- and receives NO table grants here (it holds only functions). USAGE on schema
-- `app` was already granted in 0001 so RLS predicates can resolve app.* helpers.
-- ===========================================================================

-- --- Existing objects -------------------------------------------------------
-- These target the authored, postgres-owned public tables (all of which have
-- RLS enabled per 0009/0013). The only public table without RLS is PostGIS's
-- public.spatial_ref_sys, which is owned and grant-managed by `supabase_admin`
-- (the Supabase base image), not by the migration role: these statements are a
-- harmless no-op on it and do not change its base-image grants. `authenticated`
-- write access to the authored tables is therefore always gated by RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- --- Future objects (created by the migration owner) ------------------------
-- Mirror the grants above so later migrations' tables/sequences are covered
-- without a follow-up grant. New tables created by later migrations are still
-- expected to enable RLS (that is the row gate); these defaults only supply the
-- table-level privilege that RLS is checked against.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

-- ===========================================================================
-- Function EXECUTE reconciliation for RLS predicates.
--
-- 0013 SECTION 11 revoked EXECUTE on the app.* helpers from every role, then
-- re-granted only the subset invoked as DIRECT RLS predicates
-- (has_active_capability, safe_uuid, storage_seg, admin_assigned_task,
-- admin_assigned_offer). One direct predicate was missed: the
-- `ticket_messages_insert` WITH CHECK policy (0013 SECTION 2) calls
-- app.admin_assigned_ticket(ticket_id) directly, so the querying role
-- (`authenticated`) must be able to EXECUTE it — otherwise an assigned support
-- Admin's ticket reply fails with "permission denied for function
-- admin_assigned_ticket". Verified against pg_policy: this is the ONLY app.*
-- predicate referenced by any policy (public or storage.objects) that still
-- lacked authenticated EXECUTE.
--
-- All other revoked helpers (admin_assigned_dispute/report/verification/
-- booking/conversation/evidence, acting_capability, assert_reasoned,
-- audit_read_once, is_active_account) are invoked ONLY inside SECURITY DEFINER
-- bodies, which execute as the function owner, so they intentionally remain
-- non-executable by authenticated. The security_hardening suite explicitly
-- asserts admin_assigned_dispute and audit_read_once stay non-executable, which
-- is the safety net proving this grant is not over-broad.
-- ===========================================================================
grant execute on function app.admin_assigned_ticket(uuid) to authenticated;
