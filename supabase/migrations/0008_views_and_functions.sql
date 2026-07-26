-- 0008_views_and_functions.sql
-- Public-safe projections and bounded/indexed query functions. These views
-- deliberately exclude exact address, private coordinates, contact, ID, and
-- payment fields (requirement R4/R5).

-- Public task feed: only OPEN tasks, approximate location only.
create or replace view public.public_task_feed
with (security_invoker = true)
as
select
  t.id,
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
  (select count(*) from public.offers o where o.task_id = t.id and o.status = 'SUBMITTED') as offer_count
from public.tasks t
join public.task_public_locations pl on pl.task_id = t.id
where t.status = 'OPEN';

-- Public Tasker trust profile: no private identity/payout/exact address.
create or replace view public.public_tasker_profiles
with (security_invoker = true)
as
select
  tp.user_id,
  p.display_name,
  p.avatar_path,
  tp.public_bio,
  tp.public_experience,
  tp.completion_count,
  case when tp.rating_count > 0
       then round(tp.rating_sum::numeric / tp.rating_count, 2)
       else null end as rating_average,
  tp.rating_count,
  (tp.approved_at is not null and tp.suspended_at is null) as approved,
  (tp.suspended_at is not null) as suspended,
  exists (
    select 1 from public.verification_cases vc
    where vc.user_id = tp.user_id and vc.status = 'APPROVED'
  ) as verified_identity
from public.tasker_profiles tp
join public.profiles p on p.id = tp.user_id;

-- ---------------------------------------------------------------------------
-- Ledger-derived balances. No mutable balance column is authoritative.
-- ---------------------------------------------------------------------------
create or replace function app.account_balance(p_account_id uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(amount_centavos), 0)
  from public.ledger_entries
  where account_id = p_account_id;
$$;

create or replace function app.derive_user_balances(p_user_id uuid)
returns table (
  pending_centavos   bigint,
  protected_centavos bigint,
  available_centavos bigint,
  reserved_centavos  bigint,
  withdrawn_centavos bigint
)
language sql
stable
security definer
set search_path = public, app
as $$
  with entries as (
    select la.account_type, le.amount_centavos, lt.booking_id
    from public.ledger_entries le
    join public.ledger_accounts la on la.id = le.account_id
    join public.ledger_transactions lt on lt.id = le.transaction_id
    where la.owner_id = p_user_id
  )
  select
    -- Pending: protected holds tied to bookings not yet completed.
    coalesce((
      select sum(e.amount_centavos) from entries e
      join public.bookings b on b.id = e.booking_id
      where e.account_type = 'PROTECTED_HOLD'
        and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETION_REQUESTED', 'DISPUTED')
    ), 0) as pending_centavos,
    coalesce((select sum(amount_centavos) from entries where account_type = 'PROTECTED_HOLD'), 0)
      as protected_centavos,
    coalesce((select sum(amount_centavos) from entries where account_type = 'TASKER_AVAILABLE'), 0)
      as available_centavos,
    coalesce((select sum(amount_centavos) from entries where account_type = 'PAYOUT_CLEARING'), 0)
      as reserved_centavos,
    coalesce((
      select sum(w.amount_centavos) from public.withdrawals w
      where w.tasker_id = p_user_id and w.status = 'PAID'
    ), 0) as withdrawn_centavos;
$$;

-- ---------------------------------------------------------------------------
-- Bounded/indexed feed search. Enforces pagination limits server-side.
-- ---------------------------------------------------------------------------
create or replace function public.search_open_tasks(
  p_keyword       text default null,
  p_city_code     text default null,
  p_barangay_code text default null,
  p_category_id   uuid default null,
  p_min_budget    bigint default null,
  p_max_budget    bigint default null,
  p_same_day_only boolean default false,
  p_sort          text default 'newest',
  p_page          integer default 1,
  p_page_size     integer default 20
)
returns setof public.public_task_feed
language sql
stable
security invoker
as $$
  select f.*
  from public.public_task_feed f
  where (p_keyword is null or (f.title ilike '%' || p_keyword || '%' or f.description ilike '%' || p_keyword || '%'))
    and (p_city_code is null or f.city_code = p_city_code)
    and (p_barangay_code is null or f.barangay_code = p_barangay_code)
    and (p_category_id is null or f.category_id = p_category_id)
    and (p_min_budget is null or f.budget_centavos >= p_min_budget)
    and (p_max_budget is null or f.budget_centavos <= p_max_budget)
    and (p_same_day_only is not true or f.same_day = true)
  order by
    case when p_sort = 'highest_budget' then f.budget_centavos end desc nulls last,
    case when p_sort = 'newest' then f.published_at end desc nulls last,
    f.published_at desc
  limit least(greatest(coalesce(p_page_size, 20), 1), 100)
  offset greatest(coalesce(p_page, 1) - 1, 0) * least(greatest(coalesce(p_page_size, 20), 1), 100);
$$;
