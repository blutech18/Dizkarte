-- Let the owner replace or remove a document only while the verification case
-- is still editable. Submitted/in-review evidence remains immutable for the
-- manual reviewer and audit trail.
drop policy if exists verification_documents_delete_own_open
  on public.verification_documents;

create policy verification_documents_delete_own_open
  on public.verification_documents
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.verification_cases vc
      where vc.id = verification_documents.case_id
        and vc.user_id = (select auth.uid())
        and vc.status in ('DRAFT', 'RESUBMISSION_REQUIRED')
    )
  );