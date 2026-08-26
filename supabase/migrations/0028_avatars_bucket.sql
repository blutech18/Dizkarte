-- 0028_avatars_bucket.sql
-- Profile avatars bucket. Private like every other bucket (0010): a user's
-- avatar is rendered through a short-lived signed URL, not a public URL. The
-- path convention mirrors the others — the first segment is the owning user's
-- id, so the owner policy `app.storage_owner(name) = auth.uid()::text` allows
-- it:
--   avatars/<user_id>/<file>
--
-- Only the owner may upload, replace, or delete their own avatar. Read is
-- owner-only here because the only surface that renders an avatar today is the
-- signed-in user's own Profile screen. When a surface needs to show another
-- user's avatar (e.g. a public Tasker profile), add a scoped read path rather
-- than making the whole bucket public.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists avatars_owner_rw on storage.objects;
create policy avatars_owner_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'avatars'
    and (app.storage_owner(name) = auth.uid()::text or app.is_admin())
  )
  with check (
    bucket_id = 'avatars' and app.storage_owner(name) = auth.uid()::text
  );
