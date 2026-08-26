-- 0029_public_profile_reads.sql
-- Cross-user display-safe profile reads.
--
-- `profiles` is self-readable only (0009) to protect contact number, locality,
-- and bio. But a marketplace has to show WHO you are dealing with — the display
-- name and avatar on offers, bookings, chat, and the public Tasker profile. Two
-- gaps followed from the self-only policy:
--
--   1. Counterpart names (the Client's name shown to the Tasker and vice versa)
--      are read from `profiles`, which returned no row for the other party, so
--      every booking/offer/message rendered the "Dizkarte user" fallback.
--   2. `public_tasker_profiles` is `security_invoker = true` and JOINs
--      `profiles`; under the caller's own row policy that join is empty for any
--      other user, so the whole "public" trust projection (rating, specialties,
--      verified badge) returned nothing to anyone but the Tasker themselves.
--
-- The fix exposes ONLY the two non-sensitive identity fields — display name and
-- avatar path — and nothing else (contact, locality, bio, account status stay
-- private):
--   * `public_profiles`, a definer view over (id, display_name, avatar_path)
--     that reads past the self-only row policy, and
--   * `public_tasker_profiles` switched to a definer view so its already-safe
--     projection resolves for any authenticated viewer.
--
-- `anon` has no base-table privileges (0014) and is granted nothing here, so
-- these projections are readable only by an authenticated session.

create or replace view public.public_profiles as
select id, display_name, avatar_path
from public.profiles;

grant select on public.public_profiles to authenticated;

-- Meant to be readable by any authenticated user; running it as invoker made
-- its `profiles` join and the verification EXISTS collapse for everyone else.
-- As a definer view it returns the same safe columns to any viewer.
alter view public.public_tasker_profiles set (security_invoker = false);
