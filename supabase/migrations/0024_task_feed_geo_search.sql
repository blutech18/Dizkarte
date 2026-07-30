-- 0024_task_feed_geo_search.sql
-- Make "near me" actually mean near me.
--
-- PostGIS has been installed since 0001 and `task_public_locations` has carried
-- a `geography(Point,4326)` column with a GIST index since 0004, but no query in
-- the schema ever used a distance operator. `search_open_tasks` (0008) has no
-- coordinate parameters at all, and the mobile client accepted `nearLat`,
-- `nearLng`, and `radiusKm` only to drop them and order by recency instead. A
-- Tasker filtering to "within 5 km" was shown the whole city.
--
-- Radius filtering cannot be expressed through PostgREST's filter grammar, so it
-- has to be a function. This one replaces `search_open_tasks` as the single feed
-- entry point rather than sitting beside it, because the contract requires the
-- list and the map to agree: two query paths would eventually disagree.
--
-- Privacy: distance is measured from `approximate_point`, the same fuzzed point
-- the public feed already publishes, never from `task_private_locations`. It is
-- also rounded to 100 m so a set of distance readings cannot be trilaterated
-- into a sharper position than the coordinates the feed already returns.
--
-- `security invoker` is deliberate — the caller's RLS on `tasks` and
-- `task_public_locations` still decides which rows are visible. This function
-- adds filtering and ordering, never reach.

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
  p_page_size      integer default 20
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
  double precision, double precision, double precision, text, integer, integer
) to authenticated, anon;
