-- 0015_handle_new_user.sql
-- Auto-provision an application profile when a Supabase Auth user is created.
--
-- Without this, a real `auth.users` signup has no `public.profiles` row, so
-- every RLS self-read (profile, capabilities, verification, application) would
-- return nothing and the app could not build a session. This trigger closes
-- that gap: it creates the profile and grants the baseline CLIENT capability.
-- Elevated capabilities (TASKER, ADMIN_*) are never granted here — only by an
-- Admin action or the seed script.

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_display_name text;
begin
  -- Prefer a display name supplied at sign-up; otherwise derive from the email
  -- local part. Clamp to the profiles length constraint (2..80).
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
  if v_display_name is null or char_length(v_display_name) < 2 then
    v_display_name := 'New User';
  elsif char_length(v_display_name) > 80 then
    v_display_name := left(v_display_name, 80);
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  -- Baseline capability: anyone can hire (act as a Client). Publishing a paid
  -- task remains gated by identity verification elsewhere.
  insert into public.user_capabilities (user_id, capability)
  values (new.id, 'CLIENT')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
