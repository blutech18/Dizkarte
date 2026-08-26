-- 0039_task_time_of_day.sql
--
-- Persist the coarse time of day a task is needed.
--
-- The posting wizard already asks "I need a certain time of day" and offers
-- Morning / Midday / Afternoon / Evening, but the choice was only ever held in
-- screen-local state: it was discarded on submit, so a Client who asked for a
-- morning job had that requirement silently dropped and Taskers quoted without
-- it. This adds a first-class, nullable column so the answer survives the
-- round-trip and can be shown back on the task.
--
-- NULL is meaningful and is the default: it means the Client is flexible about
-- the time within the day, which is exactly the state of every task posted
-- before this column existed.
--
-- SAFETY: purely additive. No existing column, row, trigger, policy, view, or
-- RPC is altered — `scheduled_for` and `same_day` keep their current meaning,
-- and the public feed/search contracts are unchanged. Every statement is
-- idempotent so re-running the migration is a no-op. Table-level privileges
-- granted in 0014 already cover new columns, so `authenticated` can read/write
-- this one under the existing RLS row gate.

alter table public.tasks
  add column if not exists time_of_day text;

-- Mirrors `taskTimeOfDaySchema` in @dizkarte/domain, so an invalid slot can
-- never be stored even if a caller bypasses the client. Only constrains the
-- value when one is set; a flexible task keeps it NULL. Dropped-then-added so
-- the migration stays re-runnable.
alter table public.tasks
  drop constraint if exists tasks_time_of_day_check;
alter table public.tasks
  add constraint tasks_time_of_day_check
  check (time_of_day is null or time_of_day in ('morning', 'midday', 'afternoon', 'evening'));
