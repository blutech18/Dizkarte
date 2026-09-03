-- 0053_task_questions_owner_answer.sql
-- Allow task owners to answer questions on their own tasks.
--
-- Task questions have RLS enabled (0009) with SELECT and INSERT policies,
-- but lacked an UPDATE policy. When the task client calls answerQuestion to
-- set the answer and answered_at timestamp, PostgREST was blocked by RLS.
-- This policy allows the task owner (client_id on the parent task) or an admin
-- to update task_questions.

drop policy if exists task_questions_update_owner on public.task_questions;
create policy task_questions_update_owner on public.task_questions
  for update to authenticated
  using (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
    or app.is_admin()
  )
  with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.client_id = auth.uid())
    or app.is_admin()
  );
