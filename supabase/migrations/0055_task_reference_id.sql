-- 0055_task_reference_id.sql
-- Formal Task Reference ID (TSK-YYYYMMDD-XXXX) support for public.tasks.
--
-- Adds a unique reference_id column to public.tasks and a before-insert trigger
-- so that every newly created task automatically receives a standardized, human-readable
-- formal reference ID matching the platform convention.
--
-- Safe and idempotent. Foreign keys referencing tasks(id) as UUID remain undisturbed.

alter table public.tasks
  add column if not exists reference_id text;

-- Helper function to generate formal reference code from task creation date and UUID
create or replace function app.generate_task_reference_id(p_created_at timestamptz, p_id uuid)
returns text as $$
declare
  v_date text;
  v_hex text;
begin
  v_date := to_char(coalesce(p_created_at, now()) at time zone 'Asia/Manila', 'YYYYMMDD');
  v_hex := upper(substring(replace(coalesce(p_id, gen_random_uuid())::text, '-', ''), 1, 4));
  return 'TSK-' || v_date || '-' || v_hex;
end;
$$ language plpgsql immutable;

-- Trigger function to automatically set reference_id on insert for any new task
create or replace function app.set_task_reference_id()
returns trigger as $$
begin
  if new.reference_id is null or new.reference_id = '' then
    new.reference_id := app.generate_task_reference_id(new.created_at, coalesce(new.id, gen_random_uuid()));
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_reference_id on public.tasks;
create trigger trg_tasks_reference_id
  before insert on public.tasks
  for each row execute function app.set_task_reference_id();

-- Backfill existing tasks so they also have their formal reference_id populated
update public.tasks
set reference_id = app.generate_task_reference_id(created_at, id)
where reference_id is null;

-- Ensure uniqueness and fast lookup
create unique index if not exists ix_tasks_reference_id on public.tasks (reference_id);
