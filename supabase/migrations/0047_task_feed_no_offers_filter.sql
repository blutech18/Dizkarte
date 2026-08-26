-- 0047_task_feed_no_offers_filter.sql
-- "Show tasks with no offers" - the one browse filter the marketplace reference
-- has that this feed did not - plus the defect that filter uncovered.
--
-- DEFECT FOUND WHILE TESTING: `offer_count` was per-viewer, not per-task.
--
-- `public_task_feed` is `security_invoker = true`, and its `offer_count` was an
-- inline `select count(*) from offers ...`. Offer rows are private per viewer (the
-- task owner sees all, a Tasker sees only their own, anyone else sees none), so
-- that subquery was evaluated under the READER's RLS:
--
--   * the task owner saw the true count;
--   * a Tasker browsing saw 1 for their own quote and **0 for every other task**;
--   * a signed-out/unrelated viewer saw 0 everywhere.
--
-- So the number on a browse card was already wrong for the audience that reads it
-- most, and a "no offers yet" filter built on it would have matched everything.
--
-- Fix: the COUNT is computed by a `SECURITY DEFINER` helper, so it reflects the
-- task rather than the reader. This is an aggregate-only disclosure and is
-- deliberately narrow - `app.task_submitted_offer_count` returns a number and
-- nothing else. Which Taskers quoted, at what price, and with what message all
-- stay governed by the existing per-viewer `offers` policies; nothing about offer
-- CONTENT visibility changes here.
--
-- WHY THE OLD SIGNATURE IS DROPPED FIRST
--
-- `search_task_feed` gains a parameter. Adding one to a `create or replace` would
-- leave the previous 15-argument function in place as a separate OVERLOAD, and
-- PostgREST resolves overloads by the argument names a caller supplies - so the
-- app could keep binding to the old one and the filter would silently do nothing.
-- Dropping the old signature explicitly guarantees exactly one
-- `search_task_feed` exists.
--
-- The function body below is 0024's, unchanged except for the new parameter and
-- its single predicate: the page-size clamp, half-origin degradation, radius cap,
-- `st_dwithin` index form, 100 m distance rounding, and sort/tiebreak order all
-- keep their existing behaviour.

-- ---------------------------------------------------------------------------
-- app.task_submitted_offer_count - a task fact, not a viewer fact.
-- ---------------------------------------------------------------------------
create or replace function app.task_submitted_offer_count(p_task_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, app
as $$
  select count(*)
  from public.offers o
  where o.task_id = p_task_id
    and o.status = 'SUBMITTED';
$$;

-- The public feed is readable by `anon` as well, so both API roles need EXECUTE.
-- Revoke from PUBLIC first: a bare `create function` grants EXECUTE to PUBLIC.
revoke execute on function app.task_submitted_offer_count(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app.task_submitted_offer_count(uuid) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- public_task_feed - recreated verbatim from 0008 with the count delegated.
--
-- Same column names and types (so `create or replace view` is legal), and
-- `security_invoker` is re-asserted: every other column must keep being read
-- under the caller's own RLS. Only the count is elevated.
-- ---------------------------------------------------------------------------
create or replace view public.public_task_feed as
select t.id,
       t.category_id,
       t.title,
       t.description,
       t.budget_centavos,
       t.currency,
       t.status,
       t.same_day,
       t.scheduled_for,
       t.published_at,
       pl.city_code,
       pl.barangay_code,
       pl.landmark,
       round(st_y(pl.approximate_point::geometry)::numeric, 3) as approximate_lat,
       round(st_x(pl.approximate_point::geometry)::numeric, 3) as approximate_lng,
       pl.approximate_point,
       app.task_submitted_offer_count(t.id) as offer_count
from public.tasks t
join public.task_public_locations pl on pl.task_id = t.id
where t.status = 'OPEN';

alter view public.public_task_feed set (security_invoker = true);

drop function if exists public.search_task_feed(
  text, uuid, text, text, bigint, bigint, timestamptz, timestamptz, boolean,
  double precision, double precision, double precision, text, integer, integer
);
create or replace function public.search_task_feed(
  p_keyword        text default null,
  p_category_id    uuid default null,
  p_city_code      text default null,
  p_barangay_code  text default null,
  p_min_budget     bigint default null,
  p_max_budget     bigint default null,
  p_scheduled_from timestamptz default null,
  p_scheduled_to   timestamptz default null,
  p_same_day_only  boolean default false,
  p_near_lat       double precision default null,
  p_near_lng       double precision default null,
  p_radius_km      double precision default null,
  p_sort           text default 'newest',
  p_page           integer default 1,
  p_page_size      integer default 20,
  -- New: restrict to tasks that have attracted no offer yet.
  p_no_offers_only boolean default false
)
returns table (
  id               uuid,
  category_id      uuid,
  title            text,
  description      text,
  budget_centavos  bigint,
  currency         text,
  status           task_status,
  same_day         boolean,
  scheduled_for    timestamptz,
  published_at     timestamptz,
  city_code        text,
  barangay_code    text,
  landmark         text,
  approximate_lat  numeric,
  approximate_lng  numeric,
  offer_count      bigint,
  distance_m       double precision,
  total_count      bigint
)
language sql
stable
security invoker
set search_path = public
as $$
with bounds as (
  select
    -- Page size is clamped server-side so a client cannot ask for the whole table.
    least(greatest(coalesce(p_page_size, 20), 1), 100) as page_size,
    greatest(coalesce(p_page, 1), 1)                   as page,
    -- A coordinate pair is only usable if both halves are present and in range;
    -- a half-supplied origin silently degrades to a non-geographic search
    -- rather than matching everything or nothing.
    case
      when p_near_lat is null or p_near_lng is null then null
      when p_near_lat < -90 or p_near_lat > 90 then null
      when p_near_lng < -180 or p_near_lng > 180 then null
      else st_setsrid(st_makepoint(p_near_lng, p_near_lat), 4326)::geography
    end as origin,
    -- Unbounded radius searches scan the country; 100 km covers any realistic
    -- travel distance for a task in a Philippine city.
    case
      when p_radius_km is null or p_radius_km <= 0 then null
      else least(p_radius_km, 100) * 1000
    end as radius_m
),
matched as (
  select
    f.*,
    -- st_distance on geography returns metres.
    case when b.origin is null then null
         else round(st_distance(f.approximate_point, b.origin) / 100.0) * 100
    end as distance_m,
    b.page_size,
    b.page,
    b.origin
  from public.public_task_feed f
  cross join bounds b
  where (p_keyword is null
         or f.title ilike '%' || p_keyword || '%'
         or f.description ilike '%' || p_keyword || '%')
    and (p_category_id is null or f.category_id = p_category_id)
    and (p_city_code is null or f.city_code = p_city_code)
    and (p_barangay_code is null or f.barangay_code = p_barangay_code)
    and (p_min_budget is null or f.budget_centavos >= p_min_budget)
    and (p_max_budget is null or f.budget_centavos <= p_max_budget)
    and (p_scheduled_from is null or f.scheduled_for >= p_scheduled_from)
    and (p_scheduled_to is null or f.scheduled_for <= p_scheduled_to)
    and (p_same_day_only is not true or f.same_day = true)
    -- Unquoted work only. `is not true` keeps a null flag equivalent to "off",
    -- matching how every other boolean filter here behaves.
    and (p_no_offers_only is not true or coalesce(f.offer_count, 0) = 0)
    -- st_dwithin is the index-using form; a radius without an origin is ignored
    -- rather than treated as "0 km", which would return nothing.
    and (b.origin is null or b.radius_m is null
         or st_dwithin(f.approximate_point, b.origin, b.radius_m))
)
select
  m.id,
  m.category_id,
  m.title,
  m.description,
  m.budget_centavos,
  m.currency,
  m.status,
  m.same_day,
  m.scheduled_for,
  m.published_at,
  m.city_code,
  m.barangay_code,
  m.landmark,
  m.approximate_lat,
  m.approximate_lng,
  m.offer_count,
  m.distance_m,
  count(*) over () as total_count
from matched m
order by
  -- 'nearby' without a usable origin falls back to recency instead of
  -- inventing an order the caller would read as distance.
  case when p_sort = 'nearby' and m.origin is not null then m.distance_m end asc nulls last,
  case when p_sort = 'highest_budget' then m.budget_centavos end desc nulls last,
  m.published_at desc nulls last,
  m.id
limit  (select page_size from bounds)
offset ((select page from bounds) - 1) * (select page_size from bounds);
$$;

grant execute on function public.search_task_feed(
  text, uuid, text, text, bigint, bigint, timestamptz, timestamptz, boolean,
  double precision, double precision, double precision, text, integer, integer, boolean
) to authenticated, anon;
