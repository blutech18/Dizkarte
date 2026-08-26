-- 0041_task_location_type_and_dropoff.sql
--
-- Two additive fields the posting flow already collected but could not store.
--
-- 1. `tasks.location_type` — the wizard has always offered "In Person" vs
--    "Online", but the choice only ever existed in screen-local state. The sole
--    trace of a remote task was the literal string "Online / Remote" written
--    into the public `landmark`, so nothing could distinguish a genuinely remote
--    task from one whose landmark happened to read that way, and the choice was
--    lost on reload. This makes it a real, queryable field.
--
--    An online task still records a city/barangay: the locality is what makes a
--    task discoverable regionally and `task_public_locations` requires it. What
--    the flag changes is the meaning — for a remote task the locality is where
--    the Client is, not where the Tasker must appear.
--
-- 2. `task_public_locations.dropoff_landmark` — the wizard asks removals Clients
--    for a drop-off location and then discarded it on submit. It is stored at
--    the same public, area-level precision as `landmark` and is NEVER an exact
--    address: `task_public_locations` is readable by any authenticated user
--    through the public feed, so a second precise address here would defeat the
--    approximate/exact separation that requirement R4 exists to protect. If an
--    exact drop-off is ever needed it belongs beside `exact_address` in
--    `task_private_locations`, behind the confirmed-booking gate.
--
-- SAFETY: purely additive and idempotent. Both columns are nullable with
-- sensible reads for existing rows (`location_type` defaults to 'in_person',
-- which is what every task posted before this was; `dropoff_landmark` stays
-- NULL, meaning "single location"). No existing column, row, trigger, policy, or
-- RPC changes behaviour, and the public feed view is untouched. Table-level
-- privileges from 0014 already cover new columns.

-- 1. Task location type ------------------------------------------------------

alter table public.tasks
  add column if not exists location_type text not null default 'in_person';

-- Mirrors `taskLocationTypeSchema` in @dizkarte/domain so an invalid value can
-- never be stored even if a caller bypasses the client. Dropped-then-added so
-- the migration stays re-runnable.
alter table public.tasks
  drop constraint if exists tasks_location_type_check;
alter table public.tasks
  add constraint tasks_location_type_check
  check (location_type in ('in_person', 'online'));

-- 2. Public, area-level drop-off ---------------------------------------------

alter table public.task_public_locations
  add column if not exists dropoff_landmark text;

alter table public.task_public_locations
  drop constraint if exists task_public_locations_dropoff_landmark_check;
alter table public.task_public_locations
  add constraint task_public_locations_dropoff_landmark_check
  check (dropoff_landmark is null or char_length(dropoff_landmark) between 1 and 200);

-- 3. Expose the drop-off through the coordinate-readable view -----------------
--
-- Recreated from 0017 with the one new column **appended last**. That ordering
-- is required, not cosmetic: `create or replace view` may only add columns at
-- the end of the select list, and inserting `dropoff_landmark` before
-- `approximate_lat` fails with "cannot change name of view column". Still
-- `security_invoker = true`, so the caller's own RLS on
-- `task_public_locations` continues to decide visibility — the view grants no
-- additional access, and the drop-off is exactly as public as the landmark
-- beside it.
create or replace view public.task_locations_readable
with (security_invoker = true)
as
select
  pl.task_id,
  pl.city_code,
  pl.barangay_code,
  pl.landmark,
  round(st_y(pl.approximate_point::geometry)::numeric, 3) as approximate_lat,
  round(st_x(pl.approximate_point::geometry)::numeric, 3) as approximate_lng,
  pl.dropoff_landmark
from public.task_public_locations pl;

grant select on public.task_locations_readable to authenticated;
