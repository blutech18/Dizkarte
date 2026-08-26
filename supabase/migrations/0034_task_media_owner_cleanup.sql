-- Let a Client view and remove task-media objects they staged for one of their
-- own tasks before the matching public.task_media row has been committed.
--
-- The existing participant/feed read policy remains unchanged. These two
-- policies are owner-only and bind the object path's first two segments to the
-- authenticated Client and a real task they own, preserving the hardening from
-- migration 0013 while enabling upload rollback and photo removal.

drop policy if exists task_media_owner_staging_read on storage.objects;
create policy task_media_owner_staging_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-media'
    and app.storage_seg(name, 1) = auth.uid()::text
    and exists (
      select 1
      from public.tasks t
      where t.id = app.safe_uuid(app.storage_seg(name, 2))
        and t.client_id = auth.uid()
    )
  );

drop policy if exists task_media_owner_delete on storage.objects;
create policy task_media_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-media'
    and app.storage_seg(name, 1) = auth.uid()::text
    and exists (
      select 1
      from public.tasks t
      where t.id = app.safe_uuid(app.storage_seg(name, 2))
        and t.client_id = auth.uid()
    )
  );