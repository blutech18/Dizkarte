-- 0057_task_reference_id_unique_sequence.sql
-- Fix a collision defect introduced by 0055.
--
-- 0055 derived a task's formal reference from the Manila date plus only the
-- FIRST 4 hex characters of the task UUID:
--     TSK-YYYYMMDD-<first 4 hex of uuid>
-- Combined with the `ix_tasks_reference_id` UNIQUE index it added, any two tasks
-- that share those 4 hex characters and are created on the same Manila day
-- generate the SAME reference_id, so the second INSERT fails. With random UUIDs
-- the 4-hex space is only 65,536 values, so same-day collisions become likely
-- after a few hundred tasks/day (birthday bound) — a real task-creation failure
-- in production, not just a test artifact.
--
-- Fix: generate the suffix from an ATOMIC per-day sequence instead of UUID bits,
-- so every task gets a unique, human-readable, monotonic reference:
--     TSK-YYYYMMDD-NNNN   (zero-padded, widening past 9999 within a day)
--
-- Safe and idempotent. The column, trigger name, and UNIQUE index from 0055 are
-- reused unchanged; only the value-generation logic changes. Existing rows keep
-- their already-assigned (and already-unique) reference_id.

-- Per-day counter. One row per Manila calendar day; `last_seq` is the highest
-- sequence handed out for that day. Lives in the internal `app` schema and is
-- never exposed to clients.
create table if not exists app.task_reference_sequences (
  ref_date  text primary key,
  last_seq  integer not null default 0
);

-- Atomically reserve and return the next per-day sequence, formatted as the
-- full reference id. The `on conflict ... do update ... returning` locks the
-- day row for the transaction, so concurrent inserts serialize on it and can
-- never receive the same number. SECURITY DEFINER so the trigger can maintain
-- the counter regardless of the (RLS-constrained) inserting role.
create or replace function app.next_task_reference_id(p_created_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_date text;
  v_seq  integer;
begin
  v_date := to_char(coalesce(p_created_at, now()) at time zone 'Asia/Manila', 'YYYYMMDD');
  insert into app.task_reference_sequences as s (ref_date, last_seq)
    values (v_date, 1)
  on conflict (ref_date)
    do update set last_seq = s.last_seq + 1
  returning s.last_seq into v_seq;
  -- Zero-pad to 4 digits; values past 9999 keep their natural (wider) width and
  -- remain unique, so a very high-volume day never breaks the constraint.
  return 'TSK-' || v_date || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- Re-point the before-insert trigger function at the sequence generator. Only
-- fills a reference when the caller did not supply one, exactly as before.
create or replace function app.set_task_reference_id()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.reference_id is null or new.reference_id = '' then
    new.reference_id := app.next_task_reference_id(new.created_at);
  end if;
  return new;
end;
$$;

-- The trigger created in 0055 already calls app.set_task_reference_id; recreate
-- it defensively so this migration is self-contained if 0055 was skipped.
drop trigger if exists trg_tasks_reference_id on public.tasks;
create trigger trg_tasks_reference_id
  before insert on public.tasks
  for each row execute function app.set_task_reference_id();

-- The UNIQUE index from 0055 is the correctness backstop; ensure it exists.
create unique index if not exists ix_tasks_reference_id on public.tasks (reference_id);

-- Seed each day's counter past any legacy 0055 reference whose 4-hex suffix
-- happens to be all digits (e.g. TSK-20261004-0042). Without this, the
-- sequence for a day that already has 0055-style rows (the deploy day, or any
-- backdated insert) could hand out that same number and hit the UNIQUE index.
create or replace function app.seed_task_reference_sequences()
returns void
language sql
security definer
set search_path = public, app
as $$
  insert into app.task_reference_sequences (ref_date, last_seq)
  select substring(reference_id from 5 for 8), max(substring(reference_id from 14)::integer)
  from public.tasks
  where reference_id ~ '^TSK-[0-9]{8}-[0-9]+$'
  group by 1
  on conflict (ref_date)
    do update set last_seq = greatest(app.task_reference_sequences.last_seq, excluded.last_seq);
$$;

select app.seed_task_reference_sequences();

-- Internal helpers: only the trigger (running as the definer) may call these.
revoke execute on function app.next_task_reference_id(timestamptz) from public, anon, authenticated;
revoke execute on function app.seed_task_reference_sequences() from public, anon, authenticated;
revoke all on table app.task_reference_sequences from public, anon, authenticated;
