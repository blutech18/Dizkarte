-- 0010_storage_policies.sql
-- Private storage buckets and object policies. All buckets are private; access
-- is granted only through short-lived signed URLs created by authorized server
-- logic. Object paths are partitioned by owner so users cannot read each other's
-- files by guessing paths.
--
-- Path convention: the first folder segment is the owning user's id, e.g.
--   id-documents/<user_id>/<case_id>/front.jpg
--   portfolios/<user_id>/<item>.jpg
--   chat-media/<user_id>/<conversation_id>/<file>
--   evidence/<user_id>/<resource_id>/<file>
--   task-media/<client_id>/<task_id>/<file>

insert into storage.buckets (id, name, public)
values
  ('id-documents', 'id-documents', false),
  ('task-media',   'task-media',   false),
  ('portfolios',   'portfolios',   false),
  ('chat-media',   'chat-media',   false),
  ('evidence',     'evidence',     false)
on conflict (id) do nothing;

-- Helper: first path segment of an object name.
create or replace function app.storage_owner(object_name text)
returns text
language sql
immutable
as $$
  select (storage.foldername(object_name))[1];
$$;

-- id-documents: strictly owner + verification Admin. Never publicly readable.
drop policy if exists id_documents_owner_rw on storage.objects;
create policy id_documents_owner_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'id-documents'
    and (
      app.storage_owner(name) = auth.uid()::text
      or app.has_capability(array['ADMIN_SUPPORT','ADMIN_SUPER']::user_capability[])
    )
  )
  with check (
    bucket_id = 'id-documents' and app.storage_owner(name) = auth.uid()::text
  );

-- portfolios: owner writes; owner + Admin read (moderation elsewhere gates public view).
drop policy if exists portfolios_owner_rw on storage.objects;
create policy portfolios_owner_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'portfolios'
    and (app.storage_owner(name) = auth.uid()::text or app.is_admin())
  )
  with check (
    bucket_id = 'portfolios' and app.storage_owner(name) = auth.uid()::text
  );

-- task-media: owner (client) writes; participants + Admin read.
drop policy if exists task_media_owner_write on storage.objects;
create policy task_media_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-media' and app.storage_owner(name) = auth.uid()::text
  );
drop policy if exists task_media_read on storage.objects;
create policy task_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-media'
    and (app.storage_owner(name) = auth.uid()::text or app.is_admin())
  );

-- chat-media: sender writes; only conversation participants + Admin read is
-- enforced at the row layer; here we restrict to owner-partitioned paths + Admin.
drop policy if exists chat_media_owner_write on storage.objects;
create policy chat_media_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media' and app.storage_owner(name) = auth.uid()::text
  );
drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (app.storage_owner(name) = auth.uid()::text or app.is_admin())
  );

-- evidence: owner writes; owner + Admin read.
drop policy if exists evidence_owner_rw on storage.objects;
create policy evidence_owner_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'evidence'
    and (app.storage_owner(name) = auth.uid()::text or app.is_admin())
  )
  with check (
    bucket_id = 'evidence' and app.storage_owner(name) = auth.uid()::text
  );
