-- 0035_psgc_localities.sql
--
-- Canonical PSGC locality reference data (resolves decision D14). Replaces the
-- dev "type a raw PSGC code" placeholder with real, name-searchable
-- city/municipality and barangay pickers that resolve to the official codes.
--
-- SOURCE / VERSION (approved 2026-08-14): Philippine Statistics Authority (PSA)
-- Philippine Standard Geographic Code, via the open machine-readable mirror
-- `https://psgc.gitlab.io/api` (snapshot loaded by scripts/load-psgc.mjs, which
-- records the exact fetch date). Counts at load time: 1,634 cities/municipalities
-- and 42,046 barangays.
--
-- These are public, non-sensitive reference tables: readable by any
-- authenticated user, written only by the service role (the loader). The app
-- stores the 6-digit city prefix as `city_code` and the 9-digit barangay code as
-- `barangay_code`, matching existing task/profile/service-area columns.

create table if not exists public.psgc_cities_municipalities (
  code          text primary key,          -- 9-digit PSGC code
  city6         text not null,             -- 6-digit prefix stored as city_code
  name          text not null,
  province_name text,                      -- null for NCR (district-based)
  region_code   text not null,
  is_city       boolean not null default false
);
create index if not exists ix_psgc_cities_city6 on public.psgc_cities_municipalities (city6);
create index if not exists ix_psgc_cities_name on public.psgc_cities_municipalities (lower(name));

create table if not exists public.psgc_barangays (
  code       text primary key,             -- 9-digit PSGC code stored as barangay_code
  name       text not null,
  city6      text not null,                -- parent city's 6-digit prefix
  city_code9 text not null                 -- parent city's 9-digit code
);
create index if not exists ix_psgc_barangays_city6 on public.psgc_barangays (city6);
create index if not exists ix_psgc_barangays_name on public.psgc_barangays (lower(name));

-- Public reference data: authenticated read-only; writes are service-role only.
alter table public.psgc_cities_municipalities enable row level security;
drop policy if exists psgc_cities_read on public.psgc_cities_municipalities;
create policy psgc_cities_read on public.psgc_cities_municipalities
  for select to authenticated using (true);

alter table public.psgc_barangays enable row level security;
drop policy if exists psgc_barangays_read on public.psgc_barangays;
create policy psgc_barangays_read on public.psgc_barangays
  for select to authenticated using (true);

grant select on public.psgc_cities_municipalities to authenticated;
grant select on public.psgc_barangays to authenticated;
