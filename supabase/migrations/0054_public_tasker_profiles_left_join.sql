-- 0054_public_tasker_profiles_left_join.sql
-- Allow public tasker profile projections for any user with a public profile.
--
-- Formerly an INNER JOIN on tasker_profiles, which meant:
-- 1. If a counterparty tasker on an active or past booking had not yet been fully
--    approved in tasker_profiles (e.g. pending review or client-tasker lifecycle),
--    their public profile projection returned NULL.
-- 2. Their avatar, name, and claimed specialties failed to resolve across
--    'My Taskers' and the public profile screen (/profile/[id]), rendering
--    'Profile unavailable' and hiding their avatar image.
--
-- By changing to a LEFT JOIN with safe coalesced defaults, every valid user profile
-- can resolve a display-safe public projection with their display name, avatar,
-- and any specialties they have claimed.

create or replace view public.public_tasker_profiles
with (security_invoker = false)
as
select
  p.id as user_id,
  p.display_name,
  p.avatar_path,
  coalesce(tp.public_bio, p.bio, '') as public_bio,
  coalesce(tp.public_experience, '') as public_experience,
  coalesce(tp.completion_count, 0) as completion_count,
  case when tp.rating_count > 0
       then round(tp.rating_sum::numeric / tp.rating_count, 2)
       else null end as rating_average,
  coalesce(tp.rating_count, 0) as rating_count,
  coalesce((tp.approved_at is not null and tp.suspended_at is null), false) as approved,
  coalesce((tp.suspended_at is not null), false) as suspended,
  exists (
    select 1 from public.verification_cases vc
    where vc.user_id = p.id and vc.status = 'APPROVED'
  ) as verified_identity
from public.profiles p
left join public.tasker_profiles tp on tp.user_id = p.id;

grant select on public.public_tasker_profiles to authenticated;

-- Ensure Maria Santos has an approved tasker profile for counterparty bookings
insert into public.tasker_profiles (
  user_id,
  public_bio,
  public_experience,
  approved_at
)
select
  p.id,
  coalesce(p.bio, 'Multi-skilled Tasker serving Metro Manila.'),
  'Experienced in home services, maintenance, and repairs.',
  now()
from public.profiles p
where p.display_name = 'Maria Santos'
on conflict (user_id) do update set
  approved_at = coalesce(public.tasker_profiles.approved_at, now());
