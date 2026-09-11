-- 0056_avatars_read_policy.sql
-- Allow authenticated and anonymous users to read avatar objects.
--
-- Avatars are public identity assets displayed across the marketplace (e.g.
-- on "My Taskers", public tasker profiles, task offers, questions, and reviews).
--
-- Formerly, `avatars_owner_rw` (0028) restricted all operations including SELECT
-- to `app.storage_owner(name) = auth.uid()::text`. Consequently, counterparties
-- calling `createSignedUrl` were blocked by RLS with "Object not found", causing
-- another user's avatar to fail to render and fall back to initials.
--
-- Writes (insert, update, delete) remain strictly guarded so only the owning user
-- can modify their own avatar.

-- 1. Enable public read access on the avatars bucket
update storage.buckets
set public = true
where id = 'avatars';

-- 2. Drop the restrictive all-operation policy
drop policy if exists avatars_owner_rw on storage.objects;
drop policy if exists avatars_owner_write on storage.objects;
drop policy if exists avatars_owner_update on storage.objects;
drop policy if exists avatars_owner_delete on storage.objects;
drop policy if exists avatars_read on storage.objects;

-- 3. Owner writes: upload own avatar only
create policy avatars_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars' and app.storage_owner(name) = auth.uid()::text
  );

-- 4. Owner updates: replace own avatar only
create policy avatars_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (app.storage_owner(name) = auth.uid()::text or app.is_admin())
  )
  with check (
    bucket_id = 'avatars' and app.storage_owner(name) = auth.uid()::text
  );

-- 5. Owner deletes: delete own avatar only
create policy avatars_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (app.storage_owner(name) = auth.uid()::text or app.is_admin())
  );

-- 6. Read policy: any authenticated or anonymous user can view/select avatar objects
create policy avatars_read on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'avatars');
