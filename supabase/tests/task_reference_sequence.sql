-- tests/task_reference_sequence.sql
-- Self-checks for migration 0057's per-day task reference sequence.
--
-- Coverage: same-day inserts get distinct, sequential TSK-YYYYMMDD-NNNN
-- references; an explicitly supplied reference is kept; the seed step moves a
-- day's counter past legacy (0055-style) all-digit suffixes so the next insert
-- cannot collide with them; and client roles cannot call the internal helpers.
--
-- Uses a far-future Manila date so it never touches a real day's counter.
-- Runs in a transaction and rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/task_reference_sequence.sql

begin;

insert into auth.users (id, email)
values ('f1111111-1111-1111-1111-111111111111', 'trs-client@synthetic.test')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values ('f1111111-1111-1111-1111-111111111111', 'TRS Client')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.categories (id, slug, name)
values ('c5700000-0000-0000-0000-000000000001', 'trs-cat', 'TRS Category');

-- ===========================================================================
-- 1. Same-day inserts receive distinct, sequential references.
-- ===========================================================================
insert into public.tasks
  (id, client_id, category_id, title, description, budget_centavos, status, created_at)
values
  ('a5700000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111',
   'c5700000-0000-0000-0000-000000000001', 'TRS One', 'Synthetic task number one.', 100000,
   'DRAFT', '2099-03-01 10:00+08'),
  ('a5700000-0000-0000-0000-000000000002', 'f1111111-1111-1111-1111-111111111111',
   'c5700000-0000-0000-0000-000000000001', 'TRS Two', 'Synthetic task number two.', 100000,
   'DRAFT', '2099-03-01 11:00+08');

do $$
declare v_one text; v_two text;
begin
  select reference_id into v_one from public.tasks where id = 'a5700000-0000-0000-0000-000000000001';
  select reference_id into v_two from public.tasks where id = 'a5700000-0000-0000-0000-000000000002';
  if v_one <> 'TSK-20990301-0001' or v_two <> 'TSK-20990301-0002' then
    raise exception 'FAIL: expected sequential references, got % and %', v_one, v_two;
  end if;
  raise notice 'PASS: same-day inserts get distinct sequential references';
end $$;

-- ===========================================================================
-- 2. A caller-supplied reference is kept as-is.
-- ===========================================================================
insert into public.tasks
  (id, client_id, category_id, title, description, budget_centavos, status, created_at,
   reference_id)
values
  ('a5700000-0000-0000-0000-000000000003', 'f1111111-1111-1111-1111-111111111111',
   'c5700000-0000-0000-0000-000000000001', 'TRS Legacy', 'Task with a legacy-style reference.', 100000,
   'DRAFT', '2099-03-02 09:00+08', 'TSK-20990302-0042');

do $$
declare v_ref text;
begin
  select reference_id into v_ref from public.tasks where id = 'a5700000-0000-0000-0000-000000000003';
  if v_ref <> 'TSK-20990302-0042' then
    raise exception 'FAIL: supplied reference was overwritten (%)', v_ref;
  end if;
  raise notice 'PASS: a supplied reference is preserved';
end $$;

-- ===========================================================================
-- 3. Seeding moves the counter past legacy all-digit suffixes.
-- ===========================================================================
select app.seed_task_reference_sequences();

insert into public.tasks
  (id, client_id, category_id, title, description, budget_centavos, status, created_at)
values
  ('a5700000-0000-0000-0000-000000000004', 'f1111111-1111-1111-1111-111111111111',
   'c5700000-0000-0000-0000-000000000001', 'TRS After Seed', 'Task inserted after seeding the counter.',
   100000, 'DRAFT', '2099-03-02 12:00+08');

do $$
declare v_ref text;
begin
  select reference_id into v_ref from public.tasks where id = 'a5700000-0000-0000-0000-000000000004';
  if v_ref <> 'TSK-20990302-0043' then
    raise exception 'FAIL: expected TSK-20990302-0043 after seeding, got %', v_ref;
  end if;
  raise notice 'PASS: seeding skips past legacy references';
end $$;

-- ===========================================================================
-- 4. Client roles cannot call the internal helpers or read the counter.
-- ===========================================================================
do $$
begin
  if has_function_privilege('anon', 'app.next_task_reference_id(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'app.next_task_reference_id(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'app.seed_task_reference_sequences()', 'execute') then
    raise exception 'FAIL: a client role can execute a reference-sequence helper';
  end if;
  if has_table_privilege('authenticated', 'app.task_reference_sequences', 'select')
     or has_table_privilege('anon', 'app.task_reference_sequences', 'select') then
    raise exception 'FAIL: a client role can read the reference counter';
  end if;
  raise notice 'PASS: reference-sequence helpers are not client-callable';
end $$;

rollback;
